import { useEffect, useRef, useState } from 'react';
import { gamesApi } from '../api/games';
import { useKeepScreenAwake } from '../hooks/useKeepScreenAwake';
import { Dialog } from '../ui/Dialog';
import { st } from '../ui/st';
import { useT } from '../i18n';

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

/** The trailer for a game that is not on a list yet (looked up by IGDB id), fetched straight away. */
export function useIgdbTrailer(igdbId: number): State {
  const [state, setState] = useState<State>({ kind: 'loading' });
  useEffect(() => {
    setState({ kind: 'loading' });
    let cancelled = false;
    gamesApi
      .igdbTrailer(igdbId)
      .then(({ trailer }) => !cancelled && setState(trailer ? { kind: 'ready', youtubeId: trailer.youtubeId } : { kind: 'none' }))
      .catch(() => !cancelled && setState({ kind: 'error' }));
    return () => {
      cancelled = true;
    };
  }, [igdbId]);
  return state;
}

/** A phone or tablet (a touch screen), where the video is small in portrait and a one-tap landscape full screen helps.
 * On a desktop the player's own full screen button is enough. */
function isTouchDevice(): boolean {
  try {
    return window.matchMedia('(pointer: coarse)').matches;
  } catch {
    return false;
  }
}

/** The screen orientation API is not in every browser's types, and locking only works while in full screen. */
type LockableOrientation = ScreenOrientation & { lock?: (o: 'landscape') => Promise<void> };

/** A 16:9 YouTube (no-cookie) player that fills its container. Keeps the screen awake while it's open. On a touch
 * device it also has a Full screen button: the video fills the whole screen and, where the browser allows it
 * (Android Chrome and most Android browsers; iPhones only offer YouTube's own full screen button), the phone is
 * turned to landscape for the duration, so the picture is as big as the screen can make it. */
export function TrailerPlayer({ youtubeId, radius = 16 }: { youtubeId: string; radius?: number }) {
  const t = useT();
  useKeepScreenAwake();
  const frameRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const canFullscreen = typeof document !== 'undefined' && document.fullscreenEnabled === true && isTouchDevice();

  // Follows the real full screen state (the person can leave with the system gesture, not just our button).
  useEffect(() => {
    const onChange = () => {
      const on = document.fullscreenElement === frameRef.current;
      setFullscreen(on);
      // Landscape is only held while in full screen: let the phone turn freely again afterwards.
      if (!on) {
        try {
          screen.orientation?.unlock?.();
        } catch {
          /* not supported */
        }
      }
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  async function toggleFullscreen() {
    const el = frameRef.current;
    if (!el) return;
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
        return;
      }
      await el.requestFullscreen();
      // Turn the phone to landscape if it can be asked to; a refusal just leaves it as it is.
      await (screen.orientation as LockableOrientation | undefined)?.lock?.('landscape').catch(() => undefined);
    } catch {
      /* full screen refused: the player's own button still works */
    }
  }

  return (
    <div style={st('display:flex;flex-direction:column;gap:10px')}>
      <div
        ref={frameRef}
        style={st(`position:relative;width:100%;${fullscreen ? 'height:100%;' : 'aspect-ratio:16/9;'}border-radius:${fullscreen ? 0 : radius}px;overflow:hidden;background:#000`)}
      >
        <iframe
          title={t('game.trailer.iframeTitle')}
          src={`https://www.youtube-nocookie.com/embed/${youtubeId}?autoplay=1&rel=0&modestbranding=1`}
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
          referrerPolicy="strict-origin-when-cross-origin"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }}
        />
        {fullscreen && (
          <button
            type="button"
            onClick={() => void toggleFullscreen()}
            aria-label={t('game.trailer.exitFullscreen')}
            style={st('position:absolute;top:12px;left:12px;height:36px;padding:0 14px;border-radius:999px;border:none;background:rgba(0,0,0,0.6);color:#fff;font:600 13px var(--font-ui)')}
          >
            {t('game.trailer.exitFullscreen')}
          </button>
        )}
      </div>
      {canFullscreen && !fullscreen && (
        <button
          type="button"
          onClick={() => void toggleFullscreen()}
          style={st('align-self:flex-start;height:40px;padding:0 16px;border-radius:999px;border:1px solid var(--line);background:transparent;color:var(--text);font:600 13.5px var(--font-ui)')}
        >
          {t('game.trailer.fullscreen')}
        </button>
      )}
    </div>
  );
}

/** "Watch trailer": nothing is fetched until it's tapped, then the trailer pops out in a large modal. */
export function Trailer({ gameId, title }: { gameId: string; title?: string }) {
  const t = useT();
  const { state, load, reset } = useTrailer(gameId);
  const [open, setOpen] = useState(false);

  async function start() {
    setOpen(true);
    if (state.kind !== 'ready') await load();
  }

  const label =
    state.kind === 'loading'
      ? t('game.trailer.finding')
      : state.kind === 'none'
        ? t('game.trailer.none')
        : state.kind === 'error'
          ? t('game.trailer.error')
          : t('game.trailer.watch');
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
          title={title ? t('game.trailer.dialogTitle', { title }) : t('game.trailer.dialogTitleBare')}
          width={960}
          centered
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
