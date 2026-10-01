import { spawn, type ChildProcess } from 'node:child_process';
import type { Readable } from 'node:stream';
import type { FastifyBaseLogger } from 'fastify';
import type { TunnelState, TunnelStatus } from '@queueup/shared';
import { env } from '../config/env.js';
import { getConfigSource, getConfigValue } from './configResolver.js';

/** Cloudflare Tunnel (issue #664): with a tunnel token set (env var or Administrator settings),
 * the server runs `cloudflared` as a child process and keeps it running, so the app is reachable
 * through Cloudflare without opening a port. The tunnel's public hostname and its target
 * (http://localhost:<PORT>) are set up on the Cloudflare side; the token is all QueueUp needs. */

const RESTART_MIN_MS = 5_000;
const RESTART_MAX_MS = 5 * 60_000;
/** A run that stayed up this long resets the backoff, so one blip doesn't leave a long wait later. */
const STABLE_RUN_MS = 60_000;
const STOP_GRACE_MS = 5_000;

let logger: FastifyBaseLogger | null = null;
let child: ChildProcess | null = null;
let restartTimer: NodeJS.Timeout | null = null;
let restartDelay = RESTART_MIN_MS;
let generation = 0;
let state: TunnelState = 'off';
let connections = 0;
let lastError: string | null = null;
let since: Date | null = null;

function setState(next: TunnelState) {
  if (next !== state) since = new Date();
  state = next;
}

/** Pulls what matters out of cloudflared's log output: connection up/down, and errors. */
export function parseCloudflaredLine(line: string): { connected?: true; disconnected?: true; error?: string } {
  // Checked before "Registered", which it contains.
  if (/Unregistered tunnel connection|Connection terminated|Lost connection/i.test(line)) return { disconnected: true };
  if (/Registered tunnel connection/i.test(line)) return { connected: true };
  // cloudflared logs as "<timestamp> <LEVEL> <message> key=value...": only ERR/FTL lines are errors.
  const err = line.match(/\s(?:ERR|FTL)\s+(.*)$/);
  if (err) return { error: err[1].trim().slice(0, 300) };
  return {};
}

function handleLine(line: string) {
  if (!line.trim()) return;
  logger?.debug({ cloudflared: line }, 'cloudflared');
  const parsed = parseCloudflaredLine(line);
  if (parsed.connected) {
    connections += 1;
    lastError = null;
    if (state !== 'connected') logger?.info('Cloudflare Tunnel connected');
    setState('connected');
  } else if (parsed.disconnected) {
    connections = Math.max(0, connections - 1);
    if (connections === 0 && state === 'connected') setState('starting');
  } else if (parsed.error) {
    lastError = parsed.error;
  }
}

function pipeLines(stream: Readable | null) {
  if (!stream) return;
  let buffer = '';
  stream.setEncoding('utf8');
  stream.on('data', (chunk: string) => {
    buffer += chunk;
    let i;
    while ((i = buffer.indexOf('\n')) >= 0) {
      handleLine(buffer.slice(0, i));
      buffer = buffer.slice(i + 1);
    }
  });
}

function launch(token: string, myGeneration: number) {
  connections = 0;
  setState('starting');
  const startedAt = Date.now();
  // The token goes in through the environment (cloudflared reads TUNNEL_TOKEN), not the command
  // line, so it doesn't show up in `ps` output.
  // --metrics on loopback: cloudflared's container builds otherwise expose it on every interface.
  const proc = spawn(env.CLOUDFLARED_PATH, ['tunnel', '--no-autoupdate', '--metrics', '127.0.0.1:0', 'run'], {
    env: { ...process.env, TUNNEL_TOKEN: token },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  child = proc;
  pipeLines(proc.stdout);
  pipeLines(proc.stderr);

  proc.on('error', (err: NodeJS.ErrnoException) => {
    if (myGeneration !== generation) return;
    child = null;
    if (err.code === 'ENOENT') {
      lastError = `cloudflared isn't installed here (looked for "${env.CLOUDFLARED_PATH}")`;
      setState('unavailable');
      logger?.warn(lastError);
      return;
    }
    lastError = err.message;
    scheduleRestart(token, myGeneration);
  });
  proc.on('exit', (code, signal) => {
    if (myGeneration !== generation || child !== proc) return;
    child = null;
    connections = 0;
    lastError ??= `cloudflared exited (${signal ?? `code ${code}`})`;
    logger?.warn({ code, signal, lastError }, 'Cloudflare Tunnel stopped, restarting');
    if (Date.now() - startedAt >= STABLE_RUN_MS) restartDelay = RESTART_MIN_MS;
    scheduleRestart(token, myGeneration);
  });
}

function scheduleRestart(token: string, myGeneration: number) {
  setState('error');
  if (restartTimer) clearTimeout(restartTimer);
  restartTimer = setTimeout(() => {
    restartTimer = null;
    if (myGeneration === generation) launch(token, myGeneration);
  }, restartDelay);
  restartTimer.unref();
  restartDelay = Math.min(restartDelay * 2, RESTART_MAX_MS);
}

function killChild(): Promise<void> {
  const proc = child;
  child = null;
  if (!proc || proc.exitCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    const force = setTimeout(() => proc.kill('SIGKILL'), STOP_GRACE_MS);
    force.unref();
    proc.once('exit', () => {
      clearTimeout(force);
      resolve();
    });
    proc.kill('SIGTERM');
  });
}

/** Stops any running tunnel, then starts it again if a token is set. Called at boot and whenever
 * an admin saves or clears the token, so a change applies without restarting the container. */
export async function reloadTunnel(log?: FastifyBaseLogger): Promise<void> {
  if (log) logger = log;
  const myGeneration = ++generation;
  if (restartTimer) clearTimeout(restartTimer);
  restartTimer = null;
  restartDelay = RESTART_MIN_MS;
  await killChild();
  lastError = null;
  connections = 0;
  const token = await getConfigValue('CLOUDFLARE_TUNNEL_TOKEN', env.CLOUDFLARE_TUNNEL_TOKEN);
  if (myGeneration !== generation) return;
  if (!token) {
    setState('off');
    return;
  }
  logger?.info('Starting Cloudflare Tunnel');
  launch(token, myGeneration);
}

/** Stops the tunnel for good (server shutdown). */
export async function stopTunnel(): Promise<void> {
  generation++;
  if (restartTimer) clearTimeout(restartTimer);
  restartTimer = null;
  await killChild();
  setState('off');
}

export async function getTunnelStatus(): Promise<TunnelStatus> {
  return {
    state,
    source: await getConfigSource('CLOUDFLARE_TUNNEL_TOKEN', env.CLOUDFLARE_TUNNEL_TOKEN),
    connections,
    lastError,
    since: since ? since.toISOString() : null,
  };
}

// cloudflared shouldn't outlive the server if it exits without the graceful shutdown path.
process.once('exit', () => {
  if (child && child.exitCode === null) child.kill('SIGTERM');
});
