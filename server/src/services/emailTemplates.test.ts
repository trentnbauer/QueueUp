import { describe, expect, it } from 'vitest';
import { DIGEST_MAX_LINES, renderAlertDigest, renderConfirmEmail, renderSmtpTest } from './emailTemplates.js';

const base = 'https://queueup.example.com';
// Every plain-text body now ends with the same unsubscribe line (see emailUnsubscribe.test.ts).
const unsubscribeLines = ['', '--', `Unsubscribe or choose which alerts you get: ${base}/?settings=notifications`];

describe('renderAlertDigest', () => {
  it('keeps the plain-text body exactly as it was before theming (one alert)', () => {
    const mail = renderAlertDigest({ messages: ['"Hades" hit your target price - now 12.49 USD'], appBaseUrl: base });
    expect(mail.subject).toBe('QueueUp: 1 new alert');
    expect(mail.text).toBe(
      [
        'You have a new alert on QueueUp:',
        '',
        '- "Hades" hit your target price - now 12.49 USD',
        '',
        `Open QueueUp: ${base}`,
        '',
        'You are getting this because you turned on email alerts. You can choose which alerts you get under Settings > Notifications.',
        ...unsubscribeLines,
      ].join('\n'),
    );
  });

  it('lists several alerts, with a count in the subject, heading and title', () => {
    const mail = renderAlertDigest({ messages: ['a', 'b', 'c'], appBaseUrl: base });
    expect(mail.subject).toBe('QueueUp: 3 new alerts');
    expect(mail.text).toContain('You have 3 new alerts on QueueUp:');
    expect(mail.html).toContain('You have 3 new alerts on QueueUp');
    expect(mail.html).toContain('<title>QueueUp: 3 new alerts</title>');
    expect(mail.html.match(/class="qu-body">/g)).toHaveLength(3);
  });

  it('shows at most 20 alerts and then an "and n more" line, in both versions', () => {
    const mail = renderAlertDigest({ messages: Array.from({ length: 25 }, (_, i) => `alert ${i}`), appBaseUrl: base });
    expect(DIGEST_MAX_LINES).toBe(20);
    expect(mail.text).toContain('- alert 19');
    expect(mail.text).not.toContain('- alert 20');
    expect(mail.text).toContain('…and 5 more');
    expect(mail.html).toContain('&hellip;and 5 more');
    expect(mail.html).not.toContain('alert 20');
  });

  it('escapes member-written text so it cannot inject markup', () => {
    const mail = renderAlertDigest({ messages: ['<script>alert(1)</script> "x" & <b>y</b>'], appBaseUrl: base });
    expect(mail.html).not.toContain('<script>');
    expect(mail.html).not.toContain('<b>y</b>');
    expect(mail.html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &quot;x&quot; &amp; &lt;b&gt;y&lt;/b&gt;');
    // The preheader (inbox preview) holds the first alert too.
    expect(mail.html).toContain('<div style="display:none;');
  });

  it('rounds the list correctly for one row, first and last rows, and a trailing "more" row', () => {
    expect(renderAlertDigest({ messages: ['a'], appBaseUrl: base }).html).toContain('border-radius:18px;"');
    const two = renderAlertDigest({ messages: ['a', 'b'], appBaseUrl: base }).html;
    expect(two).toContain('border-radius:18px 18px 0 0;');
    expect(two).toContain('border-radius:0 0 18px 18px;');
    const many = renderAlertDigest({ messages: Array.from({ length: 21 }, (_, i) => `m${i}`), appBaseUrl: base }).html;
    expect(many.match(/border-radius:0 0 18px 18px;/g)).toHaveLength(1); // only the "more" row
  });

  it('links to the app and shows the server host', () => {
    const mail = renderAlertDigest({ messages: ['a'], appBaseUrl: base });
    expect(mail.html).toContain(`href="${base}"`);
    expect(mail.html).toContain('Sent by your QueueUp server &middot; queueup.example.com');
  });
});

describe('renderConfirmEmail', () => {
  const mail = renderConfirmEmail({ email: 'me@example.com', confirmUrl: `${base}/confirm-email/abc_DEF-123`, appBaseUrl: base });

  it('keeps the plain-text body exactly as it was before theming', () => {
    expect(mail.subject).toBe('Confirm your email for QueueUp alerts');
    expect(mail.text).toBe(
      [
        'Someone (hopefully you) asked to send QueueUp alerts to this address.',
        '',
        `Confirm it here: ${base}/confirm-email/abc_DEF-123`,
        '',
        'The link works for 24 hours. If this was not you, ignore this email and nothing changes.',
        ...unsubscribeLines,
      ].join('\n'),
    );
  });

  it('shows the address, a button and the pasteable link, with the "not you" notice', () => {
    expect(mail.html).toContain('<strong style="color:#f1eee9; font-weight:600;">me@example.com</strong>');
    expect(mail.html.match(/href="https:\/\/queueup\.example\.com\/confirm-email\/abc_DEF-123"/g)!.length).toBeGreaterThanOrEqual(3);
    expect(mail.html).toContain('Not you?');
  });

  it('escapes the address it was given', () => {
    expect(renderConfirmEmail({ email: '"><img src=x>@e.com', confirmUrl: base, appBaseUrl: base }).html).not.toContain('<img');
  });
});

describe('renderSmtpTest', () => {
  const mail = renderSmtpTest({ appBaseUrl: base });
  it('keeps the original subject and text', () => {
    expect(mail.subject).toBe('QueueUp test email');
    expect(mail.text).toBe(['If you can read this, QueueUp can send email alerts.', ...unsubscribeLines].join('\n'));
  });
  it('says SMTP is connected', () => {
    expect(mail.html).toContain('Email is working');
    expect(mail.html).toContain('SMTP connected');
  });
});

describe('every email', () => {
  it('is a complete document with the dark/light hints and the Outlook fallbacks', () => {
    for (const mail of [renderAlertDigest({ messages: ['a'], appBaseUrl: base }), renderConfirmEmail({ email: 'a@b.c', confirmUrl: base, appBaseUrl: base }), renderSmtpTest({ appBaseUrl: base })]) {
      expect(mail.html.startsWith('<!DOCTYPE html>')).toBe(true);
      expect(mail.html).toContain('name="color-scheme"');
      expect(mail.html).toContain('<!--[if mso]>');
      expect(mail.html).not.toContain('%PAD%');
      expect(mail.html).not.toContain('{{');
      expect(mail.html.trimEnd().endsWith('</html>')).toBe(true);
    }
  });
});
