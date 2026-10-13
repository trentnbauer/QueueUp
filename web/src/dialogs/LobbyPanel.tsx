import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import type { RoomMember } from '@queueup/shared';
import { useSpinLobby } from '../hooks/useSpinLobby';
import { viewFor, type LobbyGameView } from '../lobbyGames';
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

const PAD: { label: string; dx: number; dy: number; area: string }[] = [
  { label: '▲', dx: 0, dy: -1, area: '1 / 2' },
  { label: '◀', dx: -1, dy: 0, area: '2 / 1' },
  { label: '▶', dx: 1, dy: 0, area: '2 / 3' },
  { label: '▼', dx: 0, dy: 1, area: '3 / 2' },
];
const LEFT_RIGHT_PAD = [
  { label: '◀', dx: -1, dy: 0 },
  { label: '▶', dx: 1, dy: 0 },
];

const BIG_BUTTON = 'border:none;border-radius:18px;background:var(--surf2);color:var(--text);font:700 15px var(--font-ui);touch-action:none;user-select:none';

/** The room's live mini game: the server-run game everyone in the lobby plays, plus the vote to leave
 * for the spin when one is waiting. The game itself is drawn by the matching view in `lobbyGames/`. */
export function LobbyPanel({ roomId, members, me, onStarted, offlineFallback }: { roomId: string; members: RoomMember[]; me: string; onStarted?: () => void; offlineFallback?: ReactNode }) {
  const t = useT();
  const { snapshot, status, sendInput, sendAction, vote } = useSpinLobby(roomId, true, onStarted);
  const canvasRef = useRef<HTMLCanvasElement>(null);
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
      });
      for (const key of [...shown.keys()]) if (!seen.has(key)) shown.delete(key);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [me]);

  const here = snapshot?.game.players.length ?? 0;
  const voted = !!snapshot?.voters.includes(me);
  const statusText = status === 'open' ? t(here === 1 ? 'spin.lobby.here.one' : 'spin.lobby.here.other', { n: here }) : status === 'connecting' ? t('spin.lobby.connecting') : t('spin.lobby.offline');
  const standings = snapshot && view ? view.standings(snapshot.game) : [];
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

  return (
    <div style={st('display:flex;flex-direction:column;gap:10px')}>
      <div style={st('display:flex;justify-content:space-between;align-items:center;font:600 13px var(--font-ui)')}>
        <span>{t('spin.lobby.title')}</span>
        <span style={st('font:500 12px var(--font-ui);color:var(--muted)')}>{statusText}</span>
      </div>
      <canvas ref={canvasRef} role="img" aria-label={t('spin.lobby.title')} style={st('width:100%;max-width:340px;aspect-ratio:1;align-self:center;border-radius:16px;touch-action:none;display:block')} />
      {standings.length > 0 && (
        <div style={st('display:flex;flex-wrap:wrap;gap:6px;justify-content:center')}>
          {standings.map((s) => (
            <span key={s.id} style={st(`display:flex;align-items:center;gap:5px;height:24px;padding:0 9px;border-radius:999px;background:var(--surf2);font:600 11.5px var(--font-ui);opacity:${s.active ? 1 : 0.5}`)}>
              <span style={st(`width:9px;height:9px;border-radius:50%;background:${byId.get(s.id)?.avatarColor ?? '#8b5cf6'}`)} />
              {byId.get(s.id)?.displayName ?? '?'} · {s.score}
            </span>
          ))}
        </div>
      )}
      <div style={st('display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 6px')}>
        <div style={st('display:flex;align-items:center;gap:8px;min-height:92px')}>
          {view?.pad === 'full' && (
            <div style={st('display:grid;grid-template-columns:repeat(3,52px);grid-template-rows:repeat(3,44px);gap:4px')}>
              {PAD.map((b) => (
                <button key={b.label} type="button" aria-label={b.label} {...holdProps(b.dx, b.dy)} style={st(`grid-area:${b.area};${BIG_BUTTON};border-radius:12px;font-size:16px`)}>
                  {b.label}
                </button>
              ))}
            </div>
          )}
          {view?.pad === 'leftRight' &&
            LEFT_RIGHT_PAD.map((b) => (
              <button key={b.label} type="button" aria-label={b.label} {...holdProps(b.dx, b.dy)} style={st(`width:76px;height:76px;${BIG_BUTTON};font-size:24px`)}>
                {b.label}
              </button>
            ))}
          {view?.holds?.map((h) => (
            <button key={h.labelKey} type="button" {...holdProps(h.dx, h.dy)} style={st(`width:92px;height:76px;${BIG_BUTTON}`)}>
              {t(h.labelKey)}
            </button>
          ))}
        </div>
        <div style={st('display:flex;align-items:center;gap:10px')}>
          {view?.actions.map((a) => (
            <button
              key={a.name}
              type="button"
              onPointerDown={() => sendAction(a.name)}
              style={st('width:92px;height:92px;border:none;border-radius:50%;background:var(--acc);color:var(--onAcc, #fff);font:800 15px var(--font-ui);touch-action:none;user-select:none')}
            >
              {t(a.labelKey)}
            </button>
          ))}
        </div>
      </div>
      {view && <span style={st('font:500 12px var(--font-ui);color:var(--faint);text-align:center')}>{t(view.hintKey)}</span>}
      {snapshot?.spinWaiting ? (
        <>
          <button
            type="button"
            onClick={() => vote(!voted)}
            style={st(`height:42px;border-radius:999px;border:none;background:${voted ? 'var(--surf2)' : 'var(--text)'};color:${voted ? 'var(--text)' : 'var(--onText)'};font:700 13.5px var(--font-ui)`)}
          >
            {voted ? t('spin.lobby.voted') : t('spin.lobby.vote')}
          </button>
          <span style={st('font:500 12px var(--font-ui);color:var(--muted);text-align:center')}>{t('spin.lobby.votes', { n: snapshot.voters.length, needed: snapshot.needed })}</span>
        </>
      ) : status === 'offline' && offlineFallback ? (
        offlineFallback
      ) : (
        status === 'open' && <span style={st('font:500 12px var(--font-ui);color:var(--muted);text-align:center')}>{t('spin.lobby.noSpin')}</span>
      )}
    </div>
  );
}

/** The mini game on its own, from the room's settings: a lobby to play in with whoever else opens it,
 * with or without a spin. */
export function RoomLobbyDialog({ roomId, members, me, onClose }: { roomId: string; members: RoomMember[]; me: string; onClose: () => void }) {
  const t = useT();
  return (
    <Dialog onClose={onClose} title={t('spin.lobby.title')} width={420}>
      <LobbyPanel roomId={roomId} members={members} me={me} onStarted={onClose} />
    </Dialog>
  );
}
