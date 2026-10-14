import type { RoomMember, RoundSummary } from '@queueup/shared';
import { LOBBY_HISTORY_LENGTH } from '@queueup/shared';
import { st } from '../../ui/st';
import { useT } from '../../i18n';

const KICKER = 'font:500 11px var(--font-mono);letter-spacing:.08em;text-transform:uppercase';

/** The last ten runs as a strip of tiles (the winner's colour and initial; a dash for a run with no
 * winner), oldest first, and the best run so far. `compact` is the phone's smaller tiles. */
export function RunHistory({ summary, members, compact }: { summary: RoundSummary; members: RoomMember[]; compact?: boolean }) {
  const t = useT();
  const byId = new Map(members.map((m) => [m.user.id, m.user]));
  const name = (id: string | null) => (id ? byId.get(id)?.displayName ?? '?' : '?');
  // Always ten slots, filled from the right: the newest run sits at the end.
  const empty = Math.max(0, LOBBY_HISTORY_LENGTH - summary.history.length);
  const tile = compact ? 'border-radius:4px' : 'border-radius:7px';

  return (
    <div style={st('display:flex;flex-direction:column;gap:8px')}>
      {!compact && (
        <div style={st(`display:flex;justify-content:space-between;${KICKER};color:var(--faint)`)}>
          <span>{t('spin.lobby.history.title')}</span>
          <span>{t('spin.lobby.history.order')}</span>
        </div>
      )}
      <div style={st(`display:grid;grid-template-columns:repeat(${compact ? 5 : LOBBY_HISTORY_LENGTH},1fr);gap:${compact ? 3 : 4}px`)}>
        {Array.from({ length: empty }, (_, i) => (
          <span key={`empty-${i}`} aria-hidden="true" style={st(`aspect-ratio:1;${tile};border:1px dashed var(--chip)`)} />
        ))}
        {summary.history.map((r, i) => {
          const winner = r.winnerId ? byId.get(r.winnerId) : undefined;
          const label = r.winnerId ? t('spin.lobby.history.tile', { name: name(r.winnerId), m: r.meters }) : t('spin.lobby.history.draw', { m: r.meters });
          return (
            <span
              key={i}
              role="img"
              aria-label={label}
              title={label}
              style={st(`aspect-ratio:1;${tile};display:flex;align-items:center;justify-content:center;font:700 ${compact ? 10 : 12}px var(--font-ui);color:#fff;background:${winner ? winner.avatarColor : 'var(--surf2)'}`)}
            >
              {winner ? winner.displayName.slice(0, 1).toUpperCase() : '–'}
            </span>
          );
        })}
      </div>
      {summary.best && !compact && <span style={st('font:500 12px var(--font-ui);color:var(--muted)')}>{t('spin.lobby.history.best', { m: summary.best.meters, name: name(summary.best.id) })}</span>}
    </div>
  );
}
