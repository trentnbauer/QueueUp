import { useEffect, useMemo, useRef, useState } from 'react';
import { useKeepScreenAwake } from '../hooks/useKeepScreenAwake';
import type { Game, RoomMember, RoomSpinSession, SpinPlay, SpinPlayAction, StoredPlay } from '@queueup/shared';
import {
  advancePlay,
  applyNudge,
  applyPlayAction,
  avoidedGenres,
  buildSpinStrip,
  candidateIndexAt,
  hasUnmetPrerequisite,
  isFullyOwned,
  isPlayMode,
  isUnreleased,
  pendingPlay,
  positionAt,
  publicPlay,
  resolveConcreteTheme,
  settledPositionOf,
  settlesAtOf,
  spinCandidates,
  spinCandidateWeight,
  SPIN_INITIAL_VELOCITY,
  type SpinBase,
} from '@queueup/shared';
import type { SpinFilters } from '../api/rooms';
import { useAuth } from '../context/AuthContext';
import { useConfirm } from '../context/ConfirmContext';
import { useScope } from '../context/ScopeContext';
import { useUi } from '../context/UiContext';
import { useRoomSpin } from '../hooks/useRoomSpin';
import { useShelfSpinTheme } from '../home/shelfSpinTheme';
import { gamesApi } from '../api/games';
import { fmtMoney, priceLabel } from '../lib/gameView';
import { Dialog, CloseButton } from '../ui/Dialog';
import { coverBg } from '../ui/primitives';
import { useIsMobile } from '../ui/useLayout';
import { st } from '../ui/st';
import { celebratePick } from '../ui/PickCelebration';
import { MODE_EXPLAINER, ModeStage } from './spinModes';
import { nameOf } from './spinModes/shared';
import { t, useT, type MessageKey } from '../i18n';
import { spinThemeLabel } from '../i18n/labels';

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

/** The shared engine's kicker lines (spinModes.ts), translated. */
const KNOWN_KICKERS: Record<string, MessageKey> = {
  'THREE OF A KIND, FIRST PULL': 'spin.kicker.slotFirstPull',
  'THREE OF A KIND': 'spin.kicker.slotThree',
  'OUT OF RESPINS · THE PAIR WINS': 'spin.kicker.slotPair',
  'OUT OF RESPINS · BEST ON THE LINE': 'spin.kicker.slotBest',
  'THREE MISSES · THE MACHINE TOOK PITY': 'spin.kicker.clawPity',
  'NO VOTES · WEIGHTED DRAW PICKED IT': 'spin.kicker.noVotes',
  'TIED · WEIGHTED DRAW BROKE IT': 'spin.kicker.tied',
  'AN UPSET, NO CHIPS': 'spin.kicker.upset',
};

/** A kicker from the shared engine in the current language; anything unknown shows as sent. */
function translateKicker(kicker: string): string {
  const known = KNOWN_KICKERS[kicker];
  if (known) return t(known);
  const chips = /^TONIGHT'S PICK · (\d+) CHIPS? ON IT$/.exec(kicker);
  if (chips) {
    const n = Number(chips[1]);
    return t(n === 1 ? 'spin.kicker.chips.one' : 'spin.kicker.chips.other', { n });
  }
  return kicker;
}

