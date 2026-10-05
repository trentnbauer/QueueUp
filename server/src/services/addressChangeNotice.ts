import { env } from '../config/env.js';
import { prisma } from '../db/client.js';
import { renderAddressChanged } from './emailTemplates.js';
import { isUndeliverableAddress } from './emailRecipient.js';
import { sendMail, smtpIsConfigured } from './mailer.js';

/** Who to tell that alerts moved: the address they used to go to, and the account's own (sign-in)
 * email, minus the address now in use (it is the one that was just set, or the person's own choice)
 * and anything undeliverable. An account email the provider never verified is left out too (it can
 * be anyone's), including when it is the address alerts used to go to. Compared case-insensitively,
 * each address once. */
export function noticeRecipients(previousEffective: string, accountEmail: string, currentEffective: string, accountEmailVerified = true): string[] {
  const current = currentEffective.trim().toLowerCase();
  const unverified = accountEmailVerified ? null : accountEmail.trim().toLowerCase();
  const seen = new Set<string>();
  const out: string[] = [];
  for (const address of [previousEffective, accountEmail]) {
    const key = address.trim().toLowerCase();
    if (!key || key === current || key === unverified || seen.has(key) || isUndeliverableAddress(key)) continue;
    seen.add(key);
    out.push(address.trim());
  }
  return out;
}

/** After a person's alert email changes, tells the address it changed *away from* (and their
 * account email) by email. Without this, someone who hijacked a session could point alerts
 * at their own mailbox and the real owner would never hear about it at the address they actually
 * read. Sent whatever the person's alert preferences are, since it is a security notice. Does
 * nothing when the server can't send email or the address didn't really change. Best effort: it
 * logs a failure and never throws, so it can't undo or fail the change itself. */
export async function warnPreviousAddresses(userId: string, previousEffective: string): Promise<void> {
  try {
    if (!(await smtpIsConfigured())) return;
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, alertEmail: true, emailVerified: true } });
    if (!user) return;
    const current = user.alertEmail ?? user.email;
    if (current.toLowerCase() === previousEffective.toLowerCase()) return;
    const mail = renderAddressChanged({ newAddress: user.alertEmail, appBaseUrl: env.APP_BASE_URL });
    for (const to of noticeRecipients(previousEffective, user.email, current, user.emailVerified)) {
      try {
        await sendMail({ to, subject: mail.subject, text: mail.text, html: mail.html, kind: 'address_changed' });
      } catch (err) {
        console.error('[address-change] could not send a notice', err instanceof Error ? err.message : err);
      }
    }
  } catch (err) {
    console.error('[address-change] could not look up who to notify', err instanceof Error ? err.message : err);
  }
}
