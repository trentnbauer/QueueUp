import type { FastifyInstance } from 'fastify';
import type { LibraryFileImportRequest, LibraryFilePreview, LibrarySyncProgress, PlayniteImportStarted } from '@queueup/shared';
import { HttpError } from '../util/httpError.js';
import { getLibrarySyncProgress, startLibrarySync, type LibrarySyncSource } from '../services/librarySync.js';
import { buildEntries, parseLibraryFile, previewLibraryFile } from '../services/libraryFile.js';

export const FILE_SOURCE: LibrarySyncSource = { source: 'file', syncSource: 'file', label: 'Your file import' };
// A few thousand rows is well under 2 MB; the cap leaves room for a verbose Takeout file.
const MAX_FILE_BYTES = 8 * 1024 * 1024;

function textOf(body: LibraryFileImportRequest | undefined): string {
  if (typeof body?.text !== 'string') throw new HttpError(400, 'Choose a file to import.');
  return body.text;
}

/** Import a library from a CSV/JSON file (issue #1047). The file's text is read in the browser and
 * posted here; the titles then go through the same IGDB matching, shelf and Needs matching code as
 * every other library sync (see librarySync.ts). Cookie-session only. */
export default async function libraryFileImportRoutes(app: FastifyInstance) {
  app.post<{ Body: LibraryFileImportRequest }>(
    '/api/me/import/file/preview',
    { bodyLimit: MAX_FILE_BYTES, config: { rateLimit: { max: 30, timeWindow: '1 hour' } } },
    async (request): Promise<LibraryFilePreview> => {
      await request.requireAuth();
      return previewLibraryFile(textOf(request.body));
    },
  );

  app.post<{ Body: LibraryFileImportRequest }>(
    '/api/me/import/file',
    { bodyLimit: MAX_FILE_BYTES, config: { rateLimit: { max: 10, timeWindow: '1 hour' } } },
    async (request): Promise<PlayniteImportStarted> => {
      const userId = await request.requireAuth();
      const mapping = request.body?.mapping;
      if (!mapping || typeof mapping.titleColumn !== 'string') throw new HttpError(400, 'Pick the column that holds the game title.');
      const entries = buildEntries(parseLibraryFile(textOf(request.body)), mapping);
      return startLibrarySync(userId, FILE_SOURCE, entries, request.log);
    },
  );

  app.get('/api/me/import/file/progress', { config: { rateLimit: { max: 120, timeWindow: '1 minute' } } }, async (request): Promise<{ progress: LibrarySyncProgress | null }> => {
    const userId = await request.requireAuth();
    return { progress: await getLibrarySyncProgress(FILE_SOURCE.source, userId) };
  });
}
