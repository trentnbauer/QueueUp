import type { Prisma } from '@prisma/client';
import { prisma } from '../db/client.js';

interface LogAdminActionInput {
  actorId: string;
  actorLabel: string;
  action: string;
  targetLabel?: string | null;
  // Kept as a plain object rather than Prisma's own (fussier) InputJsonValue type - callers just
  // want to pass a small snapshot object, not think about Prisma's JSON-null sentinel rules.
  metadata?: Record<string, unknown>;
}

/** Writes a durable audit trail row for a destructive admin action. Separate from (and in
 * addition to) the structured app.log line each call site already emits - the log line is useful
 * for live monitoring, but doesn't survive log rotation or a container restart the way a DB row
 * does, and "who deleted this room six weeks ago" is exactly the kind of question you can't
 * answer from a log file that's already rolled over. */
export async function logAdminAction(input: LogAdminActionInput): Promise<void> {
  // After a restore or import the acting admin may no longer exist (the database now holds another
  // server's users), so the row keeps their label but no actor link rather than failing the request.
  const actorExists = (await prisma.user.count({ where: { id: input.actorId } })) > 0;
  await prisma.adminAuditLog.create({
    data: {
      actorId: actorExists ? input.actorId : null,
      actorLabel: input.actorLabel,
      action: input.action,
      targetLabel: input.targetLabel ?? null,
      metadata: (input.metadata as Prisma.InputJsonValue) ?? undefined,
    },
  });
}
