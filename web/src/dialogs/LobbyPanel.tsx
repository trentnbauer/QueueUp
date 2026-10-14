import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import type { LobbyGameId, RoomMember } from '@queueup/shared';
import { useLocalLobby } from '../hooks/useLocalLobby';
import { useSpinLobby } from '../hooks/useSpinLobby';
import { viewFor, type LobbyGameView } from '../lobbyGames';
import { LobbyFx } from '../lobbyGames/kit';
import { Controls } from './lobby/Controls';
import { LiveAnnouncer } from './lobby/LiveAnnouncer';
import { LobbyHeader } from './lobby/LobbyHeader';
import { RunHistory } from './lobby/RunHistory';
import { VoteBar } from './lobby/VoteBar';
import { WinChart } from './lobby/WinChart';
import { useIsMobile } from '../ui/useLayout';
import { Dialog } from '../ui/Dialog';
import { st } from '../ui/st';
import { t as tNow, useT } from '../i18n';

type Vec = [number, number];

const LEFT_RIGHT_KEYS: Record<string, Vec> = { ArrowLeft: [-1, 0], a: [-1, 0], ArrowRight: [1, 0], d: [1, 0] };
const FULL_KEYS: Record<string, Vec> = { ...LEFT_RIGHT_KEYS, ArrowUp: [0, -1], w: [0, -1], ArrowDown: [0, 1], s: [0, 1] };

/** Which keyboard keys move you in a game, from the controls it declares. */
function movementKeys(view: LobbyGameView | null): Record<string, Vec> {
  if (!view) return {};
  const keys: Record<string, Vec> = view.pad === 'full' ? { ...FULL_KEYS } : view.pad === 'leftRight' ? { ...LEFT_RIGHT_KEYS } : {};
  for (const h of view.holds ?? []) for (const k of h.keys) keys[k] = [h.dx, h.dy];
  return keys;
}

const clampAxis = (n: number): number => Math.max(-1, Math.min(1, n));

/** The room's live mini game: the server-run game everyone in the lobby plays, plus the vote to leave
 * for the spin when one is waiting. The game itself is drawn by the matching view in `lobbyGames/`. */
