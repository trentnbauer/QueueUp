import { useEffect, useState } from 'react';
import { gamesApi } from '../api/games';
import { Dialog } from '../ui/Dialog';
import { st } from '../ui/st';

type State = { kind: 'idle' } | { kind: 'loading' } | { kind: 'none' } | { kind: 'error' } | { kind: 'ready'; youtubeId: string };

/** Looks the game's trailer up (IGDB, cached server-side). `auto` fetches right away; otherwise
 * nothing is fetched until `load()` is called. */
export function useTrailer(gameId: string, auto = false) {
  const [state, setState] = useState<State>({ kind: 'idle' });

  async function load() {
    setState({ kind: 'loading' });
    try {
      const { trailer } = await gamesApi.trailer(gameId);
      setState(trailer ? { kind: 'ready', youtubeId: trailer.youtubeId } : { kind: 'none' });
    } catch {
      setState({ kind: 'error' });
    }
  }

  useEffect(() => {
    setState({ kind: 'idle' });
    if (!auto) return;
    let cancelled = false;
    gamesApi
      .trailer(gameId)
      .then(({ trailer }) => !cancelled && setState(trailer ? { kind: 'ready', youtubeId: trailer.youtubeId } : { kind: 'none' }))
      .catch(() => !cancelled && setState({ kind: 'error' }));
    return () => {
      cancelled = true;
    };
  }, [gameId, auto]);

  return { state, load, reset: () => setState({ kind: 'idle' }) };
}

/** A 16:9 YouTube (no-cookie) player that fills its container. */
export function TrailerPlayer({ youtubeId, radius = 16 }: { youtubeId: string; radius?: number }) {
  return (
    <div style={st(`position:relative;width:100%;aspect-ratio:16/9;border-radius:${radius}px;overflow:hidden;background:#000`)}>
      <iframe
        title="Game trailer"
        src={`https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1&rel=0&modestbranding=1`}
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
      />
    </div>
  );
}

/** "Watch trailer": nothing is fetched until it's tapped, then the trailer pops out in a large modal. */
export function Trailer({ gameId, title }: { gameId: string; title?: string }) {
  const { state, load, reset } = useTrailer(gameId);
  const [open, setOpen] = useState(false);

  async function start() {
    setOpen(true);
    if (state.kind !== 'ready') await load();
  }

  const label = state.kind === 'loading' ? 'Finding trailer…' : state.kind === 'none' ? 'No trailer found' : state.kind === 'error' ? "Couldn't load the trailer. Tap to retry" : '▶ Watch trailer';
  return (
    <>
      <button
        type="button"
        onClick={() => void start()}
        disabled={state.kind === 'loading' || state.kind === 'none'}
        style={st(
          `align-self:flex-start;display:flex;align-items:center;gap:8px;height:40px;padding:0 16px;border-radius:999px;border:1px solid var(--line);background:transparent;color:${state.kind === 'none' ? 'var(--faint)' : 'var(--text)'};font:600 13.5px var(--font-ui);opacity:${state.kind === 'loading' ? 0.6 : 1}`,
        )}
      >
        {label}
      </button>
      {open && state.kind === 'ready' && (
        <Dialog
          title={title ? `${title} · trailer` : 'Trailer'}
          width={960}
          onClose={() => {
            setOpen(false);
            reset();
          }}
        >
          <TrailerPlayer youtubeId={state.youtubeId} />
        </Dialog>
      )}
    </>
  );
}