/** The result's kicker line for a spin mode. */
function modeKicker(play: SpinPlay, members: Parameters<typeof nameOf>[0], me: string): string {
  if (play.kicker) return translateKicker(play.kicker);
  if (play.mode === 'match_three' && play.flips.length) {
    const last = play.flips[play.flips.length - 1];
    return t('spin.kicker.matchThree', { name: nameOf(members, last.userId, me).toUpperCase() });
  }
  return t('spin.kicker.tonightsPick');
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
  const t = useT();
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
          <span style={st('font:500 12.5px var(--font-ui);color:var(--faint)')}>{t('spin.reel.idle')}</span>
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
  const t = useT();
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
  // A Personal Shelf spin mode, run right here with the same engine the server runs for rooms.
  const [shelfTheme] = useShelfSpinTheme();
  const [localPlay, setLocalPlayState] = useState<{ stored: StoredPlay; startAt: number } | null>(null);
  const localPlayRef = useRef(localPlay);
  const setLocalPlay = (next: { stored: StoredPlay; startAt: number } | null) => {
    localPlayRef.current = next;
    setLocalPlayState(next);
  };
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
  // Every mode but the reel: the server runs a room's round (see spinModes.ts in packages/shared);
  // the shelf runs its own locally.
  const isMode = (!!session && session.theme !== 'reel') || (!session && !!localPlay);
  const modeTheme = session ? session.theme : localPlay?.stored.mode;
  const localDealt = localPlay && !('pending' in localPlay.stored) ? localPlay.stored : null;
  const localPublic = useMemo(() => (localDealt ? publicPlay(localDealt) : null), [localDealt]);
  const play = !isMode ? null : session ? session.play : localPublic;
  const offset = session ? shared.clockOffset : 0;
  // The clock only needs to tick until the result has shown (plus a beat for its last animation).
  const revealed = !!play && play.revealAt !== null && Date.now() + offset >= play.revealAt + 1500;
  const modeNow = useModeNow(isMode && !revealed, offset);
  const run: Run | null = session ? sessionRun(session) : local;
  const reelNow = useLiveNow(run?.settlesAtMs ?? 0);
  const now = isMode ? modeNow : reelNow;
  const settled = isMode ? !!play && play.revealAt !== null && now >= play.revealAt : !!run && now >= run.settlesAtMs;
  const waiting = !!session && !!run && now < run.base.timestamp0;
  const poolById = useMemo(() => new Map((session ? session.strip : games).map((g) => [g.id, g])), [session, games]);
  // A shelf round has just you in it.
  const modeMembers = useMemo<RoomMember[]>(
    () => (session || !user ? members : [{ roomId: '', user, role: 'room_master', joinedAt: '' }]),
    [session, user, members],
  );

  // Runs a shelf round's timers forward (deals, closes votes, plays out the claw...).
  const localRunning = !!localPlay && !play?.winnerId;
  useEffect(() => {
    if (!localRunning) return;
    const id = setInterval(() => {
      const cur = localPlayRef.current;
      if (!cur) return;
      const next = advancePlay(cur.stored, Date.now(), cur.startAt, [me], Math.random);
      if (next !== cur.stored) setLocalPlay({ ...cur, stored: next });
    }, 100);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [localRunning, me]);

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

  function act(action: SpinPlayAction): Promise<boolean> {
    const cur = localPlayRef.current;
    if (!session && cur) {
      if ('pending' in cur.stored) return Promise.resolve(false);
      try {
        setLocalPlay({ ...cur, stored: applyPlayAction(cur.stored, me, action, Date.now(), Math.random) });
        return Promise.resolve(true);
      } catch (err) {
        ui.showError(err instanceof Error ? err.message : t('spin.error.action'));
        return Promise.resolve(false);
      }
    }
    return shared.act(action).then(
      () => true,
      (err) => {
        ui.showError(err instanceof Error ? err.message : t('spin.error.action'));
        return false;
      },
    );
  }

  const filters: SpinFilters = {
    maxPrice: maxPrice || undefined,
    maxTtb: maxTtb || undefined,
    everyoneOwns: everyone || undefined,
    minScore: minScore ? minScore * 10 : undefined,
    maxSizeMb: maxSize ? maxSize * 1024 : undefined,
  };

  // Games whose price the room's limit can't judge yet (no Steam match): try a silent match first.
  // Memoized: the dialog re-renders every animation frame while a spin runs.
  // The same statuses the spin pool draws from (backlogGames in spinPicker.ts).
  const backlog = useMemo(
    () => games.filter((g) => (g.status === 'backlog' || g.status === 'replay' || g.status === 'play_next') && !isUnreleased(g) && !hasUnmetPrerequisite(g, games)),
    [games],
  );
  const undecided = useMemo(
    () => (gate !== undefined ? backlog.filter((g) => !isFullyOwned(g) && !(g.price.source === 'live' || g.ggDealsUrl !== null) && g.manualPrice === null) : []),
    [backlog, gate],
  );

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
        ui.showError(err instanceof Error ? err.message : t('spin.error.start'));
      } finally {
        setStarting(false);
      }
      return;
    }
    const pool = candidates.filter((g) => !skipped.has(g.id));
    if (!pool.length) {
      ui.notify(t('spin.notify.emptyPool'));
      return;
    }
    startLocal(pool);
  }

  /** A shelf spin: the reel, or the Spin type picked in Shelf settings. */
  function startLocal(pool: Game[]) {
    const theme = resolveConcreteTheme(shelfTheme);
    if (isPlayMode(theme)) {
      const avoided = avoidedGenres(games);
      const pending = pendingPlay(theme, pool.map((g) => ({ gameId: g.id, weight: spinCandidateWeight(g, avoided) })), Math.random);
      const startAt = Date.now();
      setLocal(null);
      setLocalPlay({ stored: advancePlay(pending, startAt, startAt, [me], Math.random), startAt });
      return;
    }
    setLocalPlay(null);
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
      ui.showError(err instanceof Error ? err.message : t('spin.error.respin'));
    }
  }

  function letsPlay() {
    if (winner) {
      ops.updateStatus(winner.id, 'playing');
      ui.notify(t('spin.notify.nowPlaying', { title: winner.title }));
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
      title: t('spin.wontPlay.title', { title: winner.title }),
      message: t('spin.wontPlay.message'),
      confirmLabel: t('spin.wontPlay.confirm'),
    });
    if (!ok) return;
    ops.updateStatus(winner.id, 'wont_play');
    const rest = candidates.filter((g) => g.id !== winner.id && !skipped.has(g.id));
    setSkipped((prev) => new Set(prev).add(winner.id));
    if (!rest.length) {
      setLocal(null);
      setLocalPlay(null);
      ui.notify(t('spin.notify.emptyPoolLeft'));
      return;
    }
    startLocal(rest);
  }

  const idle = !run && !play;
  const spinning = (!!run || !!play) && !settled && !waiting;
  const nudgeable = spinning && !session;
  const reelSpinning = spinning && !isMode;
  // Stop the screen dimming mid-spin; released as soon as the wheel settles.
  useKeepScreenAwake(spinning);
  const tw = mobile ? 84 : 104;
  const th = mobile ? 126 : 156;

  const noPrice = useMemo(() => (gate === undefined ? 0 : backlog.filter((g) => !isFullyOwned(g) && g.price.amount === null && g.manualPrice === null).length), [backlog, gate]);
  const waitN = useMemo(() => games.filter((g) => ['backlog', 'replay'].includes(g.status) && hasUnmetPrerequisite(g, games)).length, [games]);
  const gateNote = [
    gate !== undefined && gate > 0
      ? t('spin.gate.limit', { price: fmtMoney(gate, backlog.find((g) => g.price.currency)?.price.currency ?? 'USD') })
      : gate === 0
        ? t('spin.gate.ownedOnly')
        : null,
    noPrice ? t('spin.gate.noPrice', { n: noPrice }) : null,
    waitN ? t('spin.gate.waiting', { n: waitN }) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const countdown = waiting && run ? Math.max(1, Math.ceil((run.base.timestamp0 - now) / 1000)) : 0;
  const resPrice = winner ? priceLabel(winner).label : '';

  return (
    <>
      <Dialog onClose={onClose} bare padded={false} width={680} ariaLabel={t('spin.dialog.ariaLabel')}>
        <div
          style={st(
            `padding:18px;display:flex;flex-direction:column;overflow-y:auto;${nudge ? `animation:qu-fade .3s ease both;` : ''}`,
          )}
        >
          <div style={st('display:flex;align-items:center;justify-content:space-between;margin-bottom:12px')}>
            <span style={st('font:700 22px var(--font-display);letter-spacing:-0.02em')}>{t('spin.dialog.title')}</span>
            <CloseButton onClick={onClose} />
          </div>

          {!session && (
            <>
              <div style={st('display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-bottom:8px')}>
                {PRICE_OPTS.map((p) => (
                  <button key={p} type="button" onClick={() => setMaxPrice(p)} style={st(`${PILL};background:${maxPrice === p ? 'var(--text)' : 'var(--chip)'};color:${maxPrice === p ? 'var(--onText)' : 'var(--muted)'}`)}>
                    {p ? t('spin.filter.underPrice', { price: fmtMoney(p, 'USD').replace(/\.00$/, '') }) : t('spin.filter.anyPrice')}
                  </button>
                ))}
                {!isShelf && (
                  <button type="button" onClick={() => setEveryone((v) => !v)} style={st(`${PILL};background:${everyone ? 'var(--text)' : 'var(--chip)'};color:${everyone ? 'var(--onText)' : 'var(--muted)'}`)}>
                    {t('spin.filter.everyoneOwns')}
                  </button>
                )}
              </div>
              <div style={st('display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-bottom:8px')}>
                {TTB_OPTS.map((h) => (
                  <button key={h} type="button" onClick={() => setMaxTtb(h)} style={st(`${PILL};background:${maxTtb === h ? 'var(--text)' : 'var(--chip)'};color:${maxTtb === h ? 'var(--onText)' : 'var(--muted)'}`)}>
                    {h ? t('spin.filter.underHours', { n: h }) : t('spin.filter.anyLength')}
                  </button>
                ))}
              </div>
              <div style={st('display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-bottom:8px')}>
                {SCORE_OPTS.map((n) => (
                  <button key={n} type="button" onClick={() => setMinScore(n)} style={st(`${PILL};background:${minScore === n ? 'var(--text)' : 'var(--chip)'};color:${minScore === n ? 'var(--onText)' : 'var(--muted)'}`)}>
                    {n ? `★ ${n}+` : t('spin.filter.anyScore')}
                  </button>
                ))}
              </div>
              <div style={st('display:flex;flex-wrap:wrap;align-items:center;gap:6px;margin-bottom:8px')}>
                {SIZE_OPTS.map((n) => (
                  <button key={n} type="button" onClick={() => setMaxSize(n)} title={n ? t('spin.filter.sizeHint') : undefined} style={st(`${PILL};background:${maxSize === n ? 'var(--text)' : 'var(--chip)'};color:${maxSize === n ? 'var(--onText)' : 'var(--muted)'}`)}>
                    {n ? t('spin.filter.underSize', { n }) : t('spin.filter.anySize')}
                  </button>
                ))}
              </div>
            </>
          )}
          {gateNote && (
            <div style={st('margin-bottom:8px;padding:9px 12px;border-radius:12px;background:var(--surf);font:500 12.5px/1.4 var(--font-ui);color:var(--text2);text-wrap:pretty')}>{gateNote}</div>
          )}
          <div style={st('display:flex;justify-content:space-between;gap:10px;margin-bottom:14px;font:500 12px var(--font-ui);color:var(--faint)')}>
            <span style={{ textWrap: 'pretty' }}>{isMode && modeTheme && modeTheme !== 'reel' ? MODE_EXPLAINER[modeTheme] : t('spin.dialog.weightHint')}</span>
            <span style={st('flex-shrink:0;font-family:var(--font-mono);text-transform:uppercase')}>
              {isMode && modeTheme ? spinThemeLabel(modeTheme) : session ? t('spin.dialog.slots', { n: session.strip.length }) : t('spin.dialog.inPool', { n: candidates.length })}
            </span>
          </div>

          {waiting && session ? (
            <div style={st('display:flex;flex-direction:column;align-items:center;gap:10px;padding:26px 12px;border-radius:20px;background:var(--bg);text-align:center')}>
              <span style={st('font:600 15px var(--font-ui)')}>{t('spin.waiting.title')}</span>
              <span style={st('font:500 13px var(--font-ui);color:var(--muted)')}>
                {t(members.length === 1 ? 'spin.waiting.status.one' : 'spin.waiting.status.other', { ready: session.readyCount, total: members.length, n: countdown })}
              </span>
              <button type="button" onClick={() => void shared.skipWaitSpin().catch(() => {})} style={st('height:40px;padding:0 20px;border-radius:999px;border:none;background:var(--text);color:var(--onText);font:700 13.5px var(--font-ui)')}>
                {t('spin.waiting.startNow')}
              </button>
            </div>
          ) : isMode ? (
            play ? (
              <ModeStage play={play} games={poolById} members={modeMembers} me={me} now={now} act={act} mobile={mobile} settled={settled} />
            ) : (
              <div style={st('display:flex;align-items:center;justify-content:center;height:372px;border-radius:20px;background:var(--bg);font:500 13px var(--font-ui);color:var(--muted)')}>{t('spin.dialog.dealing')}</div>
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
              aria-label={nudgeable ? t('spin.reel.ariaLabel') : undefined}
              style={{ cursor: nudgeable ? 'pointer' : 'default' }}
              title={nudgeable ? t('spin.reel.title') : undefined}
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
                {starting ? t('spin.dialog.checkingPrices') : t('spin.dialog.spin')}
              </button>
            )}
            {reelSpinning && <span style={st('font:500 14px var(--font-ui);color:var(--muted)')}>{session ? t('spin.reel.rolling') : t('spin.reel.rollingNudge')}</span>}
            {settled && winner && (
              <>
                <span style={st('font:500 12px var(--font-mono);color:var(--accText)')}>{play ? modeKicker(play, modeMembers, me) : t('spin.kicker.tonightsPick')}</span>
                <span style={st('font:700 28px/1.05 var(--font-display);letter-spacing:-0.02em')}>{winner.title}</span>
                <span style={st('font:400 13.5px var(--font-ui);color:var(--muted)')}>
                  {[winner.genre?.split(',')[0], winner.timeToBeatHours ? t('spin.result.hours', { n: winner.timeToBeatHours }) : '', resPrice].filter(Boolean).join(' · ')}
                </span>
                <div style={st('display:flex;gap:8px;margin-top:12px')}>
                  {session ? (
                    <button
                      type="button"
                      onClick={() => void voteRespin()}
                      disabled={session.youVotedRespin || shared.votingRespin}
                      title={session.youVotedRespin ? t('spin.result.respinWaiting') : t('spin.result.respinHint')}
                      style={st(`height:42px;padding:0 16px;white-space:nowrap;border-radius:999px;border:1px solid var(--line);background:transparent;color:var(--text);font:600 13.5px var(--font-ui);opacity:${session.youVotedRespin ? 0.6 : 1}`)}
                    >
                      {t(session.youVotedRespin ? 'spin.result.votedRespin' : 'spin.result.voteRespin', { votes: session.respinVotes, needed: session.respinNeeded })}
                    </button>
                  ) : (
                    <>
                      <button type="button" onClick={() => void wontPlay()} style={st('height:42px;padding:0 16px;white-space:nowrap;border-radius:999px;border:1px solid var(--line);background:transparent;color:var(--muted);font:600 13.5px var(--font-ui)')}>
                        {t('spin.result.wontPlay')}
                      </button>
                      <button type="button" onClick={() => go()} style={st('height:42px;padding:0 16px;white-space:nowrap;border-radius:999px;border:1px solid var(--line);background:transparent;color:var(--text);font:600 13.5px var(--font-ui)')}>
                        {t('spin.result.spinAgain')}
                      </button>
                    </>
                  )}
                  <button type="button" onClick={letsPlay} style={st('height:42px;padding:0 16px;white-space:nowrap;border-radius:999px;border:none;background:var(--text);color:var(--onText);font:700 13.5px var(--font-ui)')}>
                    {t('spin.result.letsPlay')}
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
