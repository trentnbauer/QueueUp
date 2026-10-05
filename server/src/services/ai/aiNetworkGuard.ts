import { lookup } from 'node:dns/promises';
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
