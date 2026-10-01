import { useEffect, useState } from 'react';
import { gamesApi } from '../api/games';
import { st } from '../ui/st';

type State = { kind: 'idle' } | { kind: 'loading' } | { kind: 'none' } | { kind: 'error' } | { kind: 'ready'; youtubeId: string };

/** "Watch trailer": nothing is fetched or embedded until it's tapped. Then the game's YouTube
 * trailer (looked up from IGDB and cached server-side) plays inline in a 16:9 frame. */
export function Trailer({
  gameId,
  compact,
  onPlayingChange,
}: {
  gameId: string;
  compact?: boolean;
  /** Fires true while the player is showing, so a parent can swap other art out for it. */
  onPlayingChange?: (playing: boolean) => void;
}) {
  const [state, setState] = useState<State>({ kind: 'idle' });
  const playing = state.kind === 'ready';
  useEffect(() => {
    onPlayingChange?.(playing);
    return () => onPlayingChange?.(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing]);

  async function open() {
    setState({ kind: 'loading' });
    try {
      const { trailer } = await gamesApi.trailer(gameId);
      setState(trailer ? { kind: 'ready', youtubeId: trailer.youtubeId } : { kind: 'none' });
    } catch {
      setState({ kind: 'error' });
    }
  }

  if (state.kind === 'ready') {
    return (
      <div style={st('width:100%;display:flex;flex-direction:column;gap:6px')}>
        <div style={st('position:relative;width:100%;aspect-ratio:16/9;border-radius:16px;overflow:hidden;background:#000')}>
          <iframe
            title="Game trailer"
            src={`https://www.youtube-nocookie.com/embed/${state.youtubeId}?autoplay=1&rel=0&modestbranding=1`}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
            referrerPolicy="strict-origin-when-cross-origin"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
          />
        </div>
        <button type="button" onClick={() => setState({ kind: 'idle' })} style={st('align-self:flex-start;border:none;background:none;padding:0;color:var(--muted);font:500 12.5px var(--font-ui);text-decoration:underline;text-underline-offset:3px')}>
          Hide trailer
        </button>
      </div>
    );
  }

  const label =
    state.kind === 'loading' ? 'Finding trailer…' : state.kind === 'none' ? 'No trailer found' : state.kind === 'error' ? "Couldn't load the trailer. Tap to retry" : '▶ Watch trailer';
  return (
    <button
      type="button"
      onClick={open}
      disabled={state.kind === 'loading' || state.kind === 'none'}
      style={st(
        `align-self:${compact ? 'center' : 'flex-start'};display:flex;align-items:center;gap:8px;height:${compact ? 38 : 40}px;padding:0 16px;border-radius:999px;border:1px solid var(--line);background:transparent;color:${state.kind === 'none' ? 'var(--faint)' : 'var(--text)'};font:600 13.5px var(--font-ui);opacity:${state.kind === 'loading' ? 0.6 : 1}`,
      )}
    >
      {label}
    </button>
  );
}
