import { Request, Response } from 'express';
import Lead from '../models/Lead';
import Task from '../models/Task';
import Deal from '../models/Deal';
import Contact from '../models/Contact';
import { Op } from 'sequelize';

export const getDeletedRecords = async (req: Request, res: Response) => {
  try {
    // Fetch soft-deleted records using `paranoid: false` and filtering by deletedAt != null
    const [leads, tasks, deals, contacts] = await Promise.all([
      Lead.findAll({ where: { deletedAt: { [Op.not]: null } }, paranoid: false }),
      Task.findAll({ where: { deletedAt: { [Op.not]: null } }, paranoid: false }),
      Deal.findAll({ where: { deletedAt: { [Op.not]: null } }, paranoid: false }),
      Contact.findAll({ where: { deletedAt: { [Op.not]: null } }, paranoid: false }),
    ]);

    // Format them for a unified recycle bin view
    const records = [
      ...leads.map((l) => ({ id: l.id, type: 'Lead', name: `${l.firstName} ${l.lastName}`, deletedAt: l.deletedAt })),
      ...tasks.map((t) => ({ id: t.id, type: 'Task', name: t.title, deletedAt: t.deletedAt })),
      ...deals.map((d) => ({ id: d.id, type: 'Deal', name: d.title, deletedAt: d.deletedAt })),
      ...contacts.map((c) => ({ id: c.id, type: 'Contact', name: `${c.firstName} ${c.lastName}`, deletedAt: c.deletedAt })),
    ];

    // Sort by most recently deleted
    records.sort((a: any, b: any) => new Date(b.deletedAt).getTime() - new Date(a.deletedAt).getTime());

    return res.json({ records });
  } catch (error) {
    console.error('Get deleted records error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

export const restoreRecord = async (req: Request, res: Response) => {
  try {
    const { type, id } = req.body;
    let record;

    switch (type) {
      case 'Lead':
        record = await Lead.findByPk(id, { paranoid: false });
        break;
      case 'Task':
        record = await Task.findByPk(id, { paranoid: false });
        break;
      case 'Deal':
        record = await Deal.findByPk(id, { paranoid: false });
        break;
      case 'Contact':
        record = await Contact.findByPk(id, { paranoid: false });
        break;
      default:
        return res.status(400).json({ message: 'Invalid entity type' });
    }

    if (!record || !record.deletedAt) {
      return res.status(404).json({ message: 'Deleted record not found' });
    }

    // Restore the record by setting deletedAt to null
    await record.restore();

    return res.json({ message: `${type} restored successfully` });
  } catch (error) {
    console.error('Restore record error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};
