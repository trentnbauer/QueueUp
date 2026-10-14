import type { LobbyGameId, MiniGameLobbyDto } from '@queueup/shared';
import type { MessageKey } from '../i18n';

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

/** "Sam and Jess are playing Runner": who is in an open lobby (other than you), and the game if it has one.
 * Your own lobby says it is open. */
export function lobbyHeadline(lobby: MiniGameLobbyDto, viewerId: string, t: Translate, gameName: (id: LobbyGameId) => string): string {
  const game = lobby.game ? gameName(lobby.game) : null;
  if (lobby.mine) return game ? t('games.live.mineGame', { game }) : t('games.live.mine');
  const others = lobby.players.filter((p) => p.id !== viewerId).map((p) => p.displayName);
  // A lobby nobody else is in yet still reads sensibly: it is the host's.
  const who = others.length ? others : [lobby.players[0]?.displayName ?? '?'];
  const count = who.length === 1 ? 'one' : who.length === 2 ? 'two' : 'many';
  const vars = { a: who[0], b: who[1] ?? '', n: Math.max(0, who.length - 2) };
  if (game) return t(`games.live.playingGame.${count}` as MessageKey, { ...vars, game });
  return t(`games.live.playing.${count}` as MessageKey, vars);
}
