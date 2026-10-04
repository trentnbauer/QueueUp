import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import type { Game, RoomMember, SpinPlay, SpinPlayAction } from '@queueup/shared';
import { Avatar, coverBg } from '../../ui/primitives';
import { st } from '../../ui/st';

/** What every spin mode screen gets from SpinDialog. */
export interface ModeProps<P extends SpinPlay = SpinPlay> {
  play: P;
  /** The round's games, by id (the pool the server dealt from). */
  games: Map<string, Game>;
  members: RoomMember[];
  /** The viewer's user id. */
  me: string;
  /** Server-aligned epoch ms, updated every frame. Compare against the play's timestamps. */
  now: number;
  /** Sends a move; resolves false if it failed (the error is already shown to the user). */
  act: (action: SpinPlayAction) => Promise<boolean>;
  mobile: boolean;
  /** True once the result is showing (now >= play.revealAt). */
  settled: boolean;
}

/** The design's winner highlight. */
export const WIN_RING = '0 0 0 2.5px var(--acc), 0 0 28px var(--accA45)';
/** The viewer's own pick (vote, chip, selection). */
export const MINE_RING = '0 0 0 2.5px var(--text)';
export const MINT = 'var(--mint)';
export const DANGER = 'oklch(0.76 0.14 25)';
export const DANGER_BG = 'oklch(0.6 0.19 25)';
export const MONO_KICKER = 'font:600 11px var(--font-mono);letter-spacing:0.08em;text-transform:uppercase';

/** The stage every mode draws in: radius 20, the page background. */
export function Stage({ height = 372, children, style }: { height?: number; children: ReactNode; style?: CSSProperties }) {
  return <div style={st(`position:relative;width:100%;height:${height}px;border-radius:20px;background:var(--bg);overflow:hidden`, style)}>{children}</div>;
}

/** A fixed-size board (the design's 644x372) scaled down to fit its container on narrow screens.
 * Children lay out in board pixels. */
export function ScaledBoard({ width = 644, height = 372, children }: { width?: number; height?: number; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setScale(Math.min(1, el.clientWidth / width));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);
  return (
    <div ref={ref} style={st(`position:relative;width:100%;height:${height * scale}px;border-radius:20px;background:var(--bg);overflow:hidden`)}>
      <div style={{ position: 'absolute', left: '50%', top: 0, width, height, transform: `translateX(-50%) scale(${scale})`, transformOrigin: 'top center' }}>{children}</div>
    </div>
  );
}

/** A game's cover art filling its box, with the title along the bottom. */
export function Cover({ game, title = true, style, children, titleSize = 11 }: { game: Game | undefined; title?: boolean; style?: CSSProperties; children?: ReactNode; titleSize?: number }) {
  const name = game?.title ?? '…';
  return (
    <div style={st(`position:relative;overflow:hidden;border-radius:12px;background:${coverBg(name, game?.coverImageUrl ?? null)}`, style)}>
      {title && (
        <span
          style={st(
            `position:absolute;left:0;right:0;bottom:0;padding:18px 8px 7px;font:700 ${titleSize}px/1.2 var(--font-ui);color:#fff;background:linear-gradient(to bottom, transparent, oklch(0 0 0 / 0.82));display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden`,
          )}
        >
          {name}
        </span>
      )}
      {children}
    </div>
  );
}

/** QueueUp's "qu" mark, for card backs and the wheel hub. */
export function QuMark({ size = 28, style }: { size?: number; style?: CSSProperties }) {
  return (
    <span aria-hidden style={st(`font:800 ${size}px/1 var(--font-display);letter-spacing:-0.06em;color:var(--text)`, style)}>
      q<span style={{ color: 'var(--acc)' }}>u</span>
    </span>
  );
}

/** A card back: stripes with the "qu" mark. */
export function CardBack({ style, accent = false }: { style?: CSSProperties; accent?: boolean }) {
  return (
    <div
      style={st(
        `position:absolute;inset:0;border-radius:inherit;display:flex;align-items:center;justify-content:center;background:repeating-linear-gradient(135deg, var(--surf) 0 10px, var(--surf2) 10px 20px);border:1px solid ${accent ? 'var(--accA45)' : 'var(--chip)'}`,
        style,
      )}
    >
      <QuMark size={30} />
    </div>
  );
}

