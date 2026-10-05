import { describe, expect, it } from 'vitest';
import { isUndeliverableAddress, mailRecipient } from './emailRecipient.js';

describe('mailRecipient', () => {
  it('mails the sign-in email when the provider verified it', () => {
    expect(mailRecipient({ email: 'me@x.com', alertEmail: null, emailVerified: true })).toBe('me@x.com');
  });

  it('never mails an unverified sign-in email (anyone can type one into a profile)', () => {
    expect(mailRecipient({ email: 'victim@x.com', alertEmail: null, emailVerified: false })).toBeNull();
  });

  it('mails a confirmed alert address whether or not the sign-in email was verified', () => {
    expect(mailRecipient({ email: 'victim@x.com', alertEmail: 'me@y.com', emailVerified: false })).toBe('me@y.com');
    expect(mailRecipient({ email: 'a@x.com', alertEmail: 'b@y.com', emailVerified: true })).toBe('b@y.com');
  });

  it('never mails a made-up address for a provider that gave no email', () => {
    for (const email of ['1@steamcommunity.unknown', '2@discord.unknown', '3@xbox.unknown', '4@my-sso.unknown']) {
      expect(mailRecipient({ email, alertEmail: null, emailVerified: true })).toBeNull();
    }
  });
});

describe('isUndeliverableAddress', () => {
  it('flags .unknown domains only', () => {
    expect(isUndeliverableAddress('1@steamcommunity.unknown')).toBe(true);
    expect(isUndeliverableAddress('me@example.com')).toBe(false);
    expect(isUndeliverableAddress('not-an-address')).toBe(false);
  });
});
