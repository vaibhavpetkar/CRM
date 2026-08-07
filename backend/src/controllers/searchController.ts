import { Request, Response } from 'express';
import { Op } from 'sequelize';
import Lead from '../models/Lead';
import Deal from '../models/Deal';
import Contact from '../models/Contact';

const RESULT_LIMIT_PER_TYPE = 5;

// GET /api/search?q=...
// Unified search across Leads, Deals, and Contacts for the global topbar search.
export const globalSearch = async (req: Request, res: Response) => {
  try {
    const q = (req.query.q as string || '').trim();

    if (!q || q.length < 2) {
      return res.json({ query: q, results: [], leads: [], deals: [], contacts: [] });
    }

    const like = { [Op.iLike]: `%${q}%` };

    const [leads, deals, contacts] = await Promise.all([
      Lead.findAll({
        where: {
          [Op.or]: [
            { firstName: like },
            { lastName: like },
            { email: like },
            { company: like },
            { phone: like },
          ],
        },
        limit: RESULT_LIMIT_PER_TYPE,
        order: [['createdAt', 'DESC']],
      }),
      Deal.findAll({
        where: {
          [Op.or]: [
            { title: like },
            { client: like },
          ],
        },
        limit: RESULT_LIMIT_PER_TYPE,
        order: [['createdAt', 'DESC']],
      }),
      Contact.findAll({
        where: {
          [Op.or]: [
            { firstName: like },
            { lastName: like },
            { email: like },
            { phone: like },
          ],
        },
        limit: RESULT_LIMIT_PER_TYPE,
        order: [['createdAt', 'DESC']],
      }),
    ]);

    const leadResults = leads.map((l: any) => ({
      type: 'lead',
      id: l.id,
      title: `${l.firstName} ${l.lastName}`.trim(),
      subtitle: l.company || l.email || '',
      url: `/leads/${l.id}`,
    }));

    const dealResults = deals.map((d: any) => ({
      type: 'deal',
      id: d.id,
      title: d.title,
      subtitle: d.client || '',
      url: `/deals?search=${encodeURIComponent(d.title)}`,
    }));

    const contactResults = contacts.map((c: any) => ({
      type: 'contact',
      id: c.id,
      title: `${c.firstName} ${c.lastName}`.trim(),
      subtitle: c.email || c.phone || '',
      url: `/contacts?search=${encodeURIComponent(`${c.firstName} ${c.lastName}`.trim())}`,
    }));

    const results = [...leadResults, ...dealResults, ...contactResults];

    return res.json({
      query: q,
      results,
      leads: leadResults,
      deals: dealResults,
      contacts: contactResults,
    });
  } catch (error) {
    console.error('Global search error:', error);
    return res.status(500).json({ message: 'Server error while searching' });
  }
};
