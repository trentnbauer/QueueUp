import { st } from '../../ui/st';
import { useT } from '../../i18n';

/** The vote to leave the lobby for the spin: one segment per vote it takes, filled as votes come in,
 * and a button to vote (or take the vote back). Shown only while a spin is waiting. */
export function VoteBar({ votes, needed, voted, onVote, phone }: { votes: number; needed: number; voted: boolean; onVote: (on: boolean) => void; phone: boolean }) {
  const t = useT();
  const segments = Math.max(1, Math.min(12, needed));
  return (
    <div style={st(`display:flex;align-items:center;gap:12px;padding:12px 12px 12px 16px;border-radius:16px;background:var(--surf)`)}>
      <div style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:8px')}>
        <div style={st('display:flex;justify-content:space-between;gap:10px;align-items:baseline')}>
          <span style={st('font:600 13px var(--font-ui)')}>{t('spin.lobby.votes', { n: votes, needed })}</span>
          {!phone && <span style={st('font:500 12px var(--font-ui);color:var(--faint)')}>{t('spin.lobby.vote.note')}</span>}
        </div>
        <div style={st(`display:flex;gap:4px`)} role="progressbar" aria-valuemin={0} aria-valuemax={needed} aria-valuenow={Math.min(votes, needed)}>
          {Array.from({ length: segments }, (_, i) => (
            <span key={i} style={st(`flex:1;height:${phone ? 5 : 6}px;border-radius:3px;background:${i < votes ? 'var(--acc)' : 'oklch(1 0 0 / 0.1)'};transition:background .2s`)} />
          ))}
        </div>
      </div>
      <button
        type="button"
        onClick={() => onVote(!voted)}
        style={st(`height:${phone ? 44 : 42}px;padding:0 18px;border-radius:999px;border:none;white-space:nowrap;background:${voted ? 'var(--surf2)' : 'var(--acc)'};color:${voted ? 'var(--text)' : 'var(--ink)'};font:700 13.5px var(--font-ui)`)}
      >
        {voted ? t('spin.lobby.vote.undo') : t('spin.lobby.vote')}
      </button>
    </div>
  );
}
