import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { env } from '../config/env.js';

/** Guests (mini games played without an account) are in memory only: a signed token scoped to one lobby, and a
 * name shown while they are connected. Nothing about them is ever written to the database. In the lobby hub
 * a guest is an id with this prefix, which no real user id has, so every place that saves something per user
 * can tell them apart with `isGuestId`. */
export const GUEST_PREFIX = 'guest:';
export const isGuestId = (id: string): boolean => id.startsWith(GUEST_PREFIX);

const TOKEN_TTL_MS = 6 * 60 * 60 * 1000;
let key: Buffer | undefined;

interface GuestClaims {
  gid: string;
  lid: string;
  name: string;
  exp: number;
}

const sign = (body: string): string => createHmac('sha256', (key ??= createHmac('sha256', env.SESSION_SECRET).update('queueup-guest-lobby-token').digest())).update(body).digest('base64url');

export function newGuestToken(lobbyId: string, name: string, now = Date.now()): { token: string; guestId: string } {
  const guestId = `${GUEST_PREFIX}${randomBytes(9).toString('base64url')}`;
  const body = Buffer.from(JSON.stringify({ gid: guestId, lid: lobbyId, name, exp: now + TOKEN_TTL_MS } satisfies GuestClaims)).toString('base64url');
  return { token: `${body}.${sign(body)}`, guestId };
}

/** The token's claims, or null when it is forged, expired or for another lobby. */
export function verifyGuestToken(token: unknown, lobbyId: string, now = Date.now()): { guestId: string; name: string } | null {
  if (typeof token !== 'string' || token.length > 600) return null;
  const [body, mac] = token.split('.');
  if (!body || !mac) return null;
  const want = Buffer.from(sign(body));
  const got = Buffer.from(mac);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  try {
    const c = JSON.parse(Buffer.from(body, 'base64url').toString()) as GuestClaims;
    if (c.lid !== lobbyId || c.exp < now || typeof c.gid !== 'string' || !isGuestId(c.gid) || typeof c.name !== 'string') return null;
    return { guestId: c.gid, name: c.name };
  } catch {
    return null;
  }
}

/** Guests play on servers anyone can sign up to; an invite-only or private one is not open to strangers. */
export const guestPlayAllowed = (): boolean => env.SIGNUP_MODE === 'open' && !env.PRIVATE_INSTANCE;

/** Names of the guests who are connected now, so a lobby can list them. Dropped when they leave. */
export const guestNames = new Map<string, string>();

const COLORS = ['#E8734A', '#4A8FE8', '#6FBF73', '#B87DE8', '#E8C34A', '#4AE8D0'];
export function guestColor(name: string): string {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % COLORS.length;
  return COLORS[h];
}
