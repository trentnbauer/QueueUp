import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { AiRecommendation, VoteValue } from '@queueup/shared';
import { useModalA11y } from '../hooks/useModalA11y';
import { VOTES, VOTE_VALUES } from '../lib/gameView';
import { TrailerPlayer, useIgdbTrailer } from '../game/Trailer';
import { AiPickedBadge, Btn, Cover } from '../ui/primitives';
import { st } from '../ui/st';
import { useT } from '../i18n';

function PickArt({ pick }: { pick: AiRecommendation }) {
  const trailer = useIgdbTrailer(pick.igdbId);
  if (trailer.kind === 'ready') {
    return (
      <div style={st('width:min(640px,100%)')}>
        <TrailerPlayer youtubeId={trailer.youtubeId} radius={22} />
      </div>
    );
  }
  return <Cover title={pick.title} url={pick.coverImageUrl} width={190} radius={22} style={{ boxShadow: '0 30px 60px oklch(0 0 0 / 0.45)', transform: 'rotate(-2deg)' }} />;
}

/** AI picks, one game at a time like the vote deck: its trailer plays, and you can add it (optionally
 * with how much you want to play it), skip it, or tell the AI never to suggest it again. While the AI
 * is still working the same screen shows a spinner. */
export function AiPicksDeck({
  picks,
  busy,
  error,
  onAskAgain,
  onAdd,
  onHide,
  onClose,
}: {
  /** Null until the first answer. */
  picks: AiRecommendation[] | null;
  busy: boolean;
  error: string | null;
  onAskAgain: () => void;
  /** Adds the pick (and votes, when a score is given). True when it went through. */
  onAdd: (pick: AiRecommendation, vote: VoteValue | null) => Promise<boolean>;
  onHide: (pick: AiRecommendation) => void;
  onClose: () => void;
}) {
  const t = useT();
  const ref = useModalA11y<HTMLDivElement>(onClose);
  // Picks already dealt with (added, skipped or hidden), so the deck moves on.
  const [handled, setHandled] = useState<number[]>([]);
  const [adding, setAdding] = useState(false);
  const queue = (picks ?? []).filter((p) => !handled.includes(p.igdbId));
  const current = queue[0];

  const done = (igdbId: number) => setHandled((h) => [...h, igdbId]);
  async function add(vote: VoteValue | null) {
    if (!current || adding) return;
    setAdding(true);
    try {
      if (await onAdd(current, vote)) done(current.igdbId);
    } finally {
      setAdding(false);
    }
  }
  function again() {
    setHandled([]);
    onAskAgain();
  }

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label={t('add.game.ai.heading')}
      tabIndex={-1}
      style={st('position:fixed;inset:0;z-index:90;background:var(--bg);color:var(--text);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px 20px;gap:18px;outline:none;overflow-y:auto')}
    >
      <button type="button" onClick={onClose} style={st('position:absolute;top:16px;right:16px;height:38px;padding:0 16px;border-radius:999px;border:none;background:var(--chip);color:var(--text);font:600 13.5px var(--font-ui)')}>
        {t('common.done')}
      </button>
      {busy ? (
        <>
          <span role="status" aria-label={t('add.game.ai.working')} style={st('width:56px;height:56px;border-radius:50%;border:5px solid var(--chip);border-top-color:var(--acc);animation:qu-spin .9s linear infinite')} />
          <span style={st('font:600 16px var(--font-ui);color:var(--text2);text-align:center')}>{t('add.game.ai.deck.finding')}</span>
        </>
      ) : error ? (
        <>
          <span role="alert" style={st('max-width:420px;padding:12px 14px;border-radius:14px;background:var(--errBg);border:1px solid var(--errLine);font:500 13.5px/1.4 var(--font-ui);text-align:center')}>{error}</span>
          <Btn kind="accent" height={46} padX={22} fontSize={14} weight={700} onClick={again}>
            {t('add.game.ai.again')}
          </Btn>
        </>
      ) : current ? (
        <>
          <span style={st('display:flex;align-items:center;gap:8px;font:500 12px var(--font-mono);color:var(--muted)')}>
            <AiPickedBadge title={t('add.game.ai.badge')} />
            {t('add.game.ai.deck.left', { n: queue.length })}
          </span>
          <PickArt key={current.igdbId} pick={current} />
          <div style={st('display:flex;flex-direction:column;align-items:center;gap:6px;text-align:center;max-width:420px')}>
            <span style={st('font:700 28px/1.05 var(--font-display);letter-spacing:-0.02em;text-wrap:balance')}>{current.title}</span>
            <span style={st('font:400 14px var(--font-ui);color:var(--muted)')}>{[current.releaseYear, current.platform].filter(Boolean).join(' · ')}</span>
            {current.reason && <span style={st('font:500 13.5px/1.4 var(--font-ui);color:var(--accText);text-wrap:pretty')}>{current.reason}</span>}
          </div>
          <span style={st('font:600 12px var(--font-ui);color:var(--muted)')}>{t('add.game.ai.deck.score')}</span>
          <div style={st('display:flex;gap:6px')}>
            {VOTE_VALUES.map((v) => (
              <button
                key={v}
                type="button"
                disabled={adding}
                onClick={() => void add(v)}
                style={st('display:flex;flex-direction:column;align-items:center;gap:6px;width:62px;padding:12px 0 10px;border-radius:18px;border:none;background:var(--surf);color:var(--text2)')}
              >
                <span style={st('font-size:28px;line-height:1')}>{VOTES[v].e}</span>
                <span style={st('font:600 11px var(--font-ui)')}>{VOTES[v].l}</span>
              </button>
            ))}
          </div>
          <div style={st('display:flex;flex-wrap:wrap;justify-content:center;align-items:center;gap:8px')}>
            <Btn kind="accent" height={44} padX={22} fontSize={14} weight={700} disabled={adding} onClick={() => void add(null)}>
              {adding ? t('add.game.adding') : t('common.add')}
            </Btn>
            <Btn kind="soft" height={44} padX={18} fontSize={13.5} disabled={adding} onClick={() => done(current.igdbId)}>
              {t('settings.deck.skip')}
            </Btn>
          </div>
          <button
            type="button"
            disabled={adding}
            onClick={() => {
              onHide(current);
              done(current.igdbId);
            }}
            style={st('height:40px;border:none;background:none;color:var(--muted);font:500 13.5px var(--font-ui);text-decoration:underline;text-underline-offset:3px')}
          >
            {t('add.game.ai.deck.hide')}
          </button>
        </>
      ) : (
        <>
          <span style={st('font:700 28px var(--font-display);letter-spacing:-0.02em;text-align:center')}>{picks && picks.length === 0 ? t('add.game.ai.none') : t('add.game.ai.deck.allDone')}</span>
          <div style={st('display:flex;gap:8px;flex-wrap:wrap;justify-content:center')}>
            <Btn kind="accent" height={46} padX={22} fontSize={14} weight={700} onClick={again}>
              {t('add.game.ai.again')}
            </Btn>
            <Btn kind="soft" height={46} padX={22} fontSize={14} onClick={onClose}>
              {t('common.done')}
            </Btn>
          </div>
        </>
      )}
    </div>,
    document.body,
  );
}
