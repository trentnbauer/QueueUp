# Security Policy

QueueUp is a self-hosted app meant to run on your own infrastructure, usually for a
private friend group, though an instance can also be opened up (invite-only sign-up,
blocking, reporting and bans exist for that case). Either way, please report security
issues responsibly so they can be fixed before wider disclosure.

## Reporting a vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Instead, use GitHub's private vulnerability reporting:

1. Go to the [Security tab](../../security) of this repository.
2. Click **Report a vulnerability** under "Advisories".

This opens a private conversation with the maintainer and is the preferred way to
report anything security-related — auth bypass, injection, secrets exposure,
SSRF via the gg.deals/IGDB integrations, etc.

If you're unable to use GitHub's reporting flow, you can instead email
**trentnbauer@gmail.com** with details.

Please include, where relevant:

- A description of the issue and its potential impact
- Steps to reproduce (or a proof of concept)
- The affected version/commit

## Response

This is a small, actively-developed project maintained by one person, so there's no
formal SLA. Reports are triaged as they come in and a fix (or at least an
acknowledgment) should follow reasonably promptly. Once resolved, a fix will be
released and, if appropriate, a GitHub Security Advisory published.

## Supported versions

QueueUp doesn't maintain long-term-support branches — each Docker image build is
tagged with a real `major.minor.patch` version (see the [Deployment wiki
page](https://github.com/trentnbauer/QueueUp/wiki/Deployment#pre-built-images)), but
there's no separate maintenance track for older ones. `main` (and the `latest` image
built from it) is the only actively-patched line; deploying from it and pulling
updates regularly is the best way to stay current on security fixes.

## What the app already does

So you know what is expected before reporting, this is what a default deployment relies on:

- **Sign-in and sessions.** Sign-in is through Google, Discord, Steam, Xbox or an OIDC provider; QueueUp stores no passwords. Sessions are cookie based (`HttpOnly`, `SameSite=Lax`, `Secure` once TLS is confirmed), and every sign-in flow is tied to the browser session that started it. `ADMIN_EMAILS` only grants admin for an email the provider has verified, and `DEV_FAKE_AUTH` makes the production image refuse to start. An optional Cloudflare Turnstile captcha guards sign-in and fails closed. `SIGNUP_MODE=invite` limits who can create an account.
- **Two separate auth paths.** The web app uses the cookie session; `/api/v1` uses bearer API keys only (stored as a hash, optionally read-only or expiring). A key cannot reach a cookie route and a session cannot reach `/api/v1`.
- **Browser protections.** Content Security Policy and the other `helmet` headers, and rate limiting on the API (per client IP, so keep `TRUST_PROXY` right for your proxy).
- **Secrets.** Integration keys, people's library logins and AI keys, and Discord webhook URLs are encrypted at rest (AES-256-GCM, key derived from `SESSION_SECRET`) and never sent back to the browser. A backup does not expose them. The container runs as an unprivileged user.
- **AI and outbound requests.** A person's own AI address is off by default (`AI_ALLOW_USER_BASE_URL`), and when allowed it must resolve to a public address, checked before every request, unless an admin turns private addresses on.
- **Mini games.** The lobby WebSocket refuses a page that is not at `APP_BASE_URL` and is rate limited per connection. High scores only come from runs the server saw: solo practice runs on the server itself, and in a lobby a game that works out each player on their own device keeps its scores off the lists. Seeds and anything hidden from other players come from the cryptographic random source and are never put in a snapshot that should not carry them. A game that throws closes only its own lobby.
- **Guests.** Guest mini games (the sign-in page's **Play mini-games**) are unauthenticated by design, so they are narrow: two rate-limited endpoints, a captcha check when Turnstile is on, a name run through the banned-words and blocked-names lists, and a short-lived HMAC-signed token for one lobby. A guest exists only in the lobby's memory: there is no user row, session, score, rating or notification, and nothing about them is in a backup. Guest play is off on an invite-only or private instance.
- **Moderation.** People can block and report each other, and administrators can ban, force a name change, and manage banned words and blocked names. Administrator actions are written to an audit log.

## Scope notes

- Code scanning (CodeQL, via GitHub's default setup) runs on every push/PR.
  Dependency review (`.github/workflows/dependency-review.yml`) also runs on every
  PR to `main` and flags newly introduced known-vulnerable dependencies, and
  GitGuardian checks every PR for committed secrets.
- Stored credentials (integration keys entered by an administrator, people's library
  logins and AI keys, and room Discord webhook URLs) are encrypted at rest with
  AES-256-GCM using a key derived from `SESSION_SECRET`; API keys are stored only as a
  hash. The in-app privacy page (`/privacy`) lists exactly what is and isn't encrypted.
- The compose files fall back to the database password `changeme` when `POSTGRES_PASSWORD` is not set. That is safe as shipped, because the production database
  port is not published and only the app container can reach it, but set your own before you ever publish the port or put other services on its network.
- For anything that is a hardening idea rather than an exploitable issue, the
  **Security hardening** issue form is fine to use publicly.
- Report issues in QueueUp's own code and configuration. Vulnerabilities in
  upstream dependencies (Fastify, Prisma, React, etc.) should be reported to those
  projects directly, though flagging them here is still welcome if they materially
  affect a default QueueUp deployment.
