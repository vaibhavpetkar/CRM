import { Request, Response } from 'express';
import Contact from '../models/Contact';
import User from '../models/User';
import { Op } from 'sequelize';
import sequelize from '../config/database';
import Lead from '../models/Lead';
import { findInvalidReference } from '../utils/referenceValidation';
import Deal from '../models/Deal';
import Company from '../models/Company';
import { companyKey, companySearchWord } from '../utils/companyKey';

const REFERENCE_FIELDS = {
  assignedToId: { label: 'Assigned To', model: User },
  leadId: { label: 'Lead', model: Lead },
};

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

    const badReference = await findInvalidReference(req.body, REFERENCE_FIELDS);
    if (badReference) return res.status(422).json({ message: badReference });

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

    const badReference = await findInvalidReference(req.body, REFERENCE_FIELDS);
    if (badReference) return res.status(422).json({ message: badReference });

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

/**
 * Item 8: relationship graph — connects contacts that share a company, a
 * phone number, or an email address, so the same person/number showing up
 * under two different companies (or two people sharing a work line) is
 * visible at a glance instead of buried in separate flat records.
 *
 * Returns a plain node/edge graph the frontend renders — company nodes are
 * synthetic hubs (id `company:<name>`), every contact links to its company
 * hub, and contacts sharing a phone/email get a direct edge between them
 * (only when 2+ contacts actually share that value — a phone/email used by
 * just one contact isn't a "relationship").
 */
