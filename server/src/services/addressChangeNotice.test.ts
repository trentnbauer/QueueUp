import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../config/env.js', () => ({ env: { APP_BASE_URL: 'https://queueup.example.com' } }));
const userFindUnique = vi.fn();
vi.mock('../db/client.js', () => ({ prisma: { user: { findUnique: userFindUnique } } }));
const sendMail = vi.fn(async () => {});
const smtpIsConfigured = vi.fn(async () => true);
vi.mock('./mailer.js', () => ({ sendMail, smtpIsConfigured }));

const { noticeRecipients, warnPreviousAddresses } = await import('./addressChangeNotice.js');
const { renderAddressChanged } = await import('./emailTemplates.js');

describe('noticeRecipients', () => {
  it('warns the old alert address and the account email, not the one now in use', () => {
    expect(noticeRecipients('old@x.com', 'me@x.com', 'attacker@evil.com')).toEqual(['old@x.com', 'me@x.com']);
  });

  it('does not warn the address that alerts now go to (reset to the sign-in email)', () => {
    expect(noticeRecipients('custom@x.com', 'me@x.com', 'me@x.com')).toEqual(['custom@x.com']);
  });

  it('lists each address once, ignoring case and spacing', () => {
    expect(noticeRecipients('Me@X.com', ' me@x.com ', 'other@y.com')).toEqual(['Me@X.com']);
  });

  it('skips made-up addresses for sign-in providers that gave no email', () => {
    expect(noticeRecipients('123@steamcommunity.unknown', 'real@x.com', 'new@y.com')).toEqual(['real@x.com']);
    expect(noticeRecipients('a@discord.unknown', '1@xbox.unknown', 'new@y.com')).toEqual([]);
  });
});

describe('warnPreviousAddresses', () => {
  beforeEach(() => {
    userFindUnique.mockReset();
    sendMail.mockClear();
    smtpIsConfigured.mockResolvedValue(true);
  });

  it('emails the old address and the account email after the alert address changed', async () => {
    userFindUnique.mockResolvedValue({ email: 'me@x.com', alertEmail: 'attacker@evil.com' });
    await warnPreviousAddresses('u1', 'old@x.com');
    expect(sendMail.mock.calls.map((c) => (c[0] as { to: string }).to)).toEqual(['old@x.com', 'me@x.com']);
    const first = sendMail.mock.calls[0][0] as { subject: string; text: string; kind: string };
    expect(first.kind).toBe('address_changed');
    expect(first.text).toContain('attacker@evil.com');
  });

  it('says "back to your sign-in email" when the alert address was reset', async () => {
    userFindUnique.mockResolvedValue({ email: 'me@x.com', alertEmail: null });
    await warnPreviousAddresses('u1', 'custom@x.com');
    expect(sendMail).toHaveBeenCalledTimes(1);
    expect((sendMail.mock.calls[0][0] as { text: string }).text).toContain('back to your sign-in email');
  });

  it('sends nothing when the address did not really change, or email is not set up', async () => {
    userFindUnique.mockResolvedValue({ email: 'me@x.com', alertEmail: null });
    await warnPreviousAddresses('u1', 'ME@x.com');
    smtpIsConfigured.mockResolvedValue(false);
    userFindUnique.mockResolvedValue({ email: 'me@x.com', alertEmail: 'new@y.com' });
    await warnPreviousAddresses('u1', 'old@x.com');
    expect(sendMail).not.toHaveBeenCalled();
  });

  it('never throws, and one failed send does not stop the next', async () => {
    userFindUnique.mockResolvedValue({ email: 'me@x.com', alertEmail: 'new@y.com' });
    sendMail.mockRejectedValueOnce(new Error('smtp down'));
    await expect(warnPreviousAddresses('u1', 'old@x.com')).resolves.toBeUndefined();
    expect(sendMail).toHaveBeenCalledTimes(2);
  });
});

describe('renderAddressChanged', () => {
  it('names the new address and escapes it in the HTML', () => {
    const mail = renderAddressChanged({ newAddress: 'a<b>@x.com', appBaseUrl: 'https://queueup.example.com' });
    expect(mail.text).toContain('a<b>@x.com');
    expect(mail.html).toContain('a&lt;b&gt;@x.com');
    expect(mail.html).not.toContain('a<b>@x.com');
    expect(mail.subject).toMatch(/alert email was changed/i);
  });
});
