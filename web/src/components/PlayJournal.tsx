import type { PlayLogEntry } from '@queueup/shared';
import styles from './PlayJournal.module.css';

interface PlayJournalProps {
  entries: PlayLogEntry[];
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Dated per-playthrough history (issue #361) - separate from the mutable Game.status field
 * (a single value with no history of its own), so there's an actual record of when a game was
 * started/finished rather than just its current status, and a Replay gets its own entry instead
 * of overwriting the last one (see PlayLog's schema doc / recordStatusTransition.ts). Hidden
 * entirely with no entries yet, same "just don't render" convention most other optional detail-
 * modal sections here already use. */
export function PlayJournal({ entries }: PlayJournalProps) {
  if (entries.length === 0) return null;

  return (
    <div className={styles.list}>
      {entries.map((entry) => (
        <div key={entry.id} className={styles.entry}>
          <span aria-hidden="true">{entry.finishedAt ? '✅' : '▶️'}</span>
          <span>
            Started {formatDate(entry.startedAt)}
            {entry.finishedAt ? ` · Finished ${formatDate(entry.finishedAt)}` : ' · In progress'}
          </span>
        </div>
      ))}
    </div>
  );
}
