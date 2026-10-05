import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import { getConfigValue } from './configResolver.js';
import { logEmail, type EmailKind } from './emailLog.js';

export interface SmtpSettings {
  host: string;
  port: number;
  user: string | undefined;
  password: string | undefined;
  from: string;
}

/** The SMTP settings in effect (env first, then Administrator settings), or null when the host,
 * port or from address isn't set - email alerts are then off. */
export async function getSmtpSettings(): Promise<SmtpSettings | null> {
  const [host, portText, user, password, from] = await Promise.all([
    getConfigValue('SMTP_HOST', env.SMTP_HOST),
    getConfigValue('SMTP_PORT', env.SMTP_PORT),
    getConfigValue('SMTP_USER', env.SMTP_USER),
    getConfigValue('SMTP_PASSWORD', env.SMTP_PASSWORD),
    getConfigValue('SMTP_FROM', env.SMTP_FROM),
  ]);
  const port = Number(portText);
  if (!host || !from || !Number.isInteger(port) || port < 1 || port > 65535) return null;
  return { host, port, user, password, from };
}

export async function smtpIsConfigured(): Promise<boolean> {
  return (await getSmtpSettings()) !== null;
}

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  /** The themed HTML version (see emailTemplates.ts). `text` is still sent as the fallback part. */
  html?: string;
  /** What this email is, for the Administrator page's email log. */
  kind: EmailKind;
}

/** Sends one email (themed HTML plus a plain-text fallback) through the configured SMTP server. Port 465 uses implicit TLS; any
 * other port starts plain and upgrades with STARTTLS when the server offers it. Throws when SMTP
 * isn't configured or the server refuses the message. */
export async function sendMail(message: MailMessage): Promise<void> {
  const smtp = await getSmtpSettings();
  if (!smtp) throw new Error('SMTP is not configured');
  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.port === 465,
    auth: smtp.user ? { user: smtp.user, pass: smtp.password ?? '' } : undefined,
    connectionTimeout: 15_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  });
  try {
    await transport.sendMail({ from: smtp.from, to: message.to, subject: message.subject, text: message.text, html: message.html });
    await logEmail({ kind: message.kind, to: message.to, subject: message.subject });
  } catch (err) {
    await logEmail({ kind: message.kind, to: message.to, subject: message.subject, error: err });
    throw err;
  } finally {
    transport.close();
  }
}
