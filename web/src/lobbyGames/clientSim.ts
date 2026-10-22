import { createLobbyGame, type LobbyClientMessage, type LobbyGame, type LobbyGameId, type LobbySnapshot } from '@queueup/shared';

/** The local copy of a run moves in steps this long, the same as the server's own steps. */
const FIXED_DT = 1 / 60;
/** How often a client reports its player to the server. */
const REPORT_EVERY_MS = 50;
/** The most steps one frame will catch up (about 5 minutes of a run), so a stalled tab cannot hang. */
const MAX_CATCH_UP_STEPS = 20_000;

/** Lines this device's clock up with the server's, so everyone starts a run at the same moment however
 * long their connection takes. Ping the server a few times; the answer that came back quickest says the
 * most (the least time for the clocks to disagree in), so that is the one used. */
export class ClockSync {
  private samples: { rtt: number; offset: number }[] = [];
  private offset = 0;

  /** True once at least one answer has come back. */
  get ready(): boolean {
    return this.samples.length > 0;
  }

  /** `sentAt` and `receivedAt` are this device's `performance.now()` for the ping and its answer, and
   * `serverNow` is the server's clock in the answer. The server read its clock about half the round trip
   * after the ping was sent. */
  sample(sentAt: number, receivedAt: number, serverNow: number): void {
    const rtt = receivedAt - sentAt;
    if (!(rtt >= 0) || !Number.isFinite(serverNow)) return;
    this.samples.push({ rtt, offset: serverNow + rtt / 2 - receivedAt });
    if (this.samples.length > 8) this.samples.shift();
    this.offset = this.samples.reduce((best, s) => (s.rtt < best.rtt ? s : best)).offset;
  }

  /** The round trip to the server, in ms, as of the quickest answer so far (0 until one has come back). */
  get rtt(): number {
    return this.samples.length > 0 ? this.samples.reduce((best, s) => (s.rtt < best.rtt ? s : best)).rtt : 0;
  }

  /** The server's clock now, given this device's `performance.now()`. */
  serverNow(perfNow: number): number {
    return perfNow + this.offset;
  }
}

/** A snapshot's game, as far as this needs to know about it. */
interface GameView {
  id: LobbyGameId;
  phase: string;
  run: number;
  timerMs: number;
  winnerId: string | null;
  history: unknown[];
  best: unknown;
  players: { id: string; alive: boolean; wins: number; x?: number }[];
}

/** For a game that runs each player on their own device (`LobbyGame.clientSim`): keeps a one-person copy
 * of the run going here, from the seed and start time the server sent, so this player's jumps and hits
 * happen the moment they press, whatever the ping. It reports the player to the server, and shows
 * everyone else from what the server sends back.
 *
 * - The server still decides when a run starts and ends, who is in, and who won.
 * - Each run is started from the server's seed at the server's start time, mapped to this device's clock,
 *   so every device has the same course at the same moment. Joining late catches the copy up.
 * - A game the server does not run this way (or an older server) gives no `sim`, and `frame` passes the
 *   server's snapshot through unchanged, with `input` and `action` left for the caller to send. */
export class ClientSim {
  private server: LobbySnapshot | null = null;
  private local: LobbyGame | null = null;
  private localId: LobbyGameId | null = null;
  /** The run the server has told us about, and when it starts (server clock). */
  private pending: { run: number; seed: number; startAt: number } | null = null;
  private startedRun = -1;
  /** Whether this person is in the run (not someone who arrived part way through it). */
  private participating = false;
  private lastReportAt = -Infinity;
  private lastReportedAlive = true;
  /** The direction held now, so a key already down when the run starts still counts. */
  private held = { dx: 0, dy: 0 };

  constructor(
    private readonly me: string,
    private readonly clock: ClockSync,
    private readonly send: (message: LobbyClientMessage) => void,
    /** The server works this player out itself (a practice lobby): the copy here is only for drawing, so presses are
     * still sent to the server and nothing is reported. */
    private readonly serverRuns = false,
  ) {}

  /** A snapshot arrived from the server. */
  onState(snapshot: LobbySnapshot): void {
    this.server = snapshot;
    const id = snapshot.game.id;
    if (this.localId !== id) {
      this.localId = id;
      this.local = null;
      this.pending = null;
      this.startedRun = -1;
      const game = createLobbyGame(id);
      if (game.clientSim) {
        game.join(this.me);
        this.local = game;
      }
    }
    const sim = snapshot.sim;
    if (sim && snapshot.clock !== undefined && this.local && this.pending?.run === sim.run && this.startedRun !== sim.run) {
      // Not started yet: a later snapshot can be a little more exact (the first one after connecting can be
      // up to a tick out of date), so take the latest reading of when it starts.
      this.pending.startAt = snapshot.clock + sim.startInMs;
    } else if (sim && snapshot.clock !== undefined && this.local && this.pending?.run !== sim.run) {
      this.pending = { run: sim.run, seed: sim.seed, startAt: snapshot.clock + sim.startInMs };
      const mine = (snapshot.game.players as GameView['players']).find((p) => p.id === this.me);
      // In the run if there for its countdown; someone who arrives part way through only watches.
      this.participating = !!mine && (snapshot.game.phase === 'countdown' || mine.alive);
    }
  }

