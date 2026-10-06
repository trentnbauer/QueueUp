import { randomUUID } from 'node:crypto';
import type { AiActivityEntry } from '@queueup/shared';

/** Every AI request goes through here: it is counted as running (or, when the server limits how many
 * run at once, as waiting its turn) so the app can show a person what the AI is doing for them, and
 * so a slow single-GPU model is not handed several requests at the same time (they would just slow
 * each other down and time out). With no limit set (AI_MAX_CONCURRENT_REQUESTS=0) nothing ever waits
 * and this only keeps count. In memory, per server process. */

interface Job {
  id: string;
  userId: string | undefined;
  label: string;
  state: 'queued' | 'running';
  seq: number;
}

const jobs = new Map<string, Job>();
let nextSeq = 0;
let running = 0;
const waiters: (() => void)[] = [];

// Loaded lazily (like aiConfig's env) so this stays importable without a parsed env.
let envModule: Promise<typeof import('../../config/env.js')> | null = null;
async function maxConcurrent(): Promise<number> {
  try {
    envModule ??= import('../../config/env.js');
    return (await envModule).env.AI_MAX_CONCURRENT_REQUESTS ?? 0;
  } catch {
    return 0;
  }
}

/** Runs `work` once a slot is free (at once, when there is no limit). `userId` is who it is for (none
 * for a background job); `label` says what kind of request it is, for the activity list. */
export async function runAiJob<T>(userId: string | undefined, label: string, work: () => Promise<T>): Promise<T> {
  // Registered before anything is awaited, so requests keep the order they were made in.
  const job: Job = { id: randomUUID(), userId, label, state: 'queued', seq: nextSeq++ };
  jobs.set(job.id, job);
  let holdsSlot = false;
  try {
    const max = await maxConcurrent();
    if (max > 0) {
      // A slot freed by another job is handed straight to the next waiter, so `running` stays put.
      if (running < max) running += 1;
      else await new Promise<void>((resolve) => waiters.push(resolve));
      holdsSlot = true;
    }
    job.state = 'running';
    return await work();
  } finally {
    jobs.delete(job.id);
    if (holdsSlot) {
      const next = waiters.shift();
      if (next) next();
      else running -= 1;
    }
  }
}

/** What the AI is doing for this person right now, grouped by kind of request: how many are running,
 * how many are waiting, and where the first waiting one is in the line (across everyone). */
export function aiActivityFor(userId: string): AiActivityEntry[] {
  const waiting = [...jobs.values()].filter((j) => j.state === 'queued').sort((a, b) => a.seq - b.seq);
  const byLabel = new Map<string, AiActivityEntry & { firstSeq: number }>();
  for (const j of [...jobs.values()].filter((x) => x.userId === userId).sort((a, b) => a.seq - b.seq)) {
    const entry = byLabel.get(j.label) ?? { label: j.label, running: 0, queued: 0, nextPosition: null, firstSeq: j.seq };
    if (j.state === 'running') entry.running += 1;
    else {
      entry.queued += 1;
      const position = waiting.findIndex((w) => w.id === j.id) + 1;
      if (entry.nextPosition === null || position < entry.nextPosition) entry.nextPosition = position;
    }
    byLabel.set(j.label, entry);
  }
  return [...byLabel.values()].sort((a, b) => a.firstSeq - b.firstSeq).map(({ firstSeq: _f, ...e }) => e);
}
