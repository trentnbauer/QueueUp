import type { MouseEvent, ReactNode } from 'react';
import type { Game, VoteValue } from '@queueup/shared';
import { VOTES, VOTE_VALUES, isNewRelease, releaseLabel, reviewAverage, releaseShortDate } from '../lib/gameView';
import { ABOVE, Cover, coverBg, GOLD, GOLD_RING, OpenOverlay, StatusBadge, statusOutlineFor, statusRing, TrophyBadge } from '../ui/primitives';
import { st } from '../ui/st';
import type { RowItem } from './derive';

const stop = (e: MouseEvent) => e.stopPropagation();

/** The five-emoji vote control. `variant` picks the geometry: inline list pill, mobile list pill
 * (left-aligned, under the title), or the blurred overlay on a cover card. */
export function VoteSegment({
  myVote,
  onVote,
  variant,
  compact,
}: {
  myVote: number;
  onVote: (v: VoteValue) => void;
  variant: 'inline' | 'mobile' | 'cover';
  /** The Ranked queue's slightly smaller buttons. */
  compact?: boolean;
}) {
  const wrap =
    variant === 'cover'
      ? 'position:absolute;z-index:2;left:6px;right:6px;bottom:6px;display:flex;gap:1px;padding:3px;border-radius:999px;background:oklch(0.15 0.01 55 / 0.62);backdrop-filter:blur(10px)'
      : `${ABOVE}display:flex;${variant === 'mobile' ? 'align-self:flex-start;' : 'flex-shrink:0;'}gap:1px;padding:3px;border-radius:999px;background:var(--surf)`;
  return (
    <div style={st(wrap)} onClick={stop} role="group" aria-label="Your vote">
      {VOTE_VALUES.map((v) => {
        const on = myVote === v;
        const geo =
          variant === 'cover'
            ? 'flex:1;min-width:0;height:30px;font-size:14px'
            : compact
              ? 'width:32px;height:28px;font-size:14px'
              : 'width:34px;height:30px;font-size:15px';
        return (
          <button
            key={v}
            type="button"
            aria-label={VOTES[v].l}
            title={VOTES[v].l}
            aria-pressed={on}
            onClick={(e) => {
              stop(e);
              onVote(v);
            }}
            style={st(
              `${geo};border:none;border-radius:999px;background:${on ? 'var(--acc)' : 'transparent'};opacity:${myVote && !on ? 0.4 : 1};line-height:1;padding:0`,
            )}
          >
            {VOTES[v].e}
          </button>
        );
      })}
    </div>
  );
}

const CHIP = 'flex-shrink:0;height:19px;padding:0 7px;border-radius:999px;background:var(--surf2);color:var(--text2);font:600 10.5px var(--font-ui);display:flex;align-items:center';

/** The viewer's Steam achievement count ("🏆 10/20"), gold once it's 100%. Personal Shelf only:
 * in a room, everyone's counts show in the game's detail, next to each member's vote. */
function AchievementChip({ g }: { g: Game }) {
  const a = g.myAchievements;
  if (!a || g.roomId) return null;
  const full = a.unlocked >= a.total;
  return (
    <span
      title={`${a.unlocked} of ${a.total} achievements`}
      aria-label={`${a.unlocked} of ${a.total} achievements`}
      style={st(CHIP, full ? { background: GOLD, color: 'oklch(0.28 0.06 70)' } : undefined)}
    >
      🏆 {a.unlocked}/{a.total}
    </span>
  );
}

function SelectMark({ on }: { on: boolean }) {
  return (
    <span
      style={st(
        `width:26px;height:26px;flex-shrink:0;border-radius:50%;border:2px solid ${on ? 'var(--acc)' : 'var(--line)'};background:${on ? 'var(--acc)' : 'transparent'};color:var(--ink);display:flex;align-items:center;justify-content:center;font:800 13px var(--font-ui)`,
      )}
    >
      {on ? '✓' : ''}
    </span>
  );
}

interface RowProps {
  item: RowItem;
  showRank: boolean;
  bulk: boolean;
  selected: boolean;
  /** Highlights the row whose detail is open (desktop right panel). */
  active: boolean;
  onOpen: () => void;
  onVote: (v: VoteValue) => void;
}

