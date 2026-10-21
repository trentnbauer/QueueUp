import { lookup as dnsLookup } from 'node:dns';
import { lookup } from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import { BlockList, isIP } from 'node:net';

// Addresses a person-supplied AI address must not reach: this machine, the private network behind
// it, link-local (including cloud metadata at 169.254.169.254), carrier-grade NAT, and the reserved
// and multicast ranges. The server makes the request, so without this a custom base URL is a way to
// poke at anything the server can reach.
const BLOCKED = new BlockList();
const V4: [string, number][] = [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
];
for (const [net, bits] of V4) BLOCKED.addSubnet(net, bits, 'ipv4');
BLOCKED.addAddress('::', 'ipv6');
BLOCKED.addAddress('::1', 'ipv6');
BLOCKED.addSubnet('fc00::', 7, 'ipv6'); // unique local
BLOCKED.addSubnet('fe80::', 10, 'ipv6'); // link-local
BLOCKED.addSubnet('ff00::', 8, 'ipv6'); // multicast
BLOCKED.addSubnet('64:ff9b::', 96, 'ipv6'); // NAT64 can reach any v4 address

/** Whether an IP literal is somewhere a person-supplied address must not point. An IPv4 address
 * written inside an IPv6 one (::ffff:10.0.0.1) is judged as the IPv4 address it really is. */
export function isBlockedAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 0) return true; // Not an address at all: refuse rather than guess.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
  if (mapped) return BLOCKED.check(mapped[1], 'ipv4');
  return BLOCKED.check(address, family === 4 ? 'ipv4' : 'ipv6');
}

/** What a person is told when their AI address points inside the server's own network. */
export const PRIVATE_ADDRESS_MESSAGE =
  'That AI address points at a private or local network address, which this server does not allow for personal AI settings. Use a public address, or ask the server admin to allow private addresses.';

/** Throws when `baseUrl` is, or resolves to, an address a person-supplied AI address must not reach.
 * Checked on every request rather than only when the setting is saved, so a name that later starts
 * pointing inside the network (a rebinding attempt) is caught. Every address a name resolves to
 * must be public, not just the first. `resolve` is injectable for tests. */
export async function assertPublicTarget(
  baseUrl: string,
  resolve: (host: string) => Promise<{ address: string }[]> = (host) => lookup(host, { all: true }),
): Promise<void> {
  let host: string;
  try {
    host = new URL(baseUrl).hostname.replace(/^\[|\]$/g, '');
  } catch {
    throw new Error(PRIVATE_ADDRESS_MESSAGE);
  }
  let addresses: { address: string }[];
  try {
    addresses = isIP(host) ? [{ address: host }] : await resolve(host);
  } catch {
    // A name that does not resolve can't be reached anyway; the request itself reports that.
    return;
  }
  if (addresses.length === 0 || addresses.some((a) => isBlockedAddress(a.address))) throw new Error(PRIVATE_ADDRESS_MESSAGE);
}

type Resolved = { address: string; family: number }[];

/** The `lookup` a connection to a person-supplied address uses. `assertPublicTarget` looks the name up on its own, and the request then looks it up again, so a
 * DNS server could answer "public" to the check and "10.0.0.5" to the request (DNS rebinding). Doing the check inside the connection's own lookup closes that gap:
 * the address that was checked is the one connected to. `resolve` is injectable for tests. */
export function makeGuardedLookup(resolve: (host: string) => Promise<Resolved> = (host) => lookup(host, { all: true })) {
  return (host: string, options: { all?: boolean }, callback: (err: Error | null, address?: string | Resolved, family?: number) => void): void => {
    resolve(host).then(
      (addresses) => {
        if (addresses.length === 0 || addresses.some((a) => isBlockedAddress(a.address))) return callback(new Error(PRIVATE_ADDRESS_MESSAGE));
        if (options.all) return callback(null, addresses);
        callback(null, addresses[0].address, addresses[0].family);
      },
      (err: Error) => callback(err),
    );
  };
}

const guardedLookup = makeGuardedLookup();
/** The most of a reply a guarded request reads. */
const GUARDED_MAX_BYTES = 8 * 1024 * 1024;

/** `fetch` for a person-supplied AI address: connects only to a public address (checked in the connection itself, see `makeGuardedLookup`), never follows a
 * redirect (the reply is handed back as it is), and reads at most GUARDED_MAX_BYTES. Handles only what the AI calls use: a method, headers, a string body, a signal. */
export const guardedFetch = ((input: string | URL | Request, init: RequestInit = {}): Promise<Response> =>
  new Promise<Response>((resolve, reject) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const host = url.hostname.replace(/^\[|\]$/g, '');
    // An address written out as numbers is not looked up, so it is checked here.
    if (isIP(host) && isBlockedAddress(host)) return reject(new Error(PRIVATE_ADDRESS_MESSAGE));
    const request = (url.protocol === 'https:' ? https : http).request(
      url,
      { method: init.method ?? 'GET', headers: Object.fromEntries(new Headers(init.headers).entries()), lookup: guardedLookup as never, signal: init.signal ?? undefined },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on('data', (chunk: Buffer) => {
          size += chunk.length;
          if (size > GUARDED_MAX_BYTES) request.destroy(new Error('The reply was too large'));
          else chunks.push(chunk);
        });
        res.on('error', reject);
        res.on('end', () => {
          const headers = new Headers();
          for (const [name, value] of Object.entries(res.headers)) for (const v of Array.isArray(value) ? value : value === undefined ? [] : [value]) headers.append(name, v);
          const status = res.statusCode ?? 502;
          resolve(new Response(size === 0 || [204, 205, 304].includes(status) ? null : Buffer.concat(chunks), { status, headers }));
        });
      },
    );
    request.on('error', reject);
    if (typeof init.body === 'string') request.write(init.body);
    request.end();
  })) as typeof fetch;
