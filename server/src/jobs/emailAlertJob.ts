import { env } from '../config/env.js';
import { prisma } from '../db/client.js';
import { sendMail, smtpIsConfigured } from '../services/mailer.js';
import { scheduleJob, type JobHandle } from './scheduler.js';

export const EMAIL_ALERT_INTERVAL_MS = 2 * 60 * 1000;
/** Alerts older than this are never emailed (so a long SMTP outage, or switching email on, doesn't
 * mail a pile of stale news once it's back). */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
/** Gives someone a moment to see an alert in the app before it's emailed as well. */
const MIN_AGE_MS = 60 * 1000;
const MAX_LINES = 20;
/** At most this many emails per run, so a burst can't flood the SMTP server. */
const MAX_EMAILS_PER_RUN = 50;

/** Emails each person a short digest of their unread direct alerts that they've switched email on
 * for. One email per person per run, however many alerts are waiting. Only alerts created after
 * the person switched that type on are included, and only ones still unread. A failed send is
 * logged and retried on the next run (until the alert is too old). */
export async function sendEmailAlerts(): Promise<void> {
  if (!(await smtpIsConfigured())) return;

  const prefs = await prisma.notificationPreference.findMany({
    where: { email: true },
    select: { userId: true, type: true, updatedAt: true, user: { select: { email: true, alertEmail: true } } },
  });
  if (prefs.length === 0) return;

  const byUser = new Map<string, { email: string; types: { type: (typeof prefs)[number]['type']; since: Date }[] }>();
  for (const p of prefs) {
    const entry = byUser.get(p.userId) ?? { email: p.user.alertEmail ?? p.user.email, types: [] };
    entry.types.push({ type: p.type, since: p.updatedAt });
    byUser.set(p.userId, entry);
  }

  const now = Date.now();
  const oldest = new Date(now - MAX_AGE_MS);
  const newest = new Date(now - MIN_AGE_MS);
  let sent = 0;

  for (const [userId, { email, types }] of byUser) {
    if (sent >= MAX_EMAILS_PER_RUN) break;
    if (!email) continue;
    const waiting = await prisma.notification.findMany({
      where: {
        recipientId: userId,
        readAt: null,
        emailedAt: null,
        createdAt: { gte: oldest, lte: newest },
        OR: types.map((t) => ({ type: t.type, createdAt: { gte: t.since } })),
      },
      orderBy: { createdAt: 'asc' },
      select: { id: true, message: true },
    });
    if (waiting.length === 0) continue;

    const lines = waiting.slice(0, MAX_LINES).map((n) => `- ${n.message}`);
    if (waiting.length > MAX_LINES) lines.push(`…and ${waiting.length - MAX_LINES} more`);
    const text = [
      waiting.length === 1 ? 'You have a new alert on QueueUp:' : `You have ${waiting.length} new alerts on QueueUp:`,
      '',
      ...lines,
      '',
      `Open QueueUp: ${env.APP_BASE_URL}`,
      '',
      'You are getting this because you turned on email alerts. You can choose which alerts you get under Settings > Notifications.',
    ].join('\n');

    try {
      await sendMail({ to: email, subject: waiting.length === 1 ? 'QueueUp: 1 new alert' : `QueueUp: ${waiting.length} new alerts`, text });
      await prisma.notification.updateMany({ where: { id: { in: waiting.map((n) => n.id) } }, data: { emailedAt: new Date() } });
      sent += 1;
    } catch (err) {
      console.error('[email-alerts] could not send to a user, will retry', err instanceof Error ? err.message : err);
    }
  }
}

export function startEmailAlertJob(): JobHandle {
  return scheduleJob({
    name: 'email-alerts',
    intervalMs: EMAIL_ALERT_INTERVAL_MS,
    run: sendEmailAlerts,
  });
}
