/** English, the source catalog: every other language translates these keys, and anything a
 * language hasn't translated yet falls back to this. Placeholders look like {name}. */
export const en = {
  'login.tagline': 'Pick a game, together.',
  'login.feature.backlog': 'Track your backlog across every platform you own',
  'login.feature.vote': "Vote with your squad on what's up next",
  'login.feature.spin': 'Spin the Wheel when nobody can decide',
  'login.feature.prices': 'Watch prices and auto-sync Steam achievements',
  'login.signInWith': 'Sign in with {provider}',
  'login.sso': 'Single sign-on',
  'login.dev': 'Sign in (development)',
  'login.captchaFailed': "The security check didn't go through. Please try again.",
  'login.selfHosted': 'Self-hosted QueueUp',
  'login.privacy': 'Privacy',
  'login.source': 'Source',
  'onboarding.language.title': 'Pick your language',
  'onboarding.language.sub': 'QueueUp will use this everywhere. You can change it anytime in Settings.',
  'settings.language': 'Language',
  'settings.language.sub': 'More languages are on the way.',
} as const;

export type MessageKey = keyof typeof en;
