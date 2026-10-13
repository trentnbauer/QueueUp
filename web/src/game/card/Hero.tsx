import { useEffect, useState, type ReactNode } from 'react';
import { useUi } from '../../context/UiContext';
import { coverBg } from '../../ui/primitives';
import { Dialog } from '../../ui/Dialog';
import { st } from '../../ui/st';
import { useT } from '../../i18n';
import { TrailerPlayer, useTrailer } from '../Trailer';
import { FROSTED, FrostedPill, HeroButton, SCRIM } from './ui';

/** Which art a hero shows: Steam's landscape hero when it loads, else the portrait cover blurred under a crisp one, else a title-made gradient. */
export type HeroArt = 'hero' | 'blur' | 'gradient';

/** Looks the landscape hero up (it can be missing on Steam even with an app id) and says which art to use. */
export function useHeroArt(heroUrl: string | null, coverUrl: string | null): HeroArt {
  const [heroOk, setHeroOk] = useState(false);
  useEffect(() => {
    setHeroOk(false);
    if (!heroUrl) return;
    let cancelled = false;
    const img = new Image();
    img.onload = () => !cancelled && setHeroOk(true);
    img.onerror = () => !cancelled && setHeroOk(false);
    img.src = heroUrl;
    return () => {
      cancelled = true;
    };
  }, [heroUrl]);
  if (heroUrl && heroOk) return 'hero';
  return coverUrl ? 'blur' : 'gradient';
}