export const getContactRelationships = async (req: Request, res: Response) => {
  try {
    const contacts = await Contact.findAll({
      attributes: ['id', 'firstName', 'lastName', 'email', 'phone', 'company', 'jobTitle'],
      where: { isActive: true },
      limit: 500, // keep the graph readable; this is a visualization, not a full export
      order: [['company', 'ASC'], ['firstName', 'ASC']],
    });

    const nodes: any[] = [];
    const edges: any[] = [];
    const companyHubs = new Map<string, string>(); // normalized company key -> hub label

    const normalizedPhone = (p?: string | null) => (p ? p.replace(/[^\d]/g, '') : '');
    const byPhone = new Map<string, number[]>();
    const byEmail = new Map<string, number[]>();

    for (const c of contacts) {
      const contactNodeId = `contact:${c.id}`;
      const key = companyKey(c.company);
      const hubId = key ? `company:${key}` : null;
      if (hubId && !companyHubs.has(key)) {
        companyHubs.set(key, c.company!.trim());
        nodes.push({ id: hubId, type: 'company', label: c.company!.trim() });
      }
      nodes.push({
        id: contactNodeId,
        type: 'contact',
        label: `${c.firstName} ${c.lastName}`.trim(),
        // Spelling variants ("Acme Pvt Ltd" / "ACME") share one hub; report
        // the hub's label so every view groups them together.
        company: hubId ? companyHubs.get(key)! : null,
        email: c.email || null,
        phone: c.phone || null,
        jobTitle: c.jobTitle || null,
      });
      if (hubId) edges.push({ source: hubId, target: contactNodeId, type: 'company' });

      const phoneKey = normalizedPhone(c.phone);
      if (phoneKey) {
        if (!byPhone.has(phoneKey)) byPhone.set(phoneKey, []);
        byPhone.get(phoneKey)!.push(c.id);
      }
      const emailKey = c.email?.trim().toLowerCase();
      if (emailKey) {
        if (!byEmail.has(emailKey)) byEmail.set(emailKey, []);
        byEmail.get(emailKey)!.push(c.id);
      }
    }

    // Connect every pair within each shared-phone / shared-email group.
    const addPairEdges = (groups: Map<string, number[]>, type: 'phone' | 'email') => {
      for (const ids of groups.values()) {
        if (ids.length < 2) continue;
        for (let i = 0; i < ids.length; i++) {
          for (let j = i + 1; j < ids.length; j++) {
            edges.push({ source: `contact:${ids[i]}`, target: `contact:${ids[j]}`, type });
          }
        }
      }
    };
    addPairEdges(byPhone, 'phone');
    addPairEdges(byEmail, 'email');

    return res.json({ nodes, edges, totalContacts: contacts.length });
  } catch (error) {
    console.error('Get contact relationships error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};
// Same rule as authorize(), for deciding which related record types a
// contacts:read user may also see (leads/deals need their own permission).
const userCan = (user: any, permission: string): boolean => {
  if (!user) return false;
  if (user.isSuperAdmin) return true;
  const role = user.role;
  if (!role) return false;
  let perms: string[] = [];
  try {
    perms = typeof role.permissions === 'string' ? JSON.parse(role.permissions) : role.permissions || [];
  } catch {
    perms = [];
  }
  return perms.includes(permission) || perms.includes('*');
};

const RELATED_LIMIT = 200;

/**
 * Every contact, lead and deal belonging to one company. Company names are
 * free text, so rows are matched on companyKey() (case, punctuation and
 * "Pvt Ltd"-style suffixes ignored): narrowed in SQL by one word of the key,
 * then compared exactly here.
 */
const findCompanyRecords = async (key: string, user: any) => {
  const word = companySearchWord(key);
  const like = { [Op.iLike]: `%${word}%` };
  const sameCompany = (name?: string | null) => companyKey(name) === key;

  const contacts = (
    await Contact.findAll({
      attributes: ['id', 'firstName', 'lastName', 'email', 'phone', 'company', 'jobTitle', 'leadId', 'leadSource'],
      where: { company: like },
      order: [['firstName', 'ASC'], ['lastName', 'ASC']],
      limit: RELATED_LIMIT * 5,
    })
  ).filter((c) => sameCompany(c.company)).slice(0, RELATED_LIMIT);

  const leads = userCan(user, 'leads:read')
    ? (
        await Lead.findAll({
          attributes: ['id', 'leadNumber', 'firstName', 'lastName', 'company', 'status', 'email', 'mobile'],
          where: { company: like },
          order: [['createdAt', 'DESC']],
          limit: RELATED_LIMIT * 5,
        })
      ).filter((l) => sameCompany(l.company)).slice(0, RELATED_LIMIT)
    : [];

  let deals: Deal[] = [];
  if (userCan(user, 'deals:read')) {
    const accountIds = (await Company.findAll({ attributes: ['id', 'name'], where: { name: like } }))
      .filter((co) => sameCompany(co.name))
      .map((co) => co.id);
    const contactIds = contacts.map((c) => c.id);
    const candidates = await Deal.findAll({
      attributes: ['id', 'title', 'client', 'value', 'currency', 'stage', 'contactId', 'accountId'],
      where: {
        [Op.or]: [
          { client: like },
          ...(contactIds.length ? [{ contactId: { [Op.in]: contactIds } }] : []),
          ...(accountIds.length ? [{ accountId: { [Op.in]: accountIds } }] : []),
        ],
      },
      order: [['createdAt', 'DESC']],
      limit: RELATED_LIMIT * 5,
    });
    deals = candidates
      .filter(
        (d) =>
          sameCompany(d.client) ||
          (d.contactId != null && contactIds.includes(d.contactId)) ||
          (d.accountId != null && accountIds.includes(d.accountId))
      )
      .slice(0, RELATED_LIMIT);
  }

  return { contacts, leads, deals };
};

/**
 * Company page: all contacts, leads and deals at the company named by ?name=.
 */
export const getCompanyProfile = async (req: Request, res: Response) => {
  try {
    const name = String(req.query.name || '').trim();
    const key = companyKey(name);
    if (!key) return res.status(400).json({ message: 'Company name is required' });

    const { contacts, leads, deals } = await findCompanyRecords(key, (req as any).user);
    return res.json({ name, contacts: contacts.map(serializeContact), leads, deals });
  } catch (error) {
    console.error('Get company profile error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

/**
 * Everything one contact is connected to: colleagues at the same company
 * (across all contacts, not just the page the list happens to show), other
 * contacts sharing their phone or email, and the company's leads and deals.
 */
export const getRelatedForContact = async (req: Request, res: Response) => {
  try {
    const contact = await Contact.findByPk(req.params.id);
    if (!contact) return res.status(404).json({ message: 'Contact not found' });

    const key = companyKey(contact.company);
    const { contacts, leads, deals } = key
      ? await findCompanyRecords(key, (req as any).user)
      : { contacts: [] as Contact[], leads: [], deals: [] as Deal[] };

    // Shared phone (digits only, last 10 so +91 prefixes still match) / email.
    const digits = (contact.phone || '').replace(/\D/g, '').slice(-10);
    const email = contact.email?.trim().toLowerCase();
    const shared = digits.length >= 6 || email
      ? await Contact.findAll({
          attributes: ['id', 'firstName', 'lastName', 'email', 'phone', 'company', 'jobTitle'],
          where: {
            id: { [Op.ne]: contact.id },
            [Op.or]: [
              ...(digits.length >= 6
                ? [sequelize.where(sequelize.fn('regexp_replace', sequelize.col('phone'), '[^0-9]', '', 'g'), { [Op.like]: `%${digits}` })]
                : []),
              ...(email ? [sequelize.where(sequelize.fn('lower', sequelize.col('email')), email)] : []),
            ],
          },
          limit: RELATED_LIMIT,
        })
      : [];
    const sharedPhone = shared.filter((c) => digits.length >= 6 && (c.phone || '').replace(/\D/g, '').slice(-10) === digits);
    const sharedEmail = shared.filter((c) => email && c.email?.trim().toLowerCase() === email);

    // Contacts' own deals count even when the deal's client name differs.
    const ownDeals = userCan((req as any).user, 'deals:read')
      ? await Deal.findAll({
          attributes: ['id', 'title', 'client', 'value', 'currency', 'stage', 'contactId', 'accountId'],
          where: { contactId: contact.id },
        })
      : [];
    const dealMap = new Map<number, Deal>();
    [...ownDeals, ...deals].forEach((d) => dealMap.set(d.id, d));

    return res.json({
      company: contact.company ? contact.company.trim() : null,
      sameCompany: contacts.filter((c) => c.id !== contact.id).map(serializeContact),
      sharedPhone: sharedPhone.map(serializeContact),
      sharedEmail: sharedEmail.map(serializeContact),
      leads,
      deals: Array.from(dealMap.values()),
    });
  } catch (error) {
    console.error('Get related contacts error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};
