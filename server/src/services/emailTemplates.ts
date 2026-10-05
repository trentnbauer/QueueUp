/** The themed HTML versions of the three emails QueueUp sends (issue #866), designed in Claude Design.
 * Each render function returns the HTML and the original plain-text body, which is sent as the
 * fallback part, so clients that cannot show HTML read exactly what was sent before.
 *
 * Built with email-safe tables and inline styles (Outlook included). Everything that comes from a
 * person or a URL is escaped: alert messages hold member-written names and game titles. */

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const hostOf = (appBaseUrl: string) => {
  try {
    return new URL(appBaseUrl).host;
  } catch {
    return appBaseUrl;
  }
};

const FONT_DISPLAY = "'Bricolage Grotesque', Helvetica, Arial, sans-serif";
const FONT_UI = "'Geist', Helvetica, Arial, sans-serif";
const FONT_MONO = "'Geist Mono', 'Courier New', monospace";
/** Invisible filler after the preheader so clients do not pull body text into the inbox preview. */
const PREHEADER_PAD = '&#8199;&#847;'.repeat(5);

const HEAD_STYLE = `
  body { margin:0 !important; padding:0 !important; background:#16130f; }
  a { color:#f4894f; }
  a:hover { color:#f7a27a; }
  body, table, td, a { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
  table { border-collapse:collapse; mso-table-lspace:0pt; mso-table-rspace:0pt; }
  @media (max-width:620px) {
    .qu-outer { padding:12px 10px 32px !important; }
    .qu-pad { padding-left:20px !important; padding-right:20px !important; }
    .qu-hero { padding-top:26px !important; padding-bottom:22px !important; border-radius:18px 18px 0 0 !important; }
    .qu-card { border-radius:18px !important; }
    .qu-h1 { font-size:28px !important; line-height:31px !important; }
    .qu-body { font-size:16px !important; line-height:23px !important; }
    .qu-btn { width:100% !important; }
    .qu-btn a { padding:15px 20px !important; font-size:16px !important; }
  }
  @media (max-width:380px) {
    .qu-pad { padding-left:16px !important; padding-right:16px !important; }
    .qu-h1 { font-size:25px !important; line-height:28px !important; }
  }`;

const wordmark = (appBaseUrl: string) => `
    <tr><td class="qu-pad" style="padding:8px 32px 28px;">
      <a href="${esc(appBaseUrl)}" style="text-decoration:none;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          <td valign="top" style="padding-top:7px; font-family:${FONT_DISPLAY}; font-size:28px; line-height:28px; mso-line-height-rule:exactly; font-weight:800; letter-spacing:-1.2px; color:#f3efe9;">queue</td>
          <td valign="top" style="font-family:${FONT_DISPLAY}; font-size:28px; line-height:28px; mso-line-height-rule:exactly; font-weight:800; letter-spacing:-1.2px; color:#f4894f;">up</td>
        </tr></table>
      </a>
    </td></tr>`;

const hostFooter = (appBaseUrl: string) =>
  `<tr><td class="qu-pad" style="padding:%PAD%; font-family:${FONT_MONO}; font-size:11px; line-height:16px; letter-spacing:0.66px; text-transform:uppercase; color:#7d776f;">Sent by your QueueUp server &middot; ${esc(hostOf(appBaseUrl))}</td></tr>`;

const eyebrow = (label: string) =>
  `<div style="font-family:${FONT_MONO}; font-size:12px; line-height:16px; font-weight:600; letter-spacing:0.72px; text-transform:uppercase; color:#b4ada4;">${label}</div>`;

const h1 = (text: string) =>
  `<h1 class="qu-h1" style="margin:10px 0 0; font-family:${FONT_DISPLAY}; font-size:34px; line-height:37px; mso-line-height-rule:exactly; font-weight:700; letter-spacing:-1px; color:#f1eee9;">${text}</h1>`;

/** A pill button with an Outlook (VML) fallback. */
function button(href: string, label: string, width: number): string {
  const h = esc(href);
  return `<table role="presentation" class="qu-btn" cellpadding="0" cellspacing="0" border="0" style="border-collapse:separate;"><tr>
            <td align="center" bgcolor="#f4894f" style="background:#f4894f; border-radius:999px;">
              <!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${h}" style="height:46px;v-text-anchor:middle;width:${width}px;" arcsize="50%" stroke="f" fillcolor="#f4894f"><center style="color:#2a1a12;font-family:Arial,sans-serif;font-size:15px;font-weight:bold;">${esc(label)}</center></v:roundrect><![endif]-->
              <!--[if !mso]><!-- --><a href="${h}" style="display:block; padding:13px 26px; font-family:${FONT_UI}; font-size:15px; line-height:20px; font-weight:600; color:#2a1a12; text-decoration:none; border-radius:999px;">${esc(label)}</a><!--<![endif]-->
            </td>
          </tr></table>`;
}