export function memberOf(members: RoomMember[], userId: string): RoomMember | undefined {
  return members.find((m) => m.user.id === userId);
}

export function nameOf(members: RoomMember[], userId: string, me?: string): string {
  if (me && userId === me) return 'You';
  return memberOf(members, userId)?.user.displayName ?? 'Someone';
}

/** A member's avatar (22px by default), dimmed when inactive, ringed when active. */
export function MemberAvatar({ members, userId, size = 22, active, dim, style }: { members: RoomMember[]; userId: string; size?: number; active?: boolean; dim?: boolean; style?: CSSProperties }) {
  const m = memberOf(members, userId);
  return (
    <Avatar
      name={m?.user.displayName ?? '?'}
      color={m?.user.avatarColor ?? 'var(--chip)'}
      avatarUrl={m?.user.avatarUrl ?? null}
      size={size}
      fontSize={Math.round(size * 0.45)}
      style={{
        border: '2px solid var(--sheet)',
        opacity: dim ? 0.38 : 1,
        boxShadow: active ? '0 0 0 2px var(--acc)' : undefined,
        transition: 'opacity .3s, box-shadow .3s',
        ...style,
      }}
    />
  );
}

/** Overlapping avatars, e.g. voters under a card or chips on a bin. */
export function AvatarStack({ members, userIds, size = 22 }: { members: RoomMember[]; userIds: string[]; size?: number }) {
  return (
    <div style={st('display:flex;align-items:center')}>
      {userIds.map((id, i) => (
        <MemberAvatar key={id} members={members} userId={id} size={size} style={{ marginLeft: i ? -7 : 0 }} />
      ))}
    </div>
  );
}

/** The running footer's member roster: everyone in the round, the active one ringed. */
export function Roster({ members, userIds, active, done }: { members: RoomMember[]; userIds: string[]; active?: string | null; done?: (id: string) => boolean }) {
  return (
    <div style={st('display:flex;gap:6px;justify-content:center;margin-top:6px')}>
      {userIds.map((id) => (
        <MemberAvatar key={id} members={members} userId={id} active={active === id} dim={active ? active !== id : done ? !done(id) : false} />
      ))}
    </div>
  );
}

/** The running footer's mono counter line. */
export function Counter({ children }: { children: ReactNode }) {
  return <span style={st('font:600 12px var(--font-mono);letter-spacing:0.04em;color:var(--accText)')}>{children}</span>;
}

/** The running footer's plain hint line. */
export function Hint({ children }: { children: ReactNode }) {
  return <span style={st('font:500 12.5px/1.4 var(--font-ui);color:var(--faint);text-wrap:pretty')}>{children}</span>;
}

/** A 4px countdown bar: full at `from`, empty at `to`. */
export function TimerBar({ from, to, now }: { from: number; to: number; now: number }) {
  const left = Math.max(0, Math.min(1, (to - now) / Math.max(1, to - from)));
  return (
    <div style={st('width:min(260px,70%);height:4px;border-radius:999px;background:var(--chip);overflow:hidden;margin:6px 0 2px')}>
      <div style={{ width: `${left * 100}%`, height: '100%', background: 'var(--acc)', transition: 'width 0.25s linear' }} />
    </div>
  );
}

/** Seconds left until `to`, at least 0. */
export function secondsLeft(to: number, now: number): number {
  return Math.max(0, Math.ceil((to - now) / 1000));
}

/** Weight as a whole percent of `total`. */
export function pct(weight: number, total: number): string {
  return `${Math.round((weight / (total || 1)) * 100)}%`;
}

/** A mini text pill, e.g. "HELD", "BANNED", "80% grip". */
export function Pill({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <span style={st('display:inline-flex;align-items:center;height:20px;padding:0 7px;border-radius:999px;background:oklch(0 0 0 / 0.6);color:#fff;font:700 10px var(--font-mono);letter-spacing:0.04em', style)}>
      {children}
    </span>
  );
}
