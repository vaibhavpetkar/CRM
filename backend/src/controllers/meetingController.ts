import { Request, Response } from 'express';
import { Op } from 'sequelize';
import Meeting from '../models/Meeting';
import User from '../models/User';

const serialize = (meeting: any) => {
  const plain = meeting.toJSON ? meeting.toJSON() : meeting;
  return {
    ...plain,
    assignedTo: plain.assignedTo ? `${plain.assignedTo.firstName} ${plain.assignedTo.lastName}` : null,
  };
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
      include: [{ model: User, attributes: ['id', 'firstName', 'lastName'], as: 'assignedTo', required: false }],
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
    const { title, client, date, time, duration, type, status, notes, assignedToId } = req.body;
    if (!title || !date) return res.status(400).json({ message: 'Title and date are required' });

    const meeting = await Meeting.create({
      title,
      client: client || null,
      date,
      time: time || null,
      duration: duration || null,
      type: type || 'video',
      status: status || 'scheduled',
      notes: notes || null,
      assignedToId: assignedToId || null,
    });

    return res.status(201).json({ message: 'Meeting scheduled successfully', meeting: serialize(meeting) });
  } catch (error) {
    console.error('Create meeting error:', error);
    return res.status(500).json({ message: 'Server error while creating meeting' });
  }
};

export const updateMeeting = async (req: Request, res: Response) => {
  try {
    const meeting = await Meeting.findByPk(req.params.id);
    if (!meeting) return res.status(404).json({ message: 'Meeting not found' });

    const { title, client, date, time, duration, type, status, notes, assignedToId } = req.body;
    await meeting.update({
      title: title ?? meeting.title,
      client: client ?? meeting.client,
      date: date ?? meeting.date,
      time: time ?? meeting.time,
      duration: duration ?? meeting.duration,
      type: type ?? meeting.type,
      status: status ?? meeting.status,
      notes: notes ?? meeting.notes,
      assignedToId: assignedToId ?? meeting.assignedToId,
    });

    await meeting.reload({ include: [{ model: User, attributes: ['id', 'firstName', 'lastName'], as: 'assignedTo', required: false }] });
    return res.json({ message: 'Meeting updated successfully', meeting: serialize(meeting) });
  } catch (error) {
    console.error('Update meeting error:', error);
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
