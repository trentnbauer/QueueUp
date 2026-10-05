import { describe, expect, it } from 'vitest';
import { PRIVATE_ADDRESS_MESSAGE, assertPublicTarget, isBlockedAddress } from './aiNetworkGuard.js';

describe('isBlockedAddress', () => {
  it.each([
    '127.0.0.1',
    '127.5.5.5',
    '10.1.2.3',
    '172.16.0.1',
    '172.31.255.255',
    '192.168.1.10',
    '169.254.169.254',
    '100.64.0.1',
    '0.0.0.0',
    '224.0.0.1',
    '240.0.0.1',
    '::',
    '::1',
    'fc00::1',
    'fd12:3456::1',
    'fe80::1',
    'ff02::1',
    '::ffff:127.0.0.1',
    '::ffff:10.0.0.5',
    '::ffff:169.254.169.254',
    '64:ff9b::7f00:1',
  ])('blocks %s', (ip) => {
    expect(isBlockedAddress(ip)).toBe(true);
  });

  it.each(['8.8.8.8', '1.1.1.1', '172.15.255.255', '172.32.0.1', '100.63.255.255', '93.184.216.34', '2606:4700:4700::1111', '::ffff:8.8.8.8'])('allows %s', (ip) => {
    expect(isBlockedAddress(ip)).toBe(false);
  });

  it('refuses anything that is not an IP address', () => {
    expect(isBlockedAddress('not-an-ip')).toBe(true);
  });
});

describe('assertPublicTarget', () => {
  const resolvesTo = (...addresses: string[]) => async () => addresses.map((address) => ({ address }));

  it('allows a name that resolves to public addresses only', async () => {
    await expect(assertPublicTarget('https://api.example.com/v1', resolvesTo('93.184.216.34', '2606:4700:4700::1111'))).resolves.toBeUndefined();
  });

  it('refuses a name when any resolved address is private (not just the first)', async () => {
    await expect(assertPublicTarget('https://evil.example.com', resolvesTo('93.184.216.34', '10.0.0.5'))).rejects.toThrow(PRIVATE_ADDRESS_MESSAGE);
  });

  it('refuses literal private addresses, including bracketed IPv6 and the cloud metadata address', async () => {
    const never = async () => {
      throw new Error('should not resolve a literal');
    };
    await expect(assertPublicTarget('http://169.254.169.254/latest', never)).rejects.toThrow(PRIVATE_ADDRESS_MESSAGE);
    await expect(assertPublicTarget('http://127.0.0.1:11434/v1', never)).rejects.toThrow(PRIVATE_ADDRESS_MESSAGE);
    await expect(assertPublicTarget('http://[::1]:8080', never)).rejects.toThrow(PRIVATE_ADDRESS_MESSAGE);
    await expect(assertPublicTarget('http://[::ffff:10.0.0.1]/', never)).rejects.toThrow(PRIVATE_ADDRESS_MESSAGE);
  });

  it('refuses localhost and other names that resolve to loopback', async () => {
    await expect(assertPublicTarget('http://localhost:11434/v1', resolvesTo('127.0.0.1', '::1'))).rejects.toThrow(PRIVATE_ADDRESS_MESSAGE);
  });

  it('lets a public literal address through', async () => {
    await expect(assertPublicTarget('https://8.8.8.8/v1')).resolves.toBeUndefined();
  });

  it('leaves an unresolvable name to the request itself to report', async () => {
    await expect(
      assertPublicTarget('https://nope.invalid', async () => {
        throw new Error('ENOTFOUND');
      }),
    ).resolves.toBeUndefined();
  });
});
