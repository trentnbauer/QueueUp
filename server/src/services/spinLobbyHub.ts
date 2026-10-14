import { LOBBY_TICK_HZ, type LobbyServerMessage } from '@queueup/shared';
import { SpinLobby } from './spinLobby.js';

/** The part of a WebSocket the hub needs. */
export interface LobbySocket {
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export interface SpinLobbyDeps {
  /** A spin is sitting in the room's waiting room. */
  isSpinWaiting(roomId: string): Promise<boolean>;
  /** Keep that waiting room open; false once the spin is no longer waiting. */
  extendWaitingRoom(roomId: string): Promise<boolean>;
  /** End the waiting room now. */
  startSpinNow(roomId: string): Promise<void>;
}

interface RoomState {
  lobby: SpinLobby;
  sockets: Map<LobbySocket, string>;
  timer: ReturnType<typeof setInterval> | null;
  lastTickAt: number;
  ticks: number;
  spinWaiting: boolean;
  checking: boolean;
}

// A client sends a message when the direction they hold changes or they vote, and (in a game that runs
// each player on their own device) about 20 reports a second plus a few pings: well under this. Anything
// faster is dropped rather than processed.
const MAX_MESSAGES_PER_SECOND = 80;
// Open lobby connections one person may hold in a room (tabs and devices).
const MAX_CONNECTIONS_PER_USER = 5;
// How often the lobby asks whether a spin is waiting (and keeps its waiting room open).
const SPIN_CHECK_EVERY_TICKS = LOBBY_TICK_HZ * 2;

/** All the rooms' live lobbies: one `SpinLobby` per room that has someone in it, driven by a timer
 * that exists only while someone is connected. While a spin is waiting for members, the lobby holds
 * its waiting room open and starts it once more than half of the members in the lobby vote to. */
export class SpinLobbyHub {
  private readonly rooms = new Map<string, RoomState>();
  private readonly rate = new WeakMap<LobbySocket, { windowStart: number; count: number }>();

  constructor(
    private readonly deps: SpinLobbyDeps,
    private readonly options: { autoTick?: boolean; now?: () => number } = {},
  ) {}

  private now(): number {
    return (this.options.now ?? Date.now)();
  }

  hasMembers(roomId: string): boolean {
    return (this.rooms.get(roomId)?.lobby.size ?? 0) > 0;
  }

  isPresent(roomId: string, userId: string): boolean {
    return this.rooms.get(roomId)?.lobby.present.includes(userId) ?? false;
  }

  connect(roomId: string, userId: string, socket: LobbySocket): void {
    let room = this.rooms.get(roomId);
    // A few tabs is normal; more is a runaway client or abuse.
    if (room && [...room.sockets.values()].filter((id) => id === userId).length >= MAX_CONNECTIONS_PER_USER) {
      socket.close(1013, 'Too many connections');
      return;
    }
    if (!room) {
      room = { lobby: new SpinLobby(), sockets: new Map(), timer: null, lastTickAt: this.now(), ticks: 0, spinWaiting: false, checking: false };
      this.rooms.set(roomId, room);
      if (this.options.autoTick !== false) {
        const state = room;
        state.timer = setInterval(() => void this.tickRoom(roomId), Math.round(1000 / LOBBY_TICK_HZ));
        state.timer.unref();
      }
    }
    room.lobby.join(userId);
    room.sockets.set(socket, userId);
    // Look straight away rather than waiting for the next check, so a vote button shows at once.
    void this.refreshSpin(roomId);
    this.send(socket, room.lobby.snapshot(room.spinWaiting, this.now(), userId));
  }

  disconnect(roomId: string, socket: LobbySocket): void {
    const room = this.rooms.get(roomId);
    const userId = room?.sockets.get(socket);
    if (!room || userId === undefined) return;
    room.sockets.delete(socket);
    room.lobby.leave(userId);
    if (room.sockets.size === 0) {
      if (room.timer) clearInterval(room.timer);
      this.rooms.delete(roomId);
    }
  }

  /** Closes every connection a person has to a room's lobby (they were removed from the room). Membership is
   * only checked when a connection opens, so without this a removed member keeps seeing and voting in it. */
  kick(roomId: string, userId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    for (const [socket, id] of [...room.sockets]) {
      if (id !== userId) continue;
      this.disconnect(roomId, socket);
      this.closeSocket(socket, 'Removed from the room');
    }
  }

  /** Closes every connection to a room's lobby (the room was deleted). */
  closeRoom(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;
    for (const socket of [...room.sockets.keys()]) {
      this.disconnect(roomId, socket);
      this.closeSocket(socket, 'Room closed');
    }
  }

