import { Request, Response } from 'express';
import { Op, ForeignKeyConstraintError, ValidationError } from 'sequelize';
import Meeting from '../models/Meeting';
import User from '../models/User';
import Lead from '../models/Lead';
import Deal from '../models/Deal';
import Contact from '../models/Contact';

// Included whenever a Meeting is fetched so the API returns the linked
// Lead/Deal/Contact record itself, not just a typed-in "client" string.
const relationIncludes = [
  { model: User, attributes: ['id', 'firstName', 'lastName'], as: 'assignedTo', required: false },
  { model: Lead, attributes: ['id', 'firstName', 'lastName', 'company'], as: 'lead', required: false },
  { model: Deal, attributes: ['id', 'title'], as: 'deal', required: false },
  { model: Contact, attributes: ['id', 'firstName', 'lastName'], as: 'contact', required: false },
];

const serialize = (meeting: any) => {
  const plain = meeting.toJSON ? meeting.toJSON() : meeting;
  return {
    ...plain,
    assignedTo: plain.assignedTo ? `${plain.assignedTo.firstName} ${plain.assignedTo.lastName}` : null,
  };
};

// leadId/dealId/contactId come from the client-side datalist and are normally
// valid, but the picked record can be stale (deleted or edited by someone
// else between page load and submit) or forged. Rather than let a bad FK
// bubble up as a bare 500, surface it as a normal 400 the form can show.
const isBadReferenceError = (error: unknown) =>
  error instanceof ForeignKeyConstraintError ||
  (error instanceof ValidationError && error.name === 'SequelizeValidationError');

export const getMeetings = async (req: Request, res: Response) => {
  try {
    const { search, status } = req.query;
    const whereClause: any = {};

    if (search) {
      whereClause[Op.or] = [
        { title: { [Op.iLike]: `%${search}%` } },
        { client: { [Op.iLike]: `%${search}%` } },
      ];
    }
    if (status && status !== 'all') whereClause.status = status;

    const meetings = await Meeting.findAll({
      where: whereClause,
      include: relationIncludes,
      order: [['date', 'ASC']],
    });

    return res.json({ meetings: meetings.map(serialize), total: meetings.length });
  } catch (error) {
    console.error('Get meetings error:', error);
    return res.status(500).json({ message: 'Server error while fetching meetings' });
  }
};

export const createMeeting = async (req: Request, res: Response) => {
  try {
    const { title, client, leadId, dealId, contactId, date, time, duration, type, status, notes, assignedToId } = req.body;
    if (!title || !date) return res.status(400).json({ message: 'Title and date are required' });

    const meeting = await Meeting.create({
      title,
      client: client || null,
      leadId: leadId || null,
      dealId: dealId || null,
      contactId: contactId || null,
      date,
      time: time || null,
      duration: duration || null,
      type: type || 'video',
      status: status || 'scheduled',
      notes: notes || null,
      assignedToId: assignedToId || null,
    });

    await meeting.reload({ include: relationIncludes });
    return res.status(201).json({ message: 'Meeting scheduled successfully', meeting: serialize(meeting) });
  } catch (error) {
    console.error('Create meeting error:', error);
    if (isBadReferenceError(error)) {
      return res.status(400).json({ message: 'The selected Lead, Deal, or Contact no longer exists. Please pick it again.' });
    }
    return res.status(500).json({ message: 'Server error while creating meeting' });
  }
};

export const updateMeeting = async (req: Request, res: Response) => {
  try {
    const meeting = await Meeting.findByPk(req.params.id);
    if (!meeting) return res.status(404).json({ message: 'Meeting not found' });

    const { title, client, leadId, dealId, contactId, date, time, duration, type, status, notes, assignedToId } = req.body;
    await meeting.update({
      title: title ?? meeting.title,
      client: client ?? meeting.client,
      leadId: leadId ?? meeting.leadId,
      dealId: dealId ?? meeting.dealId,
      contactId: contactId ?? meeting.contactId,
      date: date ?? meeting.date,
      time: time ?? meeting.time,
      duration: duration ?? meeting.duration,
      type: type ?? meeting.type,
      status: status ?? meeting.status,
      notes: notes ?? meeting.notes,
      assignedToId: assignedToId ?? meeting.assignedToId,
    });

    await meeting.reload({ include: relationIncludes });
    return res.json({ message: 'Meeting updated successfully', meeting: serialize(meeting) });
  } catch (error) {
    console.error('Update meeting error:', error);
    if (isBadReferenceError(error)) {
      return res.status(400).json({ message: 'The selected Lead, Deal, or Contact no longer exists. Please pick it again.' });
    }
    return res.status(500).json({ message: 'Server error while updating meeting' });
  }
};

export const deleteMeeting = async (req: Request, res: Response) => {
  try {
    const meeting = await Meeting.findByPk(req.params.id);
    if (!meeting) return res.status(404).json({ message: 'Meeting not found' });
    await meeting.destroy();
    return res.json({ message: 'Meeting deleted successfully' });
  } catch (error) {
    return res.status(500).json({ message: 'Server error' });
  }
};
