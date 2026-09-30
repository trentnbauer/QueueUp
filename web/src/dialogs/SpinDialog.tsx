import { useEffect, useMemo, useState } from 'react';
import type { Game, RoomSpinSession } from '@queueup/shared';
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
  type SpinBase,
} from '@queueup/shared';
import type { SpinFilters } from '../api/rooms';
import { useScope } from '../context/ScopeContext';
import { useUi } from '../context/UiContext';
import { useRoomSpin } from '../hooks/useRoomSpin';
import { useSteamAutoMatch } from '../hooks/useSteamAutoMatch';
import { SteamMatchSheet } from '../game/SteamMatchSheet';
import { fmtMoney, priceLabel } from '../lib/gameView';
import { Dialog, CloseButton } from '../ui/Dialog';
import { coverBg } from '../ui/primitives';
import { useIsMobile } from '../ui/useLayout';
import { st } from '../ui/st';
import { ConfettiBurst } from '../components/ConfettiBurst';

const ACC = 'oklch(0.74 0.15 45)';

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

const PRICE_OPTS = [0, 10, 20, 40];
const TTB_OPTS = [0, 10, 20, 40];
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
          boxShadow: `0 0 0 1000px oklch(0 0 0 / 0.35), 0 0 24px oklch(0.74 0.15 45 / ${settled ? 0.7 : 0.45})`,
          pointerEvents: 'none',
          zIndex: 2,
        }}
      />
    </div>
  );
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
  const steam = useSteamAutoMatch();

  const [maxPrice, setMaxPrice] = useState(0);
  const [maxTtb, setMaxTtb] = useState(0);
  const [everyone, setEveryone] = useState(false);
  const [local, setLocal] = useState<Run | null>(null);
  const [nudge, setNudge] = useState<'left' | 'right' | null>(null);
  const [starting, setStarting] = useState(false);

  const gate = !isShelf && room ? room.spinOwnershipMaxPrice : undefined;
  const base = useMemo(() => spinCandidates(games, gate), [games, gate]);
  const candidates = useMemo(
    () =>
      base.filter((g) => {
        if (maxPrice && !(g.youOwn || (g.price.amount !== null && Number(g.price.amount) <= maxPrice))) return false;
        if (maxTtb && !(g.timeToBeatHours !== null && g.timeToBeatHours <= maxTtb)) return false;
        if (everyone && !isFullyOwned(g)) return false;
        return true;
      }),
    [base, maxPrice, maxTtb, everyone],
  );

  const session = shared.spin;
  const run: Run | null = session ? sessionRun(session) : local;
  const now = useLiveNow(run?.settlesAtMs ?? 0);
  const settled = !!run && now >= run.settlesAtMs;
  const waiting = !!session && !!run && now < run.base.timestamp0;

  useEffect(() => {
    if (session) void shared.markReady().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.id]);

  const position = run ? (settled ? run.settledPosition : positionAt(run.base, now)) : 0;
  const winner = run && settled && run.strip.length ? run.strip[candidateIndexAt(run.settledPosition, run.strip.length)] : null;

  const filters: SpinFilters = { maxPrice: maxPrice || undefined, maxTtb: maxTtb || undefined, everyoneOwns: everyone || undefined };

  // Games whose price the room's limit can't judge yet (no Steam match): try a silent match first.
  const backlog = games.filter((g) => g.status === 'backlog' && !isUnreleased(g) && !hasUnmetPrerequisite(g, games));
  const undecided = gate !== undefined ? backlog.filter((g) => !isFullyOwned(g) && !(g.price.source === 'live' || g.ggDealsUrl !== null) && g.manualPrice === null) : [];
  const [checked, setChecked] = useState<Set<string>>(new Set());

  async function go() {
    if (roomId) {
      setStarting(true);
      try {
        for (const g of undecided) {
          if (checked.has(g.id)) continue;
          setChecked((prev) => new Set(prev).add(g.id));
          let resolved: number | null | undefined;
          // eslint-disable-next-line no-await-in-loop
          await steam.attemptAutoMatch(g.id, g.title, (id) => {
            resolved = id;
            ops.setSteamMatch(g.id, id);
          });
          if (resolved === undefined) return; // the manual picker took over
        }
        await (session ? shared.restartSpin(filters) : shared.startSpin(filters));
      } catch (err) {
        ui.showError(err instanceof Error ? err.message : 'Could not start a spin.');
      } finally {
        setStarting(false);
      }
      return;
    }
    if (!candidates.length) {
      ui.notify('Nothing in the pool. Loosen the filters.');
      return;
    }
    setLocal(localRun(games, candidates));
  }

  function clickReel(e: React.MouseEvent<HTMLDivElement>) {
    if (!run || settled || waiting) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const dir = e.clientX - rect.left > rect.width / 2 ? 'right' : 'left';
    setNudge(dir);
    setTimeout(() => setNudge(null), 300);
    if (session) void shared.nudgeSpin(dir).catch(() => {});
    else setLocal((prev) => (prev ? { ...prev, base: applyNudge(prev.base, Date.now(), dir), settlesAtMs: settlesAtOf(applyNudge(prev.base, Date.now(), dir)), settledPosition: settledPositionOf(applyNudge(prev.base, Date.now(), dir)) } : prev));
  }

  function play() {
    if (winner) {
      ops.updateStatus(winner.id, 'playing');
      ui.notify(`${winner.title} is now Playing`);
    }
    if (session) void shared.closeSpin().catch(() => {});
    onClose();
  }

  const idle = !run;
  const spinning = !!run && !settled && !waiting;
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

  const pickerGame = steam.pickerGameId ? games.find((g) => g.id === steam.pickerGameId) : undefined;
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
            </>
          )}
          {gateNote && (
            <div style={st('margin-bottom:8px;padding:9px 12px;border-radius:12px;background:var(--surf);font:500 12.5px/1.4 var(--font-ui);color:var(--text2);text-wrap:pretty')}>{gateNote}</div>
          )}
          <div style={st('display:flex;justify-content:space-between;gap:10px;margin-bottom:14px;font:500 12px var(--font-ui);color:var(--faint)')}>
            <span style={{ textWrap: 'pretty' }}>Votes and review scores weight the pick</span>
            <span style={st('flex-shrink:0;font-family:var(--font-mono)')}>{session ? `${session.strip.length} slots` : `${candidates.length} in the pool`}</span>
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
          ) : (
            <div onClick={clickReel} style={{ cursor: spinning ? 'pointer' : 'default' }} title={spinning ? 'Click the left side to slow it down, the right side to speed it up' : undefined}>
              <Reel strip={run?.strip ?? []} position={position} tw={tw} th={th} settled={settled} idle={idle} />
            </div>
          )}

          <div style={st('min-height:112px;margin-top:16px;text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px')} aria-live="polite">
            {idle && (
              <button
                type="button"
                onClick={go}
                disabled={starting || (!roomId && !candidates.length)}
                style={st(`height:50px;padding:0 40px;border-radius:999px;border:none;background:${ACC};color:var(--ink);font:800 16px var(--font-display);box-shadow:0 8px 24px oklch(0.74 0.15 45 / 0.35);opacity:${starting ? 0.6 : 1}`)}
              >
                {starting ? 'Checking prices…' : 'Spin'}
              </button>
            )}
            {spinning && <span style={st('font:500 14px var(--font-ui);color:var(--muted)')}>Rolling… click left to slow it, right to speed it up</span>}
            {settled && winner && (
              <>
                <span style={st('font:500 12px var(--font-mono);color:var(--accText)')}>TONIGHT'S PICK</span>
                <span style={st('font:700 28px/1.05 var(--font-display);letter-spacing:-0.02em')}>{winner.title}</span>
                <span style={st('font:400 13.5px var(--font-ui);color:var(--muted)')}>
                  {[winner.genre?.split(',')[0], winner.timeToBeatHours ? `~${winner.timeToBeatHours}h` : '', resPrice].filter(Boolean).join(' · ')}
                </span>
                <div style={st('display:flex;gap:8px;margin-top:12px')}>
                  <button type="button" onClick={() => (session ? void shared.restartSpin(filters).catch(() => {}) : go())} style={st('height:42px;padding:0 18px;border-radius:999px;border:1px solid var(--line);background:transparent;color:var(--text);font:600 13.5px var(--font-ui)')}>
                    Spin again
                  </button>
                  <button type="button" onClick={play} style={st('height:42px;padding:0 18px;border-radius:999px;border:none;background:var(--text);color:var(--onText);font:700 13.5px var(--font-ui)')}>
                    Let's play
                  </button>
                </div>
              </>
            )}
          </div>
          {settled && winner && run && <ConfettiBurst key={run.settlesAtMs} />}
        </div>
      </Dialog>
      {pickerGame && (
        <SteamMatchSheet
          gameId={pickerGame.id}
          gameTitle={pickerGame.title}
          hasExistingMatch={pickerGame.price.source === 'live' || pickerGame.ggDealsUrl !== null}
          onMatched={(id) => {
            ops.setSteamMatch(pickerGame.id, id);
            steam.closePicker();
          }}
          onClose={steam.closePicker}
        />
      )}
    </>
  );
}
