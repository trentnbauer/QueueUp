import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import type { JournalEntry } from '@queueup/shared';
import { apiGet } from '../api/client';
import { useUi } from '../context/UiContext';
import { STATUS_LABEL } from '../lib/gameView';
import { Dialog } from '../ui/Dialog';
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

function day(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** Play journal (#802): every playthrough, newest first, grouped by the month it started - across
 * your shelf and all your rooms (from Settings), or one room (from its settings). */
export function JournalDialog({ roomId }: { roomId?: string }) {
  const ui = useUi();
  const { data, isLoading } = useQuery({
    queryKey: ['journal', roomId ?? 'me'],
    queryFn: () => apiGet<{ entries: JournalEntry[] }>(roomId ? `/api/rooms/${roomId}/journal` : '/api/me/journal'),
  });
  const entries = data?.entries ?? [];
  const groups = useMemo(() => {
    const out: { label: string; items: JournalEntry[] }[] = [];
    for (const e of entries) {
      const d = new Date(e.startedAt);
      const label = `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
      const last = out[out.length - 1];
      if (last?.label === label) last.items.push(e);
      else out.push({ label, items: [e] });
    }
    return out;
  }, [entries]);
  const logged = entries.reduce((sum, e) => sum + (e.minutesPlayed ?? 0), 0);

  return (
    <Dialog onClose={() => ui.closeDialog('journal')} title={roomId ? 'Room play journal' : 'Play journal'} height="tall" gap={20}>
      <span style={st('font:400 13.5px/1.45 var(--font-ui);color:var(--muted)')}>
        {roomId ? 'Everything this room has played.' : 'Everything you have played, on your shelf and in your rooms.'} Time comes from Steam or Playnite where QueueUp has it.
        {logged > 0 && ` ${formatMinutes(logged)} logged in total.`}
      </span>
      {isLoading && <span style={st('font:400 14px var(--font-ui);color:var(--muted)')}>Loading…</span>}
      {!isLoading && entries.length === 0 && (
        <span style={st('font:400 14px var(--font-ui);color:var(--muted)')}>Nothing yet. Mark a game Playing and it shows up here.</span>
      )}
      {groups.map((g) => (
        <div key={g.label} style={st('display:flex;flex-direction:column;gap:8px')}>
          <span style={st('font:600 12px var(--font-mono);letter-spacing:0.06em;color:var(--muted)')}>{g.label.toUpperCase()}</span>
          {g.items.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => {
                ui.closeDialog('journal');
                ui.selectGame(e.gameId);
              }}
              style={st('display:flex;align-items:center;gap:12px;padding:8px;border:none;border-radius:14px;background:var(--surf);color:var(--text);text-align:left;font:inherit')}
            >
              <span aria-hidden style={st(`width:38px;height:50px;flex-shrink:0;border-radius:8px;background:${coverBg(e.title, e.coverImageUrl, 'small')}`)} />
              <span style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:2px')}>
                <span style={st('font:600 14.5px var(--font-ui);overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>{e.title}</span>
                <span style={st('font:400 12.5px var(--font-ui);color:var(--muted)')}>
                  {[
                    e.finishedAt ? `${day(e.startedAt)} – ${day(e.finishedAt)}` : `Started ${day(e.startedAt)}`,
                    e.finishedAt ? null : STATUS_LABEL[e.status],
                    // A shelf entry with a room name was beaten in that room ("mark it Beaten on your shelf too").
                    roomId ? null : e.roomId ? e.roomName : e.roomName ? `Shelf · beaten in ${e.roomName}` : 'Personal shelf',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>
              <span style={st('flex-shrink:0;display:flex;flex-direction:column;align-items:flex-end;gap:2px;font:600 12.5px var(--font-mono)')}>
                {e.minutesPlayed !== null && <span>{formatMinutes(e.minutesPlayed)}</span>}
                {e.totalMinutes !== null && <span style={st('font-weight:500;color:var(--faint)')}>{formatMinutes(e.totalMinutes)} total</span>}
              </span>
            </button>
          ))}
        </div>
      ))}
    </Dialog>
  );
}
