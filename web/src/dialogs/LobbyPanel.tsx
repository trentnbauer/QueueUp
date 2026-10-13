import { useEffect, useMemo, useRef, type ReactNode } from 'react';
import type { RoomMember } from '@queueup/shared';
import { useSpinLobby } from '../hooks/useSpinLobby';
import { Dialog } from '../ui/Dialog';
import { st } from '../ui/st';
import { useT } from '../i18n';

/** Reads the held direction from the keyboard: arrow keys or WASD. */
function directionFromKeys(keys: Set<string>): { dx: number; dy: number } {
  const dx = (keys.has('ArrowRight') || keys.has('d') ? 1 : 0) - (keys.has('ArrowLeft') || keys.has('a') ? 1 : 0);
  const dy = (keys.has('ArrowDown') || keys.has('s') ? 1 : 0) - (keys.has('ArrowUp') || keys.has('w') ? 1 : 0);
  return { dx, dy };
}

const PAD: { label: string; dx: number; dy: number; area: string }[] = [
  { label: '▲', dx: 0, dy: -1, area: '1 / 2' },
  { label: '◀', dx: -1, dy: 0, area: '2 / 1' },
  { label: '▶', dx: 1, dy: 0, area: '2 / 3' },
  { label: '▼', dx: 0, dy: 1, area: '3 / 2' },
];

/** The room's live mini game: a shared arena everyone in the lobby walks around in, plus the vote to
 * leave for the spin when one is waiting. Phase one of the lobby - nothing here changes a spin. */
export function LobbyPanel({ roomId, members, me, onStarted, offlineFallback }: { roomId: string; members: RoomMember[]; me: string; onStarted?: () => void; offlineFallback?: ReactNode }) {
  const t = useT();
  const { snapshot, status, sendInput, vote } = useSpinLobby(roomId, true, onStarted);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const latest = useRef(snapshot);
  latest.current = snapshot;
  const byId = useMemo(() => new Map(members.map((m) => [m.user.id, m.user])), [members]);
  const byIdRef = useRef(byId);
  byIdRef.current = byId;

  // Movement input: keyboard and the on-screen pad share one held direction, sent only when it changes.
  const keys = useRef(new Set<string>());
  const pad = useRef({ dx: 0, dy: 0 });
  const sent = useRef({ dx: 0, dy: 0 });
  const sendHeld = () => {
    const k = directionFromKeys(keys.current);
    const dx = k.dx || pad.current.dx;
    const dy = k.dy || pad.current.dy;
    if (dx === sent.current.dx && dy === sent.current.dy) return;
    sent.current = { dx, dy };
    sendInput(dx, dy);
  };
  const sendHeldRef = useRef(sendHeld);
  sendHeldRef.current = sendHeld;

  useEffect(() => {
    const normal = (e: KeyboardEvent) => (e.key.length === 1 ? e.key.toLowerCase() : e.key);
    const typing = (e: KeyboardEvent) => e.target instanceof HTMLElement && (e.target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName));
    const down = (e: KeyboardEvent) => {
      if (typing(e) || !['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd'].includes(normal(e))) return;
      e.preventDefault();
      keys.current.add(normal(e));
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

  // Drawing: the server sends about 15 snapshots a second; each dot eases toward its latest spot so
  // movement looks smooth at the screen's own frame rate.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const shown = new Map<string, { x: number; y: number }>();
    let frame = 0;
    const draw = () => {
      frame = requestAnimationFrame(draw);
      const size = canvas.clientWidth;
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== Math.round(size * dpr)) {
        canvas.width = Math.round(size * dpr);
        canvas.height = Math.round(size * dpr);
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const style = getComputedStyle(canvas);
      ctx.clearRect(0, 0, size, size);
      ctx.fillStyle = style.getPropertyValue('--bg').trim() || '#161210';
      ctx.fillRect(0, 0, size, size);
      ctx.strokeStyle = style.getPropertyValue('--chip').trim() || '#333';
      ctx.lineWidth = 1;
      for (let i = 1; i < 6; i++) {
        ctx.beginPath();
        ctx.moveTo((size * i) / 6, 0);
        ctx.lineTo((size * i) / 6, size);
        ctx.moveTo(0, (size * i) / 6);
        ctx.lineTo(size, (size * i) / 6);
        ctx.stroke();
      }
      const snap = latest.current;
      const radius = Math.max(12, size * 0.045);
      const inset = radius + 2;
      const live = new Set<string>();
      for (const p of snap?.players ?? []) {
        live.add(p.id);
        const cur = shown.get(p.id) ?? { x: p.x, y: p.y };
        cur.x += (p.x - cur.x) * 0.35;
        cur.y += (p.y - cur.y) * 0.35;
        shown.set(p.id, cur);
        const user = byIdRef.current.get(p.id);
        const px = inset + cur.x * (size - inset * 2);
        const py = inset + cur.y * (size - inset * 2);
        ctx.beginPath();
        ctx.arc(px, py, radius, 0, Math.PI * 2);
        ctx.fillStyle = user?.avatarColor ?? '#8b5cf6';
        ctx.fill();
        if (p.id === me) {
          ctx.lineWidth = 3;
          ctx.strokeStyle = style.getPropertyValue('--text').trim() || '#fff';
          ctx.stroke();
        }
        ctx.fillStyle = '#fff';
        ctx.font = `700 ${Math.round(radius)}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText((user?.displayName ?? '?').slice(0, 1).toUpperCase(), px, py + 1);
      }
      for (const id of [...shown.keys()]) if (!live.has(id)) shown.delete(id);
    };
    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [me]);

  const here = snapshot?.players.length ?? 0;
  const voted = !!snapshot?.voters.includes(me);
  const statusText = status === 'open' ? t(here === 1 ? 'spin.lobby.here.one' : 'spin.lobby.here.other', { n: here }) : status === 'connecting' ? t('spin.lobby.connecting') : t('spin.lobby.offline');

  return (
    <div style={st('display:flex;flex-direction:column;gap:10px')}>
      <div style={st('display:flex;justify-content:space-between;align-items:center;font:600 13px var(--font-ui)')}>
        <span>{t('spin.lobby.title')}</span>
        <span style={st('font:500 12px var(--font-ui);color:var(--muted)')}>{statusText}</span>
      </div>
      <canvas ref={canvasRef} role="img" aria-label={t('spin.lobby.title')} style={st('width:100%;max-width:340px;aspect-ratio:1;align-self:center;border-radius:16px;touch-action:none;display:block')} />
      <div style={st('display:grid;grid-template-columns:repeat(3,52px);grid-template-rows:repeat(3,44px);gap:4px;align-self:center')}>
        {PAD.map((b) => (
          <button
            key={b.label}
            type="button"
            aria-label={b.label}
            onPointerDown={(e) => {
              e.currentTarget.setPointerCapture(e.pointerId);
              pad.current = { dx: b.dx, dy: b.dy };
              sendHeld();
            }}
            onPointerUp={() => {
              pad.current = { dx: 0, dy: 0 };
              sendHeld();
            }}
            onPointerCancel={() => {
              pad.current = { dx: 0, dy: 0 };
              sendHeld();
            }}
            style={st(`grid-area:${b.area};border:none;border-radius:12px;background:var(--surf2);color:var(--text);font:700 16px var(--font-ui);touch-action:none;user-select:none`)}
          >
            {b.label}
          </button>
        ))}
      </div>
      <span style={st('font:500 12px var(--font-ui);color:var(--faint);text-align:center')}>{t('spin.lobby.hint')}</span>
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
