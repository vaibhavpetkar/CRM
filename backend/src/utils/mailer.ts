import nodemailer from 'nodemailer';
import logger from './logger';

// Lazily-created singleton transporter. If SMTP env vars aren't configured,
// callers get `false` back and the caller falls back to dev-mode behavior
// (e.g. returning the raw link in the API response instead of emailing it).
let transporter: nodemailer.Transporter | null = null;

const isEmailConfigured = (): boolean => {
  return Boolean(process.env.EMAIL_SERVICE && process.env.EMAIL_USER && process.env.EMAIL_PASS);
};

const getTransporter = (): nodemailer.Transporter | null => {
  if (!isEmailConfigured()) return null;
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE,
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  return transporter;
};

const sendMail = async (to: string, subject: string, html: string): Promise<boolean> => {
  const transport = getTransporter();
  if (!transport) {
    logger.warn(`Email not sent to ${to} ("${subject}") — SMTP is not configured.`);
    return false;
  }

  try {
    await transport.sendMail({
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to,
      subject,
      html,
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
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
      to,
      subject,
      html,
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
  const html = `
    <h3>${title}</h3>
    <p>${message}</p>
  `;
  return sendMail(email, title, html);
};
