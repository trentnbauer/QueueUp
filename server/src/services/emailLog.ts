import { prisma } from '../db/client.js';

export type EmailKind = 'alert_digest' | 'confirm_email' | 'smtp_test';

/** Rows older than this are deleted. */
export const EMAIL_LOG_RETENTION_DAYS = 90;
const PRUNE_CHANCE = 0.02;
const MAX_ERROR_LENGTH = 300;

/** Records one send attempt for the Administrator page. Never stores the body. Failing to write the
 * log must never turn a sent (or failed) email into a different error, so this swallows its own. */
export async function logEmail(entry: { kind: EmailKind; to: string; subject: string; error?: unknown }): Promise<void> {
  try {
    const failed = entry.error !== undefined;
    const message = failed ? (entry.error instanceof Error ? entry.error.message : String(entry.error)) : null;
    await prisma.emailLog.create({
      data: {
        kind: entry.kind,
        toAddress: entry.to.slice(0, 254),
        subject: entry.subject.slice(0, 200),
        status: failed ? 'failed' : 'sent',
        error: message ? message.replace(/\s+/g, ' ').slice(0, MAX_ERROR_LENGTH) : null,
      },
    });
    // Occasionally, rather than on every send: an indexed delete, but the digest can send often.
    if (Math.random() < PRUNE_CHANCE) {
      await prisma.emailLog.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - EMAIL_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000) } } });
    }
  } catch (err) {
    console.error('[emailLog] could not record an email', err instanceof Error ? err.message : err);
  }
}
