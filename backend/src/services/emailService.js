/**
 * Sends email through Nodemailer.
 *
 * - With SMTP_HOST set, mail goes out through that server (e.g. Gmail with an
 *   app password, Mailtrap, Brevo).
 * - Without it (development and tests), nothing is sent: each message is
 *   printed to the console and kept in an in-memory outbox, so reset links and
 *   2FA codes can still be used locally and checked in tests.
 */
import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

const OUTBOX_LIMIT = 50;

/** @type {{ to: string, subject: string, text: string, html?: string, attachments: string[] }[]} */
const outbox = [];

const usingSmtp = Boolean(env.SMTP_HOST);

const transporter = usingSmtp
  ? nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_SECURE,
      auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASS } : undefined,
    })
  : nodemailer.createTransport({ jsonTransport: true });

/**
 * @param {{ to: string, subject: string, text: string, html?: string,
 *           attachments?: import('nodemailer/lib/mailer').Attachment[] }} message
 */
export async function sendEmail({ to, subject, text, html, attachments }) {
  const info = await transporter.sendMail({
    from: env.EMAIL_FROM,
    to,
    subject,
    text,
    html,
    attachments,
  });

  if (!usingSmtp) {
    outbox.push({
      to,
      subject,
      text,
      html,
      attachments: (attachments ?? []).map((a) => a.filename),
    });
    if (outbox.length > OUTBOX_LIMIT) outbox.shift();
    if (!env.isTest) {
      console.log(`\n[email not sent - no SMTP_HOST] To: ${to}\nSubject: ${subject}\n\n${text}\n`);
    }
  }
  return info;
}

/** Messages "sent" without SMTP, oldest first. For development and tests only. */
export const getOutbox = () => [...outbox];

export const clearOutbox = () => {
  outbox.length = 0;
};
