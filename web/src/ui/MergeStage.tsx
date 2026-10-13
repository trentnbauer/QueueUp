import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import type { GameStatus } from '@queueup/shared';
import { coverBg } from './primitives';
import { st } from './st';
import { rich, useT } from '../i18n';
import { cardStatusLabel } from '../game/card/statusLabel';

/** One side of a merge or a remaster link: what tells two games with the same name apart. */
export interface MergeGame {
  title: string;
  coverImageUrl: string | null;
  /** A full date ("2015-05-19") when known, else just the year ("2015"). */
  date?: string | null;
  developer?: string | null;
  publisher?: string | null;
  genre?: string | null;
  /** Where the person is with it. Left out for a game that isn't a card on the list yet (a re-match target). */
  status?: GameStatus | null;
  playtimeHours?: number | null;
}

/** Below this width the stage uses the compact layout (small covers, one-column details). */
const COMPACT_BELOW = 412;

/** The stage's own width, followed as it changes (a dialog on a phone is much narrower than on a desktop). */
export function useStageWidth<T extends HTMLElement>(): [(el: T | null) => void, number | null] {
  const [width, setWidth] = useState<number | null>(null);
  const observer = useRef<ResizeObserver | null>(null);
  const ref = useCallback((el: T | null) => {
    observer.current?.disconnect();
    if (!el) return;
    setWidth(el.clientWidth || null);
    observer.current = new ResizeObserver(() => setWidth(el.clientWidth || null));
    observer.current.observe(el);
  }, []);
  useEffect(() => () => observer.current?.disconnect(), []);
  return [ref, width];
}

const DATE_WIDE = { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' } as const;

/** "19 May 2015" in the person's own locale; just the year when that is all there is; "Unknown" when nothing. */
export function formatMergeDate(d: string | null | undefined, unknown: string): string {
  if (!d) return unknown;
  if (/^\d{4}$/.test(d)) return d;
  const [y, m, day] = d.slice(0, 10).split('-').map(Number);
  if (!y || !m || !day) return unknown;
  return new Intl.DateTimeFormat(undefined, DATE_WIDE).format(new Date(Date.UTC(y, m - 1, day)));
}

const asSet = (v: string | null | undefined) =>
  v
    ? [...new Set(v.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean))]
        .sort()
        .join('|')
    : '';

/** A field is highlighted only when both sides are known and they differ. Developer, publisher and genre compare as sets, so
 * "Shooter, Tactical" equals "Tactical, Shooter"; dates compare in full when both are full, else by year. */
export function fieldDiffers(a: MergeGame, b: MergeGame, key: 'developer' | 'publisher' | 'genre' | 'date'): boolean {
  if (key === 'date') {
    if (!a.date || !b.date) return false;
    const full = /^\d{4}-/.test(a.date) && /^\d{4}-/.test(b.date);
    return full ? a.date.slice(0, 10) !== b.date.slice(0, 10) : a.date.slice(0, 4) !== b.date.slice(0, 4);
  }
  const sa = asSet(a[key]);
  const sb = asSet(b[key]);
  return !!sa && !!sb && sa !== sb;
}

const STATUS_COLOUR: Partial<Record<GameStatus, string>> = {
  done: 'var(--mint)',
  replay: 'var(--mint)',
  dropped: 'oklch(0.76 0.15 60)',
  paused: 'var(--acc)',
  playing: 'var(--accText)',
  wont_play: 'var(--muted)',
};

/** The status word for a chip: "Replaying" rather than "Replay", and the hours played when there are some. */
export function useStatusChip(): (g: MergeGame) => { text: string; colour: string } | null {
  const t = useT();
  return (g) => {
    if (!g.status) return null;
    const word = g.status === 'replay' ? t('card.merge.statusReplaying') : cardStatusLabel(g.status);
    return { text: g.playtimeHours ? `${word} · ${g.playtimeHours}h` : word, colour: STATUS_COLOUR[g.status] ?? 'var(--line)' };
  };
}

/** The look shared by the merge and remaster stages. */
export function stageMetrics(width: number | null) {
  const stageWidth = width ?? 560;
  const compact = stageWidth < COMPACT_BELOW;
  const pad = compact ? 12 : 16;
  const inner = stageWidth - pad * 2;
  const coverW = compact ? 56 : 116;
  return { compact, pad, inner, coverW, colW: (inner - 12) / 2, titleSize: compact ? 13 : 13.5, gap: 12 };
}

