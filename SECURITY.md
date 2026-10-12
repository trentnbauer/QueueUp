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

## Scope notes

- Code scanning (CodeQL, via GitHub's default setup) runs on every push/PR.
  Dependency review (`.github/workflows/dependency-review.yml`) also runs on every
  PR to `main` and flags newly introduced known-vulnerable dependencies, and
  GitGuardian checks every PR for committed secrets.
- Stored credentials (integration keys entered by an administrator, people's library
  logins and AI keys, and room Discord webhook URLs) are encrypted at rest with
  AES-256-GCM using a key derived from `SESSION_SECRET`; API keys are stored only as a
  hash. The in-app privacy page (`/privacy`) lists exactly what is and isn't encrypted.
- For anything that is a hardening idea rather than an exploitable issue, the
  **Security hardening** issue form is fine to use publicly.
- Report issues in QueueUp's own code and configuration. Vulnerabilities in
  upstream dependencies (Fastify, Prisma, React, etc.) should be reported to those
  projects directly, though flagging them here is still welcome if they materially
  affect a default QueueUp deployment.
