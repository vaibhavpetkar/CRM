import nodemailer, { type Mail } from 'nodemailer';
import logger from './logger';

// Lazily-created singleton transporter. If SMTP env vars aren't configured,
// callers get `false` back and the caller falls back to dev-mode behavior
// (e.g. returning the raw link in the API response instead of emailing it).
let transporter: Mail | null = null;

// Either a well-known provider (EMAIL_SERVICE=gmail) or any SMTP server
// (EMAIL_HOST + EMAIL_PORT, e.g. the company's own Mailcow server).
const isEmailConfigured = (): boolean => {
  return Boolean((process.env.EMAIL_SERVICE || process.env.EMAIL_HOST) && process.env.EMAIL_USER && process.env.EMAIL_PASS);
};

const domainOf = (address: string) => (/@([^>\s]+)>?\s*$/.exec(address)?.[1] || '').toLowerCase();

/** The bare sender address: EMAIL_FROM ("Name <a@b.com>" or "a@b.com"), else the SMTP login. */
const fromAddress = () => {
  const raw = (process.env.EMAIL_FROM || process.env.EMAIL_USER || '').trim();
  return /<([^>]+)>/.exec(raw)?.[1] || raw;
};

/** "Shree Mahalaxmi Realty <crm@…>": a name next to the address, as people expect from a real sender. */
const fromHeader = () => {
  const raw = (process.env.EMAIL_FROM || process.env.EMAIL_USER || '').trim();
  if (/<[^>]+>/.test(raw)) return raw;
  const name = (process.env.EMAIL_FROM_NAME || process.env.COMPANY_NAME || '').trim();
  return name ? { name, address: raw } : raw;
};

