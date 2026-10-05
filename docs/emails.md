# Emails QueueUp sends

Every email the server can send, with what triggers it and its exact current text, so they can be
themed together (issue #866). There are **three** emails. All go through one function,
`sendMail()` in `server/src/services/mailer.ts`, and nothing else in the app sends email.

Email only works when SMTP is set up (`SMTP_HOST`, `SMTP_PORT`, `SMTP_FROM`, or the same in
Administrator settings). Without it, no email is sent and the alert-address change is saved directly.

Every send, successful or not, is recorded in the **Email log** on the Administrator page (who it went
to, subject, kind, sent or failed with the mail server's reason; never the body; removed after 90 days).

## Today's constraints (for the design)

- **Themed HTML plus plain text.** The HTML versions live in `server/src/services/emailTemplates.ts`
  (one render function per email); `sendMail()` sends them with the original plain text as the
  fallback part. Everything member-written is HTML-escaped there.
- One sender (`SMTP_FROM`, for example `QueueUp <alerts@example.com>`); no reply-to.
- Links are built from `APP_BASE_URL`, shown below as `{APP_BASE_URL}`.
- The app's own wording is English only; emails are not translated.
- Text is built from member-written content (game titles, display names), so an HTML version must
  escape it.

---

## 1. Alert digest

|  |  |
|---|---|
| Code | `server/src/jobs/emailAlertJob.ts` (`sendEmailAlerts`) |
| Sent to | A person's alert address (their sign-in email, or the one they confirmed under Settings > Notifications) |
| Trigger | Runs every 2 minutes. One email per person per run, bundling their **unread** direct alerts of the types they switched email on for. Only alerts created after they switched that type on, between 1 minute and 24 hours old. Max 50 emails per run. |
| Subject | `QueueUp: 1 new alert` or `QueueUp: {n} new alerts` |

Body (one alert):

```
You have a new alert on QueueUp:

- {alert message}

Open QueueUp: {APP_BASE_URL}

You are getting this because you turned on email alerts. You can choose which alerts you get under Settings > Notifications.
```

Body (several): the first line is `You have {n} new alerts on QueueUp:`, followed by up to **20**
lines `- {alert message}`, then `…and {n - 20} more` if there are more.

### Alerts that can appear as a line in the digest

The type list is `EMAIL_ALERT_TYPES` in `packages/shared/src/types.ts`; the label is what the person
sees in Settings > Notifications. Example lines are the real wording.

| Type | Settings label | Example line |
|---|---|---|
| `price_drop` | Price drops on your wishlist | `"Hades" hit your target price - now 12.49 USD` / `"Hades" hit a new all-time low - now 12.49 USD` |
| `good_time_to_buy` | Good time to buy | (a near-lowest or well-under-usual price on a wishlisted game) |
| `wishlist_bundle_deal` | Wishlist bundle deals | `3 wishlisted games just dropped in price: A, B, C` |
| `release_watch` | New releases and DLC | `A new release showed up for "Portal": "Portal 2"` / `New DLC showed up for "Half-Life 2": "Episode One"` / `"{game}" is out now` |
| `playtime_mark_playing` | Suggestions to mark a game as Playing | `Your Steam playtime for "Hades" just went up - mark it as Playing?` |
| `playnite_sync_reminder` | Playnite sync reminders | (your Playnite library has not synced in 48 hours) |
| `play_together_request` | Ask to play together requests | `{name} wants to play {game} together` |
| `feed_reaction` | Reactions to your activity | `{name} reacted 🔥 to {game}` |
| `friend_recommendation` | Games your friends rate highly | `{name} rated "{game}" 4.5/5 - it's on your list` |
| `account_change` | Changes to your account | `Your email address for alerts was changed to {email}.` / `{provider} was linked as a sign-in method for your account.` |
| `room_game_beaten` | Room games to review after someone beats them | `{name} marked "{game}" as Beaten in {room}. Review it and mark it Beaten on your shelf?` |

Not emailed, ever: room-scoped notifications and other direct alerts without a toggle (for example
library sync errors).

---

## 2. Confirm alert email address

|  |  |
|---|---|
| Code | `server/src/routes/alertEmail.ts` (`PUT` alert email) |
| Sent to | The **new** address the person typed, before it is used |
| Trigger | Someone sets a different alert address in Settings > Notifications (only when SMTP is set up; otherwise the change is saved directly with no email) |
| Subject | `Confirm your email for QueueUp alerts` |

```
Someone (hopefully you) asked to send QueueUp alerts to this address.

Confirm it here: {APP_BASE_URL}/confirm-email/{token}

The link works for 24 hours. If this was not you, ignore this email and nothing changes.
```

The link opens the page in `web/src/pages/ConfirmEmailPage.tsx` (works signed in or out; the
single-use token is the proof). This is the one email a stranger could trigger for someone else's
address, so keep the "if this was not you" line prominent.

---

## 3. SMTP test email

|  |  |
|---|---|
| Code | `server/src/routes/admin.ts` (`POST /api/admin/smtp/test`) |
| Sent to | The signed-in administrator's own address |
| Trigger | An administrator presses "send a test email" in Administrator settings |
| Subject | `QueueUp test email` |

```
If you can read this, QueueUp can send email alerts.
```

---

## Not emails

For completeness: Discord room webhooks (`postRoomDiscord`) and in-app notifications are separate
channels and send no email. There are no welcome, sign-up, password-reset or marketing emails, and
sign-in is by Steam, Discord, Google, Xbox or OIDC, so no sign-in or password emails exist.
