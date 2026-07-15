# Security Policy

SquadQueue is a self-hosted app meant to run on your own infrastructure, typically
exposed only to a private friend group rather than the public internet. Even so,
please report security issues responsibly so they can be fixed before wider disclosure.

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

SquadQueue does not yet have tagged releases — `main` is the only supported version.
Deploying from `main` and pulling updates regularly is the best way to stay current
on security fixes.

## Scope notes

- Automated dependency review and scheduled code-scanning triage are wired up in
  `.github/workflows/` (currently disabled while other repo changes land — see the
  workflow files for status) and will re-run automatically once re-enabled.
- Report issues in SquadQueue's own code and configuration. Vulnerabilities in
  upstream dependencies (Fastify, Prisma, React, etc.) should be reported to those
  projects directly, though flagging them here is still welcome if they materially
  affect a default SquadQueue deployment.
