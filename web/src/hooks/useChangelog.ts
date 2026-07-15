import { useEffect, useState } from 'react';

export interface ChangelogEntry {
  number: number;
  title: string;
  url: string;
  mergedAt: string;
}

const SEEN_KEY = 'changelogSeenPRs';

function loadSeen(): Set<number> | null {
  const raw = localStorage.getItem(SEEN_KEY);
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw);
    return new Set(Array.isArray(parsed) ? parsed : []);
  } catch {
    return new Set();
  }
}

function saveSeen(numbers: Iterable<number>) {
  localStorage.setItem(SEEN_KEY, JSON.stringify(Array.from(numbers)));
}

/**
 * Loads the generated changelog and tracks which PR numbers the user has already
 * seen, in a set (not a high-watermark number) since PRs can merge out of order.
 *
 * - True first-ever visit (no seen-set in localStorage at all): baseline everything
 *   as seen quietly, no popup - we don't want to dump the whole project history on
 *   brand new users.
 * - Otherwise: `newEntries` holds whatever isn't in the seen set yet, for an
 *   auto-popup.
 * - `entries` always holds the full history, for a manual "what's new" view.
 */
export function useChangelog() {
  const [entries, setEntries] = useState<ChangelogEntry[]>([]);
  const [newEntries, setNewEntries] = useState<ChangelogEntry[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let cancelled = false;

    fetch('/changelog.json')
      .then((res) => (res.ok ? res.json() : []))
      .then((data: ChangelogEntry[]) => {
        if (cancelled || !Array.isArray(data)) return;

        setEntries(data);

        const seen = loadSeen();
        if (seen === null) {
          // First-ever visit - baseline silently, nothing to show.
          saveSeen(data.map((e) => e.number));
          setNewEntries([]);
        } else {
          setNewEntries(data.filter((e) => !seen.has(e.number)));
        }
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) setLoaded(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  function markAllSeen() {
    saveSeen(entries.map((e) => e.number));
    setNewEntries([]);
  }

  return { entries, newEntries, loaded, markAllSeen };
}
