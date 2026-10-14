import { useCallback, useEffect, useRef, useState } from 'react';
import { LOBBY_TICK_HZ, LobbyRecord, type LobbyGameId, type LobbySnapshot } from '@queueup/shared';
import { LocalLobby } from '../lobbyGames/localLobby';

/** A mini game run right here in the browser, just for you, driven by a timer and fed straight from your
 * own input: for practising on the Personal Shelf, which has no room to connect to. It returns the same
 * shape as `useSpinLobby`, so the lobby panel does not care which one it is given. `onScore` hears
 * your score at the end of each run, so it can go on the high score list. */
export function useLocalLobby(gameId: LobbyGameId | undefined, me: string, onScore?: (game: LobbyGameId, score: number) => void) {
  const [snapshot, setSnapshot] = useState<LobbySnapshot | null>(null);
  const lobbyRef = useRef<LocalLobby | null>(null);
  // The run number, last results and wins stay when the person picks a different game to practise; they
  // only go when practising ends and this hook goes with it.
  const onScoreRef = useRef(onScore);
  onScoreRef.current = onScore;
  const recordRef = useRef<LobbyRecord>(new LobbyRecord());

  useEffect(() => {
    if (!gameId || !me) return;
    const lobby = new LocalLobby(gameId, me, recordRef.current, undefined, (g, score) => onScoreRef.current?.(g, score));
    lobbyRef.current = lobby;
    let last = performance.now();
    setSnapshot(lobby.snapshot());
    const timer = setInterval(() => {
      const now = performance.now();
      lobby.tick(now - last);
      last = now;
      setSnapshot(lobby.snapshot());
    }, Math.round(1000 / LOBBY_TICK_HZ));
    return () => {
      clearInterval(timer);
      lobbyRef.current = null;
      setSnapshot(null);
    };
  }, [gameId, me]);

  return {
    snapshot,
    status: 'open' as const,
    sendInput: useCallback((dx: number, dy: number) => lobbyRef.current?.input(dx, dy), []),
    sendAction: useCallback((name: string) => lobbyRef.current?.action(name), []),
    sendTap: useCallback((target: number) => lobbyRef.current?.tap(target), []),
    vote: useCallback((_on: boolean) => {}, []),
  };
}
