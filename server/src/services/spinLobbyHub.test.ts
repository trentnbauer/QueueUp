import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SPIN_IDLE_KICK_MS, SpinLobbyHub, type LobbySocket } from './spinLobbyHub.js';
import { SpinLobby } from './spinLobby.js';

function fakeSocket() {
  const sent: Record<string, unknown>[] = [];
  const socket: LobbySocket = { send: (d) => void sent.push(JSON.parse(d)), close: vi.fn() };
  return { socket, sent, last: () => sent[sent.length - 1] };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

let waiting = false;
const deps = {
  isSpinWaiting: vi.fn(async () => waiting),
  extendWaitingRoom: vi.fn(async () => waiting),
  startSpinNow: vi.fn(async () => {
    waiting = false;
  }),
};

function makeHub() {
  let t = 1000;
  const hub = new SpinLobbyHub(deps, { autoTick: false, now: () => (t += 66) });
  return hub;
}

beforeEach(() => {
  vi.clearAllMocks();
  waiting = false;
});

describe('SpinLobbyHub', () => {
  it('runs a lobby with no spin: players move, votes do nothing', async () => {
    const hub = makeHub();
    const a = fakeSocket();
    hub.connect('r1', 'a', a.socket);
    await flush();
    hub.message('r1', a.socket, JSON.stringify({ t: 'input', dx: 1, dy: 0 }));
    hub.message('r1', a.socket, JSON.stringify({ t: 'vote', on: true }));
    await hub.tickRoom('r1');
    expect(a.last()).toMatchObject({ t: 'state', spinWaiting: false });
    expect(deps.startSpinNow).not.toHaveBeenCalled();
  });

  it('starts the spin once more than half of the members in the lobby vote', async () => {
    const hub = makeHub();
    waiting = true;
    const [a, b, c] = [fakeSocket(), fakeSocket(), fakeSocket()];
    hub.connect('r1', 'a', a.socket);
    hub.connect('r1', 'b', b.socket);
    hub.connect('r1', 'c', c.socket);
    await flush();
    expect(a.last()).toMatchObject({ spinWaiting: true });

    hub.message('r1', a.socket, JSON.stringify({ t: 'vote', on: true }));
    await hub.tickRoom('r1');
    expect(deps.startSpinNow).not.toHaveBeenCalled();

    hub.message('r1', b.socket, JSON.stringify({ t: 'vote', on: true }));
    await hub.tickRoom('r1');
    expect(deps.startSpinNow).toHaveBeenCalledWith('r1');
    expect(c.last()).toEqual({ t: 'started' });
  });

  it('closes a removed member\'s connections, and their vote goes with them', async () => {
    const hub = makeHub();
    waiting = true;
    const [a, b] = [fakeSocket(), fakeSocket()];
    hub.connect('r1', 'a', a.socket);
    hub.connect('r1', 'b', b.socket);
    await flush();
    hub.message('r1', a.socket, JSON.stringify({ t: 'vote', on: true }));
    hub.kick('r1', 'a');
    expect(a.socket.close).toHaveBeenCalled();
    expect(b.socket.close).not.toHaveBeenCalled();
    expect(hub.isPresent('r1', 'a')).toBe(false);
    hub.message('r1', a.socket, JSON.stringify({ t: 'vote', on: true }));
    await hub.tickRoom('r1');
    expect(deps.startSpinNow).not.toHaveBeenCalled();
    hub.closeRoom('r1');
    expect(b.socket.close).toHaveBeenCalled();
    expect(hub.hasMembers('r1')).toBe(false);
  });

  it('survives the spin failing to start, and tries again on the next check', async () => {
    const hub = makeHub();
    waiting = true;
    const a = fakeSocket();
    hub.connect('r1', 'a', a.socket);
    await flush();
    deps.startSpinNow.mockRejectedValueOnce(new Error('db down'));
    hub.message('r1', a.socket, JSON.stringify({ t: 'vote', on: true }));
    await expect(hub.tickRoom('r1')).resolves.toBeUndefined();
    expect(a.sent.some((m) => m.t === 'started')).toBe(false);
    // The next spin check sees it still waiting; the vote is still there, so the next tick starts it.
    for (let i = 0; i < 40 && !a.sent.some((m) => m.t === 'started'); i++) {
      await hub.tickRoom('r1');
      await flush();
    }
    expect(a.sent.some((m) => m.t === 'started')).toBe(true);
  });

  it('does not count members who are not in the lobby', async () => {
    const hub = makeHub();
    waiting = true;
    const a = fakeSocket();
    hub.connect('r1', 'a', a.socket); // the other room members never joined
    await flush();
    hub.message('r1', a.socket, JSON.stringify({ t: 'vote', on: true }));
    await hub.tickRoom('r1');
    expect(deps.startSpinNow).toHaveBeenCalledTimes(1);
  });

  it('only lets a person in the lobby vote from outside the socket', () => {
    const hub = makeHub();
    const a = fakeSocket();
    hub.connect('r1', 'a', a.socket);
    expect(hub.castVote('r1', 'a', true)).toBe(true);
    expect(hub.castVote('r1', 'stranger', true)).toBe(false);
    expect(hub.castVote('nope', 'a', true)).toBe(false);
  });

  it('tells the lobby when the spin starts some other way', async () => {
    const hub = makeHub();
    waiting = true;
    const a = fakeSocket();
    hub.connect('r1', 'a', a.socket);
    await flush();
    waiting = false; // everyone was ready, so the spin began
    for (let i = 0; i < 31; i++) await hub.tickRoom('r1');
    await flush();
    expect(a.sent.some((m) => m.t === 'started')).toBe(true);
  });

  it('refuses a sixth connection from one person', () => {
    const hub = makeHub();
    const sockets = Array.from({ length: 6 }, () => fakeSocket());
    sockets.forEach((s) => hub.connect('r1', 'a', s.socket));
    expect(sockets[5].socket.close).toHaveBeenCalled();
    expect(sockets[4].socket.close).not.toHaveBeenCalled();
    hub.disconnect('r1', sockets[5].socket); // never joined: harmless
    expect(hub.isPresent('r1', 'a')).toBe(true);
  });

  it('forgets a room when its last socket closes, and ignores junk and floods', async () => {
    const hub = makeHub();
    const a = fakeSocket();
    hub.connect('r1', 'a', a.socket);
    hub.message('r1', a.socket, 'not json');
    hub.message('r1', a.socket, JSON.stringify([1, 2]));
    hub.message('r1', a.socket, JSON.stringify({ t: 'vote', on: 'yes' }));
    for (let i = 0; i < 200; i++) hub.message('r1', a.socket, JSON.stringify({ t: 'input', dx: 1, dy: 0 }));
    hub.disconnect('r1', a.socket);
    expect(hub.hasMembers('r1')).toBe(false);
  });

  it('sends each connection the game as that person should see it', async () => {
    const hub = makeHub();
    const a = fakeSocket();
    const b = fakeSocket();
    hub.connect('r1', 'a', a.socket);
    hub.connect('r1', 'b', b.socket);
    const snapshot = vi.spyOn(SpinLobby.prototype, 'snapshot');
    await hub.tickRoom('r1');
    const viewers = snapshot.mock.calls.map((call) => call[2]).filter((v) => v !== undefined);
    expect(viewers.sort()).toEqual(['a', 'b']);
    // Each socket got one state, and they were made one per person (not one shared message).
    expect(a.last().t).toBe('state');
    expect(b.last().t).toBe('state');
    snapshot.mockRestore();
  });

  it('answers a ping with its own clock, to that socket only', () => {
    const hub = makeHub();
    const a = fakeSocket();
    const b = fakeSocket();
    hub.connect('r1', 'a', a.socket);
    hub.connect('r1', 'b', b.socket);
    const before = b.sent.length;
    hub.message('r1', a.socket, JSON.stringify({ t: 'ping', c: 1234.5 }));
    const pong = a.last();
    expect(pong).toMatchObject({ t: 'pong', c: 1234.5 });
    expect(typeof pong.s).toBe('number');
    expect(b.sent.length).toBe(before);
    // A ping that is not a number gets no answer.
    const count = a.sent.length;
    hub.message('r1', a.socket, JSON.stringify({ t: 'ping', c: 'x' }));
    hub.message('r1', a.socket, JSON.stringify({ t: 'ping' }));
    expect(a.sent.length).toBe(count);
  });

  it('takes reports and sends the clock with snapshots, and does not fall over on bad ones', async () => {
    const hub = makeHub();
    const a = fakeSocket();
    hub.connect('r1', 'a', a.socket);
    for (const bad of [{ t: 'report' }, { t: 'report', run: 1, alive: 'x', f: 5 }, { t: 'report', run: 1, alive: true, f: { h: 1 } }]) {
      hub.message('r1', a.socket, JSON.stringify(bad));
    }
    await hub.tickRoom('r1');
    expect(a.last().t).toBe('state');
    expect(hub.isPresent('r1', 'a')).toBe(true);
  });

  describe('open lobbies', () => {
    it('stays open until everyone has left, then says so', async () => {
      const onEmpty = vi.fn();
      const hub = new SpinLobbyHub({ ...deps, onEmpty }, { autoTick: false });
      const [a, b] = [fakeSocket(), fakeSocket()];
      hub.connect('lobby:x', 'a', a.socket);
      hub.connect('lobby:x', 'b', b.socket);
      hub.disconnect('lobby:x', a.socket);
      expect(onEmpty).not.toHaveBeenCalled();
      expect(hub.presentIds('lobby:x')).toEqual(['b']);
      hub.disconnect('lobby:x', b.socket);
      expect(onEmpty).toHaveBeenCalledWith('lobby:x');
      expect(hub.hasMembers('lobby:x')).toBe(false);
    });

    it('plays the one game it was opened with, and never looks for a spin', async () => {
      const hub = makeHub();
      const a = fakeSocket();
      hub.connect('lobby:x', 'a', a.socket, { game: 'dodge' });
      await flush();
      await hub.tickRoom('lobby:x');
      expect(a.last()).toMatchObject({ t: 'state', spinWaiting: false, game: { id: 'dodge' } });
      expect(deps.isSpinWaiting).not.toHaveBeenCalled();
    });

    it('records each real player\'s score as a lobby run', async () => {
      const recordScores = vi.fn();
      let t = 1000;
      const hub = new SpinLobbyHub({ ...deps, recordScores }, { autoTick: false, now: () => (t += 250) });
      const a = fakeSocket();
      hub.connect('lobby:x', 'a', a.socket, { game: 'dodge' });
      for (let i = 0; i < 1000 && recordScores.mock.calls.length === 0; i++) await hub.tickRoom('lobby:x');
      expect(recordScores).toHaveBeenCalled();
      const [key, game, source, scores] = recordScores.mock.calls[0];
      expect([key, game, source]).toEqual(['lobby:x', 'dodge', 'lobby']);
      expect(scores[0].userId).toBe('a');
    });
  });
});

describe('SpinLobbyHub idle kick', () => {
  function clockHub() {
    const clock = { t: 1000 };
    const hub = new SpinLobbyHub(deps, { autoTick: false, now: () => clock.t });
    return { hub, clock };
  }
  const send = (hub: SpinLobbyHub, s: ReturnType<typeof fakeSocket>, m: object) => hub.message('r1', s.socket, JSON.stringify(m));

  it('drops a member who does nothing while a spin waits, and the others can then pass the vote', async () => {
    const { hub, clock } = clockHub();
    waiting = true;
    const [a, b, c] = [fakeSocket(), fakeSocket(), fakeSocket()];
    hub.connect('r1', 'a', a.socket);
    hub.connect('r1', 'b', b.socket);
    hub.connect('r1', 'c', c.socket);
    await flush();
    clock.t += SPIN_IDLE_KICK_MS - 1000;
    send(hub, a, { t: 'vote', on: true });
    send(hub, b, { t: 'tap', target: 0 });
    clock.t += 1000;
    await hub.tickRoom('r1');
    expect(c.socket.close).toHaveBeenCalledWith(1008, 'Idle');
    expect(a.socket.close).not.toHaveBeenCalled();
    expect(b.socket.close).not.toHaveBeenCalled();
    expect(hub.presentIds('r1').sort()).toEqual(['a', 'b']);
  });

  it('ignores pings, repeated inputs and unchanged reports', async () => {
    const { hub, clock } = clockHub();
    waiting = true;
    const a = fakeSocket();
    hub.connect('r1', 'a', a.socket);
    hub.connect('r1', 'b', fakeSocket().socket);
    await flush();
    send(hub, a, { t: 'input', dx: 0, dy: 0 });
    send(hub, a, { t: 'report', run: 1, alive: true, f: { x: 1 } });
    clock.t += SPIN_IDLE_KICK_MS - 1;
    send(hub, a, { t: 'ping', c: 1 });
    send(hub, a, { t: 'input', dx: 0, dy: 0 });
    send(hub, a, { t: 'report', run: 1, alive: true, f: { x: 1 } });
    clock.t += 1;
    await hub.tickRoom('r1');
    expect(a.socket.close).toHaveBeenCalledWith(1008, 'Idle');
  });

  it('counts a changed report as movement', async () => {
    const { hub, clock } = clockHub();
    waiting = true;
    const a = fakeSocket();
    hub.connect('r1', 'a', a.socket);
    await flush();
    send(hub, a, { t: 'report', run: 1, alive: true, f: { x: 1 } });
    clock.t += SPIN_IDLE_KICK_MS - 1;
    send(hub, a, { t: 'report', run: 1, alive: true, f: { x: 2 } });
    clock.t += 1;
    await hub.tickRoom('r1');
    expect(a.socket.close).not.toHaveBeenCalled();
  });

  it('never drops someone holding a direction', async () => {
    const { hub, clock } = clockHub();
    waiting = true;
    const a = fakeSocket();
    hub.connect('r1', 'a', a.socket);
    await flush();
    send(hub, a, { t: 'input', dx: 1, dy: 0 });
    for (let i = 0; i < 5; i++) {
      clock.t += SPIN_IDLE_KICK_MS;
      await hub.tickRoom('r1');
    }
    expect(a.socket.close).not.toHaveBeenCalled();
  });

  it('does not drop anyone when no spin is waiting, and starts the clock when one begins', async () => {
    const { hub, clock } = clockHub();
    const a = fakeSocket();
    hub.connect('r1', 'a', a.socket);
    await flush();
    clock.t += SPIN_IDLE_KICK_MS * 3;
    await hub.tickRoom('r1');
    expect(a.socket.close).not.toHaveBeenCalled();
    waiting = true;
    await hub.tickRoom('r1');
    // Spin discovered on the check; idle time counts from now, not from the long quiet before.
    await (hub as unknown as { refreshSpin(id: string): Promise<void> }).refreshSpin('r1');
    await hub.tickRoom('r1');
    expect(a.socket.close).not.toHaveBeenCalled();
    clock.t += SPIN_IDLE_KICK_MS;
    await hub.tickRoom('r1');
    expect(a.socket.close).toHaveBeenCalledWith(1008, 'Idle');
  });
});
