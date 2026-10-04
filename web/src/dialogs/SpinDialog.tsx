import { useEffect, useMemo, useRef, useState } from 'react';
import { useKeepScreenAwake } from '../hooks/useKeepScreenAwake';
import type { Game, RoomSpinSession, SpinPlay, SpinPlayAction } from '@queueup/shared';
import {
  applyNudge,
  buildSpinStrip,
  candidateIndexAt,
  hasUnmetPrerequisite,
  isFullyOwned,
  isUnreleased,
  positionAt,
  settledPositionOf,
  settlesAtOf,
  spinCandidates,
  SPIN_INITIAL_VELOCITY,
  SPIN_WHEEL_THEME_LABELS,
  type SpinBase,
} from '@queueup/shared';
import type { SpinFilters } from '../api/rooms';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '../context/ConfirmContext';
import { useScope } from '../context/ScopeContext';
import { useUi } from '../context/UiContext';
import { useRoomSpin } from '../hooks/useRoomSpin';
import { gamesApi } from '../api/games';
import { fmtMoney, priceLabel } from '../lib/gameView';
import { Dialog, CloseButton } from '../ui/Dialog';
import { coverBg } from '../ui/primitives';
import { useIsMobile } from '../ui/useLayout';
import { st } from '../ui/st';
import { celebratePick } from '../ui/PickCelebration';
import { MODE_EXPLAINER, ModeStage } from './spinModes';
import { nameOf } from './spinModes/shared';

const ACC = 'var(--acc)';

interface Run {
  strip: Game[];
  base: SpinBase;
  settlesAtMs: number;
  settledPosition: number;
}

function localRun(games: Game[], candidates: Game[]): Run {
  const strip = buildSpinStrip(games, candidates);
  const base: SpinBase = { position0: 0, velocity0: SPIN_INITIAL_VELOCITY, timestamp0: Date.now() };
  return { strip, base, settlesAtMs: settlesAtOf(base), settledPosition: settledPositionOf(base) };
}

function sessionRun(spin: RoomSpinSession): Run {
  return {
    strip: spin.strip,
    base: { position0: spin.position0, velocity0: spin.velocity0, timestamp0: new Date(spin.timestamp0).getTime() },
    settlesAtMs: new Date(spin.settlesAt).getTime(),
    settledPosition: spin.settledPosition,
  };
}

function useLiveNow(settlesAtMs: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const t = Date.now();
      setNow(t);
      if (t < settlesAtMs) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [settlesAtMs]);
  return now;
}

