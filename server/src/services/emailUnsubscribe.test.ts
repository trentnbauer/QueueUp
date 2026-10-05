import { describe, expect, it } from 'vitest';
import { notificationSettingsUrl, renderAddressChanged, renderAlertDigest, renderConfirmEmail, renderSmtpTest, withUnsubscribeText } from './emailTemplates.js';

const BASE = 'https://queueup.example.com';
const LINK = 'https://queueup.example.com/?settings=notifications';

describe('notificationSettingsUrl', () => {
  it('opens the notification settings in the app, and copes with a trailing slash or a sub-path', () => {
    expect(notificationSettingsUrl(BASE)).toBe(LINK);
    expect(notificationSettingsUrl(`${BASE}/`)).toBe(LINK);
    expect(notificationSettingsUrl(`${BASE}/queueup`)).toBe('https://queueup.example.com/queueup/?settings=notifications');
  });
});

describe('withUnsubscribeText', () => {
  it('appends the link to the plain-text version', () => {
    const text = withUnsubscribeText('Hello', BASE);
    expect(text.startsWith('Hello')).toBe(true);
    expect(text).toContain(`Unsubscribe or choose which alerts you get: ${LINK}`);
  });
});

// Every template, so a new one can't ship without it.
describe('every email has an unsubscribe link to the notification settings', () => {
  const emails = {
    alertDigest: renderAlertDigest({ messages: ['A price dropped'], appBaseUrl: BASE }),
    confirmEmail: renderConfirmEmail({ email: 'me@x.com', confirmUrl: `${BASE}/confirm-email/abc`, appBaseUrl: BASE }),
    addressChanged: renderAddressChanged({ newAddress: 'new@x.com', appBaseUrl: BASE }),
    smtpTest: renderSmtpTest({ appBaseUrl: BASE }),
  };

  it.each(Object.entries(emails))('%s: HTML footer link and plain-text line', (_name, mail) => {
    expect(mail.html).toContain(`href="${LINK}"`);
    expect(mail.html).toContain('Unsubscribe or choose which alerts you get');
    expect(mail.text).toContain(LINK);
  });

  it('puts the unsubscribe text after the body rather than replacing it', () => {
    expect(emails.confirmEmail.text).toContain(`${BASE}/confirm-email/abc`);
  });
});