/** One game's column inside a stage: label, cover (with its badge and status chip), title, date and details. */
export function StageCard({
  game,
  other,
  label,
  labelColour,
  compact,
  coverW,
  colW,
  titleSize,
  transform,
  opacity,
  zIndex,
  transition,
  coverShadow,
  coverFilter,
  badge,
  captionOpacity = 1,
  highlight = true,
}: {
  game: MergeGame;
  other: MergeGame;
  label: string;
  labelColour: string;
  compact: boolean;
  coverW: number;
  colW: number;
  titleSize: number;
  transform: string;
  opacity: number;
  zIndex: number;
  transition: string;
  coverShadow: string;
  coverFilter?: string;
  badge?: ReactNode;
  captionOpacity?: number;
  /** Bold the fields that differ from the other game (the merge stage does; the remaster stage doesn't). */
  highlight?: boolean;
}) {
  const t = useT();
  const chip = useStatusChip()(game);
  const unknown = t('settings.duplicates.unknown');
  const rows: [string, 'developer' | 'publisher' | 'genre'][] = [
    [t('settings.duplicates.developer'), 'developer'],
    [t('settings.duplicates.publisher'), 'publisher'],
    [t('settings.duplicates.genre'), 'genre'],
  ];
  const dateDiffers = highlight && fieldDiffers(game, other, 'date');
  return (
    <div style={st(`position:relative;min-width:0;display:flex;flex-direction:column;align-items:center;gap:8px;transform:${transform};opacity:${opacity};z-index:${zIndex};transition:${transition}`)}>
      <span style={st(`font:700 10.5px var(--font-mono);letter-spacing:0.06em;color:${labelColour};opacity:${captionOpacity};transition:opacity .4s ease`)}>{label}</span>
      <div style={st('position:relative;display:flex')}>
        <span style={{ width: coverW, aspectRatio: '2/3', borderRadius: 10, display: 'block', background: coverBg(game.title, game.coverImageUrl), boxShadow: coverShadow, filter: coverFilter ?? 'none', transition: 'box-shadow .5s ease, filter .4s ease' }} />
        {badge}
        {chip && (
          <span
            style={st(
              `position:absolute;left:50%;bottom:-10px;transform:translateX(-50%);max-width:${Math.round(colW - 8)}px;height:20px;padding:0 7px;border-radius:999px;background:var(--sheet);border:1.5px solid ${chip.colour};color:var(--text);font:600 10.5px var(--font-ui);display:flex;align-items:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;opacity:${captionOpacity};transition:opacity .4s ease`,
            )}
          >
            {chip.text}
          </span>
        )}
      </div>
      <div style={st(`width:100%;min-width:0;display:flex;flex-direction:column;align-items:center;gap:6px;margin-top:6px;opacity:${captionOpacity};transition:opacity .4s ease`)}>
        <div style={st('width:100%;display:flex;flex-direction:column;align-items:center;gap:3px')}>
          <span title={game.title} style={st(`max-width:100%;font:600 ${titleSize}px/18px var(--font-ui);max-height:36px;text-align:center;display:block;overflow:hidden;overflow-wrap:anywhere`)}>
            {game.title}
          </span>
          <span style={st(`font:${dateDiffers ? 600 : 500} 12px var(--font-mono);color:${dateDiffers ? 'var(--text)' : game.date ? 'var(--muted)' : 'var(--faint)'}`)}>{formatMergeDate(game.date, unknown)}</span>
        </div>
        <div style={st(`width:100%;display:grid;grid-template-columns:${compact ? 'minmax(0,1fr)' : 'auto minmax(0,1fr)'};gap:${compact ? '0' : '2px 8px'};font:400 12px/1.35 var(--font-ui)`)}>
          {rows.map(([labelText, key]) => {
            const value = game[key];
            const differs = highlight && fieldDiffers(game, other, key);
            return (
              <span key={key} style={st('display:contents')}>
                <span style={st(`color:var(--faint);text-align:${compact ? 'center' : 'right'};font:${compact ? '600 9.5px var(--font-mono)' : '400 12px/1.35 var(--font-ui)'};letter-spacing:${compact ? '0.06em' : 'normal'};margin-top:${compact ? '2px' : '0'}`)}>{labelText}</span>
                <span
                  title={value || unknown}
                  style={st(
                    `min-width:0;color:${!value ? 'var(--faint)' : differs ? 'var(--text)' : 'var(--muted)'};font-weight:${differs ? 600 : 400};text-align:${compact ? 'center' : 'left'};display:block;max-height:${compact ? '16px' : '32px'};overflow:hidden;white-space:${compact ? 'nowrap' : 'normal'};text-overflow:ellipsis;overflow-wrap:anywhere`,
                  )}
                >
                  {value || unknown}
                </span>
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/** What merging two games does: the one that is removed slides into the one that stays and is gone, leaving only the kept game with a +1.
 * The two are laid out side by side (no fixed height) and shrink for a phone. `onSwap` makes the removed game the one that stays. */
export function MergeStage({
  remove,
  keep,
  onSwap,
  consequence,
  disabled,
}: {
  remove: MergeGame;
  keep: MergeGame;
  /** Leave out when the two can't change places (a re-match: the other side isn't a card on the list). */
  onSwap?: () => void;
  /** Replaces the usual sentence under the stage. */
  consequence?: string;
  disabled?: boolean;
}) {
  const t = useT();
  const [stageRef, width] = useStageWidth<HTMLDivElement>();
  const m = stageMetrics(width);
  const baseShadow = '0 10px 24px oklch(0 0 0 / 0.35)';
  const sr = t('card.merge.srLine', { remove: remove.title, keep: keep.title });
  const text = consequence ?? (m.compact ? t('card.merge.consequenceShort', { keep: keep.title }) : t('card.merge.consequence', { remove: remove.title, keep: keep.title }));

  return (
    <div style={st(`display:flex;flex-direction:column;gap:${m.compact ? 8 : 12}px;min-width:0`)}>
      <div
        ref={stageRef}
        role="group"
        aria-label={t('card.merge.stageAria')}
        style={st(`position:relative;border-radius:18px;background:var(--surf);overflow:hidden;display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);column-gap:${m.gap}px;padding:${m.pad}px`)}
      >
        <span
          aria-hidden="true"
          style={st(`position:absolute;left:50%;top:${Math.round(m.pad + 21 + (m.coverW * 1.5) / 2 - 16)}px;transform:translateX(-50%);font:700 26px var(--font-ui);color:var(--muted);pointer-events:none`)}
        >
          →
        </span>
        <StageCard
          game={remove}
          other={keep}
          label={t('card.merge.removed')}
          labelColour="var(--danger)"
          compact={m.compact}
          coverW={m.coverW}
          colW={m.colW}
          titleSize={m.titleSize}
          transform="none"
          opacity={1}
          zIndex={1}
          transition="none"
          coverShadow={baseShadow}
          coverFilter="grayscale(0.6) brightness(0.8)"
        />
        <StageCard
          game={keep}
          other={remove}
          label={t('card.merge.kept')}
          labelColour="var(--mint)"
          compact={m.compact}
          coverW={m.coverW}
          colW={m.colW}
          titleSize={m.titleSize}
          transform="none"
          opacity={1}
          zIndex={2}
          transition="none"
          coverShadow={`0 0 0 3px var(--mint), ${baseShadow}`}
        />
        <span style={st('position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap')}>{sr}</span>
      </div>
      <div style={st('display:flex;justify-content:center;gap:8px;min-width:0')}>
        {onSwap && (
          <button
            type="button"
            onClick={onSwap}
            disabled={disabled}
            aria-label={t('card.merge.swapKeepAria', { title: remove.title })}
            style={st('min-width:0;max-width:100%;height:34px;padding:0 14px;border-radius:999px;border:1px solid var(--line);background:transparent;color:var(--text2);font:600 12.5px var(--font-ui);display:flex;align-items:center;gap:4px;white-space:nowrap')}
          >
            <span style={st('flex-shrink:0')}>⇄</span>
            {m.compact ? (
              <span>{t('card.merge.swapShort')}</span>
            ) : (
              <span style={st(`min-width:0;display:flex;gap:4px;max-width:${Math.max(80, Math.round(m.inner - 70))}px`)}>
                {rich(t('card.merge.swapKeep'), { title: <span key="t" style={st(`min-width:0;max-width:${Math.max(80, Math.round(m.inner - 170))}px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis`)}>{remove.title}</span> })}
              </span>
            )}
          </button>
        )}
      </div>
      <span style={st(`font:400 ${m.compact ? 12.5 : 13}px/1.45 var(--font-ui);color:var(--muted);text-align:center;text-wrap:pretty`)}>{text}</span>
    </div>
  );
}