function layout(opts: { title: string; preheader: string; appBaseUrl: string; card: string; footer: string }): string {
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="dark light">
<meta name="supported-color-schemes" content="dark light">
<title>${esc(opts.title)}</title>
<!--[if mso]><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
<style>${HEAD_STYLE}
</style>
</head>
<body style="margin:0; padding:0; background:#16130f;">
<div style="display:none; max-height:0; overflow:hidden; mso-hide:all; font-size:1px; line-height:1px; color:#16130f; opacity:0;">${esc(opts.preheader)}${PREHEADER_PAD}</div>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#16130f" style="background:#16130f;">
<tr><td class="qu-outer" align="center" style="padding:24px 12px 48px;">

  <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px; width:100%;">
${wordmark(opts.appBaseUrl)}

    <tr><td style="padding:0;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="qu-card" bgcolor="#1b1814" style="background:#1b1814; border:1px solid #2e2a26; border-radius:22px; border-collapse:separate;">
${opts.card}
      </table>
    </td></tr>

${opts.footer}
  </table>
  <!--[if mso]></td></tr></table><![endif]-->

</td></tr>
</table>
</body>
</html>
`;
}

const heroCell = (inner: string, radius: string, padBottom: number) =>
  `        <tr><td class="qu-pad qu-hero" bgcolor="#2a211b" style="background:#2a211b; background-image:linear-gradient(160deg, #33271f 0%, #1f1b17 100%); border-radius:${radius}; padding:32px 32px ${padBottom}px;">
          ${inner}
        </td></tr>`;

// ---- 1. Alert digest ----------------------------------------------------------------------

/** At most this many alerts are listed; the rest are summarised as "...and n more". */
export const DIGEST_MAX_LINES = 20;

export function renderAlertDigest(input: { messages: string[]; appBaseUrl: string }): RenderedEmail {
  const total = input.messages.length;
  const shown = input.messages.slice(0, DIGEST_MAX_LINES);
  const more = total - shown.length;
  const countLabel = total === 1 ? '1 new alert' : `${total} new alerts`;
  const subject = `QueueUp: ${countLabel}`;

  const text = [
    total === 1 ? 'You have a new alert on QueueUp:' : `You have ${total} new alerts on QueueUp:`,
    '',
    ...shown.map((m) => `- ${m}`),
    ...(more > 0 ? [`…and ${more} more`] : []),
    '',
    `Open QueueUp: ${input.appBaseUrl}`,
    '',
    'You are getting this because you turned on email alerts. You can choose which alerts you get under Settings > Notifications.',
  ].join('\n');

  const rows = shown
    .map((m, i) => {
      const isFirst = i === 0;
      const isLast = i === shown.length - 1 && more === 0;
      const radius = isFirst && isLast ? 'border-radius:18px;' : isFirst ? 'border-radius:18px 18px 0 0;' : isLast ? 'border-radius:0 0 18px 18px;' : '';
      return `${i > 0 ? '            <tr><td height="1" style="height:1px; font-size:0; line-height:0;">&nbsp;</td></tr>\n' : ''}            <tr><td bgcolor="#211d19" style="background:#211d19; padding:15px 18px; ${radius}">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
                <td width="18" valign="top" style="padding-top:7px;"><div style="width:7px; height:7px; border-radius:50%; background:#f4894f; font-size:0; line-height:0;">&nbsp;</div></td>
                <td style="font-family:${FONT_UI}; font-size:15px; line-height:21px; color:#f1eee9;" class="qu-body">${esc(m)}</td>
              </tr></table>
            </td></tr>`;
    })
    .join('\n');
  const moreRow =
    more > 0
      ? `\n            <tr><td height="1" style="height:1px; font-size:0; line-height:0;">&nbsp;</td></tr>
            <tr><td bgcolor="#211d19" style="background:#211d19; padding:13px 18px 13px 36px; border-radius:0 0 18px 18px; font-family:${FONT_UI}; font-size:14px; line-height:20px; color:#b4ada4;">&hellip;and ${more} more</td></tr>`
      : '';

  const card = `${heroCell(`${eyebrow('Email alerts')}\n          ${h1(`You have ${countLabel} on QueueUp`)}`, '22px 22px 0 0', 28)}

        <tr><td class="qu-pad" style="padding:24px 32px 8px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#2e2a26" style="background:#2e2a26; border-radius:18px; border-collapse:separate;">
${rows}${moreRow}
          </table>
        </td></tr>

        <tr><td class="qu-pad" style="padding:20px 32px 34px;">
          ${button(input.appBaseUrl, 'Open QueueUp', 180)}
        </td></tr>`;

  const footer = `    <tr><td class="qu-pad" style="padding:24px 32px 0; font-family:${FONT_UI}; font-size:13px; line-height:20px; color:#958e85;">
      You are getting this because you turned on email alerts. You can choose which alerts you get under <a href="${esc(input.appBaseUrl)}" style="color:#f7ae86; text-decoration:underline;">Settings &rsaquo; Notifications</a>.
    </td></tr>
    ${hostFooter(input.appBaseUrl).replace('%PAD%', '14px 32px 0')}`;

  return { subject, text, html: layout({ title: subject, preheader: shown[0] ?? '', appBaseUrl: input.appBaseUrl, card, footer }) };
}

// ---- 2. Confirm alert email address -------------------------------------------------------

export function renderConfirmEmail(input: { email: string; confirmUrl: string; appBaseUrl: string }): RenderedEmail {
  const subject = 'Confirm your email for QueueUp alerts';
  const text = [
    'Someone (hopefully you) asked to send QueueUp alerts to this address.',
    '',
    `Confirm it here: ${input.confirmUrl}`,
    '',
    'The link works for 24 hours. If this was not you, ignore this email and nothing changes.',
  ].join('\n');
  const url = esc(input.confirmUrl);

  const card = `${heroCell(
    `${eyebrow('Alert email')}\n          ${h1('Confirm your email')}\n          <p class="qu-body" style="margin:10px 0 0; font-family:${FONT_UI}; font-size:15px; line-height:22px; color:#d6d1ca;">Someone (hopefully you) asked to send QueueUp alerts to <strong style="color:#f1eee9; font-weight:600;">${esc(input.email)}</strong>.</p>`,
    '22px 22px 0 0',
    28,
  )}

        <tr><td class="qu-pad" style="padding:24px 32px 0;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#2a1f19" style="background:#2a1f19; border:1px solid #5a3a28; border-radius:14px; border-collapse:separate;"><tr>
            <td class="qu-body" style="padding:14px 16px; font-family:${FONT_UI}; font-size:15px; line-height:22px; color:#f1eee9;"><strong style="font-weight:700; color:#f7ae86;">Not you?</strong> Ignore this email and nothing changes. No alerts will go to this address unless the link is used.</td>
          </tr></table>
        </td></tr>

        <tr><td class="qu-pad" style="padding:24px 32px 0;">
          ${button(input.confirmUrl, 'Confirm address', 200)}
        </td></tr>

        <tr><td class="qu-pad" style="padding:24px 32px 0;">
          <div style="font-family:${FONT_MONO}; font-size:11px; line-height:16px; font-weight:600; letter-spacing:0.66px; text-transform:uppercase; color:#958e85;">Or paste this link</div>
          <div style="margin-top:8px; padding:12px 14px; background:#211d19; border:1px solid #2e2a26; border-radius:12px; font-family:${FONT_MONO}; font-size:12px; line-height:18px; color:#f7ae86; word-break:break-all;"><a href="${url}" style="color:#f7ae86; text-decoration:none;">${url}</a></div>
        </td></tr>

        <tr><td class="qu-pad" style="padding:24px 32px 32px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid #2e2a26;"><tr>
            <td style="padding-top:18px; font-family:${FONT_UI}; font-size:14px; line-height:21px; color:#b4ada4;">The link works for 24 hours and can only be used once.</td>
          </tr></table>
        </td></tr>`;

  return {
    subject,
    text,
    html: layout({
      title: subject,
      preheader: 'Someone (hopefully you) asked to send QueueUp alerts to this address. Not you? Ignore this email.',
      appBaseUrl: input.appBaseUrl,
      card,
      footer: `    ${hostFooter(input.appBaseUrl).replace('%PAD%', '24px 32px 0')}`,
    }),
  };
}

// ---- 3. SMTP test -------------------------------------------------------------------------

export function renderSmtpTest(input: { appBaseUrl: string }): RenderedEmail {
  const subject = 'QueueUp test email';
  const text = 'If you can read this, QueueUp can send email alerts.';
  const card = heroCell(
    `${eyebrow('Administrator &middot; SMTP test')}\n          ${h1('Email is working')}
          <p class="qu-body" style="margin:10px 0 0; font-family:${FONT_UI}; font-size:15px; line-height:22px; color:#d6d1ca;">If you can read this, QueueUp can send email alerts.</p>
          <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:20px; border-collapse:separate;"><tr>
            <td bgcolor="#1f2a1f" style="background:#1f2a1f; border:1px solid #35503a; border-radius:999px; padding:6px 12px; font-family:${FONT_MONO}; font-size:11px; line-height:14px; font-weight:600; letter-spacing:0.66px; text-transform:uppercase; color:#9fd8a8;">&#10003;&nbsp; SMTP connected</td>
          </tr></table>`,
    '22px',
    30,
  );
  return {
    subject,
    text,
    html: layout({
      title: subject,
      preheader: text,
      appBaseUrl: input.appBaseUrl,
      card,
      footer: `    ${hostFooter(input.appBaseUrl).replace('%PAD%', '24px 32px 0')}`,
    }),
  };
}