  private closeSocket(socket: LobbySocket, reason: string): void {
    try {
      socket.close(1008, reason);
    } catch {
      // Already closing.
    }
  }

  /** A raw message from a socket. Malformed or unknown messages are ignored. */
  message(roomId: string, socket: LobbySocket, raw: string): void {
    const room = this.rooms.get(roomId);
    const userId = room?.sockets.get(socket);
    if (!room || userId === undefined) return;
    const now = this.now();
    const rate = this.rate.get(socket) ?? { windowStart: now, count: 0 };
    if (now - rate.windowStart >= 1000) {
      rate.windowStart = now;
      rate.count = 0;
    }
    rate.count++;
    this.rate.set(socket, rate);
    if (rate.count > MAX_MESSAGES_PER_SECOND) return;

    let msg: unknown;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (!msg || typeof msg !== 'object') return;
    const m = msg as Record<string, unknown>;
    if (m.t === 'input') room.lobby.setInput(userId, m.dx, m.dy);
    else if (m.t === 'action') room.lobby.action(userId, m.name);
    else if (m.t === 'tap') room.lobby.tap(userId, m.target);
    else if (m.t === 'report') room.lobby.report(userId, m.run, m.alive, m.f);
    else if (m.t === 'ping' && typeof m.c === 'number' && Number.isFinite(m.c)) this.send(socket, { t: 'pong', c: m.c, s: now });
    else if (m.t === 'vote' && typeof m.on === 'boolean') room.lobby.vote(userId, m.on);
  }

  /** A vote from outside the socket (the "start now" button's HTTP call). False when the person is
   * not in the lobby, so they cannot vote for it. */
  castVote(roomId: string, userId: string, on: boolean): boolean {
    const room = this.rooms.get(roomId);
    if (!room || !room.lobby.present.includes(userId)) return false;
    room.lobby.vote(userId, on);
    return true;
  }

  /** One step of a room's lobby: move everyone, send the snapshot, and (every couple of seconds)
   * check on the spin. Exposed so tests can drive it. */
  async tickRoom(roomId: string): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) return;
    const now = this.now();
    room.lobby.tick(now - room.lastTickAt);
    room.lastTickAt = now;
    room.ticks++;

    if (room.spinWaiting && room.lobby.votePassed) {
      room.spinWaiting = false;
      try {
        await this.deps.startSpinNow(roomId);
      } catch {
        // A database hiccup must not escape the timer as an unhandled rejection (which ends the process).
        // The votes stay, and the next spin check finds the spin still waiting and tries again.
        return;
      }
      this.broadcast(room, { t: 'started' });
      for (const userId of room.lobby.present) room.lobby.vote(userId, false);
      return;
    }

    if (room.ticks % SPIN_CHECK_EVERY_TICKS === 0) void this.refreshSpin(roomId);
    this.broadcastState(room, room.spinWaiting);
  }

  /** Asks whether a spin is waiting, holds its waiting room open if so, and tells the lobby when it
   * has started (someone went to it by another route, or everyone was ready). */
  private async refreshSpin(roomId: string): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room || room.checking) return;
    room.checking = true;
    try {
      const was = room.spinWaiting;
      const waiting = was ? await this.deps.extendWaitingRoom(roomId) : await this.deps.isSpinWaiting(roomId);
      if (this.rooms.get(roomId) !== room) return;
      room.spinWaiting = waiting;
      if (was && !waiting) this.broadcast(room, { t: 'started' });
      else if (!was && waiting) this.broadcastState(room, true);
    } catch {
      // A hiccup reading the spin should not take the lobby down; the next check tries again.
    } finally {
      room.checking = false;
    }
  }

  /** The game's state to everyone in the room, each person's own view of it (for games with hidden things). */
  private broadcastState(room: RoomState, spinWaiting: boolean): void {
    const now = this.now();
    for (const [socket, userId] of room.sockets) this.send(socket, room.lobby.snapshot(spinWaiting, now, userId));
  }

  private broadcast(room: RoomState, message: LobbyServerMessage): void {
    const data = JSON.stringify(message);
    for (const socket of room.sockets.keys()) this.sendRaw(socket, data);
  }

  private send(socket: LobbySocket, message: LobbyServerMessage): void {
    this.sendRaw(socket, JSON.stringify(message));
  }

  private sendRaw(socket: LobbySocket, data: string): void {
    try {
      socket.send(data);
    } catch {
      // A socket that is closing; its close handler removes it.
    }
  }
}
