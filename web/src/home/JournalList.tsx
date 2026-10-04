import { useMemo, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { JournalEntry, JournalEventKind } from '@queueup/shared';
import { apiGet } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { STATUS_LABEL } from '../lib/gameView';
import { coverBg } from '../ui/primitives';
import { st } from '../ui/st';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "12h 30m", "45m". */
export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** Each kind's icon and the tint behind it. */
const ICON: Record<JournalEventKind, { emoji: string; label: string; tint: string }> = {
  added: { emoji: '➕', label: 'Added', tint: 'var(--surf2)' },
  started: { emoji: '▶️', label: 'Started playing', tint: 'var(--accA35)' },
  beaten: { emoji: '🏆', label: 'Beaten', tint: 'oklch(0.83 0.15 85 / 0.35)' },
  dropped: { emoji: '🛑', label: 'Dropped', tint: 'var(--surf2)' },
  paused: { emoji: '⏸️', label: 'Paused', tint: 'var(--surf2)' },
  replay: { emoji: '🔁', label: 'Replaying', tint: 'var(--accA35)' },
  skipped: { emoji: '🚫', label: "Won't play", tint: 'var(--surf2)' },
  moved: { emoji: '📋', label: 'Moved', tint: 'var(--surf2)' },
  spin: { emoji: '🎡', label: 'Spin', tint: 'var(--accA35)' },
  reviewed: { emoji: '⭐', label: 'Reviewed', tint: 'oklch(0.83 0.15 85 / 0.35)' },
};

function when(iso: string): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return `${d.getDate()} ${MONTHS[d.getMonth()]} · ${time}`;
}

/** The entry as a sentence: who did what to which game ("Trent started playing Hades"). Entries
 * logged before the journal kept that detail fall back to the sentence they were written with. */
function sentence(e: JournalEntry, meId: string | undefined, onShelf: boolean): ReactNode {
  const who = !e.actor ? 'Someone' : e.actor.id === meId ? 'You' : e.actor.displayName;
  if (!e.title) return e.message;
  const t = <b style={st('font-weight:700;color:var(--text)')}>{e.title}</b>;
  switch (e.kind) {
    case 'added':
      return <>{who} added {t} to {onShelf ? 'the shelf' : 'the list'}</>;
    case 'started':
      return <>{who} started playing {t}</>;
    case 'beaten':
      return <>{who} beat {t}</>;
    case 'dropped':
      return <>{who} dropped {t}</>;
    case 'paused':
      return <>{who} paused {t}</>;
    case 'replay':
      return <>{who} started a replay of {t}</>;
    case 'skipped':
      return <>{who} decided not to play {t}</>;
    case 'spin':
      return <>{who} spun the wheel and landed on {t}</>;
    case 'reviewed':
      return <>{who} reviewed {t}</>;
    case 'moved':
      return e.status ? <>{who} moved {t} to {STATUS_LABEL[e.status]}</> : e.message;
  }
}

/** Play journal (#802) as a list of events, newest first and grouped by month: who added,
 * started, beat, dropped, spun or reviewed which game. One room's (its 📖 tab), or (no roomId)
 * everything the viewer did on their shelf and in their rooms (Settings > Play journal). */
