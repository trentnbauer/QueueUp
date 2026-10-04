import type { MessageKey } from './en';

/** Pirate: QueueUp's joke language. These are its hand-written strings; everything else on screen
 * goes through `piratize` (see PirateMode). */
export const pirate: Record<MessageKey, string> = {
  'login.tagline': 'Pick yer plunder, together.',
  'login.feature.backlog': 'Keep a log o’ yer cargo hold across every ship ye sail',
  'login.feature.vote': 'Vote with yer crew on what be next',
  'login.feature.spin': 'Spin the Wheel when no scallywag can decide',
  'login.feature.prices': 'Watch the bounties and plunder yer Steam treasures',
  'login.signInWith': 'Come aboard with {provider}',
  'login.sso': 'The captain’s secret passage',
  'login.dev': 'Come aboard (shipwright’s door)',
  'login.captchaFailed': 'The lookout didn’t believe ye. Try again, matey.',
  'login.selfHosted': 'A QueueUp of yer very own',
  'login.privacy': 'Pirate’s code',
  'login.source': 'Treasure map',
  'onboarding.language.title': 'Pick yer tongue',
  'onboarding.language.sub': 'QueueUp will talk like this everywhere. Change it any time in Settings, if ye must.',
  'settings.language': 'Language',
  'settings.language.sub': 'More tongues be on the horizon.',
};

/** Whole phrases first (matched case-insensitively), then single words. */
const PHRASES: [RegExp, string][] = [
  [/\bsign in\b/gi, 'come aboard'],
  [/\bsign out\b/gi, 'abandon ship'],
  [/\blog out\b/gi, 'abandon ship'],
  [/\bloading…/gi, 'hoistin’ the sails…'],
  [/\bloading\.\.\./gi, 'hoistin’ the sails...'],
  [/\bpersonal shelf\b/gi, 'personal treasure chest'],
  [/\bwhat are we playing\?/gi, 'what be we plunderin’?'],
  [/\bthank you\b/gi, 'thank ye kindly'],
  [/\bno thanks\b/gi, 'nay, matey'],
  [/\bnot now\b/gi, 'not this tide'],
  [/\byou are\b/gi, 'ye be'],
  [/\byou're\b/gi, 'ye be'],
  [/\byou’re\b/gi, 'ye be'],
  [/\bit's\b/gi, 'it be'],
  [/\bit’s\b/gi, 'it be'],
  [/\bthere is\b/gi, 'there be'],
  [/\bthere are\b/gi, 'there be'],
  [/\bwon't play\b/gi, 'won’t touch'],
  [/\bwon’t play\b/gi, 'won’t touch'],
];

const WORDS: Record<string, string> = {
  hello: 'ahoy',
  welcome: 'ahoy',
  yes: 'aye',
  you: 'ye',
  your: 'yer',
  yours: 'yers',
  yourself: 'yerself',
  my: 'me',
  is: 'be',
  are: 'be',
  am: 'be',
  friend: 'matey',
  friends: 'hearties',
  everyone: 'the whole crew',
  member: 'crewmate',
  members: 'crew',
  room: 'ship',
  rooms: 'ships',
  shelf: 'chest',
  backlog: 'cargo hold',
  wishlist: 'treasure map',
  beaten: 'conquered',
  dropped: 'scuttled',
  price: 'bounty',
  prices: 'bounties',
  money: 'doubloons',
  buy: 'plunder',
  achievement: 'treasure',
  achievements: 'treasures',
  settings: 'riggin’',
  search: 'seek',
  find: 'seek',
  stop: 'avast',
  cancel: 'belay that',
  wow: 'shiver me timbers',
  notifications: 'messages in bottles',
  notification: 'message in a bottle',
  profile: 'captain’s log',
  journal: 'ship’s log',
  activity: 'goings-on',
  stranger: 'landlubber',
  of: 'o’',
  for: 'fer',
};

/** Keeps the original word's shape: ALL CAPS, Capitalised or lower case. */
function matchCase(original: string, replacement: string): string {
  if (original.length > 1 && original === original.toUpperCase()) return replacement.toUpperCase();
  if (original[0] === original[0].toUpperCase()) return replacement[0].toUpperCase() + replacement.slice(1);
  return replacement;
}

/** Turns English into pirate, except the parts matching `keep` (game titles and people's names -
 * those are never renamed). Deterministic, so re-renders don't flicker. */
export function piratize(text: string, keep?: RegExp | null): string {
  if (!keep) return piratizeRun(text);
  let out = '';
  let last = 0;
  for (const m of text.matchAll(keep)) {
    out += piratizeRun(text.slice(last, m.index)) + m[0];
    last = m.index + m[0].length;
  }
  return out + piratizeRun(text.slice(last));
}

/** A regex matching any of `names` (longest first, so "Hades II" wins over "Hades"), or null. */
export function keepPattern(names: Iterable<string>): RegExp | null {
  const list = [...new Set(names)].filter((n) => n.trim().length > 1).sort((a, b) => b.length - a.length);
  if (!list.length) return null;
  // Whole words only: a friend called "You" mustn't stop "Your" turning into "Yer".
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${list.map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(?![\\p{L}\\p{N}])`, 'gu');
}

function piratizeRun(text: string): string {
  if (!text) return text;
  let out = text;
  for (const [re, to] of PHRASES) out = out.replace(re, (m) => matchCase(m, to));
  out = out.replace(/[A-Za-z]+(?:['’][a-z]+)?/g, (word) => {
    const swap = WORDS[word.toLowerCase()];
    if (swap) return matchCase(word, swap);
    // Playing -> Playin’, Loading -> Loadin’ (not "ring", "king", "thing").
    if (word.length > 5 && /ing$/i.test(word)) return word.slice(0, -1) + '’';
    return word;
  });
  return out;
}
