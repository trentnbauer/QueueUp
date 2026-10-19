import { LOBBY_GAME_IDS, type LobbyGameId } from '../spinLobby.js';
import { AsteroidsGame } from './asteroids.js';
import { BattleshipsGame } from './battleships.js';
import { withBots } from './bots.js';
import { CoinsGame } from './coins.js';
import { DodgeGame } from './dodge.js';
import { DrawGame } from './draw.js';
import { FlappyGame } from './flappy.js';
import { MemoryGame } from './memory.js';
import { RaceGame } from './race.js';
import { RopeGame } from './rope.js';
import { RunnerGame } from './runner.js';
import { LavaGame } from './lava.js';
import { SnakeGame } from './snake.js';
import { GravityGame } from './gravity.js';
import { LaserGame } from './laser.js';
import { ColorMatchGame } from './colormatch.js';
import { TiltGame } from './tilt.js';
import { StackerGame } from './stacker.js';
import { SumoGame } from './sumo.js';
import { WhackGame } from './whack.js';
import { WordsGame } from './words.js';
import { LobbyRecord, secureRandom } from './roundGame.js';
import type { LobbyGame } from './types.js';

export type { BotBrain, BotCommand, LobbyGame } from './types.js';
export { LobbyRecord, secureRandom } from './roundGame.js';
export { BattleshipsGame, CoinsGame, DodgeGame, FlappyGame, RaceGame, RopeGame, RunnerGame, WhackGame, DrawGame, TiltGame, StackerGame, SumoGame, AsteroidsGame, MemoryGame, WordsGame, LavaGame, SnakeGame, GravityGame, LaserGame, ColorMatchGame };
export { BotFiller, botColor, botNumber, isBotId, withBots } from './bots.js';

/** Starts a fresh game of the given kind, with bots added by the lobby when it needs more players than
 * are in it (see bots.ts). Add new games in `build`. */
export function createLobbyGame(id: LobbyGameId, record?: LobbyRecord): LobbyGame {
  return withBots(build(id, record));
}

function build(id: LobbyGameId, record?: LobbyRecord): LobbyGame {
  switch (id) {
    case 'runner':
      return new RunnerGame(undefined, record);
    case 'flappy':
      return new FlappyGame(undefined, record);
    case 'dodge':
      return new DodgeGame(undefined, record);
    case 'rope':
      return new RopeGame(undefined, record);
    case 'coins':
      return new CoinsGame(undefined, record);
    case 'battleships':
      return new BattleshipsGame(undefined, record);
    case 'race':
      return new RaceGame(undefined, record);
    case 'whack':
      return new WhackGame(undefined, record);
    case 'draw':
      return new DrawGame(undefined, record);
    case 'tilt':
      return new TiltGame(undefined, record);
    case 'stacker':
      return new StackerGame(undefined, record);
    case 'sumo':
      return new SumoGame(undefined, record);
    case 'asteroids':
      return new AsteroidsGame(undefined, record);
    case 'memory':
      return new MemoryGame(undefined, record);
    case 'words':
      return new WordsGame(undefined, record);
    case 'lava':
      return new LavaGame(undefined, record);
    case 'snake':
      return new SnakeGame(undefined, record);
    case 'gravity':
      return new GravityGame(undefined, record);
    case 'laser':
      return new LaserGame(undefined, record);
    case 'colormatch':
      return new ColorMatchGame(undefined, record);
  }
}

/** How likely each game is to come up, from how many times each has been played (missing means none): a game
 * played less is likelier. A game's weight is 1 / (1 + plays / (the average plays + 1)), which is 1 for a game
 * nobody has played and falls toward (but never reaches) 0 as it is played far more than the others, and does not
 * depend on how big the counts are. With no counts at all every game weighs the same. */
export function lobbyPickWeights(plays: Partial<Record<LobbyGameId, number>>): Record<LobbyGameId, number> {
  const count = (id: LobbyGameId) => Math.max(0, plays[id] ?? 0);
  const mean = LOBBY_GAME_IDS.reduce((sum, id) => sum + count(id), 0) / LOBBY_GAME_IDS.length;
  return Object.fromEntries(LOBBY_GAME_IDS.map((id) => [id, 1 / (1 + count(id) / (mean + 1))])) as Record<LobbyGameId, number>;
}

/** Which game a new lobby opens with, picked at random: evenly, or (with `weights`) leaning toward the games with a
 * bigger weight. A game with no weight given weighs 1. Never `not` (the game just played), whenever there is another. */
export function pickLobbyGame(random: () => number = secureRandom, not?: LobbyGameId, weights?: Partial<Record<LobbyGameId, number>>): LobbyGameId {
  // After a run the lobby moves on to a different game, whenever there is one to move to.
  const choices = LOBBY_GAME_IDS.filter((id) => id !== not);
  const from = choices.length > 0 ? choices : LOBBY_GAME_IDS;
  const weight = (id: LobbyGameId) => Math.max(0, weights?.[id] ?? 1) || 0;
  const total = from.reduce((sum, id) => sum + weight(id), 0);
  if (!(total > 0)) return from[Math.floor(random() * from.length)];
  let at = random() * total;
  for (const id of from) {
    at -= weight(id);
    if (at < 0) return id;
  }
  return from[from.length - 1];
}
