import { useState } from 'react';
import type { Game } from '@queueup/shared';
import { createPortal } from 'react-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useScope } from '../context/ScopeContext';
import { useUi } from '../context/UiContext';
import { useModalA11y } from '../hooks/useModalA11y';
import { ATTENTION_QUERY_KEY } from '../hooks/useAttention';
import { VOTES, VOTE_VALUES, metaLine, ownLabel } from '../lib/gameView';
import { TrailerPlayer, useTrailer } from '../game/Trailer';
import { Btn, Cover, IgdbScore } from '../ui/primitives';
import { st } from '../ui/st';
import { useT } from '../i18n';

const OPEN_STATUSES = ['backlog', 'wishlist', 'play_next'];

/** The game's trailer if QueueUp can find one (it autoplays in place of the box art), otherwise the cover. */
function DeckArt({ game }: { game: Game }) {
  const { state } = useTrailer(game.id, true);
  if (state.kind === 'ready') {
    return (
      <div style={st('width:min(640px,100%)')}>
        <TrailerPlayer youtubeId={state.youtubeId} radius={22} />
      </div>
    );
  }
  return <Cover title={game.title} url={game.coverImageUrl} width={190} radius={22} style={{ boxShadow: '0 30px 60px oklch(0 0 0 / 0.45)', transform: 'rotate(-2deg)' }} />;
}

/** "Vote now": one unvoted game at a time, full screen. */
export function DeckDialog() {
  const ui = useUi();
  const t = useT();
  const { games, ops, room, isShelf } = useScope();
  const queryClient = useQueryClient();
  const [skipped, setSkipped] = useState<string[]>([]);
  // What was done, newest last, so Back can take the last vote or skip undone. `pinned` is the game Back just brought back, shown first.
  const [history, setHistory] = useState<{ id: string; kind: 'vote' | 'skip' }[]>([]);
  const [pinned, setPinned] = useState<string | null>(null);
  const goBack = () => {
    const last = history[history.length - 1];
    if (!last) return;
    setHistory((h) => h.slice(0, -1));
    setPinned(last.id);
    if (last.kind === 'skip') setSkipped((s) => s.filter((x) => x !== last.id));
    else ops.unvote(last.id);
  };
  const vote = (id: string, v: (typeof VOTE_VALUES)[number]) => {
    setHistory((h) => [...h, { id, kind: 'vote' }]);
    setPinned(null);
    ops.vote(id, v);
  };
  const close = () => {
    queryClient.invalidateQueries({ queryKey: ATTENTION_QUERY_KEY });
    ui.closeDialog('deck');
  };
  const ref = useModalA11y<HTMLDivElement>(close);

  const todo = games.filter((g) => OPEN_STATUSES.includes(g.status) && !g.myVote);
  const queue = [...todo.filter((g) => !skipped.includes(g.id)), ...todo.filter((g) => skipped.includes(g.id))];
  const at = pinned ? queue.findIndex((x) => x.id === pinned) : -1;
  if (at > 0) queue.unshift(...queue.splice(at, 1));
  const g = queue[0];
  const total = todo.length;

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label={t('settings.deck.title')}
      tabIndex={-1}
      style={st('position:fixed;inset:0;z-index:70;background:var(--bg);color:var(--text);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px 20px;gap:18px;outline:none;overflow-y:auto')}
    >
      <button type="button" onClick={close} style={st('position:absolute;top:16px;right:16px;height:38px;padding:0 16px;border-radius:999px;border:none;background:var(--chip);color:var(--text);font:600 13.5px var(--font-ui)')}>
        {t('common.done')}
      </button>
      {history.length > 0 && (
        <button type="button" onClick={goBack} style={st('position:absolute;top:16px;left:16px;height:38px;padding:0 16px;border-radius:999px;border:none;background:var(--chip);color:var(--text);font:600 13.5px var(--font-ui)')}>
          {t('settings.deck.previous')}
        </button>
      )}
      {g ? (
        <>
          <span style={st('font:500 12px var(--font-mono);color:var(--muted)')}>
            {t('settings.deck.toVote', { n: total })}
          </span>
          <DeckArt key={g.id} game={g} />
          <div style={st('display:flex;flex-direction:column;align-items:center;gap:4px;text-align:center;max-width:420px')}>
            <span style={st('font:700 28px/1.05 var(--font-display);letter-spacing:-0.02em;text-wrap:balance')}>{g.title}</span>
            <span style={st('font:400 14px var(--font-ui);color:var(--muted)')}>{[metaLine(g), ownLabel(g, isShelf)].filter(Boolean).join(' · ')}</span>
            <IgdbScore score={g.reviewScore} />
            {g.genre && <span style={st('font:500 13px var(--font-ui);color:var(--text2)')}>{g.genre}</span>}
          </div>
          <div style={st('display:flex;gap:6px')}>
            {VOTE_VALUES.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => vote(g.id, v)}
                style={st('display:flex;flex-direction:column;align-items:center;gap:6px;width:62px;padding:12px 0 10px;border-radius:18px;border:none;background:var(--surf);color:var(--text2)')}
              >
                <span style={st('font-size:28px;line-height:1')}>{VOTES[v].e}</span>
                <span style={st('font:600 11px var(--font-ui)')}>{VOTES[v].l}</span>
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => {
              setSkipped((s) => [...s.filter((x) => x !== g.id), g.id]);
              setHistory((h) => [...h, { id: g.id, kind: 'skip' }]);
              setPinned(null);
            }}
            style={st('height:40px;border:none;background:none;color:var(--muted);font:500 13.5px var(--font-ui);text-decoration:underline;text-underline-offset:3px')}
          >
            {t('settings.deck.skip')}
          </button>
        </>
      ) : (
        <>
          <span style={st('font:700 32px var(--font-display);letter-spacing:-0.02em;text-align:center')}>{t('settings.deck.caughtUp')}</span>
          <span style={st('font:400 15px var(--font-ui);color:var(--muted);text-align:center')}>{room ? t('settings.deck.allVoted', { room: room.name }) : t('settings.deck.allVotedHere')}</span>
          <Btn kind="accent" height={46} padX={22} fontSize={14} weight={700} onClick={close}>
            {t('settings.deck.back')}
          </Btn>
        </>
      )}
    </div>,
    document.body,
  );
}
