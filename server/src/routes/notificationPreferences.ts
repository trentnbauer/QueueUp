import { logAccountEvent } from '../services/accountEvents.js';
import type { FastifyInstance } from 'fastify';
import {
  EMAIL_ALERT_LABELS,
  EMAIL_ALERT_TYPES,
  type EmailAlertType,
  type NotificationPreferenceDto,
  type NotificationPreferencesResponse,
  type SetNotificationPreferenceRequest,
} from '@queueup/shared';
import { prisma } from '../db/client.js';
import { HttpError } from '../util/httpError.js';
import { smtpIsConfigured } from '../services/mailer.js';

/** Which alerts a person gets in the bell and by email. */
export default async function notificationPreferenceRoutes(app: FastifyInstance) {
  app.get('/api/me/notification-preferences', async (request): Promise<NotificationPreferencesResponse> => {
    const userId = await request.requireAuth();
    const [user, rows, emailAvailable] = await Promise.all([
      prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { email: true, alertEmail: true } }),
      prisma.notificationPreference.findMany({ where: { userId } }),
      smtpIsConfigured(),
    ]);
    const byType = new Map(rows.map((r) => [r.type, r]));
    const preferences: NotificationPreferenceDto[] = EMAIL_ALERT_TYPES.map((type) => ({
      type,
      label: EMAIL_ALERT_LABELS[type],
      email: byType.get(type)?.email ?? false,
      inApp: byType.get(type)?.inApp ?? true,
    }));
    return { emailAvailable, email: user.alertEmail ?? user.email, preferences };
  });

  app.put<{ Body: SetNotificationPreferenceRequest }>(
    '/api/me/notification-preferences',
    { config: { rateLimit: { max: 60, timeWindow: '1 minute' } } },
    async (request) => {
      const userId = await request.requireAuth();
      const { type, email, inApp } = request.body ?? {};
      if (typeof type !== 'string' || !(EMAIL_ALERT_TYPES as readonly string[]).includes(type)) throw new HttpError(400, 'Unknown alert type');
      if (email !== undefined && typeof email !== 'boolean') throw new HttpError(400, 'email must be true or false');
      if (inApp !== undefined && typeof inApp !== 'boolean') throw new HttpError(400, 'inApp must be true or false');
      if (email === undefined && inApp === undefined) throw new HttpError(400, 'Nothing to change');
      if (email && !(await smtpIsConfigured())) throw new HttpError(409, 'Email alerts are not set up on this server');

      const alertType = type as EmailAlertType;
      const existing = await prisma.notificationPreference.findUnique({ where: { userId_type: { userId, type: alertType } } });
      // Switching email on starts a fresh cut-off, so only alerts from now on are emailed.
      const startingEmail = email === true && !existing?.email;
      await prisma.notificationPreference.upsert({
        where: { userId_type: { userId, type: alertType } },
        create: { userId, type: alertType, email: email ?? false, inApp: inApp ?? true, ...(email === true && { emailEnabledAt: new Date() }) },
        update: {
          ...(email !== undefined && { email }),
          ...(inApp !== undefined && { inApp }),
          ...(startingEmail && { emailEnabledAt: new Date() }),
        },
      });
      const what = type.replace(/_/g, ' ');
      if (email !== undefined && email !== (existing?.email ?? false)) {
        void logAccountEvent(userId, 'notification_email', `Email alerts for ${what} turned ${email ? 'on' : 'off'}.`);
      }
      if (inApp !== undefined && inApp !== (existing?.inApp ?? true)) {
        void logAccountEvent(userId, 'notification_in_app', `In-app alerts for ${what} turned ${inApp ? 'on' : 'off'}.`);
      }
      return { ok: true };
    },
  );
}
