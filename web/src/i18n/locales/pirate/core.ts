import type { core as en } from '../en/core';

/** Pirate for the "core" strings. Every English key must be here, with the same {placeholders}. */
export const core: Record<keyof typeof en, string> = {
  "core.login.tagline": "Pick yer plunder, together.",
  "core.login.feature.backlog": "Keep a log o’ yer cargo hold across every ship ye sail",
  "core.login.feature.vote": "Vote with yer crew on what be next",
  "core.login.feature.spin": "Spin the Wheel when no scallywag can decide",
  "core.login.feature.prices": "Watch the bounties and plunder yer Steam treasures",
  "core.login.signInWith": "Come aboard with {provider}",
  "core.login.sso": "The captain’s secret passage",
  "core.login.dev": "Come aboard (shipwright’s door)",
  "core.login.captchaFailed": "The lookout didn’t believe ye. Try again, matey.",
  "core.login.providersError": "Could not load the sign-in options. Check yer connection and try again.",
  "core.login.retry": "Try again",
  "core.login.selfHosted": "A QueueUp of yer very own",
  "core.login.privacy": "Pirate’s code",
  "core.login.source": "Treasure map",
  "core.onboarding.language.title": "Pick yer tongue",
  "core.onboarding.language.sub": "QueueUp will talk like this everywhere. Change it any time in Settings, if ye must.",
  "core.settings.language": "Language",
  "core.settings.language.sub": "More tongues be on the horizon.",
};
