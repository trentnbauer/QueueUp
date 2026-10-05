import type { FastifyInstance } from 'fastify';
import { prisma } from '../db/client.js';
import { HttpError } from '../util/httpError.js';

export type AnalyticsConsentValue = 'granted' | 'denied';

/** The stored answer, or null when it was never given (or isn't one of the two valid values). */
export function parseConsent(value: unknown): AnalyticsConsentValue | null {
  return value === 'granted' || value === 'denied' ? value : null;
}

/** The person's answer to "share usage stats?", kept on their account so it survives a cleared
 * browser, a new device or an update (it used to live only in one browser's local storage, which a
 * clear turned back into "no answer", that is, off). */
export default async function analyticsConsentRoutes(app: FastifyInstance) {
  app.get('/api/me/analytics-consent', async (request): Promise<{ consent: AnalyticsConsentValue | null }> => {
    const userId = await request.requireAuth();
    const user = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { analyticsConsent: true } });
    return { consent: parseConsent(user.analyticsConsent) };
  });

  app.put<{ Body: { consent: unknown } }>('/api/me/analytics-consent', async (request): Promise<{ consent: AnalyticsConsentValue }> => {
    const userId = await request.requireAuth();
    const consent = parseConsent(request.body?.consent);
    if (!consent) throw new HttpError(400, 'consent must be "granted" or "denied"');
    await prisma.user.update({ where: { id: userId }, data: { analyticsConsent: consent } });
    return { consent };
  });
}
