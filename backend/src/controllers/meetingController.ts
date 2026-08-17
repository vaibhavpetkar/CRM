import { Request, Response } from 'express';
import { Op, ForeignKeyConstraintError, ValidationError } from 'sequelize';
import Meeting from '../models/Meeting';
import User from '../models/User';
import Lead from '../models/Lead';
import Deal from '../models/Deal';
import Contact from '../models/Contact';
import { sendMeetingInviteEmail } from '../utils/mailer';
import { createMeetLink } from '../services/googleMeetService';

// Included whenever a Meeting is fetched so the API returns the linked
// Lead/Deal/Contact record itself, not just a typed-in "client" string.
const relationIncludes = [
  { model: User, attributes: ['id', 'firstName', 'lastName', 'email'], as: 'assignedTo', required: false },
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

// `time` and `duration` are free-text display fields elsewhere in this
// codebase (e.g. "2:00 PM", "30 min", "1h") — not strictly validated. This
// is a best-effort parse for building a real Calendar event start/end when
// creating a Google Meet link; returns null (skip the Meet link, don't
// error) rather than guessing wrong on genuinely unparseable input.
const parseMeetingStartEnd = (date: string, time?: string | null, duration?: string | null): { start: Date; end: Date } | null => {
  const timeMatch = time ? String(time).match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i) : null;
  let hours = timeMatch ? parseInt(timeMatch[1], 10) : 10;
  const minutes = timeMatch ? parseInt(timeMatch[2], 10) : 0;
  const meridiem = timeMatch?.[3]?.toUpperCase();
  if (meridiem === 'PM' && hours < 12) hours += 12;
  if (meridiem === 'AM' && hours === 12) hours = 0;

  const start = new Date(`${date}T${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:00`);
  if (isNaN(start.getTime())) return null;

  const durationMatch = duration ? String(duration).match(/(\d+(?:\.\d+)?)/) : null;
  const durationMinutes = durationMatch ? Math.max(15, parseFloat(durationMatch[1])) : 30;
  const end = new Date(start.getTime() + durationMinutes * 60_000);
  return { start, end };
};

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
    const { title, client, leadId, dealId, contactId, date, time, duration, type, status, notes, assignedToId, customerEmail, ccEmails } = req.body;
    if (!title || !date) return res.status(400).json({ message: 'Title and date are required' });

    const normalizedCc: string[] = Array.isArray(ccEmails) ? ccEmails.filter((e: unknown) => typeof e === 'string' && e.trim()) : [];

    // Best-effort real Google Meet link for video meetings — never blocks
    // meeting creation. Returns null immediately (no network call) if Meet
    // isn't connected, or if the date/time can't be parsed into a concrete
    // start/end (duration/time here are free-text display fields, not
    // strictly validated elsewhere in this codebase).
    let meetLink: string | null = null;
    if ((type || 'video') === 'video') {
      const startEnd = parseMeetingStartEnd(date, time, duration);
      if (startEnd) {
        meetLink = await createMeetLink({
          summary: title,
          description: notes || undefined,
          startTime: startEnd.start,
          endTime: startEnd.end,
          attendeeEmails: [customerEmail, ...normalizedCc].filter((e): e is string => !!e),
        });
      }
    }

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
      customerEmail: customerEmail || null,
      ccEmails: normalizedCc.length ? JSON.stringify(normalizedCc) : null,
      meetLink,
    });

    await meeting.reload({ include: relationIncludes });

    // Auto-email: client is the primary recipient, assignee + picked CCs are
    // cc'd. If there's no client email on file, fall back to emailing the
    // assignee directly so the meeting still gets confirmed to someone.
    // Never blocks meeting creation — errors are caught and logged only.
    const assigneeEmail = (meeting as any).assignedTo?.email as string | undefined;
    const ccList = [assigneeEmail, ...normalizedCc].filter((e): e is string => !!e);
    const primaryRecipient = customerEmail || assigneeEmail;
    if (primaryRecipient) {
      const cc = primaryRecipient === assigneeEmail ? normalizedCc : ccList.filter((e) => e !== primaryRecipient);
      sendMeetingInviteEmail(primaryRecipient, meeting, cc).catch((err) =>
        console.error('Failed to send meeting invite email:', err)
      );
    }

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

    const { title, client, leadId, dealId, contactId, date, time, duration, type, status, notes, assignedToId, customerEmail, ccEmails } = req.body;

    // duration is stored as STRING in DB (e.g. "60" or "1h"), so don't parse as number.
    // Just validate it's a non-empty string if provided.
    if (duration !== undefined && duration !== '' && String(duration).trim() === '') {
      return res.status(400).json({ message: 'Duration cannot be empty' });
    }

    // Use !== undefined so nullable fields can be cleared, and normalize '' -> null.
    // For FK fields (leadId, dealId, contactId, assignedToId), parse strings to numbers.
    const norm = (v: any) => (v === '' ? null : v);
    const normNum = (v: any) => {
      const n = norm(v);
      return n === null ? null : Number(n);
    };
    await meeting.update({
      title: title !== undefined ? title : meeting.title,
      client: client !== undefined ? norm(client) : meeting.client,
      leadId: leadId !== undefined ? normNum(leadId) : meeting.leadId,
      dealId: dealId !== undefined ? normNum(dealId) : meeting.dealId,
      contactId: contactId !== undefined ? normNum(contactId) : meeting.contactId,
      date: date !== undefined ? date : meeting.date,
      time: time !== undefined ? norm(time) : meeting.time,
      duration: duration !== undefined ? norm(duration) : meeting.duration,
      type: type !== undefined ? type : meeting.type,
      status: status !== undefined ? status : meeting.status,
      notes: notes !== undefined ? norm(notes) : meeting.notes,
      assignedToId: assignedToId !== undefined ? normNum(assignedToId) : meeting.assignedToId,
      customerEmail: customerEmail !== undefined ? norm(customerEmail) : meeting.customerEmail,
      ccEmails:
        ccEmails !== undefined
          ? Array.isArray(ccEmails) && ccEmails.length
            ? JSON.stringify(ccEmails.filter((e: unknown) => typeof e === 'string' && e.trim()))
            : null
          : meeting.ccEmails,
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