  /** Whether this device is working out the player's movement right now. */
  private get running(): boolean {
    return this.local !== null && this.pending !== null && this.startedRun === this.pending.run && this.participating;
  }

  /** The direction the person holds. True if the copy here took it, false if the server should be told. */
  input(dx: number, dy: number): boolean {
    this.held = { dx, dy };
    if (!this.local || !this.pending) return false;
    if (this.running) this.local.input(this.me, dx, dy);
    return !this.serverRuns;
  }

  /** For a practice run (the server also works the player out): where in the run this device's copy is, and which run, to send with a press
   * so the server applies it at that same moment. Read right after `input` or `action`, before the copy moves on. Undefined when the
   * copy is not running. */
  stamp(): { run: number; at: number } | undefined {
    if (!this.serverRuns || !this.running || !this.pending || this.local?.runMs === undefined) return undefined;
    return { run: this.pending.run, at: this.local.runMs };
  }

  /** A tap on one of the game's arena targets. True if the copy here took it (a game the device works out, in a room), false if the server should
   * be told (any other game, or a practice run, where the server also works it out: send `stamp()` with it). */
  tap(target: number): boolean {
    if (!this.local || !this.pending) return false;
    if (this.running) this.local.tap?.(this.me, target);
    return !this.serverRuns;
  }

  /** A one-off move such as a jump. True if the copy here took it, false if the server should be told. */
  action(name: string): boolean {
    if (!this.local || !this.pending) return false;
    if (this.running) this.local.action(this.me, name);
    return !this.serverRuns;
  }

  /** The snapshot to draw at `perfNow` (this device's `performance.now()`): the server's, with this
   * player, the course and the run's pace taken from the local copy. Also sends the report that is due. */
  frame(perfNow: number): LobbySnapshot | null {
    const server = this.server;
    if (!server) return null;
    const local = this.local;
    const pending = this.pending;
    if (!local || !pending || !this.clock.ready) return server;
    const game = server.game as unknown as GameView;
    const now = this.clock.serverNow(perfNow);

    if (this.startedRun !== pending.run && now >= pending.startAt && (game.phase === 'countdown' || game.phase === 'playing') && game.run === pending.run) {
      local.startRunAt?.(pending.seed);
      // A game that seats its players (Fishing) is told where the server put this one.
      const seat = game.players.find((p) => p.id === this.me)?.x;
      if (seat !== undefined) local.seat?.(this.me, seat);
      this.startedRun = pending.run;
      this.lastReportAt = -Infinity;
      this.lastReportedAlive = true;
      if (this.participating) local.input(this.me, this.held.dx, this.held.dy);
    }
    if (this.startedRun !== pending.run || game.run !== pending.run || game.phase === 'lobby') return server;

    // Bring the copy up to now: the run is `now - startAt` ms old, in the same fixed steps the server uses.
    if (game.phase === 'countdown' || game.phase === 'playing') {
      const target = now - pending.startAt;
      for (let i = 0; i < MAX_CATCH_UP_STEPS && (local.runMs ?? 0) + FIXED_DT * 1000 <= target; i++) local.stepRun?.(FIXED_DT);
    }
    if (this.participating && !this.serverRuns) this.report(perfNow, game);
    return this.compose(server, game);
  }

  /** Sends where this player is, about 20 times a second, and at once when they are out; stops when the
   * server shows them out. */
  private report(perfNow: number, game: GameView): void {
    if (game.phase !== 'countdown' && game.phase !== 'playing') return;
    if (game.players.find((p) => p.id === this.me)?.alive === false) return;
    const report = this.local?.localReport?.(this.me);
    if (!report) return;
    if (perfNow - this.lastReportAt < REPORT_EVERY_MS && report.alive === this.lastReportedAlive) return;
    this.lastReportAt = perfNow;
    this.lastReportedAlive = report.alive;
    this.send({ t: 'report', run: game.run, alive: report.alive, f: report.f });
  }

  /** The server's snapshot with the local copy's course and this player laid over it. */
  private compose(server: LobbySnapshot, game: GameView): LobbySnapshot {
    const mine = this.local?.snapshot() as unknown as { players: GameView['players'] };
    const players = game.players.map((p) => {
      if (p.id !== this.me || !this.participating) return p;
      const own = mine.players.find((q) => q.id === this.me);
      // Out here is out: the server may not have heard yet. Out there is out too (it may have timed us out).
      return own ? { ...own, wins: p.wins, alive: own.alive && p.alive } : p;
    });
    // The server decides when the run starts: ahead of it, this device has already begun (it saw the same
    // start time a moment sooner), so show the run as on.
    const phase = game.phase === 'countdown' ? 'playing' : game.phase;
    return {
      ...server,
      game: {
        ...(mine as object),
        phase,
        timerMs: phase === 'playing' ? 0 : game.timerMs,
        winnerId: game.winnerId,
        run: game.run,
        history: game.history,
        best: game.best,
        players,
      } as unknown as LobbySnapshot['game'],
    };
  }
}
