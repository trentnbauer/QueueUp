import { createHash, randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import type { AlertEmailResponse, SetAlertEmailRequest, SetAlertEmailResponse } from '@queueup/shared';
import { env } from '../config/env.js';
import { prisma } from '../db/client.js';
import { HttpError } from '../util/httpError.js';
import { sendMail, smtpIsConfigured } from '../services/mailer.js';
import { notifyAccountChange } from '../services/notifications.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONFIRM_TTL_MS = 24 * 60 * 60 * 1000;

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/** The address alert emails go to: the one the person set, else their account's email. */
export async function alertEmailFor(userId: string): Promise<string> {
  const u = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, alertEmail: true } });
  return u.alertEmail ?? u.email;
}

/** The email address alerts are sent to. Separate from the account email (which comes from the
 * sign-in provider, is refreshed on every sign-in and decides admin rights), so changing it here
 * never affects sign-in. A new address has to be confirmed from a link sent to it, so nobody can
 * point alerts at someone else's mailbox; when the server can't send email at all there is nothing
 * to confirm with, so it is simply saved. */
export default async function alertEmailRoutes(app: FastifyInstance) {
  app.get('/api/me/alert-email', async (request): Promise<AlertEmailResponse> => {
    const userId = await request.requireAuth();
    const [user, pending] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, alertEmail: true } }),
      prisma.emailChangeRequest.findUnique({ where: { userId } }),
    ]);
    return {
      accountEmail: user.email,
      alertEmail: user.alertEmail,
      effectiveEmail: user.alertEmail ?? user.email,
      pending: pending && pending.expiresAt > new Date() ? pending.email : null,
    };
  });

  app.put<{ Body: SetAlertEmailRequest }>(
    '/api/me/alert-email',
    { config: { rateLimit: { max: 5, timeWindow: '1 hour' } } },
    async (request): Promise<SetAlertEmailResponse> => {
      const userId = await request.requireAuth();
      const raw = request.body?.email;
      if (raw === null || raw === undefined || (typeof raw === 'string' && raw.trim() === '')) {
        // Back to using the account's own email.
        await prisma.$transaction([
          prisma.user.update({ where: { id: userId }, data: { alertEmail: null } }),
          prisma.emailChangeRequest.deleteMany({ where: { userId } }),
        ]);
        await notifyAccountChange(userId, 'Your email address for alerts was reset to your sign-in email.');
        return { status: 'saved' };
      }
      if (typeof raw !== 'string') throw new HttpError(400, 'Enter an email address');
      const email = raw.trim().toLowerCase();
      if (email.length > 254 || !EMAIL_RE.test(email)) throw new HttpError(400, 'That does not look like an email address');

      if (!(await smtpIsConfigured())) {
        await prisma.user.update({ where: { id: userId }, data: { alertEmail: email } });
        await notifyAccountChange(userId, `Your email address for alerts was changed to ${email}.`);
        return { status: 'saved' };
      }

      const token = randomBytes(32).toString('base64url');
      await prisma.emailChangeRequest.upsert({
        where: { userId },
        create: { userId, email, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + CONFIRM_TTL_MS) },
        update: { email, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + CONFIRM_TTL_MS), createdAt: new Date() },
      });
      try {
        await sendMail({
          to: email,
          subject: 'Confirm your email for QueueUp alerts',
          text: [
            'Someone (hopefully you) asked to send QueueUp alerts to this address.',
            '',
            `Confirm it here: ${env.APP_BASE_URL}/confirm-email/${token}`,
            '',
            'The link works for 24 hours. If this was not you, ignore this email and nothing changes.',
          ].join('\n'),
        });
      } catch {
        await prisma.emailChangeRequest.deleteMany({ where: { userId } });
        throw new HttpError(502, 'Could not send the confirmation email. Check the address and try again.');
      }
      return { status: 'confirmation_sent' };
    },
  );

  // Opened from the link in the email, so it works whether or not the person is signed in: the
  // single-use token is the proof.
  app.post<{ Body: { token?: string } }>(
    '/api/email/confirm',
    { config: { rateLimit: { max: 20, timeWindow: '1 hour' } } },
    async (request) => {
      const token = request.body?.token;
      if (typeof token !== 'string' || token.length < 20 || token.length > 200) throw new HttpError(400, 'This link is not valid');
      const row = await prisma.emailChangeRequest.findUnique({ where: { tokenHash: hashToken(token) } });
      if (!row || row.expiresAt < new Date()) throw new HttpError(400, 'This link is not valid or has expired');
      await prisma.$transaction([
        prisma.user.update({ where: { id: row.userId }, data: { alertEmail: row.email } }),
        prisma.emailChangeRequest.delete({ where: { userId: row.userId } }),
      ]);
      await notifyAccountChange(row.userId, `Your email address for alerts was changed to ${row.email}.`);
      return { email: row.email };
    },
  );
}
