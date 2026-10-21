/**
 * Email templates. Each returns { subject, text, html }: the plain-text part
 * is for mail clients that do not render HTML (and for the console outbox).
 *
 * Any value that comes from users (names, event titles) MUST go through
 * escapeHtml() before it is placed in HTML.
 */
import { env } from '../config/env.js';

/** @param {unknown} value */
export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** Wraps content in a simple, inline-styled layout that works in most mail clients. */
function layout(title, bodyHtml) {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px;background:#f4f6f8;font-family:Arial,Helvetica,sans-serif;color:#1f2937">
    <table role="presentation" width="100%" style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:8px">
      <tr><td style="padding:20px 24px;background:#1e3a5f;color:#ffffff;border-radius:8px 8px 0 0">
        <strong style="font-size:18px">${escapeHtml(env.APP_NAME)}</strong>
      </td></tr>
      <tr><td style="padding:24px">
        <h1 style="margin:0 0 16px;font-size:20px">${escapeHtml(title)}</h1>
        ${bodyHtml}
      </td></tr>
      <tr><td style="padding:16px 24px;font-size:12px;color:#6b7280">
        This is an automated message from ${escapeHtml(env.APP_NAME)}. Please do not reply.
      </td></tr>
    </table>
  </body>
</html>`;
}

const button = (url, label) =>
  `<p style="margin:24px 0"><a href="${escapeHtml(url)}" style="background:#0f766e;color:#ffffff;padding:12px 20px;border-radius:6px;text-decoration:none;display:inline-block">${escapeHtml(label)}</a></p>`;

/**
 * @param {{ name: string, resetUrl: string, ttlMinutes: number }} params
 */
export function passwordResetEmail({ name, resetUrl, ttlMinutes }) {
  const subject = 'Reset your CEMS password';
  const text = [
    `Hi ${name},`,
    '',
    'We received a request to reset your password. Open this link to choose a new one:',
    resetUrl,
    '',
    `The link expires in ${ttlMinutes} minutes and can only be used once.`,
    "If you didn't ask for this, you can ignore this email; your password will not change.",
  ].join('\n');

  const html = layout(
    'Reset your password',
    `<p>Hi ${escapeHtml(name)},</p>
     <p>We received a request to reset your password. Click the button below to choose a new one.</p>
     ${button(resetUrl, 'Reset password')}
     <p>The link expires in ${ttlMinutes} minutes and can only be used once.</p>
     <p style="color:#6b7280">If you didn't ask for this, you can ignore this email; your password will not change.</p>`,
  );

  return { subject, text, html };
}

/**
 * @param {{ name: string, code: string, ttlMinutes: number }} params
 */
export function twoFactorCodeEmail({ name, code, ttlMinutes }) {
  const subject = `Your CEMS login code: ${code}`;
  const text = [
    `Hi ${name},`,
    '',
    `Your login code is: ${code}`,
    '',
    `It expires in ${ttlMinutes} minutes. Never share this code with anyone.`,
    "If you didn't just try to log in, change your password immediately.",
  ].join('\n');

  const html = layout(
    'Your login code',
    `<p>Hi ${escapeHtml(name)},</p>
     <p>Enter this code to finish logging in:</p>
     <p style="font-size:32px;letter-spacing:8px;font-weight:bold;margin:24px 0">${escapeHtml(code)}</p>
     <p>It expires in ${ttlMinutes} minutes. Never share this code with anyone.</p>
     <p style="color:#6b7280">If you didn't just try to log in, change your password immediately.</p>`,
  );

  return { subject, text, html };
}
