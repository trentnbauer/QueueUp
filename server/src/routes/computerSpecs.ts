import type { FastifyInstance } from 'fastify';
import type { ComputerSpecs } from '@queueup/shared';
import { prisma } from '../db/client.js';
import { logAccountEvent } from '../services/accountEvents.js';
import { isEmptySpecs, parseComputerSpecs, specsFromRow } from '../services/computerSpecs.js';

/** The computer a person plays on, typed in by them. Private: only ever read back to its owner (and in
 * their own data export). */
export default async function computerSpecsRoutes(app: FastifyInstance) {
  app.get('/api/me/computer-specs', async (request): Promise<ComputerSpecs> => {
    const userId = await request.requireAuth();
    return specsFromRow(await prisma.userComputerSpecs.findUnique({ where: { userId } }));
  });

  app.put<{ Body: unknown }>('/api/me/computer-specs', { config: { rateLimit: { max: 30, timeWindow: '1 minute' } } }, async (request): Promise<ComputerSpecs> => {
    const userId = await request.requireAuth();
    const specs = parseComputerSpecs(request.body);
    if (isEmptySpecs(specs)) {
      await prisma.userComputerSpecs.deleteMany({ where: { userId } });
    } else {
      await prisma.userComputerSpecs.upsert({ where: { userId }, create: { userId, ...specs }, update: specs });
    }
    void logAccountEvent(userId, 'computer_specs', isEmptySpecs(specs) ? 'Computer specs cleared.' : 'Computer specs updated.');
    return specs;
  });
}
