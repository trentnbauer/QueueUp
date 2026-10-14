import { randomInt, randomUUID } from 'node:crypto';
import { MINIGAME_CODE_ALPHABET, formatLobbyCode, type LobbyGameId, type MiniGameLobbyVisibility } from '@queueup/shared';

/** Hub key prefix: an open lobby runs in the same hub as a room's lobby, under `lobby:<id>`. */
export const OPEN_LOBBY_PREFIX = 'lobby:';
export const lobbyKey = (id: string): string => `${OPEN_LOBBY_PREFIX}${id}`;

/** The most open lobbies at once, and how long a new one waits for its first person before it is dropped. */
export const MAX_OPEN_LOBBIES = 200;
export const UNJOINED_TTL_MS = 2 * 60 * 1000;

export interface OpenLobby {
  id: string;
  hostId: string;
  visibility: MiniGameLobbyVisibility;
  /** One fixed game, or null for a random one after every run. */
  game: LobbyGameId | null;
  /** The 6 code characters (invite-code lobbies only). */
  code: string | null;
  createdAt: number;
  /** People who came in with the code: only they (and the host) may open a code lobby. */
  allowed: Set<string>;
}

function newCode(): string {
  let out = '';
  for (let i = 0; i < 6; i++) out += MINIGAME_CODE_ALPHABET[randomInt(MINIGAME_CODE_ALPHABET.length)];
  return out;
}

/** The open lobbies on this server. A lobby lives while someone is in it (the hub tells us when it empties)
 * and goes if nobody ever arrives. In memory only, like the lobbies themselves: production runs one server. */
export class OpenLobbyRegistry {
  private readonly lobbies = new Map<string, OpenLobby>();

  constructor(private readonly now: () => number = Date.now) {}

  get(id: string): OpenLobby | undefined {
    return this.lobbies.get(id);
  }

  all(): OpenLobby[] {
    return [...this.lobbies.values()];
  }

  hostedBy(userId: string): OpenLobby | undefined {
    return this.all().find((l) => l.hostId === userId);
  }

  byCode(code: string): OpenLobby | undefined {
    return this.all().find((l) => l.code === code);
  }

  /** Opens a lobby for `hostId`. Someone hosts one at a time, so an earlier one of theirs is replaced (and
   * returned, for the caller to close). Null when the server already has the most it allows. */
  create(hostId: string, visibility: MiniGameLobbyVisibility, game: LobbyGameId | null): { lobby: OpenLobby; replaced?: OpenLobby } | null {
    const replaced = this.hostedBy(hostId);
    if (replaced) this.lobbies.delete(replaced.id);
    if (this.lobbies.size >= MAX_OPEN_LOBBIES) return null;
    let code: string | null = null;
    if (visibility === 'code') {
      do code = newCode();
      while (this.byCode(code));
    }
    const lobby: OpenLobby = { id: randomUUID(), hostId, visibility, game, code, createdAt: this.now(), allowed: new Set([hostId]) };
    this.lobbies.set(lobby.id, lobby);
    return { lobby, replaced };
  }

  close(id: string): OpenLobby | undefined {
    const lobby = this.lobbies.get(id);
    this.lobbies.delete(id);
    return lobby;
  }

  /** Drops lobbies nobody ever joined (the host closed the dialog before it connected). */
  purge(hasPeople: (id: string) => boolean): void {
    const cutoff = this.now() - UNJOINED_TTL_MS;
    for (const lobby of this.all()) if (lobby.createdAt < cutoff && !hasPeople(lobby.id)) this.lobbies.delete(lobby.id);
  }
}

export const openLobbies = new OpenLobbyRegistry();

/** Who may open a lobby: the host always; an invite-code lobby only people who came in with the code; a
 * friends lobby the host's friends; a public one anyone. Nobody who has blocked or been blocked by the host. */
export function mayOpenLobby(lobby: OpenLobby, userId: string, relation: { friend: boolean; blocked: boolean }): boolean {
  if (userId === lobby.hostId) return true;
  if (relation.blocked) return false;
  if (lobby.allowed.has(userId)) return true;
  if (lobby.visibility === 'public') return true;
  if (lobby.visibility === 'friends') return relation.friend;
  return false;
}

export { formatLobbyCode };
