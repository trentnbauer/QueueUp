import { useCallback, useEffect, useRef, useState } from 'react';
import type { LobbyClientMessage, LobbyServerMessage, LobbySnapshot } from '@queueup/shared';
import { ClientSim, ClockSync } from '../lobbyGames/clientSim';
import { getBasePath } from '../utils/basePath';

export type LobbyStatus = 'connecting' | 'open' | 'offline';

const RECONNECT_MIN_MS = 1000;
const RECONNECT_MAX_MS = 8000;
/** When, after connecting, to ask the server for its clock (ms), then every PING_EVERY_MS after. A few early
 * answers give a good reading quickly; the quickest one is the one kept. */
const PING_AT_MS = [0, 250, 600, 1200, 2500];
const PING_EVERY_MS = 10_000;

/** The live connection to a lobby (see services/spinLobbyHub.ts on the server): a room's, at
 * `/api/rooms/:id/lobby`, or an open lobby's, at `/api/minigames/lobbies/:id/lobby`. Opens while
 * `enabled`, closes when it is not or the component goes away, and reconnects on its own if the
 * connection drops. `onStarted` fires when the room's spin has begun.
 *
 * For a game that runs each player on their own device, it also keeps a local copy of the run going
 * (`ClientSim`): `frame` gives the snapshot to draw, with this player worked out here instead of waiting
 * for the server, and the input and action calls go to that copy instead of the server. For any other
 * game, `frame` is the server's latest snapshot and input goes to the server as before. */
export function useSpinLobby(path: string | undefined, enabled: boolean, me: string, onStarted?: () => void, serverRuns = false) {
  const [snapshot, setSnapshot] = useState<LobbySnapshot | null>(null);
  const [status, setStatus] = useState<LobbyStatus>('connecting');
  const socketRef = useRef<WebSocket | null>(null);
  const simRef = useRef<ClientSim | null>(null);
  const startedRef = useRef(onStarted);
  startedRef.current = onStarted;

  useEffect(() => {
    if (!path || !enabled) return;
    let stopped = false;
    let retry = RECONNECT_MIN_MS;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let pings: ReturnType<typeof setTimeout>[] = [];
    let pingEvery: ReturnType<typeof setInterval> | undefined;

    const connect = () => {
      setStatus('connecting');
      const scheme = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${scheme}//${window.location.host}${getBasePath()}${path}`);
      socketRef.current = ws;
      // A new connection starts its own clock reading and local copy of the run.
      const clock = new ClockSync();
      const sim = new ClientSim(
        me,
        clock,
        (message) => {
          if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
        },
        serverRuns,
      );
      simRef.current = sim;
      const ping = () => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: 'ping', c: performance.now() } satisfies LobbyClientMessage));
      };
      ws.onopen = () => {
        retry = RECONNECT_MIN_MS;
        setStatus('open');
        pings = PING_AT_MS.map((ms) => setTimeout(ping, ms));
        pingEvery = setInterval(ping, PING_EVERY_MS);
      };
      ws.onmessage = (e) => {
        let msg: LobbyServerMessage;
        try {
          msg = JSON.parse(String(e.data)) as LobbyServerMessage;
        } catch {
          return;
        }
        if (msg.t === 'state') {
          sim.onState(msg);
          setSnapshot(msg);
        } else if (msg.t === 'pong') clock.sample(msg.c, performance.now(), msg.s);
        else if (msg.t === 'started') startedRef.current?.();
      };
      ws.onclose = () => {
        pings.forEach(clearTimeout);
        if (pingEvery) clearInterval(pingEvery);
        if (socketRef.current === ws) socketRef.current = null;
        if (simRef.current === sim) simRef.current = null;
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
      pings.forEach(clearTimeout);
      if (pingEvery) clearInterval(pingEvery);
      socketRef.current?.close();
      socketRef.current = null;
      simRef.current = null;
      setSnapshot(null);
    };
  }, [path, enabled, me, serverRuns]);

  const send = useCallback((msg: LobbyClientMessage) => {
    const ws = socketRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }, []);

  return {
    snapshot,
    status,
    /** The snapshot to draw at `now` (`performance.now()`): fresher than `snapshot` for a game that runs on the client. */
    frame: useCallback((now: number): LobbySnapshot | null => simRef.current?.frame(now) ?? null, []),
    // The local copy takes the input when the game runs here; otherwise the server does.
    sendInput: useCallback((dx: number, dy: number) => (simRef.current?.input(dx, dy) ? undefined : send({ t: 'input', dx, dy, ...simRef.current?.stamp() })), [send]),
    sendAction: useCallback((name: string) => (simRef.current?.action(name) ? undefined : send({ t: 'action', name, ...simRef.current?.stamp() })), [send]),
    sendTap: useCallback((target: number, ms?: number) => send({ t: 'tap', target, ms }), [send]),
    vote: useCallback((on: boolean) => send({ t: 'vote', on }), [send]),
    setTimeLimit: useCallback((on: boolean) => send({ t: 'timeLimit', on }), [send]),
  };
}
