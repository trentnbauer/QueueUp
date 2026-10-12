import type { FastifyInstance } from 'fastify';
import { promises as fs } from 'node:fs';
import type { LegalConfig } from '@queueup/shared';
import { env } from '../config/env.js';

/** A legal text is read from disk on each request but never past this size. */
const MAX_BYTES = 200_000;

async function readText(file: string | undefined, app: FastifyInstance): Promise<string | null> {
  if (!file) return null;
  try {
    const buf = await fs.readFile(file);
    if (buf.length > MAX_BYTES) {
      app.log.warn({ file }, 'Legal text file is too large and was ignored');
      return null;
    }
    return buf.toString('utf8');
  } catch (err) {
    app.log.warn({ file, err }, 'Could not read legal text file; showing the default text');
    return null;
  }
}

/** Public: the operator's contact and any custom terms / privacy text (#1097). Re-read on every
 * request, so editing a mounted file needs no restart. */
export default async function legalRoutes(app: FastifyInstance) {
  app.get('/api/legal', async (): Promise<LegalConfig> => {
    const [terms, privacy] = await Promise.all([readText(env.TERMS_FILE, app), readText(env.PRIVACY_FILE, app)]);
    return { contact: env.LEGAL_CONTACT?.trim() || null, terms, privacy };
  });
}
