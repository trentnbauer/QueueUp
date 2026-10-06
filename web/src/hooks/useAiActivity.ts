import { useSyncExternalStore } from 'react';
import { useQuery } from '@tanstack/react-query';
import { aiApi } from '../api/ai';

/** Which AI jobs this browser has started and is still waiting on (by key, e.g. 'duplicates'), so
 * every place that cares - the scan button, the shelf's duplicates nudge, the Settings row - can show
 * "working" at once, even after the dialog that started the job is closed. */
const active = new Map<string, number>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export async function trackAiActivity<T>(key: string, work: () => Promise<T>): Promise<T> {
  active.set(key, (active.get(key) ?? 0) + 1);
  emit();
  try {
    return await work();
  } finally {
    const left = (active.get(key) ?? 1) - 1;
    if (left <= 0) active.delete(key);
    else active.set(key, left);
    emit();
  }
}

export function useAiActivity(key: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => active.has(key),
    () => false,
  );
}

export const AI_ACTIVITY_QUERY_KEY = ['ai-activity'] as const;

/** What the server says the AI is doing for this person (running, or waiting its turn), refreshed
 * every few seconds while `enabled` (the notifications are open). */
export function useAiJobs(enabled: boolean) {
  const { data } = useQuery({
    queryKey: AI_ACTIVITY_QUERY_KEY,
    queryFn: aiApi.activity,
    enabled,
    refetchInterval: enabled ? 3000 : false,
  });
  return data?.activity ?? [];
}
