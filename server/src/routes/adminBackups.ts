import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { AdminBackupsResponse, RestoreBackupResponse, UpdateBackupSettingsRequest } from '@queueup/shared';
import { HttpError } from '../util/httpError.js';
import { requireAdmin, requireSuperAdmin } from '../services/adminAccess.js';
import { logAdminAction } from '../services/adminAuditLog.js';
import { prisma } from '../db/client.js';
import {
  deleteBackup,
  getAdminBackupSettings,
  isBackupName,
  listBackups,
  readBackupFile,
  restoreBackup,
  type RestoreOptions,
  runScheduledBackup,
  updateBackupSettings,
} from '../services/backup.js';

/** Admin Backups: settings (on/off, cron schedule, retention), the file list, back up now, download,
 * delete, restore from a stored file, and import (restore from an uploaded file). All admin-only. */

// Uploaded backups are sent as the raw request body (the gzip file itself) rather than multipart.
const MAX_IMPORT_BYTES = 1024 * 1024 * 1024;

/** Restore options travel in headers, since an import's body is the raw backup file. The old
 * session key is URI-encoded by the client (header values must be ASCII) and never logged. */
function restoreOptions(request: FastifyRequest): RestoreOptions {
  const raw = request.headers['x-backup-session-key'];
  let sessionKey: string | undefined;
  if (typeof raw === 'string' && raw) {
    try {
      sessionKey = decodeURIComponent(raw);
    } catch {
      throw new HttpError(400, 'Could not read the session key that was sent.');
    }
  }
  return { sessionKey, skipEncrypted: request.headers['x-backup-skip-encrypted'] === '1' };
}

const limit = { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } };

export default async function adminBackupRoutes(app: FastifyInstance) {
  // Every route here is admin-only, and that's checked before the body is read: otherwise anyone
  // could make the server buffer a large upload just to be told 401 afterwards.
  app.addHook('onRequest', async (request) => {
    await requireAdmin(await request.requireAuth());
  });

  // Scoped to this plugin: accept gzip/octet-stream bodies as Buffers. Only the import route
  // raises the body limit (see its options); the rest keep the app default.
  app.addContentTypeParser(['application/gzip', 'application/octet-stream'], { parseAs: 'buffer' }, (_req, body, done) => done(null, body));

  // Listing backups and taking one are for any administrator; everything that hands over, changes or
  // replaces the data is for a Super administrator (#1102).
  const actor = async (request: { requireAuth: () => Promise<string> }, opts: { superAdmin?: boolean } = {}) => {
    const userId = await request.requireAuth();
    await (opts.superAdmin ? requireSuperAdmin(userId) : requireAdmin(userId));
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { displayName: true } });
    return { userId, label: user?.displayName ?? userId };
  };

  app.get('/api/admin/backups', async (request): Promise<AdminBackupsResponse> => {
    await actor(request);
    return { settings: await getAdminBackupSettings(), backups: await listBackups() };
  });

  app.patch<{ Body: UpdateBackupSettingsRequest }>('/api/admin/backups/settings', limit, async (request) => {
    const { userId, label } = await actor(request, { superAdmin: true });
    const body = request.body ?? {};
    const settings = await updateBackupSettings(
      {
        ...(typeof body.enabled === 'boolean' && { enabled: body.enabled }),
        ...(typeof body.cron === 'string' && { cron: body.cron }),
        ...(typeof body.retention === 'number' && { retention: body.retention }),
      },
      userId,
    );
    await logAdminAction({ actorId: userId, actorLabel: label, action: 'backup.settings', metadata: { ...settings } });
    return { settings: await getAdminBackupSettings() };
  });

  app.post('/api/admin/backups', limit, async (request) => {
    const { userId, label } = await actor(request);
    const backup = await runScheduledBackup('manual');
    await logAdminAction({ actorId: userId, actorLabel: label, action: 'backup.create', targetLabel: backup.name });
    return { backup };
  });

  app.get<{ Params: { name: string } }>('/api/admin/backups/:name/download', limit, async (request, reply) => {
    const { userId, label } = await actor(request, { superAdmin: true });
    const data = await readBackupFile(request.params.name);
    await logAdminAction({ actorId: userId, actorLabel: label, action: 'backup.download', targetLabel: request.params.name });
    reply.header('Content-Type', 'application/gzip');
    reply.header('Content-Disposition', `attachment; filename="${request.params.name}"`);
    return reply.send(data);
  });

  app.delete<{ Params: { name: string } }>('/api/admin/backups/:name', limit, async (request, reply) => {
    const { userId, label } = await actor(request, { superAdmin: true });
    await deleteBackup(request.params.name);
    await logAdminAction({ actorId: userId, actorLabel: label, action: 'backup.delete', targetLabel: request.params.name });
    return reply.status(204).send();
  });

  app.post<{ Params: { name: string } }>('/api/admin/backups/:name/restore', limit, async (request): Promise<RestoreBackupResponse> => {
    const { userId, label } = await actor(request, { superAdmin: true });
    if (!isBackupName(request.params.name)) throw new HttpError(400, 'Not a QueueUp backup file name');
    const result = await restoreBackup(await readBackupFile(request.params.name), restoreOptions(request));
    await logAdminAction({
      actorId: userId,
      actorLabel: label,
      action: 'backup.restore',
      targetLabel: request.params.name,
      metadata: { rows: result.rows, skippedEncrypted: result.skippedEncrypted, safetyBackup: result.safetyBackup },
    });
    return result;
  });

  app.post(
    '/api/admin/backups/import',
    // Checked before the (large) body is read, like the plugin-wide admin check above.
    { ...limit, bodyLimit: MAX_IMPORT_BYTES, onRequest: async (request) => void (await requireSuperAdmin(await request.requireAuth())) },
    async (request): Promise<RestoreBackupResponse> => {
    const { userId, label } = await actor(request, { superAdmin: true });
    if (!Buffer.isBuffer(request.body)) throw new HttpError(400, 'Send the backup file as the request body (application/gzip).');
    const result = await restoreBackup(request.body, restoreOptions(request));
    await logAdminAction({
      actorId: userId,
      actorLabel: label,
      action: 'backup.import',
      metadata: { bytes: request.body.length, rows: result.rows, skippedEncrypted: result.skippedEncrypted, safetyBackup: result.safetyBackup },
    });
    return result;
  },
  );
}