/** The big white play button that opens the trailer (IGDB, looked up when tapped), with its "Watch trailer" pill. */
function TrailerButton({ gameId, title, size, withCover }: { gameId: string; title: string; size: number; withCover?: boolean }) {
  const t = useT();
  const ui = useUi();
  const { state, load, reset } = useTrailer(gameId);
  const [open, setOpen] = useState(false);

  // A game with no trailer on file says so rather than doing nothing.
  useEffect(() => {
    if (open && (state.kind === 'none' || state.kind === 'error')) {
      setOpen(false);
      ui.notify(t(state.kind === 'none' ? 'game.trailer.none' : 'game.trailer.error'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.kind, open]);

  function start() {
    setOpen(true);
    if (state.kind !== 'ready') void load();
  }

  const busy = open && state.kind === 'loading';
  return (
    <>
      <button
        type="button"
        onClick={start}
        aria-label={t('game.trailer.watch')}
        disabled={busy}
        style={st(`display:flex;flex-direction:column;align-items:center;gap:8px;border:none;background:none;padding:0;opacity:${busy ? 0.7 : 1}`)}
      >
        <span
          style={st(
            `width:${size}px;height:${size}px;border-radius:50%;background:#fff;color:oklch(0.18 0.01 55);display:flex;align-items:center;justify-content:center;font-size:${Math.round(size * 0.35)}px;padding-left:${Math.round(size * 0.06)}px;box-shadow:0 10px 30px oklch(0 0 0 / 0.5), 0 0 0 6px oklch(1 0 0 / 0.18)`,
          )}
        >
          ▶
        </span>
        {!withCover && (
          <FrostedPill style={{ height: 26, padding: '0 12px', color: '#fff', font: '600 12px var(--font-ui)' }}>
            {busy ? t('game.trailer.finding') : t('game.trailer.watch')}
          </FrostedPill>
        )}
      </button>
      {open && state.kind === 'ready' && (
        <Dialog
          title={t('game.trailer.dialogTitle', { title })}
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

interface HeroProps {
  title: string;
  coverUrl: string | null;
  heroUrl: string | null;
  /** "PS5 NIGHT · BACKLOG" */
  kicker: string;
  /** The line under the title, already assembled (genre, year, players, ★). */
  meta: ReactNode;
  /** "~8 sessions to finish (5h)", when there is one. */
  sessions?: string | null;
  /** The game's id when the trailer button should show (a game that is on a list). */
  trailerGameId?: string | null;
  desktop: boolean;
  onClose: () => void;
  /** DLC cards: "‹ Base game". */
  back?: { label: string; onClick: () => void } | null;
  /** DLC cards use a shorter hero with a smaller title. */
  compact?: boolean;
  /** The little grab handle at the top of a phone sheet. */
  handle?: boolean;
}

/** The card's art, title and meta. Phone: 320px across the top. Desktop: the whole left column. */
export function Hero({ title, coverUrl, heroUrl, kicker, meta, sessions, trailerGameId, desktop, onClose, back, compact, handle = !desktop }: HeroProps) {
  const t = useT();
  const art = useHeroArt(heroUrl, coverUrl);
  const height = compact ? 230 : desktop ? '100%' : 320;
  const playSize = desktop ? 76 : 68;

  return (
    <div style={st(`position:relative;height:${typeof height === 'number' ? `${height}px` : height};flex-shrink:0;overflow:hidden;background:var(--hero1)`)}>
      {art === 'hero' && heroUrl && (
        <span style={{ position: 'absolute', inset: 0, background: `url("${heroUrl}") 58% center/cover no-repeat` }} />
      )}
      {art === 'blur' && coverUrl && (
        <span style={{ position: 'absolute', inset: -60, background: `url("${coverUrl}") center/cover no-repeat`, filter: 'blur(28px) saturate(1.25)', opacity: 0.85 }} />
      )}
      {art === 'gradient' && <span style={{ position: 'absolute', inset: 0, background: coverBg(title, coverUrl) }} />}
      <span
        style={{
          position: 'absolute',
          inset: 0,
          background: `linear-gradient(to bottom, ${SCRIM.replace(')', ' / 0.15)')}, ${SCRIM.replace(')', ' / 0)')} 30%, ${SCRIM.replace(')', ' / 0.6)')} 68%, ${SCRIM.replace(')', ' / 0.94)')})`,
        }}
      />
      {handle && <span style={st('position:absolute;top:8px;left:50%;width:36px;height:5px;margin-left:-18px;border-radius:999px;background:oklch(1 0 0 / 0.45)')} />}

      {back && (
        <HeroButton onClick={back.onClick} label={back.label} style={{ top: 14, left: 14, height: 34, padding: '0 12px 0 9px', borderRadius: 999, font: '600 12.5px var(--font-ui)', maxWidth: '65%', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
          ‹ {back.label}
        </HeroButton>
      )}
      {(!desktop || compact) && (
        <HeroButton onClick={onClose} label={t('common.close')} style={{ top: compact ? 14 : 16, right: compact ? 14 : 16, width: 34, height: 34, borderRadius: '50%', fontSize: 18, lineHeight: 1 }}>
          ×
        </HeroButton>
      )}

      {/* Portrait cover on its own, with the play button on it, when there is no landscape art. */}
      {art === 'blur' && coverUrl && !compact && (
        <div
          style={{
            position: 'absolute',
            top: desktop ? '16%' : 34,
            left: '50%',
            width: desktop ? 148 : 104,
            marginLeft: desktop ? -74 : -52,
            aspectRatio: '2/3',
            borderRadius: 12,
            boxShadow: '0 16px 36px oklch(0 0 0 / 0.5), 0 0 0 1px oklch(1 0 0 / 0.1)',
            background: `url("${coverUrl}") center/cover no-repeat`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {trailerGameId && <TrailerButton gameId={trailerGameId} title={title} size={46} withCover />}
        </div>
      )}
      {art !== 'blur' && trailerGameId && !compact && (
        <div style={st(`position:absolute;left:50%;top:${desktop ? '38%' : '118px'};transform:translate(-50%,-50%)`)}>
          <TrailerButton gameId={trailerGameId} title={title} size={playSize} />
        </div>
      )}

      <div style={st('position:absolute;left:20px;right:20px;bottom:10px;display:flex;flex-direction:column;gap:6px')}>
        <span
          style={st(
            `align-self:flex-start;max-width:100%;${FROSTED};height:24px;padding:0 10px;border-radius:999px;color:oklch(0.82 0.11 var(--rh, 50));font:600 10.5px var(--font-mono);letter-spacing:0.04em;display:flex;align-items:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis`,
          )}
        >
          {kicker}
        </span>
        <span style={st(`font:800 ${compact ? 30 : desktop ? 36 : 34}px/1 var(--font-display);letter-spacing:-0.03em;color:#fff;text-wrap:balance`)}>{title}</span>
        <span style={st('font:500 13px var(--font-ui);color:oklch(0.9 0.006 70)')}>{meta}</span>
        {sessions && <span style={st('font:500 13px var(--font-ui);color:oklch(0.9 0.006 70)')}>{sessions}</span>}
      </div>
    </div>
  );
}
