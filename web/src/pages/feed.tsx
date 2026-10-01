import type { FriendActivityEntry, FriendEventKind } from '@queueup/shared';
import { REVIEW_CATEGORIES } from '@queueup/shared';
import { REVIEW_EMOJI } from '../lib/gameView';
import { Avatar, Cover } from '../ui/primitives';
import { st } from '../ui/st';

const EVT: Record<FriendEventKind, { verb: string; cap: string; tag: string; bg: string; fg: string }> = {
  added: { verb: 'added', cap: 'Added', tag: 'Library', bg: 'var(--chip)', fg: 'var(--text2)' },
  wishlist: { verb: 'wishlisted', cap: 'Wishlisted', tag: 'Wishlist', bg: 'oklch(0.72 0.1 250 / 0.16)', fg: 'oklch(0.72 0.1 250)' },
  playing: { verb: 'started playing', cap: 'Started playing', tag: 'Playing', bg: 'var(--accSoft2)', fg: 'var(--accText)' },
  beaten: { verb: 'beat', cap: 'Beat', tag: 'Beaten', bg: 'var(--mintSoft)', fg: 'var(--mint)' },
  dropped: { verb: 'dropped', cap: 'Dropped', tag: 'Dropped', bg: 'var(--chip)', fg: 'var(--muted)' },
  ach: { verb: 'earned', cap: 'Earned', tag: 'Achievement', bg: 'oklch(0.7 0.12 300 / 0.16)', fg: 'oklch(0.72 0.12 300)' },
};

export type FeedFilter = 'all' | 'playing' | 'beaten' | 'dropped' | 'ach';
export const FEED_FILTERS: [FeedFilter, string][] = [
  ['all', 'All'],
  ['playing', 'Playing'],
  ['beaten', 'Beaten'],
  ['dropped', 'Dropped'],
  ['ach', 'Achievements'],
];

export function applyFeedFilter(entries: FriendActivityEntry[], filter: FeedFilter): FriendActivityEntry[] {
  return filter === 'all' ? entries : entries.filter((e) => e.kind === filter);
}

