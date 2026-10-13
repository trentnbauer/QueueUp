import { useCallback, useEffect, useRef, useState } from 'react';
import type { LobbyClientMessage, LobbyServerMessage, LobbySnapshot } from '@queueup/shared';
import { getBasePath } from '../utils/basePath';

export type LobbyStatus = 'connecting' | 'open' | 'offline';

const RECONNECT_MIN_MS = 1000;
const RECONNECT_MAX_MS = 8000;

/** The live connection to a room's lobby (see services/spinLobbyHub.ts on the server). Opens while
 * `enabled`, closes when it is not or the component goes away, and reconnects on its own if the
 * connection drops. `onStarted` fires when the room's spin has begun. */
export function useSpinLobby(roomId: string | undefined, enabled: boolean, onStarted?: () => void) {
  const [snapshot, setSnapshot] = useState<LobbySnapshot | null>(null);
  const [status, setStatus] = useState<LobbyStatus>('connecting');
  const socketRef = useRef<WebSocket | null>(null);
  const startedRef = useRef(onStarted);
  startedRef.current = onStarted;

  useEffect(() => {
    if (!roomId || !enabled) return;
    let stopped = false;
    let retry = RECONNECT_MIN_MS;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      setStatus('connecting');
      const scheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${scheme}//${window.location.host}${getBasePath()}/api/rooms/${encodeURIComponent(roomId)}/lobby`);
      socketRef.current = ws;
      ws.onopen = () => {
        retry = RECONNECT_MIN_MS;
        setStatus('open');
      };
      ws.onmessage = (e) => {
        let msg: LobbyServerMessage;
        try {
          msg = JSON.parse(String(e.data)) as LobbyServerMessage;
        } catch {
          return;
        }
        if (msg.t === 'state') setSnapshot(msg);
        else if (msg.t === 'started') startedRef.current?.();
      };
      ws.onclose = () => {
        if (socketRef.current === ws) socketRef.current = null;
        if (stopped) return;
        setStatus('offline');
        setSnapshot(null);
        timer = setTimeout(connect, retry);
        retry = Math.min(RECONNECT_MAX_MS, retry * 2);
      };
    };
    connect();

    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      socketRef.current?.close();
      socketRef.current = null;
      setSnapshot(null);
    };
  }, [roomId, enabled]);

  const send = useCallback((msg: LobbyClientMessage) => {
    const ws = socketRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }, []);

  return {
    snapshot,
    status,
    sendInput: useCallback((dx: number, dy: number) => send({ t: 'input', dx, dy }), [send]),
    sendAction: useCallback((name: string) => send({ t: 'action', name }), [send]),
    vote: useCallback((on: boolean) => send({ t: 'vote', on }), [send]),
  };
}