/** Server-aligned time, every frame, while `on` (a spin mode is showing). */
function useModeNow(on: boolean, offset: number): number {
  const [now, setNow] = useState(() => Date.now() + offset);
  useEffect(() => {
    if (!on) return;
    let raf = 0;
    const tick = () => {
      setNow(Date.now() + offset);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [on, offset]);
  return now;
}

/** The result's kicker line for a spin mode. */
function modeKicker(play: SpinPlay, members: Parameters<typeof nameOf>[0], me: string): string {
  if (play.kicker) return play.kicker;
  if (play.mode === 'match_three' && play.flips.length) {
    const last = play.flips[play.flips.length - 1];
    return `THREE OF A KIND · ${nameOf(members, last.userId, me).toUpperCase()} FLIPPED THE THIRD`;
  }
  return "TONIGHT'S PICK";
}

/** A result that sat this long before the session ended most likely expired rather than being picked. */
const STALE_GUARD_MS = 12 * 60 * 1000;

const PRICE_OPTS = [0, 10, 20, 40];
const TTB_OPTS = [0, 10, 20, 40];
/** Minimum IGDB score, on the same out-of-10 scale as the ★ on game cards. */
const SCORE_OPTS = [0, 7, 8, 9];
/** Largest install size, in GB (#800). */
const SIZE_OPTS = [0, 10, 30, 60];
const PILL = 'height:32px;padding:0 12px;border-radius:999px;border:none;font:600 12.5px var(--font-ui)';

/** The horizontal reel: tiles laid out around the live `position` (strip slots), wrapping round the
 * circular strip, with the gold marker fixed in the middle. */
function Reel({ strip, position, tw, th, settled, idle }: { strip: Game[]; position: number; tw: number; th: number; settled: boolean; idle: boolean }) {
  const gap = 8;
  const n = strip.length;
  const reelH = th + 24;
  const span = tw + gap;
  const center = Math.floor(position);
  const tiles = [];
  for (let off = -7; off <= 8; off++) {
    const idx = center + off;
    const g = n ? strip[((idx % n) + n) % n] : null;
    if (!g) continue;
    tiles.push({ idx, g, left: (idx - position) * span });
  }
  return (
    <div style={st(`position:relative;width:100%;height:${reelH}px;overflow:hidden;border-radius:20px;background:var(--bg)`)}>
      <div style={{ position: 'absolute', top: 12, left: '50%', width: 0 }}>
        {!idle &&
          tiles.map((t) => (
            <div
              key={t.idx}
              style={{
                position: 'absolute',
                top: 0,
                left: t.left - tw / 2,
                width: tw,
                height: th,
                borderRadius: 12,
                background: coverBg(t.g.title, t.g.coverImageUrl),
                overflow: 'hidden',
              }}
            >
              <span
                style={st('position:absolute;left:0;right:0;bottom:0;padding:16px 8px 7px;font:600 10.5px var(--font-ui);color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;background:linear-gradient(to bottom, transparent, oklch(0 0 0 / 0.8))')}
              >
                {t.g.title}
              </span>
            </div>
          ))}
      </div>
      {idle && (
        <div style={st('position:absolute;inset:0;display:flex;align-items:center;justify-content:center')}>
          <span style={st('font:500 12.5px var(--font-ui);color:var(--faint)')}>Higher votes land more often</span>
        </div>
      )}
      <div
        style={{
          position: 'absolute',
          top: 6,
          bottom: 6,
          left: '50%',
          transform: 'translateX(-50%)',
          width: tw + 10,
          borderRadius: 16,
          border: `2.5px solid ${ACC}`,
          boxShadow: `0 0 0 1000px oklch(0 0 0 / 0.35), 0 0 24px ${settled ? "var(--accA70)" : "var(--accA45)"}`,
          pointerEvents: 'none',
          zIndex: 2,
        }}
      />
    </div>
  );
}

// Games this tab has already tried to price-match, so reopening the spin doesn't search again.
const priceMatchTried = new Set<string>();
const PRICE_MATCHES_PER_SPIN = 5;

/** Quietly looks up a Steam match for a few unpriced games so a room's price limit can judge them
 * next time. Applies only an unambiguous (single) result and never opens the manual picker - the
 * person asked to spin, not to fix matches. Fire-and-forget: the spin doesn't wait on it. */
function matchPricesInBackground(games: Game[], setSteamMatch: (gameId: string, steamAppId: number) => void): void {
  const batch = games.filter((g) => !priceMatchTried.has(g.id)).slice(0, PRICE_MATCHES_PER_SPIN);
  for (const g of batch) {
    priceMatchTried.add(g.id);
    gamesApi
      .steamSearch(g.id, g.title)
      .then(({ results }) => {
        if (results.length === 1) setSteamMatch(g.id, results[0].steamAppId);
      })
      .catch(() => {});
  }
}

/** "What are we playing?" - filters, then the reel. On the shelf it runs locally; in a room it runs
 * the room's shared session (everyone watching sees the same spin, the waiting room, and can nudge
 * it left/right) via the same physics the server uses. */
export function SpinDialog({ onClose }: { onClose: () => void }) {
  const scope = useScope();
  const ui = useUi();
  const mobile = useIsMobile();
  const { isShelf, games, room, members, ops } = scope;
  const roomId = isShelf ? undefined : scope.scopeId;
  const shared = useRoomSpin(roomId);

  const [maxPrice, setMaxPrice] = useState(0);
  // A room's Spin defaults (#801) pick where the filters start.
  const defaults = !isShelf ? room?.spinDefaults : undefined;
  const [maxTtb, setMaxTtb] = useState(defaults?.maxTtb ?? 0);
  const [minScore, setMinScore] = useState(defaults?.minScore ? defaults.minScore / 10 : 0);
  const [everyone, setEveryone] = useState(!!defaults?.everyoneOwns);
  const [maxSize, setMaxSize] = useState(0);
  const [local, setLocal] = useState<Run | null>(null);
  const [nudge, setNudge] = useState<'left' | 'right' | null>(null);
  const [starting, setStarting] = useState(false);
  // Shelf picks marked Won't play this session, kept out of the next spin straight away (#803).
  const [skipped, setSkipped] = useState<Set<string>>(new Set());
  const confirm = useConfirm();

  const gate = !isShelf && room ? room.spinOwnershipMaxPrice : undefined;
  const base = useMemo(() => spinCandidates(games, gate), [games, gate]);
  const candidates = useMemo(
    () =>
      base.filter((g) => {
        if (maxPrice && !(g.youOwn || (g.price.amount !== null && Number(g.price.amount) <= maxPrice))) return false;
        if (maxTtb && !(g.timeToBeatHours !== null && g.timeToBeatHours <= maxTtb)) return false;
        if (minScore && !(g.reviewScore !== null && g.reviewScore >= minScore * 10)) return false;
        if (maxSize && !(g.downloadSizeMb !== null && g.downloadSizeMb <= maxSize * 1024)) return false;
        if (everyone && !isFullyOwned(g)) return false;
        return true;
      }),
    [base, maxPrice, maxTtb, minScore, everyone, maxSize],
  );

  const { user } = useAuth();
  const me = user?.id ?? '';
  const session = shared.spin;
  // Every mode but the reel: the server runs the round (see spinModes.ts in packages/shared).
  const isMode = !!session && session.theme !== 'reel';
  const play = isMode ? session.play : null;
  const modeNow = useModeNow(isMode, shared.clockOffset);
  const run: Run | null = session ? sessionRun(session) : local;
  const reelNow = useLiveNow(run?.settlesAtMs ?? 0);
  const now = isMode ? modeNow : reelNow;
  const settled = isMode ? !!play && play.revealAt !== null && now >= play.revealAt : !!run && now >= run.settlesAtMs;
  const waiting = !!session && !!run && now < run.base.timestamp0;
  const poolById = useMemo(() => new Map((session?.strip ?? []).map((g) => [g.id, g])), [session?.strip]);

  useEffect(() => {
    if (session) void shared.markReady().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id]);

  const position = run ? (settled ? run.settledPosition : positionAt(run.base, now)) : 0;
  const winner = isMode
    ? settled && play?.winnerId
      ? (poolById.get(play.winnerId) ?? null)
      : null
    : run && settled && run.strip.length
      ? run.strip[candidateIndexAt(run.settledPosition, run.strip.length)]
      : null;

  function act(action: SpinPlayAction) {
    shared.act(action).catch((err) => ui.showError(err instanceof Error ? err.message : "Couldn't do that"));
  }

  const filters: SpinFilters = {
    maxPrice: maxPrice || undefined,
    maxTtb: maxTtb || undefined,
    everyoneOwns: everyone || undefined,
    minScore: minScore ? minScore * 10 : undefined,
    maxSizeMb: maxSize ? maxSize * 1024 : undefined,
  };

  // Games whose price the room's limit can't judge yet (no Steam match): try a silent match first.
  const backlog = games.filter((g) => g.status === 'backlog' && !isUnreleased(g) && !hasUnmetPrerequisite(g, games));
  const undecided = gate !== undefined ? backlog.filter((g) => !isFullyOwned(g) && !(g.price.source === 'live' || g.ggDealsUrl !== null) && g.manualPrice === null) : [];

  async function go() {
    if (roomId) {
      setStarting(true);
      // Price-matching games the room's limit can't judge yet used to run here first, one Steam
      // search at a time, before the spin could start - and an ambiguous match stopped it for the
      // manual picker. It now runs alongside instead, quietly, and helps the next spin.
      matchPricesInBackground(undecided, ops.setSteamMatch);
      try {
        await shared.startSpin(filters);
      } catch (err) {
        ui.showError(err instanceof Error ? err.message : 'Could not start a spin.');
      } finally {
        setStarting(false);
      }
      return;
    }
    const pool = candidates.filter((g) => !skipped.has(g.id));
    if (!pool.length) {
      ui.notify('Nothing in the pool. Loosen the filters.');
      return;
    }
    setLocal(localRun(games, pool));
  }

  // Nudging is a Personal Shelf thing: in a room nobody steers the shared wheel on their own - the
  // room votes to respin instead (see voteRespin below).
  function clickReel(e: React.MouseEvent<HTMLDivElement>) {
    if (!run || settled || waiting || session) return;
    const rect = e.currentTarget.getBoundingClientRect();
    nudgeReel(e.clientX - rect.left > rect.width / 2 ? 'right' : 'left');
  }

  /** Slow the reel down ('left') or speed it up ('right'): from a click on either half, or the arrow keys. */
  function nudgeReel(dir: 'left' | 'right') {
    if (!run || settled || waiting || session) return;
    setNudge(dir);
    setTimeout(() => setNudge(null), 300);
    const at = Date.now();
    setLocal((prev) => {
      if (!prev) return prev;
      const nudged = applyNudge(prev.base, at, dir);
      return { ...prev, base: nudged, settlesAtMs: settlesAtOf(nudged), settledPosition: settledPositionOf(nudged) };
    });
  }

  async function voteRespin() {
    try {
      await shared.voteRespin();
    } catch (err) {
      ui.showError(err instanceof Error ? err.message : 'Could not vote to respin.');
    }
  }

  function letsPlay() {
    if (winner) {
      ops.updateStatus(winner.id, 'playing');
      ui.notify(`${winner.title} is now Playing`);
      celebratePick(winner);
    }
    closedByMe.current = true;
    if (session) void shared.closeSpin().catch(() => {});
    onClose();
  }

  // Someone else in the room pressed "Let's play" on the result everyone was looking at: celebrate
  // it here too (#804) and close, rather than dropping back to an empty spin.
  const closedByMe = useRef(false);
  const settledPick = useRef<{ game: Game; since: number } | null>(null);
  useEffect(() => {
    if (session && settled && winner) settledPick.current = settledPick.current?.game.id === winner.id ? settledPick.current : { game: winner, since: Date.now() };
    else if (session) settledPick.current = null;
    else if (settledPick.current && !closedByMe.current) {
      // A session also ends when it goes stale (15 minutes untouched, see roomSpin.ts) - that's
      // nobody agreeing to anything, so only a prompt ending counts as "Let's play".
      if (Date.now() - settledPick.current.since < STALE_GUARD_MS) celebratePick(settledPick.current.game);
      settledPick.current = null;
      onClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session, settled, winner?.id]);

  /** #803: drop the Personal Shelf's pick to Won't play and spin again without it. */
  async function wontPlay() {
    if (!winner) return;
    const ok = await confirm({
      title: `Won't play ${winner.title}?`,
      message: "It moves to your Won't play list and won't come up in a spin again. Then the wheel spins again.",
      confirmLabel: "Won't play",
    });
    if (!ok) return;
    ops.updateStatus(winner.id, 'wont_play');
    const rest = candidates.filter((g) => g.id !== winner.id && !skipped.has(g.id));
    setSkipped((prev) => new Set(prev).add(winner.id));
    if (!rest.length) {
      setLocal(null);
      ui.notify('Nothing left in the pool. Loosen the filters.');
      return;
    }
    setLocal(localRun(games, rest));
  }

  const idle = !run;
  const spinning = !!run && !settled && !waiting;
  const nudgeable = spinning && !session;
  const reelSpinning = spinning && !isMode;
  // Stop the screen dimming mid-spin; released as soon as the wheel settles.
  useKeepScreenAwake(spinning);
  const tw = mobile ? 84 : 104;
  const th = mobile ? 126 : 156;

  const noPrice = gate === undefined ? 0 : backlog.filter((g) => !isFullyOwned(g) && g.price.amount === null && g.manualPrice === null).length;
  const waitN = games.filter((g) => ['backlog', 'replay'].includes(g.status) && hasUnmetPrerequisite(g, games)).length;
  const gateNote = [
    gate !== undefined && gate > 0 ? `Room limit: everyone owns it, or ${fmtMoney(gate, backlog.find((g) => g.price.currency)?.price.currency ?? 'USD')} or less` : gate === 0 ? 'Room limit: only games everyone owns' : null,
    noPrice ? `${noPrice} skipped, no price yet` : null,
    waitN ? `${waitN} waiting on Play after` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const countdown = waiting && run ? Math.max(1, Math.ceil((run.base.timestamp0 - now) / 1000)) : 0;
  const resPrice = winner ? priceLabel(winner).label : '';

  return (
    <>
      <Dialog onClose={onClose} bare padded={false} width={680} ariaLabel="Spin the Wheel">
        <div
          style={st(
            `padding:18px;display:flex;flex-direction:column;overflow-y:auto;${nudge ? `animation:qu-fade .3s ease both;` : ''}`,
          )}
        >
          <div style={st('display:flex;align-items:center;justify-content:space-between;margin-bottom:12px')}>
            <span style={st('font:700 22px var(--font-display);letter-spacing:-0.02em')}>What are we playing?</span>
            <CloseButton onClick={onClose} />
          </div>

          {!session && (
            <>
              <div style={st('display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-bottom:8px')}>
                {PRICE_OPTS.map((p) => (
                  <button key={p} type="button" onClick={() => setMaxPrice(p)} style={st(`${PILL};background:${maxPrice === p ? 'var(--text)' : 'var(--chip)'};color:${maxPrice === p ? 'var(--onText)' : 'var(--muted)'}`)}>
                    {p ? `Under ${fmtMoney(p, 'USD').replace(/\.00$/, '')}` : 'Any price'}
                  </button>
                ))}
                {!isShelf && (
                  <button type="button" onClick={() => setEveryone((v) => !v)} style={st(`${PILL};background:${everyone ? 'var(--text)' : 'var(--chip)'};color:${everyone ? 'var(--onText)' : 'var(--muted)'}`)}>
                    Everyone owns it
                  </button>
                )}
              </div>
              <div style={st('display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-bottom:8px')}>
                {TTB_OPTS.map((h) => (
                  <button key={h} type="button" onClick={() => setMaxTtb(h)} style={st(`${PILL};background:${maxTtb === h ? 'var(--text)' : 'var(--chip)'};color:${maxTtb === h ? 'var(--onText)' : 'var(--muted)'}`)}>
                    {h ? `Under ${h}h` : 'Any length'}
                  </button>
                ))}
              </div>
              <div style={st('display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-bottom:8px')}>
                {SCORE_OPTS.map((n) => (
                  <button key={n} type="button" onClick={() => setMinScore(n)} style={st(`${PILL};background:${minScore === n ? 'var(--text)' : 'var(--chip)'};color:${minScore === n ? 'var(--onText)' : 'var(--muted)'}`)}>
                    {n ? `★ ${n}+` : 'Any score'}
                  </button>
                ))}
              </div>
              <div style={st('display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-bottom:8px')}>
                {SIZE_OPTS.map((n) => (
                  <button key={n} type="button" onClick={() => setMaxSize(n)} title={n ? 'PC install size from Steam; games with no size listed are left out' : undefined} style={st(`${PILL};background:${maxSize === n ? 'var(--text)' : 'var(--chip)'};color:${maxSize === n ? 'var(--onText)' : 'var(--muted)'}`)}>
                    {n ? `Under ${n} GB` : 'Any size'}
                  </button>
                ))}
              </div>
            </>
          )}
          {gateNote && (
            <div style={st('margin-bottom:8px;padding:9px 12px;border-radius:12px;background:var(--surf);font:500 12.5px/1.4 var(--font-ui);color:var(--text2);text-wrap:pretty')}>{gateNote}</div>
          )}
          <div style={st('display:flex;justify-content:space-between;gap:10px;margin-bottom:14px;font:500 12px var(--font-ui);color:var(--faint)')}>
            <span style={{ textWrap: 'pretty' }}>{isMode && session.theme !== 'reel' ? MODE_EXPLAINER[session.theme] : 'Votes and review scores weight the pick'}</span>
            <span style={st('flex-shrink:0;font-family:var(--font-mono);text-transform:uppercase')}>
              {isMode ? SPIN_WHEEL_THEME_LABELS[session.theme] : session ? `${session.strip.length} slots` : `${candidates.length} in the pool`}
            </span>
          </div>

          {waiting && session ? (
            <div style={st('display:flex;flex-direction:column;align-items:center;gap:10px;padding:26px 12px;border-radius:20px;background:var(--bg);text-align:center')}>
              <span style={st('font:600 15px var(--font-ui)')}>⏳ Waiting for members to be ready…</span>
              <span style={st('font:500 13px var(--font-ui);color:var(--muted)')}>
                {session.readyCount} of {members.length} member{members.length === 1 ? '' : 's'} ready · Starting in {countdown}s
              </span>
              <button type="button" onClick={() => void shared.skipWaitSpin().catch(() => {})} style={st('height:40px;padding:0 20px;border-radius:999px;border:none;background:var(--text);color:var(--onText);font:700 13.5px var(--font-ui)')}>
                Start now
              </button>
            </div>
          ) : isMode ? (
            play ? (
              <ModeStage play={play} games={poolById} members={members} me={me} now={now} act={act} mobile={mobile} settled={settled} />
            ) : (
              <div style={st('display:flex;align-items:center;justify-content:center;height:372px;border-radius:20px;background:var(--bg);font:500 13px var(--font-ui);color:var(--muted)')}>Dealing…</div>
            )
          ) : (
            <div
              onClick={clickReel}
              onKeyDown={(e) => {
                if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
                  e.preventDefault();
                  nudgeReel(e.key === 'ArrowLeft' ? 'left' : 'right');
                }
              }}
              tabIndex={nudgeable ? 0 : undefined}
              role={nudgeable ? 'group' : undefined}
              aria-label={nudgeable ? 'Spinning reel. Press the left arrow to slow it down and the right arrow to speed it up.' : undefined}
              style={{ cursor: nudgeable ? 'pointer' : 'default' }}
              title={nudgeable ? 'Click the left side to slow it down, the right side to speed it up' : undefined}
            >
              <Reel strip={run?.strip ?? []} position={position} tw={tw} th={th} settled={settled} idle={idle} />
            </div>
          )}

          {/* A running spin mode draws its own footer under its stage; this one is for idle, the reel and results. */}
          {!(isMode && play && !settled) && (
          <div style={st('min-height:112px;margin-top:16px;text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px')} aria-live="polite">
            {idle && (
              <button
                type="button"
                onClick={go}
                disabled={starting || (!roomId && !candidates.length)}
                style={st(`height:50px;padding:0 40px;border-radius:999px;border:none;background:${ACC};color:var(--ink);font:800 16px var(--font-display);box-shadow:0 8px 24px var(--accA35);opacity:${starting ? 0.6 : 1}`)}
              >
                {starting ? 'Checking prices…' : 'Spin'}
              </button>
            )}
            {reelSpinning && <span style={st('font:500 14px var(--font-ui);color:var(--muted)')}>{session ? 'Rolling…' : 'Rolling… click left to slow it, right to speed it up'}</span>}
            {settled && winner && (
              <>
                <span style={st('font:500 12px var(--font-mono);color:var(--accText)')}>{play ? modeKicker(play, members, me) : "TONIGHT'S PICK"}</span>
                <span style={st('font:700 28px/1.05 var(--font-display);letter-spacing:-0.02em')}>{winner.title}</span>
                <span style={st('font:400 13.5px var(--font-ui);color:var(--muted)')}>
                  {[winner.genre?.split(',')[0], winner.timeToBeatHours ? `~${winner.timeToBeatHours}h` : '', resPrice].filter(Boolean).join(' · ')}
                </span>
                <div style={st('display:flex;gap:8px;margin-top:12px')}>
                  {session ? (
                    <button
                      type="button"
                      onClick={() => void voteRespin()}
                      disabled={session.youVotedRespin || shared.votingRespin}
                      title={session.youVotedRespin ? 'Waiting for the rest of the room' : 'Respins once most of the room votes'}
                      style={st(`height:42px;padding:0 18px;border-radius:999px;border:1px solid var(--line);background:transparent;color:var(--text);font:600 13.5px var(--font-ui);opacity:${session.youVotedRespin ? 0.6 : 1}`)}
                    >
                      {session.youVotedRespin ? 'Voted to respin' : 'Vote to respin'} ({session.respinVotes}/{session.respinNeeded})
                    </button>
                  ) : (
                    <>
                      <button type="button" onClick={() => void wontPlay()} style={st('height:42px;padding:0 18px;border-radius:999px;border:1px solid var(--line);background:transparent;color:var(--muted);font:600 13.5px var(--font-ui)')}>
                        Won't play
                      </button>
                      <button type="button" onClick={() => go()} style={st('height:42px;padding:0 18px;border-radius:999px;border:1px solid var(--line);background:transparent;color:var(--text);font:600 13.5px var(--font-ui)')}>
                        Spin again
                      </button>
                    </>
                  )}
                  <button type="button" onClick={letsPlay} style={st('height:42px;padding:0 18px;border-radius:999px;border:none;background:var(--text);color:var(--onText);font:700 13.5px var(--font-ui)')}>
                    Let's play
                  </button>
                </div>
              </>
            )}
          </div>
          )}
        </div>
      </Dialog>
    </>
  );
}