export function FilterChips({ value, onChange }: { value: FeedFilter; onChange: (f: FeedFilter) => void }) {
  return (
    <div style={st('display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;flex-shrink:0')}>
      {FEED_FILTERS.map(([k, l]) => (
        <button
          key={k}
          type="button"
          onClick={() => onChange(k)}
          style={st(`flex-shrink:0;height:34px;padding:0 14px;border-radius:999px;border:none;background:${value === k ? 'var(--text)' : 'var(--chip)'};color:${value === k ? 'var(--onText)' : 'var(--muted)'};font:600 13px var(--font-ui)`)}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

const MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];

function dayLabel(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const a = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const b = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const diff = Math.round((b - a) / 864e5);
  if (diff <= 0) return 'TODAY';
  if (diff === 1) return 'YESTERDAY';
  if (diff < 7) return `${diff} DAYS AGO`;
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

export function groupByDay(entries: FriendActivityEntry[]): { label: string; items: FriendActivityEntry[] }[] {
  const out: { label: string; items: FriendActivityEntry[] }[] = [];
  for (const e of entries) {
    const label = dayLabel(e.at);
    const last = out[out.length - 1];
    if (last && last.label === label) last.items.push(e);
    else out.push({ label, items: [e] });
  }
  return out;
}

function ReviewBlock({ review }: { review: NonNullable<FriendActivityEntry['review']> }) {
  const scored = REVIEW_CATEGORIES.filter((c) => review[c.key]);
  if (!scored.length && !review.note) return null;
  return (
    <div style={st('margin-top:6px;display:flex;flex-direction:column;gap:6px;padding:10px 12px;border-radius:14px;background:var(--surf)')}>
      {scored.length > 0 && (
        <div style={st('display:flex;flex-wrap:wrap;gap:4px 12px')}>
          {scored.map((c) => (
            <span key={c.key} style={st('display:flex;align-items:center;gap:4px;font:500 12px var(--font-ui);color:var(--muted)')}>
              {c.label}
              <span style={st('font-size:14px')}>{REVIEW_EMOJI[review[c.key] as number]?.e}</span>
            </span>
          ))}
        </div>
      )}
      {review.note && <span style={st('font:italic 400 13px/1.45 var(--font-ui);color:var(--text2);text-wrap:pretty')}>“{review.note}”</span>}
    </div>
  );
}

function when(iso: string): string {
  const d = new Date(iso);
  return `${MONTHS[d.getMonth()].charAt(0)}${MONTHS[d.getMonth()].slice(1).toLowerCase()} ${d.getDate()}`;
}

/** One activity row. `compact` is the friend-profile variant (no avatar, cover leads). */
export function FeedRow({ e, me, compact, onOpen }: { e: FriendActivityEntry; me: string | undefined; compact?: boolean; onOpen?: () => void }) {
  const t = EVT[e.kind];
  const isAch = e.kind === 'ach';
  const mine = e.user.id === me;
  const tag = e.onlyYou ? `${t.tag} · only you` : t.tag;
  const clickable = !!onOpen && !mine;
  return (
    <div
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? onOpen : undefined}
      onKeyDown={clickable ? (ev) => ev.key === 'Enter' && onOpen?.() : undefined}
      style={st(`display:flex;align-items:center;gap:12px;padding:10px 0;cursor:${clickable ? 'pointer' : 'default'}`)}
    >
      {compact ? (
        isAch ? (
          <span style={st('width:34px;height:34px;flex-shrink:0;border-radius:10px;background:var(--surf);display:flex;align-items:center;justify-content:center;font-size:19px')}>{e.emoji}</span>
        ) : (
          <Cover title={e.title} url={e.coverImageUrl} width={34} radius={7} />
        )
      ) : (
        <Avatar name={e.user.displayName} color={e.user.avatarColor} avatarUrl={e.user.avatarUrl} size={36} fontSize={14} />
      )}
      <span style={st('flex:1;min-width:0;display:flex;flex-direction:column;gap:2px')}>
        <span style={st('font:400 14px/1.35 var(--font-ui);color:var(--text2);text-wrap:pretty')}>
          {compact ? (
            <>
              {t.cap} <b style={{ fontWeight: 600, color: 'var(--text)' }}>{e.title}</b>
            </>
          ) : (
            <>
              <b style={{ fontWeight: 600, color: 'var(--text)' }}>{mine ? 'You' : e.user.displayName}</b> {t.verb}{' '}
              <b style={{ fontWeight: 600, color: 'var(--text)' }}>{e.title}</b>
            </>
          )}
        </span>
        <span style={st('display:flex;align-items:center;gap:6px;font:500 12px var(--font-ui);color:var(--faint)')}>
          {!compact && (
            <span style={st(`height:18px;padding:0 7px;border-radius:999px;background:${t.bg};color:${t.fg};font:600 10.5px var(--font-ui);display:flex;align-items:center`)}>{tag}</span>
          )}
          {when(e.at)}
        </span>
        {e.review && <ReviewBlock review={e.review} />}
      </span>
      {compact ? (
        <span style={st(`height:20px;padding:0 8px;border-radius:999px;background:${t.bg};color:${t.fg};font:600 10.5px var(--font-ui);display:flex;align-items:center`)}>{tag}</span>
      ) : isAch ? (
        <span style={st('width:40px;height:40px;flex-shrink:0;border-radius:12px;background:var(--surf);display:flex;align-items:center;justify-content:center;font-size:22px')}>{e.emoji}</span>
      ) : (
        <Cover title={e.title} url={e.coverImageUrl} width={34} radius={7} />
      )}
    </div>
  );
}

export function FeedGroups({ entries, me, compact, onOpen }: { entries: FriendActivityEntry[]; me: string | undefined; compact?: boolean; onOpen?: (e: FriendActivityEntry) => void }) {
  return (
    <>
      {groupByDay(entries).map((g) => (
        <div key={g.label} style={st('display:flex;flex-direction:column;gap:2px')}>
          <span style={st('font:600 12px var(--font-mono);letter-spacing:0.06em;color:var(--muted);padding-bottom:4px')}>{g.label}</span>
          {g.items.map((e, i) => (
            <FeedRow key={`${e.at}-${e.title}-${i}`} e={e} me={me} compact={compact} onOpen={() => onOpen?.(e)} />
          ))}
        </div>
      ))}
    </>
  );
}
