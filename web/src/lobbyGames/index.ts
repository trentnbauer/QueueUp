import type { LobbyGameId, LobbyGameSnapshot, User } from '@queueup/shared';
import type { MessageKey } from '../i18n';
import type { LobbyFx } from './kit/fx';
import type { TapTargets } from './taps';
import { battleshipsView } from './battleships';
import { coinsView } from './coins';
import { dodgeView } from './dodge';
import { flappyView } from './flappy';
import { raceView } from './race';
import { redLightView } from './redlight';
import { ropeView } from './rope';
import { runnerView } from './runner';
import { whackView } from './whack';

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
  /** Effects and the memory between frames; one lives as long as the lobby panel does. */
  fx: LobbyFx;
}

export interface LobbyStanding {
  id: string;
  score: number;
  /** Still in the current round. */
  active: boolean;
}

/** How the browser plays one lobby game: the buttons it adds to the pad, how a frame is drawn and the
 * scoreboard. The rules class of the same id (packages/shared/src/lobbyGames/) holds the rules. */
export interface LobbyGameView<S extends LobbyGameSnapshot = LobbyGameSnapshot> {
  /** Controls stay small enough for a phone: at most one movement axis (or none) plus one action button.
   * `full` is the 4-way pad, `leftRight` just two buttons, `none` shows no pad (a game that only uses
   * its buttons below). */
  pad: 'full' | 'leftRight' | 'none';
  /** Buttons held down to hold a direction, such as Duck. A `primary` one is the big round action button.  `keys` are the keyboard keys that do the same. */
  holds?: { labelKey: MessageKey; dx: number; dy: number; keys: string[]; primary?: boolean }[];
  /** Tap buttons that send a one-off move. `keys` are the keyboard keys that do the same. */
  actions: { name: string; labelKey: MessageKey; keys: string[] }[];
  /** For single-button games: tapping the arena itself does this action too, so a thumb can tap anywhere. */
  tapAction?: string;
  /** Like `tapAction`, but the arena works as a held button: pressing it holds this direction until let go. */
  tapHold?: [number, number];
  /** For games where the play space is the controller: targets on the arena itself that a tap (or a key)
   * hits, with no buttons or pad underneath. A game uses this instead of `pad`, `holds` and `actions`, not
   * alongside them. The game draws its own targets where they are declared; the kit lights the one that
   * was just tapped. See taps.ts. */
  taps?: TapTargets;
  /** The game's name, shown in the lobby panel. */
  nameKey: MessageKey;
  /** A short tagline for the game card. */
  taglineKey: MessageKey;
  /** One line telling people what to do. */
  hintKey: MessageKey;
  draw(args: LobbyDrawArgs<S>): void;
  standings(snapshot: S): LobbyStanding[];
}

export const LOBBY_GAME_VIEWS: { [K in LobbyGameId]: LobbyGameView<Extract<LobbyGameSnapshot, { id: K }>> } = {
  runner: runnerView,
  flappy: flappyView,
  dodge: dodgeView,
  rope: ropeView,
  redlight: redLightView,
  coins: coinsView,
  battleships: battleshipsView,
  race: raceView,
  whack: whackView,
};

/** The view for whichever game a snapshot belongs to. */
export function viewFor(snapshot: LobbyGameSnapshot): LobbyGameView {
  return LOBBY_GAME_VIEWS[snapshot.id] as unknown as LobbyGameView;
}
