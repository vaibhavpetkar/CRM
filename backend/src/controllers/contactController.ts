import { Request, Response } from 'express';
import Contact from '../models/Contact';
import User from '../models/User';
import { Op } from 'sequelize';
import sequelize from '../config/database';

// Serialize contact to match frontend data shape
const serializeContact = (contact: any) => {
  const plain = contact.toJSON ? contact.toJSON() : contact;
  return {
    ...plain,
    // Frontend uses "title" for jobTitle
    title: plain.jobTitle,
    // Frontend expects "assignedTo" as a string
    assignedTo: plain.assignedTo
      ? `${plain.assignedTo.firstName} ${plain.assignedTo.lastName}`
      : null,
    // Frontend expects "lastContact" from lastContacted
    lastContact: plain.lastContacted,
  };
};

const ALLOWED_SORT = new Set(['createdAt', 'updatedAt', 'firstName', 'lastName', 'email', 'company', 'lastContacted']);

export const getContacts = async (req: Request, res: Response) => {
  try {
    const {
      page = 1,
      limit = 10,
      search,
      source,
      sortBy = 'createdAt',
      order = 'DESC',
    } = req.query;

    // Clamp pagination to avoid negative offsets / NaN / unbounded limits.
    const parsedPage = Math.max(1, parseInt(page as string, 10) || 1);
    const parsedLimit = Math.min(200, Math.max(1, parseInt(limit as string, 10) || 10));
    const safeSortBy = ALLOWED_SORT.has(sortBy as string) ? (sortBy as string) : 'createdAt';
    const safeOrder = String(order).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';

    const whereClause: any = {};

    if (search) {
      whereClause[Op.or] = [
        { firstName: { [Op.iLike]: `%${search}%` } },
        { lastName: { [Op.iLike]: `%${search}%` } },
        { email: { [Op.iLike]: `%${search}%` } },
        { phone: { [Op.iLike]: `%${search}%` } },
        { company: { [Op.iLike]: `%${search}%` } },
      ];
    }

    if (source) {
      whereClause.leadSource = source;
    }

    const { leadId } = req.query;
    if (leadId) {
      const parsedLeadId = parseInt(leadId as string, 10);
      if (Number.isNaN(parsedLeadId)) {
        return res.status(400).json({ message: 'Invalid leadId' });
      }
      whereClause.leadId = parsedLeadId;
    }

    const contacts = await Contact.findAndCountAll({
      where: whereClause,
      include: [
        {
          model: User,
          attributes: ['id', 'firstName', 'lastName', 'email'],
          as: 'assignedTo',
          required: false,
        },
      ],
      limit: parsedLimit,
      offset: (parsedPage - 1) * parsedLimit,
      order: [[safeSortBy, safeOrder]],
    });

    return res.json({
      contacts: contacts.rows.map(serializeContact),
      total: contacts.count,
      page: parsedPage,
      pages: Math.ceil(contacts.count / parsedLimit),
    });
  } catch (error) {
    console.error('Get contacts error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const getContactById = async (req: Request, res: Response) => {
  try {
    const contact = await Contact.findByPk(req.params.id, {
      include: [
        {
          model: User,
          attributes: ['id', 'firstName', 'lastName', 'email'],
          as: 'assignedTo',
          required: false,
        },
      ],
    });

    if (!contact) {
      return res.status(404).json({ message: 'Contact not found' });
    }

    return res.json(serializeContact(contact));
  } catch (error) {
    console.error('Get contact by ID error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const createContact = async (req: Request, res: Response) => {
  try {
    const {
      firstName,
      lastName,
      email,
      phone,
      company,
      jobTitle,
      title,        // frontend sends "title"
      leadSource,
      notes,
      assignedToId,
      leadId,
    } = req.body;

    if (!firstName || !lastName) {
      return res.status(400).json({ message: 'firstName and lastName are required' });
    }

    // Check if contact with email already exists (case-insensitive)
    if (email) {
      const existingContact = await Contact.findOne({ where: sequelize.where(sequelize.fn('lower', sequelize.col('email')), String(email).toLowerCase()) });
      if (existingContact) {
        return res.status(400).json({ message: 'Contact with this email already exists' });
      }
    }

    const contact = await Contact.create({
      firstName,
      lastName,
      email: email || null,
      phone: phone || null,
      company: company || null,
      jobTitle: jobTitle || title || null,
      leadSource: leadSource || null,
      notes: notes || null,
      assignedToId: assignedToId || null,
      leadId: leadId || null,
      isActive: true,
    });

    return res.status(201).json({
      message: 'Contact created successfully',
      contact: serializeContact(contact),
    });
  } catch (error) {
    console.error('Create contact error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const updateContact = async (req: Request, res: Response) => {
  try {
    const contact = await Contact.findByPk(req.params.id);

    if (!contact) {
      return res.status(404).json({ message: 'Contact not found' });
    }

    const {
      firstName,
      lastName,
      email,
      phone,
      company,
      jobTitle,
      title,
      leadSource,
      notes,
      assignedToId,
      lastContacted,
      isActive,
    } = req.body;

    // Check if email is being changed and already exists (case-insensitive —
    // the column has no unique index, so this is the only dedup guard).
    const newEmail = email !== undefined && email !== '' ? String(email).toLowerCase() : null;
    if (newEmail && newEmail !== String(contact.email || '').toLowerCase()) {
      const existingContact = await Contact.findOne({ where: sequelize.where(sequelize.fn('lower', sequelize.col('email')), newEmail) });
      if (existingContact) {
        return res.status(400).json({ message: 'Contact with this email already exists' });
      }
    }

    // Use !== undefined so fields can actually be cleared to null/empty, and
    // normalize '' -> null so empty dates don't 500 on a DATE column.
    const norm = (v: any) => (v === '' ? null : v);
    await contact.update({
      firstName: firstName !== undefined ? firstName : contact.firstName,
      lastName: lastName !== undefined ? lastName : contact.lastName,
      email: email !== undefined ? norm(email) : contact.email,
      phone: phone !== undefined ? norm(phone) : contact.phone,
      company: company !== undefined ? norm(company) : contact.company,
      jobTitle: jobTitle !== undefined ? norm(jobTitle) : (title !== undefined ? norm(title) : contact.jobTitle),
      leadSource: leadSource !== undefined ? norm(leadSource) : contact.leadSource,
      notes: notes !== undefined ? norm(notes) : contact.notes,
      assignedToId: assignedToId !== undefined ? norm(assignedToId) : contact.assignedToId,
      lastContacted: lastContacted !== undefined ? norm(lastContacted) : contact.lastContacted,
      isActive: isActive !== undefined ? isActive : contact.isActive,
    });

    await contact.reload({
      include: [{ model: User, attributes: ['id', 'firstName', 'lastName', 'email'], as: 'assignedTo', required: false }],
    });

    return res.json({
      message: 'Contact updated successfully',
      contact: serializeContact(contact),
    });
  } catch (error) {
    console.error('Update contact error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const deleteContact = async (req: Request, res: Response) => {
  try {
    const contact = await Contact.findByPk(req.params.id);

    if (!contact) {
      return res.status(404).json({ message: 'Contact not found' });
    }

    await contact.destroy();

    return res.json({ message: 'Contact deleted successfully' });
  } catch (error) {
    console.error('Delete contact error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const getContactStats = async (req: Request, res: Response) => {
  try {
    const totalContacts = await Contact.count();

    const contactsBySource = await Contact.findAll({
      attributes: ['leadSource', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
      group: ['leadSource'],
    });

    const contactsWithEmail = await Contact.count({
      where: { email: { [Op.ne]: null } },
    });

    const contactsWithPhone = await Contact.count({
      where: { phone: { [Op.ne]: null } },
    });

    return res.json({
      totalContacts,
      contactsBySource,
      contactsWithEmail,
      contactsWithPhone,
    });
  } catch (error) {
    console.error('Get contact stats error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};