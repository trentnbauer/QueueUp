import { prisma } from '../../db/client.js';
import { appLog } from '../appLogger.js';

/** What each kind of AI request is for, as it reads in the logs. Keyed by the label a feature passes
 * to aiComplete (also used for the activity list). */
const PURPOSES: Record<string, string> = {
  duplicates: 'Find duplicate games',
  importMatch: 'Match imported titles',
  importClassify: 'Sort imported titles (game or not)',
  picks: 'Recommendations',
  tonight: "Tonight's pick",
  price: 'Price advice',
  recap: 'Weekly room recap',
  story: 'Year story',
  search: 'AI search',
  sensitiveCheck: 'Adult game check',
  coach: 'Backlog coach',
  test: 'Settings test',
};

export const aiPurpose = (label: string | undefined): string => (label && PURPOSES[label]) || label || 'Other';

/** Whose AI answered (or was going to): the server's, the person's own, a room sponsor's, or the
 * server's as the last resort behind one of those. */
export type AiUsed = 'server' | 'personal' | 'room sponsor' | 'server (backup)' | 'none';

export function whoseAi(source: 'server' | 'user' | 'room' | null, answeredByServerBackup: boolean): AiUsed {
  if (!source) return 'none';
  if (source === 'server') return 'server';
  if (answeredByServerBackup) return 'server (backup)';
  return source === 'user' ? 'personal' : 'room sponsor';
}

/** One log line per AI request: who asked, whose AI, what for, and whether it worked (with the
 * reason when it didn't). Never throws - logging must not fail the request. */
export async function logAiCall(entry: {
  userId?: string;
  roomId?: string;
  label?: string;
  ai: AiUsed;
  ok: boolean;
  ms: number;
  provider?: string;
  model?: string;
  error?: string;
  fellBack?: boolean;
}): Promise<void> {
  try {
    const user = entry.userId ? await prisma.user.findUnique({ where: { id: entry.userId }, select: { displayName: true } }) : null;
    const who = user ? `${user.displayName} (${entry.userId})` : entry.userId ?? (entry.roomId ? `room ${entry.roomId}` : 'the server');
    const purpose = aiPurpose(entry.label);
    const fields = {
      aiCall: {
        purpose,
        label: entry.label ?? 'ai',
        userId: entry.userId ?? null,
        user: user?.displayName ?? null,
        roomId: entry.roomId ?? null,
        ai: entry.ai,
        ok: entry.ok,
        ms: entry.ms,
        provider: entry.provider ?? null,
        model: entry.model ?? null,
        fellBack: entry.fellBack ?? false,
        error: entry.error ?? null,
      },
    };
    const via = entry.provider ? ` - ${entry.provider}${entry.model ? ` (${entry.model})` : ''}` : '';
    if (entry.ok) appLog().info(fields, `AI ${purpose} for ${who}: succeeded on ${entry.ai} AI${via} in ${entry.ms}ms`);
    else appLog().warn(fields, `AI ${purpose} for ${who}: FAILED on ${entry.ai} AI${via} after ${entry.ms}ms: ${entry.error ?? 'unknown error'}`);
  } catch {
    /* logging must never fail the request */
  }
}
