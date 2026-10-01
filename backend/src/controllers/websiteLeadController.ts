import { Request, Response } from 'express';
import leadService from '../services/LeadService';
import leadRepository from '../repositories/LeadRepository';
import { logActivity } from '../services/activityLogger';
import { notifyUser } from '../utils/notificationService';
import { sendMail } from '../utils/mailer';
import User from '../models/User';
import logger from '../utils/logger';

// Public endpoint behind the "Contact us" form on the company website
// (inveontechnologies.in/contact). No login: the visitor is anonymous, so the
// route is rate-limited, size-limited and has a honeypot field. Each
// submission becomes a CRM lead (or a timeline entry on the existing lead
// when the same email/mobile writes again), alerts the team, and sends the
// visitor a confirmation email.

const MAX = { name: 120, company: 160, email: 200, phone: 40, service: 120, message: 5000 };

const clean = (value: unknown, max: number) =>
  typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, max) : '';

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const splitName = (full: string) => {
  const parts = full.split(' ').filter(Boolean);
  if (parts.length === 1) return { firstName: parts[0], lastName: '-' };
  return { firstName: parts.slice(0, -1).join(' '), lastName: parts[parts.length - 1] };
};

const teamRecipients = () =>
  (process.env.WEBSITE_LEAD_NOTIFY_EMAILS || process.env.EMAIL_FROM || process.env.EMAIL_USER || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const companyName = () => process.env.COMPANY_NAME || 'Inveon Technologies';

const leadUrl = (id: number) => `${(process.env.CLIENT_URL || '').replace(/\/$/, '')}/leads/${id}`;

const detailsTable = (rows: [string, string][]) =>
  `<table cellpadding="6" style="border-collapse:collapse;font-size:14px;">${rows
    .filter(([, v]) => v)
    .map(
      ([k, v]) =>
        `<tr><td style="color:#6b7280;vertical-align:top;white-space:nowrap;">${k}</td><td style="white-space:pre-wrap;">${escapeHtml(v)}</td></tr>`
    )
    .join('')}</table>`;

export const submitWebsiteLead = async (req: Request, res: Response) => {
  const body = req.body || {};

  // Honeypot: a hidden field real visitors never fill. Pretend success so bots move on.
  if (clean(body.website_url, 200)) return res.status(201).json({ ok: true });

  const name = clean(body.name, MAX.name);
  const email = clean(body.email, MAX.email).toLowerCase();
  const phone = clean(body.phone, MAX.phone);
  const company = clean(body.company, MAX.company);
  const service = clean(body.service, MAX.service);
  // Keep line breaks in the message itself.
  const message = typeof body.message === 'string' ? body.message.trim().slice(0, MAX.message) : '';
  const source = clean(body.source, 200) || 'website contact form';

  if (!name || !email || !message) {
    return res.status(400).json({ message: 'Please fill in your name, email and message.' });
  }
  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ message: 'Please enter a valid email address.' });
  }

  try {
    const existing = await leadRepository.findDuplicate({ email, mobile: phone || null });
    let leadId: number;
    let isNew: boolean;

    if (existing) {
      leadId = existing.id;
      isNew = false;
      await logActivity({
        action: 'updated',
        entityType: 'Lead',
        entityId: existing.id,
        performedById: null,
        details: `New website enquiry${service ? ` about ${service}` : ''}: ${message}`,
      });
    } else {
      const { firstName, lastName } = splitName(name);
      const lead = await leadService.create(
        {
          firstName,
          lastName,
          email,
          mobile: phone || null,
          company: company || null,
          leadSource: 'website',
          status: 'new',
          interestedInServices: service || null,
          description: message,
          sourceDetails: source,
        },
        null
      );
      leadId = (lead as { id: number }).id;
      isNew = true;
    }

    // Everything below is best effort: the lead is saved, so the visitor gets a success response either way.
    const title = isNew ? `New website lead: ${name}` : `Website enquiry from existing lead: ${name}`;
    const summary = `${name}${company ? ` (${company})` : ''} wrote via the website${service ? ` about ${service}` : ''}.`;

    const admins = await User.findAll({ where: { isSuperAdmin: true, isActive: true }, attributes: ['id'] });
    await Promise.all(
      admins.map((u) =>
        notifyUser({
          userId: u.id,
          type: 'lead_website',
          title,
          message: summary,
          entityType: 'Lead',
          entityId: leadId,
          sendEmail: false,
        })
      )
    );

    const teamHtml = `
      <p>${escapeHtml(summary)}</p>
      ${detailsTable([
        ['Name', name],
        ['Email', email],
        ['Phone', phone],
        ['Company', company],
        ['Interested in', service],
        ['Message', message],
        ['Source', source],
      ])}
      ${process.env.CLIENT_URL ? `<p><a href="${escapeHtml(leadUrl(leadId))}">Open the lead in the CRM</a></p>` : ''}
    `;
    const recipients = teamRecipients();
    if (recipients.length) {
      await sendMail(recipients.join(','), title, teamHtml, undefined, { replyTo: `${name} <${email}>` });
    }

    const visitorHtml = `
      <p>Hi ${escapeHtml(name.split(' ')[0])},</p>
      <p>Thank you for contacting ${escapeHtml(companyName())}. We have received your message and someone from our team will get back to you within one business day.</p>
      <p>Here is a copy of what you sent:</p>
      ${detailsTable([
        ['Interested in', service],
        ['Message', message],
      ])}
      <p>If you need to add anything, just reply to this email.</p>
      <p>Regards,<br/>${escapeHtml(companyName())}</p>
    `;
    await sendMail(email, `We received your message - ${companyName()}`, visitorHtml, undefined, {
      replyTo: recipients[0],
    });

    return res.status(201).json({ ok: true });
  } catch (error) {
    logger.error(`Website lead submission failed: ${error}`);
    return res.status(500).json({ message: 'Something went wrong. Please try again or email us directly.' });
  }
};