const escapeHtml = (text: string) =>
  String(text ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Plain-text twin of an HTML body. Mail with only HTML scores worse with spam filters. */
export const htmlToText = (html: string) =>
  html
    .replace(/<(style|script)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href, label) => {
      const text = label.replace(/<[^>]+>/g, '').trim();
      return text && text !== href ? `${text} (${href})` : href;
    })
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '- ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .split('\n')
    .map((line) => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

/** A complete HTML document (fragments without <html>/<body> look like spam to some filters). */
const wrapHtml = (subject: string, html: string) => {
  if (/<html[\s>]/i.test(html)) return html;
  const company = escapeHtml(process.env.EMAIL_FROM_NAME || process.env.COMPANY_NAME || '');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:24px;background:#f5f7fb;font-family:Arial,Helvetica,sans-serif;color:#1e293b;font-size:14px;line-height:1.5">
<div style="max-width:600px;margin:0 auto;background:#ffffff;border-radius:8px;padding:24px">
${html}
</div>
${company ? `<p style="max-width:600px;margin:12px auto 0;color:#94a3b8;font-size:12px;text-align:center">${company}</p>` : ''}
</body></html>`;
};

/** From, both bodies and the headers every message gets. */
const buildMessage = (subject: string, html: string) => {
  const from = fromHeader();
  const replyTo = (process.env.EMAIL_REPLY_TO || '').trim();
  return {
    from,
    ...(replyTo ? { replyTo } : {}),
    subject,
    html: wrapHtml(subject, html),
    text: htmlToText(html),
  };
};

const getTransporter = (): Mail | null => {
  if (!isEmailConfigured()) return null;
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    ...(process.env.EMAIL_HOST
      ? { host: process.env.EMAIL_HOST, port: Number(process.env.EMAIL_PORT) || 587 }
      : { service: process.env.EMAIL_SERVICE }),
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
    // Optional DKIM signing here, for an SMTP server that doesn't sign mail
    // itself (Gmail, Mailcow and SES already do). The public key goes in DNS
    // as <selector>._domainkey.<domain>.
    ...(process.env.DKIM_DOMAIN && process.env.DKIM_SELECTOR && process.env.DKIM_PRIVATE_KEY
      ? {
          dkim: {
            domainName: process.env.DKIM_DOMAIN,
            keySelector: process.env.DKIM_SELECTOR,
            privateKey: process.env.DKIM_PRIVATE_KEY.replace(/\\n/g, '\n'),
          },
        }
      : {}),
  } as any);

  // Mail whose From domain differs from the account sending it fails SPF/DMARC
  // alignment, which is the most common reason it lands in spam.
  const fromDomain = domainOf(fromAddress());
  const userDomain = domainOf(process.env.EMAIL_USER || '');
  if (fromDomain && userDomain && fromDomain !== userDomain && !process.env.DKIM_DOMAIN) {
    logger.warn(
      `[mail] EMAIL_FROM (${fromDomain}) is a different domain from EMAIL_USER (${userDomain}). ` +
        'Receivers will likely mark this mail as spam: send from an address on the account\'s own domain.'
    );
  }

  return transporter;
};

export const sendMail = async (
  to: string,
  subject: string,
  html: string,
  cc?: string[],
  options: { replyTo?: string } = {}
): Promise<boolean> => {
  const transport = getTransporter();
  if (!transport) {
    logger.warn(`Email not sent to ${to} ("${subject}") — SMTP is not configured.`);
    return false;
  }

  try {
    await transport.sendMail({
      ...buildMessage(subject, html),
      to,
      ...(cc && cc.length ? { cc } : {}),
      ...(options.replyTo ? { replyTo: options.replyTo } : {}),
    });
    return true;
  } catch (error) {
    logger.error(`Failed to send email to ${to}: ${error}`);
    return false;
  }
};

/**
 * Sends an email with a file attached (e.g. a generated Quotation or Invoice
 * PDF). Falls back the same way `sendMail` does when SMTP isn't configured.
 */
export const sendMailWithAttachment = async (
  to: string,
  subject: string,
  html: string,
  attachment: { filename: string; path: string }
): Promise<boolean> => {
  const transport = getTransporter();
  if (!transport) {
    logger.warn(`Email not sent to ${to} ("${subject}") — SMTP is not configured.`);
    return false;
  }

  try {
    await transport.sendMail({
      ...buildMessage(subject, html),
      to,
      attachments: [attachment],
    });
    return true;
  } catch (error) {
    logger.error(`Failed to send email with attachment to ${to}: ${error}`);
    return false;
  }
};

export const sendInviteEmail = async (
  email: string,
  inviteUrl: string,
  firstName: string,
  lastName: string
): Promise<boolean> => {
  const subject = "You're invited to join the team";
  const html = `
    <p>Hi ${firstName} ${lastName},</p>
    <p>You've been invited to join the CRM. Click the link below to set your password and get started:</p>
    <p><a href="${inviteUrl}">${inviteUrl}</a></p>
    <p>This invitation link will expire in 7 days.</p>
  `;
  return sendMail(email, subject, html);
};

export const sendResetPasswordEmail = async (
  email: string,
  resetUrl: string,
  firstName: string
): Promise<boolean> => {
  const subject = 'Reset your password';
  const html = `
    <p>Hi ${firstName},</p>
    <p>We received a request to reset your password. Click the link below to choose a new one:</p>
    <p><a href="${resetUrl}">${resetUrl}</a></p>
    <p>This link will expire in 1 hour. If you didn't request this, you can safely ignore this email.</p>
  `;
  return sendMail(email, subject, html);
};

/**
 * Generic notification email — used for task assignments, overdue reminders,
 * quote approvals/rejections, invoice payments, lead conversions, etc.
 * Kept intentionally simple/plain so a single template covers every notification type.
 */
export const sendGenericNotificationEmail = async (
  email: string,
  title: string,
  message: string
): Promise<boolean> => {
  const appUrl = (process.env.CLIENT_URL || '').replace(/\/+$/, '');
  const html = `
    <h3 style="margin:0 0 8px">${escapeHtml(title)}</h3>
    <p style="margin:0 0 16px">${escapeHtml(message)}</p>
    ${appUrl ? `<p style="margin:0"><a href="${escapeHtml(appUrl)}/notifications">Open in CRM</a></p>` : ''}
  `;
  return sendMail(email, title, html);
};

/**
 * Auto-sent when a Meeting is scheduled — one email to the client, CC'd to
 * the assigned rep and any picked CC recipients (typically other contacts
 * at the same company). Falls back the same way every other email in this
 * app does when SMTP isn't configured (logs + returns false, doesn't throw
 * and never blocks the Meeting from being created).
 */
export const sendMeetingInviteEmail = async (
  toEmail: string,
  meeting: { title: string; date: string | Date; time?: string | null; duration?: string | null; type: string; notes?: string | null; meetLink?: string | null },
  ccEmails: string[] = []
): Promise<boolean> => {
  const dateStr = new Date(meeting.date).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const subject = `Meeting scheduled: ${meeting.title}`;
  const html = `
    <p>A meeting has been scheduled:</p>
    <p>
      <strong>${meeting.title}</strong><br/>
      ${dateStr}${meeting.time ? ` at ${meeting.time}` : ''}${meeting.duration ? ` (${meeting.duration})` : ''}<br/>
      Type: ${meeting.type}
    </p>
    ${meeting.meetLink ? `<p><a href="${meeting.meetLink}">Join with Google Meet</a></p>` : ''}
    ${meeting.notes ? `<p>${meeting.notes}</p>` : ''}
  `;
  return sendMail(toEmail, subject, html, ccEmails);
};