/** One game in the list layout on desktop: rank, cover, title/meta, price, votes, score. */
export function DesktopRow({ item, showRank, bulk, selected, active, onOpen, onVote }: RowProps) {
  const g = item.game;
  const bg = bulk && selected ? 'var(--accA10)' : active ? 'var(--surf)' : 'transparent';
  return (
    <div
      className="hv-surf"
      style={st(`position:relative;display:flex;align-items:center;gap:16px;padding:10px 12px;border-radius:16px;cursor:pointer;background:${bg}`)}
    >
      <OpenOverlay label={`Open ${g.title}`} onOpen={onOpen} />
      {showRank && (
        <span style={st('width:24px;flex-shrink:0;font:700 18px var(--font-display);color:var(--rank);text-align:center')}>{item.rank}</span>
      )}
      {bulk && <SelectMark on={selected} />}
      <Cover title={g.title} url={g.coverImageUrl} width={44} radius={9} completed={isFullyCompleted(g)} status={g.status} statusRing={false} badgeScale={2} />
      <div style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:4px')}>
        <span style={st('font:600 15.5px var(--font-ui);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{g.title}</span>
        <span style={st('display:flex;align-items:center;gap:6px;min-width:0;font:400 12.5px var(--font-ui);color:var(--muted)')}>
          {item.chip && <span style={st(CHIP)}>{item.chip}</span>}
          <AchievementChip g={g} />
          <span style={st('white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{item.meta}</span>
        </span>
      </div>
      <span style={st('width:96px;flex-shrink:0;display:flex;flex-direction:column;align-items:flex-end;gap:2px;text-align:right')}>
        <span style={st(`font:600 13px var(--font-ui);color:${item.priceOwned ? 'var(--mint)' : 'var(--text)'};white-space:nowrap`)}>{item.priceLabel}</span>
        <span style={st('font:500 11.5px var(--font-ui);color:var(--faint);white-space:nowrap')}>{item.ownSub}</span>
      </span>
      <ReviewScore g={g} />
      {!bulk && <VoteSegment myVote={item.myVote} onVote={onVote} variant="inline" />}
      <ScoreCol item={item} width={52} size={19} />
    </div>
  );
}

function ScoreCol({ item, width, size }: { item: RowItem; width: number; size: number }) {
  return (
    <div style={st(`width:${width}px;flex-shrink:0;display:flex;flex-direction:column;align-items:flex-end;gap:1px`)}>
      <span style={st(`font:700 ${size}px var(--font-display);color:${item.scoreHot ? 'var(--pos)' : 'var(--faint)'}`)}>{item.scoreLabel}</span>
      <span style={st('font:500 10.5px var(--font-mono);color:var(--faint);white-space:nowrap')}>{item.countLabel}</span>
    </div>
  );
}

/** Your own review score for the game as "4.3/5" (average of the scored categories); nothing when
 * there's no review or it has no scores. */
function ReviewScore({ g }: { g: Game }) {
  const avg = g.review ? reviewAverage(g.review) : null;
  if (avg === null) return null;
  return (
    <span title="Your review" style={st('flex-shrink:0;display:flex;align-items:center;gap:4px;font:700 14px var(--font-display);color:var(--accText);white-space:nowrap')}>
      <span aria-hidden="true">★</span>
      {avg.toFixed(1)}/5
    </span>
  );
}

/** One game in the list layout on phones: votes sit under the title, tap highlights the row. */
export function MobileRow({ item, showRank, bulk, selected, onOpen, onVote }: RowProps) {
  const g = item.game;
  return (
    <div
      style={st(`position:relative;display:flex;align-items:center;gap:12px;padding:10px;border-radius:18px;cursor:pointer;background:${bulk && selected ? 'var(--accA10)' : 'transparent'}`)}
    >
      <OpenOverlay label={`Open ${g.title}`} onOpen={onOpen} />
      {showRank && <span style={st('width:20px;flex-shrink:0;font:700 17px var(--font-display);color:var(--rank);text-align:center')}>{item.rank}</span>}
      {bulk && <SelectMark on={selected} />}
      <Cover title={g.title} url={g.coverImageUrl} width={46} radius={10} completed={isFullyCompleted(g)} status={g.status} statusRing={false} badgeScale={2} />
      <div style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:6px')}>
        <div style={st('display:flex;flex-direction:column;gap:2px;min-width:0')}>
          <span style={st('font:600 15.5px var(--font-ui);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{g.title}</span>
          <span style={st('display:flex;align-items:center;gap:6px;min-width:0;font:400 12.5px var(--font-ui);color:var(--muted)')}>
            {item.chip && <span style={st(CHIP)}>{item.chip}</span>}
            <AchievementChip g={g} />
            <span style={st('white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>
              {item.meta}
              {item.meta ? ' · ' : ''}
              <span style={{ color: item.priceOwned ? 'var(--mint)' : 'var(--text)' }}>{item.priceLabel}</span>
            </span>
          </span>
        </div>
        <div style={st('display:flex;align-items:center;gap:12px;min-width:0')}>
          {!bulk && <VoteSegment myVote={item.myVote} onVote={onVote} variant="mobile" />}
          <ReviewScore g={g} />
        </div>
      </div>
      <ScoreCol item={item} width={44} size={18} />
    </div>
  );
}

/** A Beaten (or replayed) game whose achievements synced at 100%. */
function isFullyCompleted(g: Game): boolean {
  return g.steamFullyCompleted && (g.status === 'done' || g.status === 'replay');
}

const BADGE = 'background:oklch(0.15 0.01 55 / 0.62);backdrop-filter:blur(8px);color:#fff';

/** One game in the covers layout. `big` (2 per row) carries the vote overlay, 3 per row doesn't. */
export function CoverCard({
  item,
  showRank,
  bulk,
  selected,
  big,
  onOpen,
  onVote,
  onStart,
}: RowProps & { big: boolean; /** Play Next: a Start button in place of the vote bar. */ onStart?: () => void }) {
  const g = item.game;
  const completed = isFullyCompleted(g);
  const outline = completed ? null : statusOutlineFor(g.status);
  return (
    <div
      style={st('position:relative;display:flex;flex-direction:column;gap:8px;min-width:0;cursor:pointer')}
    >
      <OpenOverlay label={`Open ${g.title}`} onOpen={onOpen} />
      <div
        style={st(
          `position:relative;aspect-ratio:2/3;border-radius:16px;background:${coverBg(g.title, g.coverImageUrl)};overflow:hidden;box-shadow:${bulk && selected ? '0 0 0 3px var(--acc)' : completed ? `${GOLD_RING}, 0 8px 22px oklch(0 0 0 / 0.25)` : outline ? `${statusRing(outline)}, 0 8px 22px oklch(0 0 0 / 0.25)` : '0 8px 22px oklch(0 0 0 / 0.25)'}`,
        )}
      >
        {completed && (
          <span style={st('position:absolute;inset:0;pointer-events:none;background:linear-gradient(to bottom, oklch(0.83 0.15 85 / 0.35), transparent 45%)')} />
        )}
        {completed && <TrophyBadge size={big ? 34 : 28} style={{ top: 6, left: showRank ? 40 : 6, right: 'auto', bottom: 'auto' }} />}
        {outline && <StatusBadge outline={outline} size={big ? 34 : 28} style={{ top: 6, left: showRank ? 40 : 6, right: 'auto', bottom: 'auto' }} />}
        {showRank && (
          <span style={st(`position:absolute;top:8px;left:8px;min-width:26px;height:26px;padding:0 8px;border-radius:999px;${BADGE};font:700 13px var(--font-display);display:flex;align-items:center;justify-content:center`)}>
            {item.rank}
          </span>
        )}
        <span style={st(`position:absolute;top:8px;right:8px;height:26px;padding:0 9px;border-radius:999px;${BADGE};font:700 12px var(--font-ui);display:flex;align-items:center`)}>
          {item.scoreLabel}
        </span>
        {big && !bulk && !onStart && <VoteSegment myVote={item.myVote} onVote={onVote} variant="cover" />}
      </div>
      <div style={st('display:flex;flex-direction:column;gap:1px;min-width:0;padding:0 2px')}>
        <span style={st('font:600 14px var(--font-ui);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{g.title}</span>
        <span style={st('display:flex;align-items:center;gap:6px;min-width:0')}>
          <span style={st(`flex:1;min-width:0;font:400 12px var(--font-ui);color:${item.priceOwned ? 'var(--mint)' : 'var(--text)'};white-space:nowrap;overflow:hidden;text-overflow:ellipsis`)}>{item.priceLabel}</span>
          <AchievementChip g={g} />
        </span>
      </div>
      {onStart && (
        <button
          type="button"
          onClick={(e) => {
            stop(e);
            onStart();
          }}
          style={st(ABOVE + 'height:34px;border-radius:999px;border:1px solid var(--line);background:transparent;color:var(--text);font:600 12.5px var(--font-ui)')}
        >
          Start
        </button>
      )}
    </div>
  );
}

/** A Play Next entry with its Start button. */
export function PlayNextRow({
  item,
  onOpen,
  onStart,
  desktop,
}: {
  item: RowItem;
  onOpen: () => void;
  onStart: () => void;
  desktop: boolean;
}) {
  const g = item.game;
  const isNew = isNewRelease(g);
  return (
    <div
      className={desktop ? 'hv-surf' : undefined}
      style={st('position:relative;display:flex;align-items:center;gap:12px;padding:10px;border-radius:18px;cursor:pointer')}
    >
      <OpenOverlay label={`Open ${g.title}`} onOpen={onOpen} />
      <Cover title={g.title} url={g.coverImageUrl} width={40} radius={9} status={g.status} statusRing={false} badgeScale={2} />
      <div style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:2px')}>
        <span style={st('font:600 15px var(--font-ui);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{g.title}</span>
        <span style={st('display:flex;align-items:center;gap:6px;min-width:0;font:400 12.5px var(--font-ui);color:var(--muted)')}>
          {isNew && g.releaseDate && <span style={st(CHIP)}>{`New · out ${releaseShortDate(g.releaseDate)}`}</span>}
          <span style={st('white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>
            {item.meta}
            {item.meta ? ' · ' : ''}
            <span style={{ color: item.priceOwned ? 'var(--mint)' : 'var(--text)' }}>{item.priceLabel}</span>
          </span>
        </span>
      </div>
      <button
        type="button"
        onClick={(e) => {
          stop(e);
          onStart();
        }}
        style={st(ABOVE + 'flex-shrink:0;height:34px;padding:0 14px;border-radius:999px;border:1px solid var(--line);background:transparent;color:var(--text);font:600 12.5px var(--font-ui)')}
      >
        Start
      </button>
    </div>
  );
}

/** The "Coming soon" strip: upcoming games with a release-alert bell. */
export function ComingStrip({
  games,
  onOpen,
  onToggleWatch,
}: {
  games: Game[];
  onOpen: (g: Game) => void;
  onToggleWatch: (g: Game) => void;
}): ReactNode {
  return (
    <div style={st('display:flex;flex-direction:column;gap:10px')}>
      <span style={st('font:600 12px var(--font-mono);letter-spacing:0.06em;color:var(--muted)')}>COMING SOON · {games.length}</span>
      <div style={st('display:flex;gap:10px;overflow-x:auto;margin:0 -16px;padding:0 16px')}>
        {games.map((g) => (
          <div
            key={g.id}
            style={st('position:relative;flex-shrink:0;width:250px;display:flex;align-items:center;gap:12px;padding:10px;border-radius:18px;background:var(--surf);cursor:pointer')}
          >
            <OpenOverlay label={`Open ${g.title}`} onOpen={() => onOpen(g)} />
            <Cover title={g.title} url={g.coverImageUrl} width={44} radius={9} />
            <span style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:3px')}>
              <span style={st('font:600 14.5px var(--font-ui);white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{g.title}</span>
              <span style={st('font:500 12px var(--font-ui);color:var(--accText)')}>Releases {releaseLabel(g)}</span>
            </span>
            <button
              type="button"
              aria-label="Release alert"
              aria-pressed={g.releaseAlert}
              onClick={(e) => {
                stop(e);
                onToggleWatch(g);
              }}
              style={st(`${ABOVE}width:36px;height:36px;flex-shrink:0;border-radius:50%;border:none;background:${g.releaseAlert ? 'var(--accA18)' : 'var(--chip)'};font-size:15px;line-height:1;padding:0;opacity:${g.releaseAlert ? 1 : 0.45}`)}
            >
              🔔
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
