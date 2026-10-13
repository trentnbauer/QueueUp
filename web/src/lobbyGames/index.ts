import type { LobbyGameId, LobbyGameSnapshot, User } from '@queueup/shared';
import type { MessageKey } from '../i18n';
import { totemView } from './totem';

/** What a renderer is given each frame. */
export interface LobbyDrawArgs<S extends LobbyGameSnapshot = LobbyGameSnapshot> {
  ctx: CanvasRenderingContext2D;
  /** Canvas side in CSS pixels (the canvas is square). */
  size: number;
  snapshot: S;
  /** The viewer's user id. */
  me: string;
  users: Map<string, User>;
  /** Eases a thing toward its latest server position so movement looks smooth between the ~15
   * snapshots a second. `key` identifies the thing; pass its position, get where to draw it. */
  ease: (key: string, x: number, y: number) => { x: number; y: number };
  /** Reads a CSS variable from the canvas' theme (with a fallback). */
  color: (name: string, fallback: string) => string;
  t: (key: MessageKey, params?: Record<string, string | number>) => string;
}

export interface LobbyStanding {
  id: string;
  score: number;
  /** Still in the current round. */
  active: boolean;
}

/** How the browser plays one lobby game: the buttons it adds to the pad, how a frame is drawn and the
 * scoreboard. The server module of the same id (server/src/services/lobbyGames/) holds the rules. */
export interface LobbyGameView<S extends LobbyGameSnapshot = LobbyGameSnapshot> {
  /** Extra buttons beside the pad. `key` is the keyboard key that does the same. */
  actions: { name: string; labelKey: MessageKey; key: string }[];
  /** One line telling people what to do. */
  hintKey: MessageKey;
  draw(args: LobbyDrawArgs<S>): void;
  standings(snapshot: S): LobbyStanding[];
}

export const LOBBY_GAME_VIEWS: { [K in LobbyGameId]: LobbyGameView<Extract<LobbyGameSnapshot, { id: K }>> } = {
  totem: totemView,
};

/** The view for whichever game a snapshot belongs to. */
export function viewFor(snapshot: LobbyGameSnapshot): LobbyGameView {
  return LOBBY_GAME_VIEWS[snapshot.id] as unknown as LobbyGameView;
}