export function JournalList({ roomId, onOpen }: { roomId?: string; onOpen: (e: JournalEntry & { gameId: string }) => void }) {
  const { user } = useAuth();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['journal', roomId ?? 'me'],
    // Always fresh when shown, and kept current while it's open (other members' moves land here too).
    staleTime: 0,
    refetchInterval: 60_000,
    queryFn: () => apiGet<{ entries: JournalEntry[] }>(roomId ? `/api/rooms/${roomId}/journal` : '/api/me/journal'),
  });
  const entries = data?.entries ?? [];
  const groups = useMemo(() => {
    const out: { label: string; items: JournalEntry[] }[] = [];
    for (const e of entries) {
      const d = new Date(e.at);
      const label = `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
      const last = out[out.length - 1];
      if (last?.label === label) last.items.push(e);
      else out.push({ label, items: [e] });
    }
    return out;
  }, [entries]);

  if (isLoading) return <span style={st('padding:24px 4px;font:400 14px var(--font-ui);color:var(--muted)')}>Loading…</span>;
  if (isError) return <span style={st('padding:24px 4px;font:400 14px var(--font-ui);color:var(--muted)')}>Couldn't load the journal. Try again in a moment.</span>;
  if (entries.length === 0) {
    return (
      <span style={st('padding:24px 4px;font:400 14px/1.45 var(--font-ui);color:var(--muted);text-wrap:pretty')}>
        Nothing yet. Adding a game, marking one Playing or Beaten, a spin and a review all show up here.
      </span>
    );
  }

  return (
    <div style={st('display:flex;flex-direction:column;gap:18px')}>
      {groups.map((g) => (
        <section key={g.label} style={st('display:flex;flex-direction:column;gap:6px')}>
          <span style={st('font:600 12px var(--font-mono);letter-spacing:0.06em;color:var(--muted)')}>{g.label.toUpperCase()}</span>
          {g.items.map((e) => {
            const icon = ICON[e.kind];
            const gameId = e.gameId;
            const meta = [
              when(e.at),
              // The personal journal spans rooms: say where it happened.
              roomId ? null : (e.roomName ?? 'Personal shelf'),
              e.kind === 'reviewed' && e.score != null ? `★ ${e.score.toFixed(1)}/5` : null,
            ]
              .filter(Boolean)
              .join(' · ');
            const body = (
              <>
                <span style={st('position:relative;flex-shrink:0;width:38px;height:50px')}>
                  <span
                    aria-hidden
                    style={st(`position:absolute;inset:0;border-radius:8px;background:${e.title ? coverBg(e.title, e.coverImageUrl, 'small') : 'var(--surf2)'}`)}
                  />
                  <span
                    role="img"
                    aria-label={icon.label}
                    title={icon.label}
                    style={st(
                      `position:absolute;right:-7px;bottom:-5px;width:24px;height:24px;border-radius:999px;display:flex;align-items:center;justify-content:center;font-size:12.5px;line-height:1;background:${icon.tint};backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);box-shadow:0 0 0 2px var(--sheet)`,
                    )}
                  >
                    {icon.emoji}
                  </span>
                </span>
                <span style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:3px;padding-left:4px')}>
                  <span style={st('font:500 14px/1.35 var(--font-ui);color:var(--text2);text-wrap:pretty')}>{sentence(e, user?.id, !e.roomId)}</span>
                  <span style={st('font:400 12px var(--font-ui);color:var(--faint)')}>{meta}</span>
                </span>
                {(e.minutesPlayed !== null || e.totalMinutes !== null) && (
                  <span style={st('flex-shrink:0;display:flex;flex-direction:column;align-items:flex-end;gap:2px;font:600 12.5px var(--font-mono)')}>
                    {e.minutesPlayed !== null && <span title="Played this run">{formatMinutes(e.minutesPlayed)}</span>}
                    {e.totalMinutes !== null && <span style={st('font-weight:500;color:var(--faint)')}>{formatMinutes(e.totalMinutes)} total</span>}
                  </span>
                )}
              </>
            );
            const rowStyle = 'display:flex;align-items:center;gap:12px;padding:9px 10px;border:none;border-radius:14px;background:var(--surf);color:var(--text);text-align:left;font:inherit';
            return gameId ? (
              <button key={e.id} type="button" onClick={() => onOpen({ ...e, gameId })} style={st(rowStyle)}>
                {body}
              </button>
            ) : (
              <div key={e.id} style={st(rowStyle)}>
                {body}
              </div>
            );
          })}
        </section>
      ))}
    </div>
  );
}
