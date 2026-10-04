import { useMemo, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { JournalEntry, JournalEventKind } from '@queueup/shared';
import { apiGet } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { STATUS_LABEL } from '../lib/gameView';
import { coverBg } from '../ui/primitives';
import { st } from '../ui/st';
import { rich, t, useT, type MessageKey } from '../i18n';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "12h 30m", "45m". */
export function formatMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return t('home.duration.minutes', { m });
  return m ? t('home.duration.hoursMinutes', { h, m }) : t('home.duration.hours', { h });
}

/** Each kind's icon, the tint behind it, and its (translated) label. */
const ICON: Record<JournalEventKind, { emoji: string; label: MessageKey; tint: string }> = {
  added: { emoji: '➕', label: 'home.journal.kind.added', tint: 'var(--surf2)' },
  started: { emoji: '▶️', label: 'home.journal.kind.started', tint: 'var(--accA35)' },
  beaten: { emoji: '🏆', label: 'home.journal.kind.beaten', tint: 'oklch(0.83 0.15 85 / 0.35)' },
  dropped: { emoji: '🛑', label: 'home.journal.kind.dropped', tint: 'var(--surf2)' },
  paused: { emoji: '⏸️', label: 'home.journal.kind.paused', tint: 'var(--surf2)' },
  replay: { emoji: '🔁', label: 'home.journal.kind.replay', tint: 'var(--accA35)' },
  skipped: { emoji: '🚫', label: 'home.journal.kind.skipped', tint: 'var(--surf2)' },
  moved: { emoji: '📋', label: 'home.journal.kind.moved', tint: 'var(--surf2)' },
  spin: { emoji: '🎡', label: 'home.journal.kind.spin', tint: 'var(--accA35)' },
  reviewed: { emoji: '⭐', label: 'home.journal.kind.reviewed', tint: 'oklch(0.83 0.15 85 / 0.35)' },
};

function time(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** "Sat 4 Oct 2026" - the day heading entries are grouped under. */
function dayLabel(iso: string): string {
  const d = new Date(iso);
  return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** The entry as a sentence: who did what to which game ("Trent started playing Hades"). Entries
 * logged before the journal kept that detail fall back to the sentence they were written with. */
function sentence(e: JournalEntry, meId: string | undefined, onShelf: boolean): ReactNode {
  const who = !e.actor ? t('common.someone') : e.actor.id === meId ? t('common.you') : e.actor.displayName;
  if (!e.title) return e.message;
  const title = <b style={st('font-weight:700;color:var(--text)')}>{e.title}</b>;
  switch (e.kind) {
    case 'added':
      return rich(t(onShelf ? 'home.journal.added.shelf' : 'home.journal.added.list'), { who, title });
    case 'started':
      return rich(t('home.journal.started'), { who, title });
    case 'beaten':
      return rich(t('home.journal.beaten'), { who, title });
    case 'dropped':
      return rich(t('home.journal.dropped'), { who, title });
    case 'paused':
      return rich(t('home.journal.paused'), { who, title });
    case 'replay':
      return rich(t('home.journal.replay'), { who, title });
    case 'skipped':
      return rich(t('home.journal.skipped'), { who, title });
    case 'spin':
      return rich(t('home.journal.spin'), { who, title });
    case 'reviewed':
      return rich(t('home.journal.reviewed'), { who, title });
    case 'moved':
      return e.status ? rich(t('home.journal.moved'), { who, title, status: STATUS_LABEL[e.status] }) : e.message;
  }
}

/** Play journal (#802): game status changes, newest first and grouped by day - who started, beat,
 * dropped or moved which game. One room's (its 📖 tab), or (no roomId)
 * everything the viewer did on their shelf and in their rooms (Settings > Play journal). */
export function JournalList({ roomId, onOpen }: { roomId?: string; onOpen: (e: JournalEntry & { gameId: string }) => void }) {
  const { user } = useAuth();
  const t = useT();
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
      const label = dayLabel(e.at);
      const last = out[out.length - 1];
      if (last?.label === label) last.items.push(e);
      else out.push({ label, items: [e] });
    }
    return out;
  }, [entries]);

  if (isLoading) return <span style={st('padding:24px 4px;font:400 14px var(--font-ui);color:var(--muted)')}>{t('common.loading')}</span>;
  if (isError) return <span style={st('padding:24px 4px;font:400 14px var(--font-ui);color:var(--muted)')}>{t('home.journal.loadFailed')}</span>;
  if (entries.length === 0) {
    return (
      <span style={st('padding:24px 4px;font:400 14px/1.45 var(--font-ui);color:var(--muted);text-wrap:pretty')}>
        {t('home.journal.empty')}
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
              time(e.at),
              // The personal journal spans rooms: say where it happened.
              roomId ? null : (e.roomName ?? t('home.journal.personalShelf')),
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
                    aria-label={t(icon.label)}
                    title={t(icon.label)}
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
                    {e.minutesPlayed !== null && <span title={t('home.journal.playedThisRun')}>{formatMinutes(e.minutesPlayed)}</span>}
                    {e.totalMinutes !== null && <span style={st('font-weight:500;color:var(--faint)')}>{t('home.journal.total', { time: formatMinutes(e.totalMinutes) })}</span>}
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