export function LobbyPanel({
  roomId,
  members,
  me,
  onStarted,
  offlineFallback,
  readyUserIds,
  practiceGame,
}: {
  /** The room to connect to. Not needed when `practiceGame` is set. */
  roomId?: string;
  members: RoomMember[];
  me: string;
  onStarted?: () => void;
  offlineFallback?: ReactNode;
  /** Members who are ready for a waiting spin, or undefined when opened on its own (no spin). */
  readyUserIds?: string[];
  /** Run this game here, just for you, instead of connecting to a room (practice on the Personal Shelf). */
  practiceGame?: LobbyGameId;
}) {
  const t = useT();
  const phone = useIsMobile();
  // Either the room's live lobby over a WebSocket, or the same game run locally for practice.
  const live = useSpinLobby(practiceGame ? undefined : roomId, !practiceGame, onStarted);
  const local = useLocalLobby(practiceGame, me);
  const { snapshot, status, sendInput, sendAction, vote } = practiceGame ? local : live;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  // Effects (knock-out bursts, confetti, shake) and their memory between frames, for as long as the panel is open.
  const fxRef = useRef<LobbyFx | null>(null);
  if (!fxRef.current) fxRef.current = new LobbyFx();
  const latest = useRef(snapshot);
  latest.current = snapshot;
  const byId = useMemo(() => new Map(members.map((m) => [m.user.id, m.user])), [members]);
  const byIdRef = useRef(byId);
  byIdRef.current = byId;

  const view = snapshot ? viewFor(snapshot.game) : null;
  const viewRef = useRef(view);
  viewRef.current = view;

  // Movement input: keyboard and the on-screen pad share one held direction, sent only when it changes.
  const keys = useRef(new Set<string>());
  const pad = useRef({ dx: 0, dy: 0 });
  const sent = useRef({ dx: 0, dy: 0 });
  const sendHeld = () => {
    let kx = 0;
    let ky = 0;
    const map = movementKeys(viewRef.current);
    for (const key of keys.current) {
      kx += map[key]?.[0] ?? 0;
      ky += map[key]?.[1] ?? 0;
    }
    const dx = clampAxis(kx) || pad.current.dx;
    const dy = clampAxis(ky) || pad.current.dy;
    if (dx === sent.current.dx && dy === sent.current.dy) return;
    sent.current = { dx, dy };
    sendInput(dx, dy);
  };
  const sendHeldRef = useRef(sendHeld);
  sendHeldRef.current = sendHeld;
  const sendActionRef = useRef(sendAction);
  sendActionRef.current = sendAction;

  useEffect(() => {
    const normal = (e: KeyboardEvent) => (e.key.length === 1 ? e.key.toLowerCase() : e.key);
    const typing = (e: KeyboardEvent) => e.target instanceof HTMLElement && (e.target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON'].includes(e.target.tagName));
    const down = (e: KeyboardEvent) => {
      if (typing(e)) return;
      const key = normal(e);
      const action = viewRef.current?.actions.find((a) => a.keys.includes(key));
      if (action) {
        e.preventDefault();
        if (!e.repeat) sendActionRef.current(action.name);
        return;
      }
      if (!movementKeys(viewRef.current)[key]) return;
      e.preventDefault();
      keys.current.add(key);
      sendHeldRef.current();
    };
    const up = (e: KeyboardEvent) => {
      keys.current.delete(normal(e));
      sendHeldRef.current();
    };
    const blur = () => {
      keys.current.clear();
      sendHeldRef.current();
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', blur);
    };
  }, []);

  // Drawing: the server sends about 15 snapshots a second; the game's view eases things toward their
  // latest spot so movement looks smooth at the screen's own frame rate.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const shown = new Map<string, { x: number; y: number }>();
    let frame = 0;
    const draw = () => {
      frame = requestAnimationFrame(draw);
      const snap = latest.current;
      const gameView = viewRef.current;
      const size = canvas.clientWidth;
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== Math.round(size * dpr)) {
        canvas.width = Math.round(size * dpr);
        canvas.height = Math.round(size * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      const style = getComputedStyle(canvas);
      if (!snap || !gameView) {
        ctx.fillStyle = style.getPropertyValue('--bg').trim() || '#161210';
        ctx.fillRect(0, 0, size, size);
        return;
      }
      const seen = new Set<string>();
      gameView.draw({
        ctx,
        size,
        snapshot: snap.game,
        me,
        users: byIdRef.current,
        ease: (key, x, y) => {
          seen.add(key);
          const cur = shown.get(key) ?? { x, y };
          cur.x += (x - cur.x) * 0.35;
          cur.y += (y - cur.y) * 0.35;
          shown.set(key, cur);
          return cur;
        },
        color: (name, fallback) => style.getPropertyValue(name).trim() || fallback,
        t: tNow,
        fx: fxRef.current!,
      });
      for (const key of [...shown.keys()]) if (!seen.has(key)) shown.delete(key);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [me]);

  const game = snapshot?.game ?? null;
  const playingIds = game ? game.players.map((p) => p.id) : [];
  const here = playingIds.length;
  const voted = !!snapshot?.voters.includes(me);
  const statusText = practiceGame ? t('practice.status') : status === 'open' ? t(here === 1 ? 'spin.lobby.here.one' : 'spin.lobby.here.other', { n: here }) : status === 'connecting' ? t('spin.lobby.connecting') : t('spin.lobby.offline');
  const release = () => {
    pad.current = { dx: 0, dy: 0 };
    sendHeld();
  };
  /** Pointer handlers for a button that holds a direction for as long as it is pressed. */
  const holdProps = (dx: number, dy: number) => ({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      e.currentTarget.setPointerCapture(e.pointerId);
      pad.current = { dx, dy };
      sendHeld();
    },
    onPointerUp: release,
    onPointerCancel: release,
  });

  const arena = (
    <canvas
      ref={canvasRef}
      role="img"
      aria-label={view ? t(view.nameKey) : t('spin.lobby.title')}
      onPointerDown={(e) => {
        if (view?.tapAction) sendAction(view.tapAction);
        else if (view?.tapHold) {
          e.currentTarget.setPointerCapture(e.pointerId);
          pad.current = { dx: view.tapHold[0], dy: view.tapHold[1] };
          sendHeld();
        }
      }}
      onPointerUp={view?.tapHold ? release : undefined}
      onPointerCancel={view?.tapHold ? release : undefined}
      style={st(`display:block;width:100%;aspect-ratio:1;border-radius:${phone ? 18 : 16}px;box-shadow:inset 0 0 0 1px oklch(1 0 0 / 0.1);touch-action:none`)}
    />
  );
  const controls = view ? <Controls view={view} phone={phone} holdProps={holdProps} onAction={sendAction} /> : null;
  const gameName = view ? t(view.nameKey) : '';

  const bottom = snapshot?.spinWaiting ? (
    <VoteBar votes={snapshot.voters.length} needed={snapshot.needed} voted={voted} onVote={vote} phone={phone} />
  ) : status === 'offline' && offlineFallback ? (
    offlineFallback
  ) : (
    status === 'open' && <span style={st('font:500 12px var(--font-ui);color:var(--muted);text-align:center')}>{practiceGame ? t('practice.note') : t('spin.lobby.noSpin')}</span>
  );

  return (
    <div style={st(`display:flex;flex-direction:column;gap:${phone ? 12 : 14}px;${phone ? '' : 'padding:16px;border-radius:20px;background:var(--bg)'}`)}>
      <LobbyHeader members={members} readyIds={readyUserIds ?? null} playingIds={playingIds} gameName={gameName} run={game?.run ?? 0} statusText={statusText} phone={phone} />

      {phone ? (
        <>
          <div style={st('display:flex;flex-direction:column;gap:10px')}>
            {arena}
            {controls}
          </div>
          {game && <WinChart game={game} members={members} me={me} phone aside={<RunHistory summary={game} members={members} compact />} />}
          {view && <span style={st('font:500 12px var(--font-ui);color:var(--faint);text-align:center')}>{t(view.hintKey)}</span>}
        </>
      ) : (
        <div style={st('display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);gap:16px;align-items:start')}>
          <div style={st('display:flex;flex-direction:column;gap:12px')}>
            {arena}
            {controls}
          </div>
          <div style={st('display:flex;flex-direction:column;gap:14px;min-width:0')}>
            {view && game && (
              <div style={st('display:flex;flex-direction:column;gap:6px;padding:14px;border-radius:16px;background:linear-gradient(135deg,var(--hero1),var(--hero2))')}>
                <span style={st('font:500 11px var(--font-mono);letter-spacing:.08em;text-transform:uppercase;color:var(--accText)')}>{t('spin.lobby.gameKicker', { run: game.run, game: gameName })}</span>
                <span style={st('font:700 19px var(--font-display);letter-spacing:-.02em')}>{t(view.taglineKey)}</span>
                <span style={st('font:500 12.5px/1.4 var(--font-ui);color:var(--muted)')}>{t(view.hintKey)}</span>
              </div>
            )}
            {game && <WinChart game={game} members={members} me={me} phone={false} />}
            {game && <RunHistory summary={game} members={members} />}
          </div>
        </div>
      )}

      {bottom}
      <LiveAnnouncer game={game} me={me} members={members} />
    </div>
  );
}

/** The mini game on its own, from the room's settings: a lobby to play in with whoever else opens it,
 * with or without a spin. */
export function RoomLobbyDialog({ roomId, members, me, onClose }: { roomId: string; members: RoomMember[]; me: string; onClose: () => void }) {
  const t = useT();
  return (
    <Dialog onClose={onClose} title={t('spin.lobby.title')} width={720}>
      <LobbyPanel roomId={roomId} members={members} me={me} onStarted={onClose} />
    </Dialog>
  );
}
