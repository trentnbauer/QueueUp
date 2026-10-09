import type { SpinPlay } from './spinModes.js';
export type GameStatus = 'backlog' | 'playing' | 'done' | 'dropped' | 'wishlist' | 'replay' | 'play_next' | 'paused' | 'wont_play';

export type RoomRole = 'room_master' | 'moderator' | 'member';

export type RoomPlatform =
  | 'pc'
  | 'xbox_360'
  | 'xbox_one'
  | 'xbox_series'
  | 'ps3'
  | 'ps4'
  | 'ps5'
  | 'switch'
  | 'switch2'
  | 'quest'
  | 'quest2'
  | 'quest3'
  | 'nes'
  | 'snes'
  | 'n64'
  | 'gamecube'
  | 'wii'
  | 'wii_u'
  | 'gb'
  | 'gbc'
  | 'gba'
  | 'ds'
  | 'n3ds'
  | 'ps1'
  | 'ps2'
  | 'psp'
  | 'vita'
  | 'master_system'
  | 'genesis'
  | 'saturn'
  | 'dreamcast'
  | 'android'
  | 'ios';

/** Key order is display order everywhere platforms are listed: PC first, then newest release first. */
export const ROOM_PLATFORM_LABELS: Record<RoomPlatform, string> = {
  pc: 'PC',
  switch2: 'Switch 2',
  quest3: 'Meta Quest 3',
  ps5: 'PlayStation 5',
  xbox_series: 'Xbox Series X|S',
  quest2: 'Meta Quest 2',
  quest: 'Meta Quest',
  switch: 'Switch',
  xbox_one: 'Xbox One',
  ps4: 'PlayStation 4',
  wii_u: 'Wii U',
  vita: 'PlayStation Vita',
  n3ds: 'Nintendo 3DS',
  android: 'Android',
  ios: 'iOS',
  wii: 'Wii',
  ps3: 'PlayStation 3',
  xbox_360: 'Xbox 360',
  psp: 'PSP',
  ds: 'Nintendo DS',
  gamecube: 'GameCube',
  gba: 'Game Boy Advance',
  ps2: 'PlayStation 2',
  dreamcast: 'Dreamcast',
  gbc: 'Game Boy Color',
  n64: 'Nintendo 64',
  ps1: 'PlayStation',
  saturn: 'Sega Saturn',
  snes: 'SNES',
  gb: 'Game Boy',
  genesis: 'Mega Drive / Genesis',
  master_system: 'Master System',
  nes: 'NES',
};

/** Every RoomPlatform in display order (see ROOM_PLATFORM_LABELS). */
export const PLATFORM_ORDER = Object.keys(ROOM_PLATFORM_LABELS) as RoomPlatform[];

/** Sorts RoomPlatforms into display order (PC first, then newest first). */
export function sortPlatforms<T extends RoomPlatform>(platforms: readonly T[]): T[] {
  return [...platforms].sort((a, b) => PLATFORM_ORDER.indexOf(a) - PLATFORM_ORDER.indexOf(b));
}

/** The exact IGDB platform name(s) each RoomPlatform family corresponds to - shared so both the
 * server (scoping an IGDB search query to a room/owned-systems platform) and the web client
 * (matching a game's free-text `platform` label against a user's owned systems) use the same
 * mapping instead of two copies drifting apart. */
export const IGDB_PLATFORM_NAMES: Record<RoomPlatform, string[]> = {
  switch: ['Nintendo Switch'],
  switch2: ['Nintendo Switch 2'],
  xbox_360: ['Xbox 360'],
  xbox_one: ['Xbox One'],
  xbox_series: ['Xbox Series X|S'],
  ps3: ['PlayStation 3'],
  ps4: ['PlayStation 4'],
  ps5: ['PlayStation 5'],
  pc: ['PC (Microsoft Windows)', 'Mac', 'Linux'],
  // The original Quest kept its pre-rebrand IGDB name ("Oculus Quest") rather than being
  // retroactively renamed - confirmed against a live IGDB /platforms query (ids 384/386/471) -
  // while Quest 2/3, which launched under the Meta brand, are "Meta Quest 2"/"Meta Quest 3".
  quest: ['Oculus Quest'],
  quest2: ['Meta Quest 2'],
  quest3: ['Meta Quest 3'],
  nes: ['Nintendo Entertainment System'],
  snes: ['Super Nintendo Entertainment System'],
  n64: ['Nintendo 64'],
  gamecube: ['Nintendo GameCube'],
  wii: ['Wii'],
  wii_u: ['Wii U'],
  gb: ['Game Boy'],
  gbc: ['Game Boy Color'],
  gba: ['Game Boy Advance'],
  ds: ['Nintendo DS'],
  n3ds: ['Nintendo 3DS', 'New Nintendo 3DS'],
  ps1: ['PlayStation'],
  ps2: ['PlayStation 2'],
  psp: ['PlayStation Portable'],
  vita: ['PlayStation Vita'],
  master_system: ['Sega Master System/Mark III'],
  genesis: ['Sega Mega Drive/Genesis'],
  saturn: ['Sega Saturn'],
  dreamcast: ['Dreamcast'],
  android: ['Android'],
  ios: ['iOS'],
};

const PLATFORM_FAMILY_BRAND: Record<RoomPlatform, string> = {
  pc: 'PC',
  xbox_360: 'Xbox',
  xbox_one: 'Xbox',
  xbox_series: 'Xbox',
  ps3: 'PlayStation',
  ps4: 'PlayStation',
  ps5: 'PlayStation',
  switch: 'Nintendo Switch',
  switch2: 'Nintendo Switch',
  quest: 'Meta Quest',
  quest2: 'Meta Quest',
  quest3: 'Meta Quest',
  nes: 'Nintendo',
  snes: 'Nintendo',
  n64: 'Nintendo',
  gamecube: 'Nintendo',
  wii: 'Nintendo',
  wii_u: 'Nintendo',
  gb: 'Nintendo',
  gbc: 'Nintendo',
  gba: 'Nintendo',
  ds: 'Nintendo',
  n3ds: 'Nintendo',
  ps1: 'PlayStation',
  ps2: 'PlayStation',
  psp: 'PlayStation',
  vita: 'PlayStation',
  master_system: 'Sega',
  genesis: 'Sega',
  saturn: 'Sega',
  dreamcast: 'Sega',
  android: 'Android',
  ios: 'iOS',
};

/** Which console brand a free-text platform label (e.g. "PlayStation 4", "Xbox Series X|S") belongs
 * to, so the Personal Shelf's platform filter can group PS4/PS5 (etc.) under one "PlayStation" pill
 * instead of a separate pill per exact platform string. Mirrors the same substring rules the server
 * uses in platformFamilies (server/src/services/igdbClient.ts) to classify raw IGDB platform names
 * down to a RoomPlatform family, then maps that family to its brand. A label that matches no known
 * family (an older/uncommon platform IGDB reports that isn't one of the families a Room can be
 * restricted to) falls back to itself, so it still gets its own pill rather than being dropped or
 * lumped in with something unrelated. */
export function platformBrand(label: string): string {
  const family = platformFamilyOf(label);
  return family ? PLATFORM_FAMILY_BRAND[family] : label;
}

/** Classifies one raw IGDB platform name (or free-text label) down to a RoomPlatform family, or
 * null if it isn't one we model. Order matters: each more specific name (Switch 2, Game Boy Color,
 * Nintendo 3DS, Wii U, PlayStation 5...) is checked before the bare name it contains. The server's
 * platformFamilies (igdbClient.ts) and platformBrand above both go through this one function. */
export function platformFamilyOf(label: string): RoomPlatform | null {
  const lower = label.toLowerCase();
  if (lower.includes('switch 2')) return 'switch2';
  if (lower.includes('switch')) return 'switch';
  if (lower.includes('quest 3')) return 'quest3';
  if (lower.includes('quest 2')) return 'quest2';
  if (lower.includes('quest')) return 'quest';
  if (lower.includes('xbox series')) return 'xbox_series';
  if (lower.includes('xbox one')) return 'xbox_one';
  if (lower.includes('xbox 360')) return 'xbox_360';
  if (lower.includes('playstation 5') || /\bps5\b/.test(lower)) return 'ps5';
  if (lower.includes('playstation 4') || /\bps4\b/.test(lower)) return 'ps4';
  if (lower.includes('playstation 3') || /\bps3\b/.test(lower)) return 'ps3';
  if (lower.includes('playstation 2') || /\bps2\b/.test(lower)) return 'ps2';
  if (lower.includes('vita')) return 'vita';
  if (lower.includes('playstation portable') || /\bpsp\b/.test(lower)) return 'psp';
  if (lower.trim() === 'playstation' || /\bps1\b|\bpsx\b/.test(lower)) return 'ps1';
  if (lower.includes('3ds')) return 'n3ds';
  if (lower.includes('nintendo ds')) return 'ds';
  if (lower.includes('game boy advance')) return 'gba';
  if (lower.includes('game boy color')) return 'gbc';
  if (lower.includes('game boy')) return 'gb';
  if (lower.includes('wii u')) return 'wii_u';
  if (lower.trim() === 'wii') return 'wii';
  if (lower.includes('gamecube')) return 'gamecube';
  if (lower.includes('nintendo 64')) return 'n64';
  if (lower.includes('super nintendo') || lower.includes('snes')) return 'snes';
  if (lower.includes('entertainment system') || lower.trim() === 'nes') return 'nes';
  if (lower.includes('mega drive') || lower.includes('genesis')) return 'genesis';
  if (lower.includes('master system')) return 'master_system';
  if (lower.includes('saturn')) return 'saturn';
  if (lower.includes('dreamcast')) return 'dreamcast';
  if (lower.includes('android')) return 'android';
  if (/\bios\b/.test(lower) || lower.includes('iphone') || lower.includes('ipad')) return 'ios';
  if (lower.includes('pc') || lower.includes('windows') || lower.includes('mac') || lower.includes('linux')) return 'pc';
  return null;
}

/** Re-orders a comma-separated platform label (IGDB's "Xbox Series X|S, PC (Microsoft Windows),
 * PlayStation 5") into display order: PC first, then newest first. Names we don't model keep their
 * relative order, after the ones we do. */
export function sortPlatformLabel(label: string): string {
  const rank = (name: string) => {
    const family = platformFamilyOf(name);
    return family ? PLATFORM_ORDER.indexOf(family) : PLATFORM_ORDER.length;
  };
  const names = label.split(',').map((n) => n.trim()).filter(Boolean);
  return names
    .map((name, index) => ({ name, index, rank: rank(name) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((n) => n.name)
    .join(', ');
}

/** Newer hardware plays older games: a PS5 owner can add PS4 games, Switch 2 plays Switch, Xbox
 * Series plays Xbox One and 360, and so on. Each entry lists what that platform can also play. */
export const BACKWARDS_COMPATIBLE: Partial<Record<RoomPlatform, RoomPlatform[]>> = {
  ps5: ['ps4'],
  switch2: ['switch'],
  xbox_series: ['xbox_one', 'xbox_360'],
  n3ds: ['ds'],
  wii_u: ['wii'],
  ps2: ['ps1'],
};

/** The given platforms plus everything they can play through backwards compatibility. */
export function withBackwardsCompatible(platforms: RoomPlatform[]): RoomPlatform[] {
  return Array.from(new Set(platforms.flatMap((p) => [p, ...(BACKWARDS_COMPATIBLE[p] ?? [])])));
}

// Confirmed against gg.deals' real Prices API response before picking these - not every country
// code works (e.g. "uk" 404s, the ISO code "gb" is what it actually wants).
export type PriceRegion = 'us' | 'gb' | 'eu' | 'au' | 'ca' | 'br';

export const PRICE_REGION_LABELS: Record<PriceRegion, string> = {
  us: 'US ($)',
  gb: 'UK (£)',
  eu: 'EU (€)',
  au: 'Australia ($)',
  ca: 'Canada ($)',
  br: 'Brazil (R$)',
};

export type VoteValue = 1 | 2 | 3 | 4 | 5;

export const VOTE_SCALE: Record<VoteValue, string> = {
  1: '😴',
  2: '🙂',
  3: '😃',
  4: '🤩',
  5: '🔥',
};

export interface User {
  id: string;
  displayName: string;
  avatarColor: string;
  avatarUrl: string | null;
  isAdmin: boolean;
}

/** The event kinds a room's Discord webhook can post - each independently toggleable (Room Master
 * only), see DEFAULT_DISCORD_EVENTS for what's on out of the box. `memberAct` covers members'
 * own Personal Shelf milestones (hidden games excluded). */
export type DiscordEventKey = 'added' | 'suggest' | 'votes' | 'spins' | 'status' | 'reviews' | 'members' | 'memberAct';

export type RoomDiscordEvents = Record<DiscordEventKey, boolean>;

export const DEFAULT_DISCORD_EVENTS: RoomDiscordEvents = {
  added: true,
  suggest: true,
  votes: false,
  spins: true,
  status: true,
  reviews: true,
  members: true,
  memberAct: false,
};

export const DISCORD_EVENT_LABELS: Record<DiscordEventKey, string> = {
  added: 'Games added',
  suggest: 'Suggestions',
  votes: 'Votes',
  spins: 'Spins',
  status: 'Playing & beaten',
  reviews: 'Reviews',
  members: 'Members join or leave',
  memberAct: 'Member activity',
};

export const DISCORD_EVENT_KEYS = Object.keys(DEFAULT_DISCORD_EVENTS) as DiscordEventKey[];

/** Merges a stored (possibly partial / null) events blob over the defaults. */
export function resolveDiscordEvents(stored: unknown): RoomDiscordEvents {
  const out: RoomDiscordEvents = { ...DEFAULT_DISCORD_EVENTS };
  if (stored && typeof stored === 'object') {
    for (const key of DISCORD_EVENT_KEYS) {
      const v = (stored as Record<string, unknown>)[key];
      if (typeof v === 'boolean') out[key] = v;
    }
  }
  return out;
}

export interface Room {
  id: string;
  name: string;
  /** Null means "any platform" (issue #473) - the room isn't locked to a single console/PC, so
   * suggestion-matching, ownership, and IGDB platform resolution fall back to per-game/per-user
   * platform data instead of this one field. */
  platform: RoomPlatform | null;
  accentColor: string;
  createdBy: string;
  createdAt: string;
  myRole: RoomRole;
  /** Only present when the caller has permission to see it (any member, per current rules). */
  inviteCode?: string;
  /** Posts room activity to this Discord channel webhook, if set. Room Master only to view/edit. */
  discordWebhookUrl?: string | null;
  /** A Discord server invite link; visible to every member, who then see a Join Discord button. */
  discordInviteUrl?: string | null;
  /** Spin the Wheel draws from games every current member owns, plus games with a live price at
   * or under this many dollars. 0 reproduces the old "fully owned only" behavior. */
  spinOwnershipMaxPrice: number;
  /** Which visual presentation Spin the Wheel uses - see SpinWheelTheme. */
  spinWheelTheme: SpinWheelTheme;
  /** Filters the Spin dialog starts with in this room (#801). */
  spinDefaults: SpinDefaults;
  /** When true, this room is listed in the public room directory and any signed-in user can
   * self-join it instantly (no invite code, no approval step). Defaults to false. */
  isPublic: boolean;
  /** When true, a plain Member's "add a game" becomes a suggestion a Room Master/Moderator must
   * approve or decline (issue #362), instead of adding directly. Room Masters/Moderators always
   * add directly regardless of this flag. Defaults to false. */
  requireGameApproval: boolean;
  /** Who can invite people to the room: any member, or only Moderators and the Room Master. Only
   * those allowed get the invite code in `inviteCode` (and may add friends directly). */
  invitePermission: RoomInvitePermission;
  /** Which event kinds post to the Discord webhook (always fully resolved against the defaults).
   * Room Master only, like the webhook URL itself. */
  discordEvents?: RoomDiscordEvents;
  /** Only on GET /api/rooms: how many members the room has and how many games sit in its Queue. */
  memberCount?: number;
  queuedCount?: number;
  /** Set when the caller is an administrator managing this room as its Room Master without being a
   * member (#792): when that runs out, as an ISO timestamp. */
  adminManagedUntil?: string;
}

/** A member's lightweight nomination for a room game, pending a Room Master/Moderator's approval
 * (issue #362) - only created when the room's requireGameApproval is on and the suggester is a
 * plain Member. See GameSuggestion in schema.prisma for why this is a separate concept from Game
 * rather than a GameStatus value. */
/** A room's shared, in-progress Spin the Wheel session (see RoomSpin in schema.prisma) - polled by
 * every member currently viewing the room so the modal opens/updates for all of them together, not
 * just whoever clicked "Pick a Game". Clicking the left/right side of the spin nudges its physics
 * (see spinPhysics.ts in this package) rather than instantly rerolling - `position0`/`velocity0`/
 * `timestamp0` are a snapshot every client derives the same live position from, and `settlesAt`/
 * `settledPosition` are computed once (at start, or on each nudge) so every observer - regardless
 * of when they happen to check - agrees on the same eventual winner:
 * `strip[candidateIndexAt(settledPosition, strip.length)]`, once `Date.now() >= settlesAt`.
 * `nudgeCount` bumps on every nudge, the same "did the base change" signal `shakeCount` used to be. */
export interface RoomSpinSession {
  id: string;
  theme: ConcreteSpinWheelTheme;
  strip: Game[];
  position0: number;
  velocity0: number;
  /** ISO timestamp. */
  timestamp0: string;
  /** ISO timestamp. */
  settlesAt: string;
  settledPosition: number;
  nudgeCount: number;
  /** How many distinct members have opened Spin the Wheel while it's still in its pre-start
   * waiting room (issue #488) - lets the waiting-room countdown show who's actually shown up
   * instead of counting down blind. Meaningless once the spin has started moving (nothing clears
   * it then, but nothing reads it then either - see SPIN_WAITING_ROOM_MS in roomSpin.ts). */
  readyCount: number;
  /** Votes to respin the settled result, how many it takes, and whether the viewer has voted. */
  respinVotes: number;
  respinNeeded: number;
  youVotedRespin: boolean;
  /** The round's state for every mode but the reel (see spinModes.ts); null for the reel, and
   * while the waiting room is still open. */
  play: SpinPlay | null;
  /** Server time when this was sent, so clients can line their clock up with the round's timestamps. */
  serverNow: string;
  /** Identifies `strip`'s games. A poll that sends back the key it already has gets an empty strip
   * and `stripOmitted` instead of the same games again (they don't change during a spin). */
  stripKey: string;
  stripOmitted?: boolean;
}

/** A room's spin session, but only the sliver a cross-room "someone just started a spin" popup
 * needs (issue #555) - deliberately not RoomSpinSession itself, which carries the full strip/
 * physics state and is only worth fetching per-room, at the fast poll useRoomSpin already runs
 * for whoever's actually looking at that room. This is the opposite shape: cheap enough to poll
 * across every room a member is in, so someone who *isn't* currently looking gets pulled in before
 * the spin's pre-start waiting room (SPIN_WAITING_ROOM_MS, see roomSpin.ts) closes. Only ever
 * includes a spin still in that waiting window - once a spin has started moving, joining a popup
 * doesn't meaningfully let anyone participate anymore. */
export interface ActiveRoomSpin {
  spinId: string;
  roomId: string;
  roomName: string;
}

export interface GameSuggestion {
  id: string;
  roomId: string;
  igdbId: number;
  title: string;
  platform: string;
  coverImageUrl: string | null;
  releaseYear: number | null;
  suggestedBy: User;
  createdAt: string;
}

/** Minimal shape returned by GET /api/rooms/public for the room directory - the caller isn't a
 * member yet, so this deliberately omits invite codes, webhook URLs, and other member-only data
 * that the full Room DTO carries. */
export interface PublicRoomSummary {
  id: string;
  name: string;
  /** Null means "any platform" (issue #473) - see Room.platform. */
  platform: RoomPlatform | null;
  accentColor: string;
  memberCount: number;
}

/** Spin filters a room's Spin dialog starts with (#801). Each is optional; unset means "any". */
export interface SpinDefaults {
  /** Longest time to beat, in hours. */
  maxTtb?: number;
  /** Lowest IGDB score, 0-100. */
  minScore?: number;
  /** Only games every member owns. */
  everyoneOwns?: boolean;
}

/** How Spin the Wheel picks a game, room-settable. "reel" is the original horizontal reel; the
 * others are the spin modes in spinModes.ts. "random" resolves to one of the others at spin time
 * (see resolveConcreteTheme) rather than being a mode itself - ConcreteSpinWheelTheme is what a
 * spin actually runs. */
export type SpinWheelTheme =
  | 'reel'
  | 'card_vote'
  | 'slot'
  | 'knockout'
  | 'plinko'
  | 'plinko_stake'
  | 'ban_draft'
  | 'roulette'
  | 'claw'
  | 'match_three'
  | 'random';

export const SPIN_WHEEL_THEME_LABELS: Record<SpinWheelTheme, string> = {
  reel: 'Reel',
  card_vote: 'Three-card vote',
  slot: 'Hold & respin slots',
  knockout: 'Knockout',
  plinko: 'Plinko drop',
  plinko_stake: 'Chip-stake plinko',
  ban_draft: 'Ban draft',
  roulette: 'Prize wheel',
  claw: 'Claw machine',
  match_three: 'Match three',
  random: 'Random',
};

/** One line on how each mode picks, for the room settings picker. */
export const SPIN_WHEEL_THEME_HINTS: Record<SpinWheelTheme, string> = {
  reel: 'The classic: a reel of covers slows to a stop.',
  card_vote: 'Three cards are dealt and the room votes.',
  slot: 'Pairs hold while the odd reel respins.',
  knockout: 'Games are knocked out one by one. Everyone gets a shield.',
  plinko: 'A chip bounces down into a game.',
  plinko_stake: 'Everyone stakes a chip to boost a game, then one drop decides.',
  ban_draft: 'Take turns banning games until one is left.',
  roulette: 'A prize wheel with a wedge for each game.',
  claw: 'Take turns with the claw. Top-voted games grip better.',
  match_three: 'Take turns flipping tiles. First game to three wins.',
  random: 'A different one each spin.',
};

export type ConcreteSpinWheelTheme = Exclude<SpinWheelTheme, 'random'>;

export const CONCRETE_SPIN_WHEEL_THEMES: ConcreteSpinWheelTheme[] = [
  'reel',
  'card_vote',
  'slot',
  'knockout',
  'plinko',
  'plinko_stake',
  'ban_draft',
  'roulette',
  'claw',
  'match_three',
];

export const SPIN_WHEEL_THEMES: SpinWheelTheme[] = [...CONCRETE_SPIN_WHEEL_THEMES, 'random'];

/** A stored theme as a current one: the retired "crate" and "card_flip" (which only ever showed the
 * reel) read as "reel". */
export function normalizeSpinTheme(stored: string): SpinWheelTheme {
  return (SPIN_WHEEL_THEMES as string[]).includes(stored) ? (stored as SpinWheelTheme) : 'reel';
}

export interface RoomMember {
  roomId: string;
  user: User;
  role: RoomRole;
  joinedAt: string;
}

/** A room member's completion stats within that room (issue: member list click-to-expand).
 * completedCount is games they added to this room that are Beaten or queued for Replay;
 * fullyCompletedCount is how many of this room's titles their own Steam account has 100%'d,
 * regardless of who added them - see AchievementCompletion. */
export interface RoomMemberStats {
  completedCount: number;
  fullyCompletedCount: number;
}

export interface GamePrice {
  amount: string | null;
  currency: string | null;
  source: 'live' | 'unavailable';
  /** All-time-low price seen for this game (from gg.deals' historical price data), same currency
   * as `amount`. Null only when gg.deals has no historical data at all - unlike `amount`, this is
   * the raw value even when it equals (or is above) the current price; callers displaying it as a
   * "here's a discount" callout should compare against `amount` themselves before showing it. */
  historicalLow: string | null;
  /** When this price entry was last fetched from gg.deals (ISO string) - i.e. the age of the
   * cached/served value, not necessarily "just now". Null only when no fetch has ever happened
   * (e.g. the game has no Steam app id at all). */
  lastRefreshedAt: string | null;
}

export interface VoteSummary {
  user: User;
  value: VoteValue;
  /** When this vote was cast/last changed (ISO string) - a vote from months ago carries the same
   * weight as a fresh one everywhere it's used (sorting, Spin the Wheel), but the UI surfaces its
   * age so a stale 🔥 doesn't read as current. */
  createdAt: string;
}

/** A user-defined organizational label, layered on top of the fixed GameStatus enum (issue #247) -
 * e.g. "Co-op only" or "Short & sweet". Per-user, not shared/room-level - see Tag in schema.prisma. */
export interface Tag {
  id: string;
  name: string;
  createdAt: string;
}

/** An owner's review of a Beaten game - five independent 1-5 scores (any may be null) plus an
 * optional one-line note. */
export interface GameReview {
  art: number | null;
  gameplay: number | null;
  story: number | null;
  sound: number | null;
  /** Themes and ideas (issue #865): null when not scored, and on reviews from before it existed. */
  themes: number | null;
  note: string | null;
  /** Would they recommend it: 👍 true, 👎 false, null when they didn't say. */
  recommend: boolean | null;
  reviewedAt: string;
}

export const REVIEW_CATEGORIES = [
  { key: 'art', label: 'Art style' },
  { key: 'gameplay', label: 'Gameplay' },
  { key: 'story', label: 'Story' },
  { key: 'sound', label: 'Sound & music' },
  { key: 'themes', label: 'Themes & ideas' },
] as const;

export type ReviewCategoryKey = (typeof REVIEW_CATEGORIES)[number]['key'];

/** One block of Steam's PC requirements (minimum or recommended), as labelled lines. */
export interface SteamRequirementSet {
  lines: { label: string; value: string }[];
  /** The block as plain text, for pages that are not laid out as labelled lines. */
  text: string;
  /** The Memory line as GB, when it could be read, so it can be compared with the person's own. */
  memoryGb: number | null;
}

/** Steam's PC system requirements for a game (#1045). */
export interface GameRequirements {
  minimum: SteamRequirementSet | null;
  recommended: SteamRequirementSet | null;
}

export interface Game {
  id: string;
  roomId: string | null;
  addedBy: User;
  title: string;
  platform: string;
  genre: string | null;
  releaseYear: number | null;
  /** Full release date/time (issue #284) - releaseYear alone is only precise to the year. Null on
   * games added before this field existed, or when IGDB has no release date at all. */
  releaseDate: string | null;
  maxCoopPlayers: number | null;
  /** Hours for an average "main story" playthrough, from IGDB (issue #189). Null when IGDB has no
   * time-to-beat data for this game. */
  timeToBeatHours: number | null;
  /** Hours for a rushed/speedrun-style playthrough, from IGDB's "hastily" time-to-beat figure
   * (issue #248) - always the smallest of the three figures IGDB exposes (hastily < normally <
   * completely for any given game), i.e. less time than timeToBeatHours, not more. Null when
   * IGDB has no time-to-beat data. */
  timeToBeatRushedHours: number | null;
  /** Hours for a full completionist (100%) playthrough, from IGDB's "completely" time-to-beat
   * figure (issue #248). Null when IGDB has no time-to-beat data. */
  timeToBeatCompletionistHours: number | null;
  ggDealsUrl: string | null;
  coverImageUrl: string | null;
  status: GameStatus;
  /** True once any player's Steam achievement progress on this game has ever been observed at
   * 100% - drives the card ribbon showing "Clocked" (gold) instead of "Beaten" (green) for a Done
   * game. Sticky - a later Replay doesn't clear it. */
  steamFullyCompleted: boolean;
  /** The viewer's own Steam achievement count for this title ("10/20" on the cards), as last read
   * from Steam - null when they have no Steam account linked, the game has no achievements, or it
   * hasn't been checked yet. */
  myAchievements: { unlocked: number; total: number } | null;
  /** Room games only: the other members' stored counts (same source as myAchievements), best
   * first. Members with nothing stored are left out; always empty on the Personal Shelf. */
  memberAchievements: { user: User; unlocked: number; total: number }[];
  price: GamePrice;
  /** A price to alert at, if set (issue #162) - shared per-game, not per-user, so a room game
   * notifies everyone in the room once it's hit. Null when no alert is set. */
  targetPrice: string | null;
  /** A user-set fallback dollar amount (issue #385) - shown wherever the price otherwise displays
   * as unavailable (see GamePrice.amount/source), for games gg.deals/Steam can't match at all.
   * Null when unset, or ignored once a live price is available. */
  manualPrice: string | null;
  votes: VoteSummary[];
  myVote: VoteValue | null;
  voteScore: number;
  /** Whether the current user owns this game (see GameOwnership) - meaningful on the Personal
   * Shelf too (a simple "is there any claim at all" there, deferring to `status` - see
   * getOwnershipInfo's doc comment), not just Communal Rooms. */
  youOwn: boolean;
  /** How many of the room's *current* members own this game, out of how many current members
   * there are - e.g. {owned: 3, total: 4}. Null on the Personal Shelf, where there's no group
   * ownership to count. */
  ownership: { owned: number; total: number } | null;
  /** Ids of the current room members who own it (empty on the Personal Shelf). */
  ownerIds: string[];
  /** How many of the room's *current* members also have this game wishlisted on their own
   * Personal Shelf, out of how many current members there are (issue #368) - parallel to
   * `ownership` above. Null on the Personal Shelf, where there's no group to count. */
  wishlist: { wishlisted: number; total: number } | null;
  /** Ids of the current room members counted in `wishlist` (empty on the Personal Shelf). */
  wishlisterIds: string[];
  /** Which platform(s) the current viewer owns this on (issue #456) - Personal Shelf only, always
   * [] for a room game (its single Room.platform already says which platform). Also [] when not
   * owned, or when owned but the claim predates platform tracking (pre-migration GameOwnership
   * rows - see that model's doc comment) - treat all of those the same: nothing to show. */
  ownedPlatforms: RoomPlatform[];
  /** The *viewer's own* tags applied to this specific game row (issue #247) - always empty for a
   * room game someone else added, since only the person who added a game may tag it (tags are a
   * personal filing scheme, not a room feature - see Tag/GameTag in schema.prisma). Empty array,
   * never omitted, when the viewer has tagged nothing here. */
  tags: Tag[];
  /** IGDB's franchise/series id, if this game belongs to one - null otherwise, and on games added
   * before this was captured. Used to compute the "play after" dropdown's default suggestion
   * (the closest-released earlier entry from the same collection already in the room). */
  igdbCollectionId: number | null;
  /** 0-100 IGDB review score (issue #311) - null when IGDB has no review data for this game, or
   * on games added before this was captured. Nudges Spin the Wheel's weighted pick toward
   * better-reviewed games - see spinCandidateWeight in gameGridLogic.ts. */
  reviewScore: number | null;
  /** PC install size in MB from Steam's system requirements (#800); null when unknown. */
  downloadSizeMb: number | null;
  /** IGDB lists single player as its only mode - no multiplayer or co-op. Null when unknown. */
  singlePlayerOnly: boolean | null;
  /** User-set "play this after" pointer to another game in the same room (e.g. Borderlands 2 ->
   * Borderlands 1) - null when unset. Room games only; always null on the Personal Shelf. Spin the
   * Wheel excludes a backlog game from its candidate pool while its prerequisite isn't yet Done -
   * see hasUnmetPrerequisite in gameGridLogic.ts. */
  prerequisiteGameId: string | null;
  /** The "Play after" was filled in automatically from the game's IGDB series (the person can change or clear it). */
  prerequisiteAuto: boolean;
  /** Set when IGDB identifies this game as DLC/an expansion with a known parent (issue #338) -
   * points at the base game's row in the same room/shelf, auto-added if it wasn't already there.
   * Null for a main game, or a DLC/expansion IGDB has no parent link on file for. Unlike
   * prerequisiteGameId, this isn't user-editable - it's set once at intake, not an organizational
   * pointer someone picks from a dropdown. */
  baseGameId: string | null;
  /** Minutes of Steam playtime logged since this game's last tracked checkpoint (its last PlayLog
   * entry's start/finish playtime, or the playtime it had at its very first snapshot if it's never
   * had one) - issue #548's raw signal for "did someone actually play this." Null whenever there's
   * nothing to compare: playtime tracking is off, this isn't a Steam-matched Personal Shelf game
   * (room games have no single unambiguous player), or its owner has no playtime snapshot yet.
   * Always Personal-Shelf-only. Resets toward 0 on a status change (a new PlayLog checkpoint) -
   * see currentPlaytimeMinutes for the figure that doesn't. */
  playtimeSinceCheckpointMinutes: number | null;
  /** Raw, always-increasing total Steam playtime minutes from the latest snapshot (issue #548).
   * Same null conditions as playtimeSinceCheckpointMinutes, but never resets - the batch "review
   * your played games" prompt (usePlaytimeReview.ts) tracks its own per-game high-watermark
   * against this rather than the checkpoint-relative figure, since it needs something that keeps
   * climbing instead of zeroing out the moment an individual nudge gets acted on. */
  currentPlaytimeMinutes: number | null;
  /** When this game entered Replay (null unless its status is currently Replay). */
  replayedAt: string | null;
  /** Personal Shelf only: hidden from the public profile and friends' activity. */
  hiddenFromOthers: boolean;
  /** Room games: members who have voted to remove it (current members only). Always 0 on the shelf. */
  removeVotes: number;
  /** Room games: how many of those votes remove it (a majority of the room). 0 on the shelf. */
  removeVotesNeeded: number;
  /** The viewer has voted to remove it. */
  youVotedRemove: boolean;
  /** Personal Shelf: which syncs have seen this game (empty for room games and unsynced games). */
  syncSources: SyncSource[];
  /** IGDB tags this as adult content (issue #627). */
  sensitiveContent: boolean;
  /** The review saved after beating it, if any. */
  review: GameReview | null;
  /** "Ping me when it's out" is switched on (only meaningful for an upcoming release). */
  releaseAlert: boolean;
  createdAt: string;
  updatedAt: string;
}

/** One line in Settings -> Account history. */
export interface AccountEventEntry {
  id: string;
  type: string;
  message: string;
  createdAt: string;
}

/** GET /api/me/events - `nextBefore` is the cursor for the next older page, or null at the end. */
export interface AccountEventPage {
  entries: AccountEventEntry[];
  nextBefore: string | null;
}

/** Where a shelf game was synced from. */
export type SyncSource = 'steam' | 'steam_wishlist' | 'playnite' | 'xbox' | 'exophase' | 'psn' | 'retroachievements';

/** POST/DELETE /api/games/:id/remove-vote. `removed` is true when that vote tipped it over and the game is gone. */
export interface RemoveVoteResponse {
  removed: boolean;
  game: Game | null;
}

export interface SetGameReviewRequest {
  art?: number | null;
  gameplay?: number | null;
  story?: number | null;
  sound?: number | null;
  themes?: number | null;
  note?: string | null;
  recommend?: boolean | null;
}

/** POST /api/games/:id/recommend - tell these friends about a game you reviewed. */
export interface RecommendToFriendsRequest {
  friendIds: string[];
}

export interface SetReleaseAlertRequest {
  enabled: boolean;
}

export interface SetGameHiddenRequest {
  hidden: boolean;
}

/** A lightweight title-search match, shown in the add-game search dropdown. */
export interface GameSearchResult {
  igdbId: number;
  title: string;
  platform: string;
  coverImageUrl: string | null;
  releaseYear: number | null;
}

/** A game QueueUp suggests from IGDB's "similar games" for what's already on the shelf or in the
 * room, with why and how it plays. */
export interface RecommendedGame extends GameSearchResult {
  /** e.g. "Like Hades II". */
  reason: string;
  /** Has co-op (online, local or split screen). */
  coop: boolean;
  /** Single player is its only mode. Null when IGDB doesn't say. */
  singlePlayerOnly: boolean | null;
  reviewScore: number | null;
}

/** Result of looking up a scanned physical-game barcode (issue #402) - same shape as a normal
 * search result (see GameSearchResult), so the Add Game modal can feed it straight into the same
 * owned/platforms step, plus the specific platform ScanDex resolved for this physical copy.
 * `matchedPlatform` is null when ScanDex's platform name doesn't map to any RoomPlatform QueueUp
 * tracks (still shown/addable - just nothing to pre-check in the platforms step). */
export interface BarcodeGameMatch {
  igdbId: number;
  title: string;
  platform: string;
  coverImageUrl: string | null;
  releaseYear: number | null;
  matchedPlatform: RoomPlatform | null;
}

/** A franchise/series match, shown alongside individual games in the add-game search dropdown -
 * picking one drills into CollectionGamesResult rather than adding directly. */
export interface CollectionSearchResult {
  collectionId: number;
  name: string;
}

/** A collection's games, already filtered/deduped the same way normal search results are (room
 * platform, or the user's owned systems; games already added are excluded) and sorted oldest
 * release first, so "add the whole series" naturally lands in play order. */
/** GET /api/games/:id/series: the earlier entries of the game's IGDB series, and which of them are not on the list. */
export interface GameSeriesResponse {
  series: {
    name: string;
    /** Earlier entries (by release year) in total, and the ones not on this list yet. */
    earlierTotal: number;
    earlierMissing: GameSearchResult[];
    truncated: boolean;
  } | null;
}

export interface CollectionGamesResult {
  name: string;
  games: GameSearchResult[];
  /** True if the collection had more games than were returned - see MAX_COLLECTION_GAMES. */
  truncated: boolean;
}

export interface CreateGameRequest {
  igdbId: number;
  roomId?: string | null;
  /** Explicit initial status - Personal Shelf's Add Game modal asks owned ('backlog') or not
   * ('wishlist') up front instead of leaving it to defaultStatusForRelease's release-date guess.
   * Omitted (rooms, and Steam import) keeps that release-date fallback unchanged. Only 'backlog'
   * or 'wishlist' are accepted here - this isn't a general status override. */
  status?: 'backlog' | 'wishlist';
  /** Platforms to mark this game owned on immediately (Personal Shelf's Add Game modal) - only
   * meaningful alongside `status: 'backlog'` (owned); ignored otherwise, and rejected outright for
   * a room add (see the route) since room ownership is scoped to the room's own platform instead. */
  ownedPlatforms?: RoomPlatform[];
}

/** POST /api/games normally adds the game directly. In a room with requireGameApproval on, a
 * plain Member's add instead creates a GameSuggestion for a Room Master/Moderator to approve or
 * decline (issue #362) - callers must check which key is present. */
export type CreateGameResponse = ({ game: Game } | { suggestion: GameSuggestion }) & { unlockedBadges: BadgeDefinition[] };

export interface CreateRoomRequest {
  name: string;
  /** Omit (or pass null) for "any platform" (issue #473) - the room won't be locked to a single
   * console/PC. */
  platform?: RoomPlatform | null;
  accentColor: string;
  /** Defaults to false (invite-only) if omitted. */
  isPublic?: boolean;
}

/** Room Master only. Any subset of fields may be provided. */
export type RoomInvitePermission = 'members' | 'moderators';

export interface UpdateRoomRequest {
  name?: string;
  /** Pass null to clear the room's platform restriction (issue #473); omit to leave it unchanged. */
  platform?: RoomPlatform | null;
  accentColor?: string;
  /** Set to null to clear/disable the webhook. */
  discordWebhookUrl?: string | null;
  /** Set to null to remove the invite link. */
  discordInviteUrl?: string | null;
  spinOwnershipMaxPrice?: number;
  spinDefaults?: SpinDefaults;
  spinWheelTheme?: SpinWheelTheme;
  isPublic?: boolean;
  requireGameApproval?: boolean;
  invitePermission?: RoomInvitePermission;
  /** Any subset of event toggles; omitted keys are left unchanged. */
  discordEvents?: Partial<RoomDiscordEvents>;
}

export interface JoinRoomRequest {
  inviteCode: string;
}

export interface VoteRequest {
  value: VoteValue;
}

/** The systems a user has ticked as "owned" on their Personal Shelf - an empty array means no
 * filter has been opted into yet, so the add-game search/create flow shows everything. */
export interface UpdateOwnedPlatformsRequest {
  platforms: RoomPlatform[];
}

/** Toggles User.publicProfileEnabled (issue #511) - see that field's schema doc. Superseded by
 * UpdateProfileVisibilityRequest; still accepted (true -> public, false -> friends). */
export interface UpdatePublicProfileRequest {
  enabled: boolean;
}

/** Who can open someone's profile page: anyone, only their friends, or only themselves. */
export type ProfileVisibility = 'public' | 'friends' | 'private';
export const PROFILE_VISIBILITIES: readonly ProfileVisibility[] = ['public', 'friends', 'private'];

export interface UpdateProfileVisibilityRequest {
  visibility: ProfileVisibility;
}

export interface UpdateGameStatusRequest {
  status: GameStatus;
}

/** A room game just got marked Beaten, and the same game (by igdbId) either isn't on the caller's
 * Personal Shelf at all, or is there but not yet marked Beaten - offered as a one-tap sync rather
 * than making someone remember to go update it separately. `shelfGameId` is null when the game
 * isn't on the shelf yet at all - accepting the suggestion adds it there (already marked Beaten)
 * instead of just updating an existing row. Never generated the other way around - marking a game
 * Beaten on the Personal Shelf doesn't prompt about any room copies. */
export interface ShelfSyncSuggestion {
  shelfGameId: string | null;
  igdbId: number;
  title: string;
}

export interface UpdateGameStatusResponse {
  game: Game;
  shelfSync?: ShelfSyncSuggestion;
  unlockedBadges: BadgeDefinition[];
}

/** Applies one status to many Personal Shelf games at once (issue #205) - scoped to the shelf since
 * that's where large single-player backlogs pile up; rooms are small/shared enough that per-card
 * status changes stay easy. */
export interface BulkUpdateGameStatusRequest {
  gameIds: string[];
  status: GameStatus;
}

/** Removes many Personal Shelf games at once - same shelf-only scoping as
 * BulkUpdateGameStatusRequest, for the same reason. */
export interface BulkRemoveGamesRequest {
  gameIds: string[];
}

/** Sets (or clears, with null) the price to alert at for a game - see Game.targetPrice. */
export interface SetTargetPriceRequest {
  targetPrice: string | null;
}

/** Sets (or clears, with null) the fallback price for a game - see Game.manualPrice. */
export interface SetManualPriceRequest {
  manualPrice: string | null;
}

/** Marks (or clears) the current user's ownership claim on a game - see GameOwnership. */
export interface SetGameOwnershipRequest {
  owned: boolean;
}

/** Sets (or clears, with null) which other game in the same room this one should be played after -
 * see Game.prerequisiteGameId. */
export interface SetGamePrerequisiteRequest {
  prerequisiteGameId: string | null;
}

/** One candidate from a Steam store title search - used for manually picking which Steam release
 * a game's pricing should be matched to, when the automatic match (IGDB, then an exact-title
 * Steam search) either found nothing or picked the wrong edition/remaster. */
export interface SteamStoreMatch {
  steamAppId: number;
  title: string;
  thumbnailUrl: string | null;
}

/** Manually sets (or clears, with null) which Steam App ID a game's gg.deals pricing should be
 * matched to - see Game.steamAppid. */
export interface SetSteamMatchRequest {
  steamAppId: number | null;
}

/** "Incorrect match" (issue #814): re-points a game card at a different IGDB entry. */
export interface SetIgdbMatchRequest {
  igdbId: number;
}

/** "Duplicate?" (issue #848): folds this card into another card already in the same list. */
export interface MergeGameRequest {
  targetGameId: string;
}

/** A game the person merged into another (issue #814) - listed on the Personal Shelf's Merged tab.
 * Later imports of `fromIgdbId` land on `toIgdbId` instead of re-creating the duplicate. */
export interface MergedGame {
  fromIgdbId: number;
  fromTitle: string;
  fromCoverImageUrl: string | null;
  toIgdbId: number;
  toTitle: string;
  createdAt: string;
}

/** Relocates a game to a different room, or to the mover's Personal Shelf (roomId: null). */
export interface MoveGameRequest {
  roomId: string | null;
}

/** Creates a new tag for the caller. Rejected with 409 if they already have one with this name
 * (case-sensitive - see Tag's @@unique in schema.prisma). */
export interface CreateTagRequest {
  name: string;
}

/** Renames a tag the caller owns. Same name-collision handling as CreateTagRequest. */
export interface RenameTagRequest {
  name: string;
}

/** Applies a tag to a game by name (issue #247) - finds-or-creates the caller's tag with this name
 * in one request, so the "type a new tag and hit enter" flow in GameDetailModal doesn't need a
 * separate create-then-apply round trip. Applying a tag that's already on the game is a no-op. */
export interface ApplyTagRequest {
  name: string;
}

/** Response from POST /api/games/import-steam-library. The actual import (one IGDB lookup per
 * unowned game) runs in the background rather than blocking this response on it - a real
 * deployment saw a big library run past a reverse proxy/CDN's connection timeout, surfacing as a
 * client-side error even though the import was still completing server-side (see routes/games.ts).
 * This response only confirms the import started; poll SteamImportProgress for live counts and to
 * know when it's actually done. */
export interface SteamImportStarted {
  totalOwned: number;
  consideredCount: number;
}

/** Response from POST /api/games/import-steam-wishlist (issue #228 added the route, #245 moved it
 * to this same background-and-poll shape as library import - see SteamImportStarted). Added with
 * status `wishlist` rather than the default, and never marked owned. This response only confirms
 * the import started; poll SteamWishlistImportProgress for live counts and to know when it's
 * actually done. */
export interface SteamWishlistImportStarted {
  totalWishlisted: number;
  consideredCount: number;
}

/** One Personal Shelf game "Sync completions from Steam" (issue #244) found 100%'d on Steam but
 * not yet marked Done in the app - see SteamCompletionsSyncResult. Purely a suggestion: nothing is
 * changed server-side until the caller explicitly applies Done to some/all of these, the same
 * opt-in-by-design pattern as the single-game nudge in GameDetailModal.tsx (issue #227). */
export interface SteamCompletionCandidate {
  id: string;
  title: string;
  coverImageUrl: string | null;
  /** ISO 8601 - the most recent Steam achievement unlock on file for this game. */
  lastUnlockedAt: string;
}

/** Response from POST /api/games/sync-steam-completions. Runs the same candidate-scanning logic as
 * the Year in Review recap's auto-detection, but across all time instead of a 12-month window (see
 * findDetectedSteamCompletions in server/src/services/steamCompletionDetection.ts).
 * `consideredCount` is how many not-yet-Done, Steam-linked shelf games were actually checked
 * (bounded by STEAM_COMPLETIONS_SYNC_CANDIDATE_LIMIT) - not the size of `candidates`, since most
 * checked games won't turn out to be 100%'d. */
export interface SteamCompletionsSyncResult {
  consideredCount: number;
  candidates: SteamCompletionCandidate[];
  unlockedBadges: BadgeDefinition[];
}

/** One Personal Shelf game Playnite reported Completed but isn't yet marked Done in QueueUp (issue
 * #577) - a PlayniteCompletionSuggestion row (server/src/db/prisma/schema.prisma) as sent to the
 * client. Same purely-a-suggestion contract as SteamCompletionCandidate above: nothing is changed
 * server-side until the caller applies Done (or dismisses it - see DELETE
 * /api/games/playnite-completion-suggestions/:gameId). */
export interface PlayniteCompletionSuggestionDto {
  id: string;
  title: string;
  coverImageUrl: string | null;
  createdAt: string;
}

/** Response from GET /api/games/playnite-completion-suggestions. */
export interface PlayniteCompletionSuggestionsResult {
  suggestions: PlayniteCompletionSuggestionDto[];
}

/** Polled by the shelf UI while an import is running (see routes/games.ts and
 * SteamImportCard.tsx) so a slow import (one IGDB lookup per unowned game) shows live counts
 * instead of sitting on a bare "Importing…" the whole time - also the only source of the final
 * result once `done` is true, since the import runs entirely in the background (see
 * SteamImportStarted). */
export interface SteamImportProgress {
  totalOwned: number;
  consideredCount: number;
  imported: number;
  skipped: number;
  /** How many of the skipped games were sent to Needs matching to be matched by hand (they had no
   * automatic match). Left out on progress written before this existed. */
  needsMatching?: number;
  done: boolean;
  /** Only ever populated on the final `done: true` payload (issue #489) - the import runs entirely
   * in the background, so there's no synchronous response to attach these to; the client checks
   * this the moment `done` flips true instead. */
  unlockedBadges?: BadgeDefinition[];
}

/** Wishlist counterpart to SteamImportProgress (issue #245) - same reasoning/shape, but for a
 * wishlist import (see SteamWishlistImportStarted) rather than a library import. */
export interface SteamWishlistImportProgress {
  totalWishlisted: number;
  consideredCount: number;
  imported: number;
  skipped: number;
  /** Same as SteamImportProgress.needsMatching. */
  needsMatching?: number;
  done: boolean;
  /** Same as SteamImportProgress.unlockedBadges - only set on the final `done: true` payload. */
  unlockedBadges?: BadgeDefinition[];
}

/** Where a configurable integration credential currently comes from - env vars always take
 * precedence over the DB-stored fallback; "unset" means neither is configured. */
export type ConfigSource = 'env' | 'db' | 'unset';

/** One player's Steam achievement progress for a specific game - room members for a room game, or
 * just the current user for a Personal Shelf game. Only includes players with a usable Steam
 * account (see resolveSteamId64) for a game that actually has achievements to report; everyone
 * else is simply omitted rather than shown as a zero. */
export interface PlayerAchievements {
  user: User;
  unlocked: number;
  total: number;
}

/** One playthrough attempt's dated record (issue #361) - see PlayLog in schema.prisma for why this
 * exists separately from Game.status. `finishedAt` is null while still in progress (or paused -
 * see recordStatusTransition.ts). Newest attempt first. */
/** One recorded price for a game (see GET /api/games/:id/price-history). */
export interface PriceHistoryPoint {
  at: string;
  amount: number;
}

export interface PriceHistoryResponse {
  currency: string | null;
  points: PriceHistoryPoint[];
  /** The middle of the recorded prices, or null without enough history. */
  usual: number | null;
  lowest: number | null;
}

/** One playthrough in a play journal (#802): a game, where it was played, when, and time logged. */
/** What a play-journal entry records - each gets its own icon and sentence. */
export type JournalEventKind = 'added' | 'started' | 'beaten' | 'dropped' | 'paused' | 'replay' | 'skipped' | 'moved' | 'spin' | 'reviewed';

/** One event in a play journal (#802): who did what to which game, and when. */
export interface JournalEntry {
  id: string;
  kind: JournalEventKind;
  /** Who did it - null for an account since deleted. */
  actor: User | null;
  /** Null for an old entry whose game QueueUp can no longer match (then `message` says it all). */
  gameId: string | null;
  title: string | null;
  coverImageUrl: string | null;
  /** The game's status after this event ('moved' entries say which). */
  status: GameStatus | null;
  /** The room it happened in, or null for the Personal Shelf. */
  roomId: string | null;
  roomName: string | null;
  at: string;
  /** The logged sentence, for entries written before the journal kept structured detail. */
  message: string;
  /** Beaten: minutes played in that playthrough (Steam playtime at start and finish), when known. */
  minutesPlayed: number | null;
  /** Beaten: the viewer's all-time playtime from Steam or Playnite, when known. */
  totalMinutes: number | null;
  /** Reviewed: the review's average score out of 5. */
  score: number | null;
}

export interface PlayLogEntry {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  /** Minutes actually played during this specific attempt (issue #559) - finishPlaytimeMinutes
   * minus startPlaytimeMinutes on the underlying PlayLog row, distinct from the wall-clock time
   * between startedAt/finishedAt (which includes any stretch the game sat untouched). Null while
   * still in progress (finishedAt is also null then), or whenever either playtime stamp is missing
   * - playtime tracking was off, this game was never Steam-matched, or the entry predates issue
   * #548 entirely. */
  minutesPlayed: number | null;
  /** The room the game was finished in, when this entry came from "mark it Beaten on your shelf too?"
   * after beating it in a group. Null for a game beaten on the shelf itself. */
  roomName: string | null;
}

/** The integration credentials that can be set via env var or, as a fallback, via the admin
 * Settings panel (see server/src/services/configResolver.ts). */
export type IntegrationConfigKey =
  | 'GGDEALS_API_KEY'
  | 'IGDB_CLIENT_ID'
  | 'IGDB_CLIENT_SECRET'
  | 'SCANDEX_API_KEY'
  | 'TURNSTILE_SITE_KEY'
  | 'TURNSTILE_SECRET_KEY'
  | 'GA_MEASUREMENT_ID'
  | 'CLOUDFLARE_TUNNEL_TOKEN'
  | 'SMTP_HOST'
  | 'SMTP_PORT'
  | 'SMTP_USER'
  | 'SMTP_PASSWORD'
  | 'SMTP_FROM'
  | 'XBOX_CLIENT_ID';

/** Cloudflare Tunnel (issue #664) as the server sees it: `off` (no token), `starting` (cloudflared
 * running, no connection yet), `connected`, `error` (stopped, retrying with backoff) or
 * `unavailable` (cloudflared isn't installed where the server runs). */
export type TunnelState = 'off' | 'starting' | 'connected' | 'error' | 'unavailable';

export interface TunnelStatus {
  state: TunnelState;
  /** Where the token comes from (env var, Administrator settings, or not set). */
  source: ConfigSource;
  /** Open connections to Cloudflare's edge (cloudflared normally holds 4). */
  connections: number;
  lastError: string | null;
  /** When `state` last changed (ISO). */
  since: string | null;
}

/** Admin-only views — never sent to non-admin users. */
/** One backup file in the admin Backups list. */
export interface AdminBackupInfo {
  name: string;
  sizeBytes: number;
  createdAt: string;
  kind: 'nightly' | 'manual' | 'pre-restore' | 'pre-schema-push' | 'risky-upgrade';
}

export interface AdminBackupSettings {
  /** The nightly backup is on by default. */
  enabled: boolean;
  /** 5-field cron expression, evaluated in `timezone`. */
  cron: string;
  /** How many backups to keep before the oldest are deleted. */
  retention: number;
  nextRunAt: string | null;
  directory: string;
  timezone: string;
  lastRun: { at: string; ok: boolean; message: string } | null;
}

export interface AdminBackupsResponse {
  settings: AdminBackupSettings;
  backups: AdminBackupInfo[];
}

export interface UpdateBackupSettingsRequest {
  enabled?: boolean;
  cron?: string;
  retention?: number;
}

export interface RestoreBackupResponse {
  tables: number;
  rows: number;
  /** Encrypted integration keys left out because the backup's session key wasn't given. */
  skippedEncrypted: number;
  skippedTables: string[];
  safetyBackup: string;
}

/** Error codes a restore or import can answer with when the backup holds encrypted keys made with
 * a different SESSION_SECRET: none given yet, or the one given doesn't unlock them. */
export type RestoreSessionKeyCode = 'session_key_required' | 'session_key_wrong';

export interface AdminIntegrationStatus {
  ggDealsApiKeyConfigured: boolean;
  ggDealsApiKeySource: ConfigSource;
  igdbConfigured: boolean;
  igdbClientIdSource: ConfigSource;
  igdbClientSecretSource: ConfigSource;
  /** ScanDex (issue #402) - barcode-to-IGDB lookup for "scan a physical game" on Add Game. Not
   * required for the rest of the app to function, unlike gg.deals/IGDB above - unset just means
   * the camera-scan option degrades to "couldn't look that up," search still works normally. */
  scandexApiKeyConfigured: boolean;
  scandexApiKeySource: ConfigSource;
  /** Cloudflare Turnstile captcha on the sign-in page (issue #665) - on only when both keys are set. */
  turnstileConfigured: boolean;
  turnstileSiteKeySource: ConfigSource;
  turnstileSecretKeySource: ConfigSource;
  /** Google Analytics: off unless a measurement id is set. */
  gaMeasurementIdSource: ConfigSource;
  /** Email alerts: on only when the host, port and from address are all set. */
  smtpConfigured: boolean;
  smtpSources: Record<'SMTP_HOST' | 'SMTP_PORT' | 'SMTP_USER' | 'SMTP_PASSWORD' | 'SMTP_FROM', ConfigSource>;
  /** Native Xbox library sync: on once a Microsoft app client id is set. */
  xboxClientIdSource: ConfigSource;
  /** AI backend: on once a provider and model are set (the key is optional for local models). */
  aiConfigured: boolean;
  aiSources: Record<'AI_PROVIDER' | 'AI_API_KEY' | 'AI_BASE_URL' | 'AI_MODEL', ConfigSource>;
  devFakeAuth: boolean;
  activeAuthProviders: string[];
}

/** Sets (or replaces) the DB-stored fallback value for one integration credential. Rejected by
 * the server if the corresponding env var is already set (env vars always win, so writing here
 * for an env-sourced key would be silently ineffective). */
export interface SetIntegrationConfigRequest {
  key: IntegrationConfigKey;
  value: string;
}

export interface AdminUserSummary {
  id: string;
  displayName: string;
  email: string;
  avatarColor: string;
  avatarUrl: string | null;
  isAdmin: boolean;
  /** Can also do the destructive things (#1102); always isAdmin too. */
  isSuperAdmin: boolean;
  /** Allowed to use the server's own AI key when the server is set to AI_SERVER_ACCESS=entitled. */
  aiEntitled: boolean;
  createdAt: string;
  /** Their use of the server's own AI (not their own or a room sponsor's providers). */
  serverAi: AiServerUsageSummary;
}

/** One person's use of the server's own AI: this calendar month (UTC) so far, and the average over
 * the finished months since they first used it (null until one has finished). */
export interface AiServerUsageSummary {
  tokensThisMonth: number;
  requestsThisMonth: number;
  avgTokensPerMonth: number | null;
  avgRequestsPerMonth: number | null;
}

/** A deleted room that can still be restored (#1103). */
export interface DeletedRoomSummary {
  id: string;
  name: string;
  accentColor: string;
  platform: RoomPlatform | null;
  memberCount: number;
  gameCount: number;
  deletedAt: string;
  /** When it will be removed for good. */
  purgeAt: string;
}

export interface AdminRoomSummary {
  id: string;
  name: string;
  /** Null means "any platform" (issue #473) - see Room.platform. */
  platform: RoomPlatform | null;
  createdBy: string;
  creatorDisplayName: string;
  memberCount: number;
  gameCount: number;
  createdAt: string;
  /** When the calling administrator's "Manage as Room Master" for this room runs out, if it's on. */
  managingUntil: string | null;
}

/** A read-only look at one room for administrators (#792). */
export interface AdminRoomDetail {
  room: AdminRoomSummary & {
    isPublic: boolean;
    requireGameApproval: boolean;
    invitePermission: RoomInvitePermission;
    spinOwnershipMaxPrice: number;
    spinWheelTheme: SpinWheelTheme;
  };
  members: { user: User; role: RoomRole; joinedAt: string }[];
  games: { id: string; title: string; status: GameStatus; voteScore: number; coverImageUrl: string | null; addedByName: string }[];
}

/** A durable record of a destructive admin action - see AdminAuditLog in schema.prisma.
 * actorLabel/targetLabel are snapshots taken at write time, so they stay meaningful even after
 * the account/room/etc they refer to is gone. */
export interface AdminEmailLogEntry {
  id: string;
  /** alert_digest, confirm_email, address_changed or smtp_test. */
  kind: string;
  to: string;
  subject: string;
  status: 'sent' | 'failed';
  /** Why it failed (the mail server's reason), null when it was sent. */
  error: string | null;
  createdAt: string;
}

export interface AdminAuditLogEntry {
  id: string;
  actorLabel: string;
  action: string;
  targetLabel: string | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
}

/** GET /api/me/attention - per room, what still needs the caller (drives the red dots). */
export interface AttentionSummary {
  rooms: { roomId: string; toVote: number; toApprove: number }[];
}

export type NotificationType =
  | 'game_added'
  | 'member_joined'
  | 'room_renamed'
  | 'room_platform_changed'
  | 'room_owner_changed'
  | 'room_deleted'
  | 'room_restored'
  | 'price_drop'
  | 'game_suggested'
  | 'release_watch'
  | 'playtime_mark_playing'
  | 'playnite_sync_reminder'
  | 'wishlist_bundle_deal'
  | 'play_together_request'
  | 'feed_reaction'
  | 'friend_recommendation'
  | 'good_time_to_buy'
  | 'account_change'
  | 'library_sync_error'
  | 'library_sync_available'
  | 'platform_unowned'
  | 'room_game_beaten'
  | 'merge_suggestions'
  | 'sensitive_games';

/** Notification types a person can choose to receive by email (direct ones, never room-scoped). */
export const EMAIL_ALERT_TYPES = [
  'price_drop',
  'release_watch',
  'wishlist_bundle_deal',
  'playtime_mark_playing',
  'playnite_sync_reminder',
  'play_together_request',
  'feed_reaction',
  'friend_recommendation',
  'good_time_to_buy',
  'account_change',
  'room_game_beaten',
] as const;
export type EmailAlertType = (typeof EMAIL_ALERT_TYPES)[number];

export const EMAIL_ALERT_LABELS: Record<EmailAlertType, string> = {
  price_drop: 'Price drops on your wishlist',
  release_watch: 'New releases and DLC',
  wishlist_bundle_deal: 'Wishlist bundle deals',
  playtime_mark_playing: 'Suggestions to mark a game as Playing',
  playnite_sync_reminder: 'Playnite sync reminders',
  play_together_request: 'Ask to play together requests',
  feed_reaction: 'Reactions to your activity',
  friend_recommendation: 'Games your friends rate highly',
  good_time_to_buy: 'Good time to buy',
  account_change: 'Changes to your account',
  room_game_beaten: 'Room games to review after someone beats them',
};

/** One alert type's settings for the signed-in person. `email` sends it by email (needs SMTP set
 * up on the server, off by default); `inApp` lets it appear in the notification bell at all
 * (on by default; only the newer alert types honour turning it off). */
export interface NotificationPreferenceDto {
  type: EmailAlertType;
  label: string;
  email: boolean;
  inApp: boolean;
}

/** GET/PUT /api/me/auto-hide-adult: whether games flagged as adult are hidden from the public profile and friends automatically. */
export interface AutoHideAdultResponse {
  enabled: boolean;
}

/** GET/PUT /api/me/activity-visibility: whether the person's activity is hidden from friends' feeds. */
export interface ActivityVisibilityResponse {
  hidden: boolean;
}

export interface SetActivityVisibilityRequest {
  hidden: boolean;
}

/** GET /api/me/alert-email. `alertEmail` is the address the person set (null = use the account
 * email); `pending` is a new address still waiting to be confirmed from the emailed link. */
export interface AlertEmailResponse {
  accountEmail: string;
  alertEmail: string | null;
  effectiveEmail: string;
  pending: string | null;
  /** Whether QueueUp may email this person: a confirmed alert address, or a sign-in email the provider verified. */
  verified: boolean;
  /** Whether this server can send email at all (so there is something to verify). */
  canSend: boolean;
}

/** Body for PUT /api/me/alert-email. An empty or null email goes back to the account email. */
export interface SetAlertEmailRequest {
  email: string | null;
}

/** `saved` took effect straight away; `confirmation_sent` takes effect once the emailed link is opened. */
export interface SetAlertEmailResponse {
  status: 'saved' | 'confirmation_sent';
}

export interface NotificationPreferencesResponse {
  /** True when the server can send email, so the email switches do something. */
  emailAvailable: boolean;
  /** The address alerts are sent to (the account's email). */
  email: string;
  preferences: NotificationPreferenceDto[];
}

export interface SetNotificationPreferenceRequest {
  type: EmailAlertType;
  email?: boolean;
  inApp?: boolean;
}

export interface Notification {
  id: string;
  /** Null once the room itself is gone - see `room_deleted`, the only type this happens for. */
  roomId: string | null;
  /** Snapshot of the room's name at the time this notification was created. */
  roomName: string;
  type: NotificationType;
  message: string;
  actor: User | null;
  createdAt: string;
  read: boolean;
  /** The specific game this notification is about, if any (issue #554) - null for every type
   * except playtime_mark_playing. Lets a client action button (e.g. "Mark Playing") target the
   * right game without parsing `message`. */
  gameId: string | null;
  /** The console a platform_unowned notification asks about adding to Systems owned. */
  platform: RoomPlatform | null;
}

/** Issue #509 - a room's full, paginated activity history, distinct from NotificationType above:
 * see RoomActivity's schema doc for why this is a separate, unread-state-free feed rather than a
 * reuse of the notification bell's table. */
export type RoomActivityType =
  | 'game_added'
  | 'game_suggested'
  | 'member_joined'
  | 'room_renamed'
  | 'room_platform_changed'
  | 'room_owner_changed'
  | 'price_drop'
  | 'status_changed'
  | 'vote_cast'
  | 'spin_result'
  | 'member_promoted'
  | 'member_left'
  | 'console_added'
  | 'admin_manage'
  | 'game_reviewed';

export interface RoomActivityEntry {
  id: string;
  type: RoomActivityType;
  message: string;
  actor: User | null;
  createdAt: string;
}

/** Response for GET /api/rooms/:roomId/activity - `nextBefore` is the createdAt cursor to pass as
 * the `before` query param for the next older page, or null once there's nothing further back. */
export interface RoomActivityPage {
  entries: RoomActivityEntry[];
  nextBefore: string | null;
}

/** The Personal Shelf's counterpart to RoomActivityType (issue #580) - a strict subset, since the
 * shelf has no members, no shared spin session, and no voting to log any of RoomActivityType's
 * other values for. See RoomActivity's schema doc (server/src/db/prisma/schema.prisma) for how one
 * table backs both feeds. */
export type ShelfActivityType = Extract<RoomActivityType, 'game_added' | 'status_changed' | 'price_drop' | 'console_added'>;

/** Unlike RoomActivityEntry, no `actor` - a shelf entry's only possible actor is its own owner (or
 * nobody, for a system-generated price_drop), so there's no separate identity worth showing. */
export interface ShelfActivityEntry {
  id: string;
  type: ShelfActivityType;
  message: string;
  createdAt: string;
}

/** Response for GET /api/me/activity - same shape/pagination contract as RoomActivityPage above. */
export interface ShelfActivityPage {
  entries: ShelfActivityEntry[];
  nextBefore: string | null;
}

export interface NotificationRoomUnread {
  roomId: string;
  unreadCount: number;
}

export interface NotificationSummary {
  totalUnread: number;
  rooms: NotificationRoomUnread[];
}

/** One entry in a Year in Review's top-voted list (issue #230) - just enough of a game to render a
 * small result row, not the full Game DTO. */
export interface YearInReviewTopVotedGame {
  id: string;
  title: string;
  coverImageUrl: string | null;
  voteScore: number;
}

export interface YearInReviewGenreCount {
  genre: string;
  count: number;
}

export interface YearInReviewGameHours {
  id: string;
  title: string;
  hours: number;
}

/** One unlocked Steam achievement, picked out as one of the rarest earned in the window (lowest
 * community-wide unlock percentage). */
export interface YearInReviewRareAchievement {
  gameTitle: string;
  achievementName: string;
  /** 0-100, community-wide. Lower = rarer. */
  globalUnlockPercent: number;
  unlockedAt: string;
}

/** One room (or the Personal Shelf, when `roomId` is null) the caller finished at least one game
 * in during the window - lets the recap say "completed with ..." instead of just a flat list.
 * `memberNames` reflects who's currently in the room, not who was there when each game was
 * actually finished (room membership history isn't tracked), and excludes the caller themselves. */
export interface YearInReviewGroupCompletion {
  roomId: string | null;
  roomName: string | null;
  memberNames: string[];
  games: { id: string; title: string }[];
}

/** On-demand summary of the last 12 months, generated from data already on hand - no new tracking
 * (issue #230). `doneCount`/`estimatedHours` cover games the caller personally added (Personal
 * Shelf or any room) and marked Done in the window, PLUS games not marked Done in the app but that
 * Steam says the caller 100%'d within the window (see `steamAutoDetectedCount`) - the app's status
 * field is opt-in (see the Done-suggestion nudge in GameDetailModal.tsx), so relying on it alone
 * undercounts anyone who tracks completion via Steam instead of clicking "Done" here. `topVoted`
 * covers every game in a room the caller is currently a member of, ranked by vote weight cast in
 * the window (regardless of who added the game or who cast the votes) - a "what did the squad
 * like" view, not a personal one. */
export interface YearInReview {
  windowStart: string;
  windowEnd: string;
  doneCount: number;
  /** How many of `doneCount` were detected from Steam achievements rather than the app's Done
   * status - 0 when the caller has no usable Steam account, no STEAM_API_KEY is configured, or
   * every completion was already tracked manually. */
  steamAutoDetectedCount: number;
  /** Sum of `timeToBeatHours` across the Done games counted above - games with no time-to-beat
   * data on file just don't contribute, rather than skewing the total with a guess. */
  estimatedHours: number;
  topVoted: YearInReviewTopVotedGame[];
  /** Genres of the Done games counted above, tallied by count, highest first. Games with no genre
   * on file are omitted rather than lumped into an "Unknown" bucket. */
  genreSpread: YearInReviewGenreCount[];
  /** The Done games counted above with the highest `timeToBeatHours`, highest first (capped to a
   * handful) - games with no time-to-beat data on file are omitted, same reasoning as
   * estimatedHours. */
  mostTimeConsuming: YearInReviewGameHours[];
  /** The Done games counted above, grouped by which room (if any) they were in - see
   * YearInReviewGroupCompletion. */
  completedByGroup: YearInReviewGroupCompletion[];
  /** Total Steam achievements unlocked in the window, across every Done/owned game with a linked
   * Steam app id - 0 (not omitted) when the caller has no usable Steam account or no
   * STEAM_API_KEY is configured, same as the rest of this recap degrading gracefully rather than
   * erroring. */
  achievementsUnlocked: number;
  /** The rarest achievements (lowest community-wide unlock %) the caller unlocked in the window,
   * across every game with a linked Steam app id - empty under the same conditions as
   * achievementsUnlocked being 0. */
  rarestAchievements: YearInReviewRareAchievement[];
}

/** One group of Currently Playing games in the cross-room dashboard (issue #364) - either a room
 * the caller is a member of, or their Personal Shelf (`roomId: null`, `roomName: null`). Only
 * groups with at least one Playing/Play Next game are included - see the route for why an empty
 * room is omitted rather than shown with a "nothing playing" placeholder. */
export interface CrossRoomPlayingGroup {
  roomId: string | null;
  roomName: string | null;
  games: Game[];
}

/** Aggregates "Currently Playing" (and Play Next) across every room the caller is in, plus their
 * Personal Shelf, into one view (issue #364) - `Game.status` is per-game, not per-member, so this
 * is "what games are active where," same scope as the per-room PlayingStrip, just merged across
 * every room at once instead of requiring a switch into each one. */
export interface CrossRoomPlaying {
  groups: CrossRoomPlayingGroup[];
}

/** One group of Beaten games in the cross-room dashboard (issue #481) - either a room the caller
 * is a member of, or their Personal Shelf (`roomId: null`, `roomName: null`). Includes Replay
 * alongside Done, same as BeatenStrip.tsx's own grouping (a Replay is by definition already-
 * beaten). Only groups with at least one Done/Replay game are included, same reasoning as
 * CrossRoomPlayingGroup. */
export interface CrossRoomBeatenGroup {
  roomId: string | null;
  roomName: string | null;
  games: Game[];
}

/** Aggregates Beaten (and Replay) across every room the caller is in, plus their Personal Shelf,
 * into one view (issue #481) - a user asked for "an easy way to display my beaten list, including
 * communal rooms" without switching into each room individually, the same problem #364's Currently
 * Playing dashboard solved for Playing/Play Next. */
export interface CrossRoomBeaten {
  groups: CrossRoomBeatenGroup[];
}

/** Which heuristic picked a /api/me/next-pick suggestion (issue #508) - shown to the caller
 * alongside the pick so "why this game" is never a mystery. Checked in this order, first
 * non-empty pool wins: `shortest` (least timeToBeatHours among backlog games that have it on
 * file), `oldest_wishlist` (longest-wishlisted title, for when nothing backlog-side has
 * time-to-beat data), `franchise_progress` (the backlog game furthest into an already-started
 * series - see collectionProgress), `neglected` (a weighted-random pick among backlog games
 * that have sat untouched 3+ months - see isNeglectedBacklogGame - weighted toward the most
 * neglected rather than a flat coin flip among them). */
export type NextPickReason = 'shortest' | 'oldest_wishlist' | 'franchise_progress' | 'neglected';

/** The slimmer, DB-shaped game view a next-pick suggestion carries - same reasoning as
 * DataExportGame below: no live price lookup or serialized ownership, just enough to render a
 * card and link through to the real game. */
export interface NextPickGame {
  id: string;
  title: string;
  coverImageUrl: string | null;
  platform: string;
  status: GameStatus;
  timeToBeatHours: number | null;
  createdAt: string;
}

export interface NextPickSuggestion {
  game: NextPickGame;
  reason: NextPickReason;
  /** Human-readable justification for the pick, e.g. "Shortest game in your backlog (4h)" or
   * "2 of 3 Mass Effect games beaten - finish the series" - computed server-side so the reasoning
   * (hours, counts, dates) stays in one place rather than being reconstructed client-side from
   * `reason` alone. */
  detail: string;
}

/** Response for GET /api/me/next-pick (issue #508) - a personal "what should I play next" picker
 * over the caller's own Personal Shelf backlog/wishlist, distinct from the existing "🎲 Pick a
 * Game" Spin the Wheel button (packages/shared/src/spinPicker.ts): Spin the Wheel is a uniform-ish
 * random draw the caller explicitly spins for fun; this is a deterministic-first recommendation
 * (shortest, then oldest wishlist, then franchise progress, then neglected-weighted-random as a
 * last resort) meant to answer the question literally, not entertain. `suggestion` is null only
 * when the caller's Personal Shelf has no backlog or wishlist games at all. */
export interface NextPickResponse {
  suggestion: NextPickSuggestion | null;
}

/** One age bucket in a backlog age distribution (issue #512) - "age" is time since a backlog
 * game was added (`createdAt`), a related but distinct question from "is it neglected" (that's
 * what `isNeglectedBacklogGame` already answers, via `updatedAt`/votes, not `createdAt` alone).
 * Boundaries are ~90/180/365 days (roughly 3/6/12 months) - the first edge deliberately echoes
 * `NEGLECTED_BACKLOG_MONTHS` so the distribution visually lines up with the same threshold used
 * elsewhere, but bucketing itself is plain day math, not the calendar-month arithmetic
 * `isNeglectedBacklogGame` uses (a fixed day count is close enough for a histogram bucket and
 * avoids reimplementing that month-overflow-safe logic for three more edges) - labels are phrased
 * in days for that reason, so nothing here implies exact month boundaries. Always four buckets, in
 * order, even when a bucket's count is 0 - so the shape of the distribution is stable to render. */
export interface BacklogAgeBucket {
  /** "Under 90 days" | "90-180 days" | "180-365 days" | "365+ days". */
  label: string;
  count: number;
}

/** The single backlog game that's gone the longest with no activity (issue #512) - "activity"
 * is exactly the three signals `isNeglectedBacklogGame` already checks (createdAt/updatedAt/
 * latest vote createdAt), just used here to rank every currently-neglected candidate by how far
 * past the threshold it is, rather than a plain in/out check. Null when nothing in the backlog
 * currently reads as neglected (not just "the least-recently-touched game," which would always
 * return something and misleadingly imply a problem when there isn't one yet). */
export interface MostNeglectedGame {
  id: string;
  title: string;
  coverImageUrl: string | null;
  /** Whichever of createdAt/updatedAt/latest-vote is most recent - the same "last touched"
   * instant `isNeglectedBacklogGame` checks against its threshold. */
  lastActivityAt: string;
  /** Days since `lastActivityAt`, floored - the headline number the UI shows. */
  daysSinceActivity: number;
}

/** On-demand insights view beyond Year in Review (issue #512), now genuinely possible since
 * `PlayLog` records real per-session start/finish timestamps (added for the Marathoner/Comeback
 * badges - issue #489) rather than only the current status. Scoped the same way Year in Review
 * scopes its Done games: every non-archived game the caller personally added, Personal Shelf or
 * any room - not just the Personal Shelf. */
export interface BacklogInsights {
  /** Average calendar time from a game being marked Playing to being marked Done/Replay, in
   * days, across the caller's most recent closed `PlayLog` entries belonging to a Done or Replay
   * game they added (capped defensively at MAX_GAMES_PER_LIST - see the route) - the actual
   * recorded stretch, not `Game.timeToBeatHours` (an IGDB estimate of active playtime hours,
   * unrelated to how long a copy sat in Playing). Days, not hours, because `PlayLog` only knows
   * when a session opened and closed, not how much was actually played in between - same reason
   * Marathoner/Comeback measure in days rather than hours. Entries with zero elapsed time (a game
   * marked Done/Dropped without ever passing through Playing - see the PlayLog model doc) are
   * excluded, same as the Not For Me badge's own duration > 0 gate, otherwise they'd drag the
   * average toward zero without reflecting a real playthrough length. Null when there are no
   * qualifying entries yet. See `averageHoursToBeat` below for the active-playtime companion
   * figure, now that PlayLog has playtime stamps (issue #548/#565) to compute it from. */
  averageDaysToBeat: number | null;
  /** How many closed `PlayLog` entries contributed to `averageDaysToBeat` - shown alongside it so
   * a "14 days" average backed by one entry doesn't read as more solid than it is. */
  finishedEntryCount: number;
  /** Average *active* hours from Playing to Done/Replay, across the subset of those same closed
   * `PlayLog` entries that also have Steam playtime stamps on both ends (issue #565) - null when
   * playtime tracking was off, or off, for every qualifying entry (PLAYTIME_TRACKING_ENABLED,
   * unmatched Steam game, etc. - see currentPlaytimeMinutesForGame). Always a subset of
   * `finishedEntryCount`, often a much smaller one. */
  averageHoursToBeat: number | null;
  /** How many entries contributed to `averageHoursToBeat` - its own count, not `finishedEntryCount`,
   * since playtime-stamped entries are usually fewer than calendar-dated ones. */
  hoursTrackedEntryCount: number;
  /** Non-archived games currently in the caller's backlog (Personal Shelf + rooms), across every
   * bucket in `ageDistribution` - an at-a-glance denominator for the distribution below. This is
   * the true total (an uncapped `count`), unlike `mostNeglectedGame`/`ageDistribution` below,
   * which are derived from a sample capped at MAX_GAMES_PER_LIST (issue #587 - a backlog larger
   * than the cap must still report its real size here). */
  backlogCount: number;
  mostNeglectedGame: MostNeglectedGame | null;
  /** The current backlog bucketed by time since added - see `BacklogAgeBucket`. */
  ageDistribution: BacklogAgeBucket[];
}

/** One game the caller added, in the "Download my data" export - a slimmer, DB-shaped view than
 * the full `Game` DTO (no live price lookup, no other members' votes), since this is a bulk
 * point-in-time snapshot rather than something rendered as a card. `roomId`/`roomName` are null
 * for a Personal Shelf entry. */
export interface DataExportGame {
  id: string;
  title: string;
  platform: string;
  genre: string | null;
  status: GameStatus;
  roomId: string | null;
  roomName: string | null;
  createdAt: string;
  updatedAt: string;
}

/** One vote the caller cast, in the "Download my data" export. `gameTitle`/`roomId`/`roomName`
 * are snapshotted alongside the vote itself so the export reads standalone even for a vote on a
 * game the caller didn't add. */
export interface DataExportVote {
  gameId: string;
  gameTitle: string;
  roomId: string | null;
  roomName: string | null;
  value: VoteValue;
  createdAt: string;
}

/** One room the caller is (or was, at export time) a member of. */
export interface DataExportRoomMembership {
  roomId: string;
  roomName: string;
  role: RoomRole;
  joinedAt: string;
}

/** One provider that can sign into the caller's account - the primary sign-in identity
 * (User.oidcSub) plus any secondary providers linked afterward (see LinkedIdentity in
 * schema.prisma), Steam included even though a linked Steam account lives on `User.steamId64`
 * rather than a LinkedIdentity row. Provider name and the provider's own account id only, never
 * a token/secret, since none are ever stored for a linked identity to begin with. */
export interface DataExportLinkedIdentity {
  provider: string;
  providerAccountId: string;
}

/** Full point-in-time JSON snapshot of everything the app knows about the caller, downloadable
 * from Profile Settings' Danger Zone as a safety net before account deletion (issue #243) - not
 * scheduled/automatic, generated fresh on each request from the same tables Year in Review reads
 * (see `/api/me/year-in-review`). Deliberately excludes anything not owned by the caller (e.g.
 * other members' votes on a shared room game) and any credential/token material. */
/** The computer a person plays on, as they typed it. Every field may be empty; all of it is private. */
export interface ComputerSpecs {
  cpu: string | null;
  gpu: string | null;
  ramGb: number | null;
  /** Monitor resolution and refresh rate, e.g. "2560x1440 @ 144Hz". */
  display: string | null;
}

/** Longest a free-text spec field may be. */
export const COMPUTER_SPEC_TEXT_MAX = 120;

export const EMPTY_COMPUTER_SPECS: ComputerSpecs = { cpu: null, gpu: null, ramGb: null, display: null };

/** The colours offered for a room or a Personal Shelf, in the order shown. */
export const ACCENT_COLOURS = ['#c0693c', '#2e8a63', '#5a73c4', '#b05a9c', '#3b86a3', '#6c9136'] as const;

/** A colour as the app stores it: `#` and six hex digits. */
export const isHexColour = (v: unknown): v is string => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);

export interface DataExport {
  exportedAt: string;
  account: {
    id: string;
    email: string;
    displayName: string;
    createdAt: string;
    /** The colour set for the Personal Shelf, or null. */
    shelfColor?: string | null;
    /** Systems ticked as "owned" on the Personal Shelf - see User.ownedPlatforms. */
    ownedPlatforms: RoomPlatform[];
  };
  /** Every provider that can sign into this account - the primary sign-in identity plus any
   * linked afterward (including Steam, if linked). */
  linkedIdentities: DataExportLinkedIdentity[];
  /** Personal Shelf games (`roomId` null) and games added to a room, combined - same `addedBy`
   * scoping as Year in Review's own queries. */
  gamesAdded: DataExportGame[];
  votesCast: DataExportVote[];
  roomMemberships: DataExportRoomMembership[];
  /** Libraries linked for sync (Xbox, PlayStation, Exophase). Never carries a login or token. */
  libraryLinks: DataExportLibraryLink[];
  /** The caller's own AI provider settings, or null. Never carries the API key, only whether one is saved. */
  aiSettings: DataExportAiSettings | null;
  /** Rooms currently using the caller's AI key (the caller is their AI sponsor). */
  roomsUsingYourAiKey: string[];
  /** Games the caller merged into another, which later imports follow. */
  mergedGames: DataExportMergedGame[];
  /** The computer specs the caller typed in, or null. */
  computerSpecs: ComputerSpecs | null;
}

/** A linked library in the "Download my data" export. Logins and tokens are never included. */
export interface DataExportLibraryLink {
  library: 'xbox' | 'playstation' | 'exophase' | 'retroachievements';
  /** The gamertag (Xbox), player id (Exophase) or username (RetroAchievements) the link is for; null for PlayStation. */
  account: string | null;
  linkedAt: string;
  lastSyncedAt: string | null;
  /** When Sony stops accepting the saved PlayStation login; null for the others and when unknown. */
  linkExpiresAt: string | null;
}

/** The caller's own AI settings in the export: the key itself is never included. */
export interface DataExportAiSettings {
  provider: string;
  model: string | null;
  baseUrl: string | null;
  hasApiKey: boolean;
}

/** A game the caller merged into another, in the export. */
export interface DataExportMergedGame {
  fromTitle: string;
  toTitle: string;
  mergedAt: string;
}

/** A personal access token for the read/write API (issue #435) - see server's ApiKey model.
 * Never carries the raw key or its hash; that's only ever returned once, at creation, by
 * CreateApiKeyResponse below. */
export interface ApiKeySummary {
  id: string;
  label: string;
  createdAt: string;
  lastUsedAt: string | null;
  revokedAt: string | null;
  /** When the key stops working; null = never. */
  expiresAt: string | null;
  /** True when the key can only read (GET) - writes through it are refused. */
  readOnly: boolean;
}

/** Most API keys a person can have working at once (revoked and expired ones don't count). */
export const MAX_ACTIVE_API_KEYS = 20;
/** Longest an API key may be set to last, in days. */
export const MAX_API_KEY_EXPIRY_DAYS = 365;

export interface CreateApiKeyRequest {
  label: string;
  /** Days until the key expires (1 to MAX_API_KEY_EXPIRY_DAYS); omit or null for no expiry. */
  expiresInDays?: number | null;
  /** Make the key read-only. Defaults to false. */
  readOnly?: boolean;
}

/** Same fields as ApiKeySummary, plus the one and only time the raw key itself is ever sent to
 * the client - shown once in the UI with a "copy now, you won't see this again" warning, same
 * principle as a session secret. */
export interface CreateApiKeyResponse extends ApiKeySummary {
  key: string;
}

/** The label PlayniteImportModal gives the setup-code API key it generates (issue #474) - shared
 * so jobs/playniteSyncReminderJob.ts (issue #570) can recognize "this user has Playnite set up" by
 * the exact same string instead of the server carrying its own hardcoded copy that could drift
 * from the client's. */
export const PLAYNITE_API_KEY_LABEL = 'Playnite Import';

/** One distinct title from an external library source (e.g. Playnite), already deduped/grouped by
 * the client - QueueUp expects one entry per title with the union of every platform that title was
 * reported owned on, not one entry per platform-specific row a source like Playnite lists
 * separately (see QueueUpPlayniteExtension#7's dedupe-before-push step). */
export interface LibraryImportEntry {
  title: string;
  platforms: RoomPlatform[];
  /** All-time playtime minutes Playnite reports for this title (issue #577) - the Playnite-sourced
   * counterpart to Steam's own playtime figure (PlaytimeSnapshot.playtimeMinutes, server-side).
   * Optional/omitted for a source, or an individual entry, with no playtime figure to report; 0 is
   * a valid reported value (owned but never played) and is handled the same as "no signal" by
   * suggestsPlayingFromMinutes (playtimeSignals.ts) - only a positive figure ever nudges anything. */
  playtimeMinutes?: number;
  /** Playnite's own per-game CompletionStatus, collapsed to a single boolean (issue #577) - true
   * when Playnite currently has this title marked Completed. Never applied automatically; only
   * ever recorded as a reviewable suggestion, same opt-in-by-design pattern as the Steam
   * achievement-based "Sync completions from Steam" flow - see
   * services/playniteCompletionSuggestions.ts (server-side). */
  isCompleted?: boolean;
}

/** Response from POST /api/v1/library/import-playnite - confirms the import started; poll
 * PlayniteImportProgress for live counts and to know when it's actually done. Same
 * background-and-poll shape as SteamImportStarted/SteamImportProgress. */
export interface PlayniteImportStarted {
  consideredCount: number;
}

export interface PlayniteImportProgress {
  /** ISO timestamp set once, when this run's progress row is first written - the one thing that
   * tells two runs apart, since consideredCount/matched/etc. alone can't (issue #583: a web client
   * polling GET /api/library/import-playnite/progress needs this to tell "still watching the run
   * it already showed a started toast for" apart from "a brand new run just clobbered the previous
   * completed one," without which a same-sized repeat sync could go unnoticed). */
  startedAt: string;
  consideredCount: number;
  /** Resolved to an igdbId (via TitleMatchAlias or an exact IGDB title match) and either newly
   * created or had its owned platforms updated on an existing shelf game. */
  matched: number;
  /** Didn't resolve to an igdbId - written to PendingLibraryImport for later manual review. */
  unmatched: number;
  /** Resolved but failed for some other reason (an IGDB hiccup, etc.) - same "don't abort the
   * batch over one bad entry" reasoning as Steam import's `skipped`. */
  errored: number;
  done: boolean;
  /** Same as SteamImportProgress.unlockedBadges - only set on the final `done: true` payload. */
  unlockedBadges?: BadgeDefinition[];
}

/** A PendingLibraryImport row (server/src/db/prisma/schema.prisma) as sent to the client - an
 * external-library title that didn't resolve to an igdbId, with whatever IGDB search candidates
 * were found for it at import time, for the "pick one" review UI in Profile Settings
 * (PendingImportsSection, #452). */
/** A candidate for matching an imported title. `suggestedBy` is set when other people already
 * matched this same title to this game (shown as "Matched by N others"); it is a hint, never applied
 * automatically. */
export interface PendingImportCandidate extends GameSearchResult {
  suggestedBy?: number;
}

export interface PendingLibraryImportDto {
  id: string;
  title: string;
  platforms: RoomPlatform[];
  source: string;
  candidates: PendingImportCandidate[];
  createdAt: string;
}

/** Body for POST /api/library/pending-imports/:id/resolve - the candidate igdbId the user picked
 * (from `candidates`, or one they searched for themselves instead). */
export interface ResolvePendingLibraryImportRequest {
  igdbId: number;
}

/** Answer to POST /api/library/pending-imports/:id/resolve: a token for POST /api/games/undo-change,
 * good for a few minutes, that puts the title back in Needs matching. */
export interface ResolvePendingLibraryImportResponse {
  undoToken: string;
}

/** Body for POST /api/library/pending-imports/:id/resolve-bundle (issue #857) - a pending title that
 * turned out to be a bundle, matched to every game inside it. */
export interface ResolvePendingLibraryImportBundleRequest {
  igdbIds: number[];
}

/** QueueUp's own gamification system (issue #489) - stable, one-shot "first time you did X"
 * unlocks. Named "badge" throughout the code, not "achievement": PlayerAchievements/
 * AchievementCompletion above (and AchievementRow.tsx/useGameAchievements.ts on the client) already
 * mean "this user's Steam achievement progress on a specific title," an unrelated, pre-existing
 * concept - user-facing copy still says "Achievements" (the sidebar icon, the panel title) to match
 * the issue, but no code identifier reuses that word so the two systems can't be confused with each
 * other while reading the source. `BadgeKey` is also the literal string stored in
 * UserBadge.badgeKey (schema.prisma) - there's no separate catalog table in the DB, so adding a
 * badge later is just adding an entry here plus a call to unlockBadge() at the right hook point,
 * not a migration. */
export type BadgeKey =
  | 'first_solo_beat'
  | 'first_room_beat'
  | 'first_drop'
  | 'first_replay'
  | 'first_100_percent'
  | 'first_spin_ready'
  | 'first_room_created'
  | 'first_public_join'
  | 'first_private_join'
  | 'first_ownership_marked'
  | 'first_wishlist'
  | 'first_library_sync'
  | 'first_pc_sync'
  | 'first_xbox_sync'
  | 'first_playstation_sync'
  | 'first_switch_sync'
  | 'first_quest_sync'
  | 'first_franchise_finished'
  | 'first_tag_applied'
  | 'first_dlc_completionist'
  | 'first_full_house'
  | 'first_promoted'
  | 'first_spin_winner'
  | 'first_patient'
  | 'first_bargain_hunter'
  | 'first_backlog_buster'
  | 'first_quick_drop'
  | 'first_marathoner'
  | 'first_comeback'
  | 'first_anniversary'
  | 'shelf_25'
  | 'shelf_100'
  | 'shelf_500'
  | 'beaten_10'
  | 'beaten_50'
  | 'beaten_100'
  | 'first_review'
  | 'first_friend'
  | 'first_api_key'
  | 'first_merge'
  | 'first_hidden_game'
  | 'first_price_alert'
  | 'first_profile_link'
  | 'first_own_ai'
  | 'first_ai_backup'
  | 'first_ai_used'
  | 'first_api_key_used'
  | 'first_discord_webhook'
  | 'first_export'
  | 'first_email_alert'
  | 'first_computer_specs'
  | 'first_full_collection';

export interface BadgeDefinition {
  key: BadgeKey;
  name: string;
  description: string;
  emoji: string;
}

export const BADGE_DEFINITIONS: Record<BadgeKey, BadgeDefinition> = {
  first_solo_beat: {
    key: 'first_solo_beat',
    name: 'Solo Beaten',
    description: 'Marked a game Beaten on your Personal Shelf.',
    emoji: '🏅',
  },
  first_room_beat: {
    key: 'first_room_beat',
    name: 'Room Champion',
    description: 'Marked a game Beaten in a room.',
    emoji: '🏆',
  },
  first_drop: {
    key: 'first_drop',
    name: 'No Regrets',
    description: 'Dropped a game.',
    emoji: '🏳️',
  },
  first_replay: {
    key: 'first_replay',
    name: 'Going Back In',
    description: 'Queued a game for Replay.',
    emoji: '🔁',
  },
  first_100_percent: {
    key: 'first_100_percent',
    name: '100% Club',
    description: "Fully completed a game's achievements.",
    emoji: '💯',
  },
  first_spin_ready: {
    key: 'first_spin_ready',
    name: 'Ready to Roll',
    description: 'Joined in on a Spin the Wheel pick.',
    emoji: '🎡',
  },
  first_room_created: {
    key: 'first_room_created',
    name: 'Room Master',
    description: 'Created a room.',
    emoji: '🛠️',
  },
  first_public_join: {
    key: 'first_public_join',
    name: 'Open Door',
    description: 'Joined a public room.',
    emoji: '🚪',
  },
  first_private_join: {
    key: 'first_private_join',
    name: 'Invited',
    description: 'Joined a room via invite code.',
    emoji: '🔑',
  },
  first_ownership_marked: {
    key: 'first_ownership_marked',
    name: 'Collector',
    description: 'Marked a game as owned.',
    emoji: '📦',
  },
  first_wishlist: {
    key: 'first_wishlist',
    name: 'Wishful Thinking',
    description: 'Added a game to your wishlist.',
    emoji: '⭐',
  },
  first_library_sync: {
    key: 'first_library_sync',
    name: 'Synced Up',
    description: 'Synced your library from Steam.',
    emoji: '🔄',
  },
  // The four below are Playnite-specific (issue: "an achievement for syncing a game for each
  // console") - Steam import is PC-only, so first_library_sync above can't tell these apart; the
  // Playnite sync is the only import path that reports which platform each game came from.
  first_pc_sync: {
    key: 'first_pc_sync',
    name: 'Rig Ready',
    description: 'Synced a PC game via Playnite.',
    emoji: '🖥️',
  },
  first_xbox_sync: {
    key: 'first_xbox_sync',
    name: 'Green Team',
    description: 'Synced an Xbox game via Playnite.',
    emoji: '🎮',
  },
  first_playstation_sync: {
    key: 'first_playstation_sync',
    name: 'Blue Team',
    description: 'Synced a PlayStation game via Playnite.',
    emoji: '🕹️',
  },
  first_switch_sync: {
    key: 'first_switch_sync',
    name: 'Docked & Ready',
    description: 'Synced a Switch game via Playnite.',
    emoji: '🍄',
  },
  first_quest_sync: {
    key: 'first_quest_sync',
    name: 'Strapped In',
    description: 'Synced a Meta Quest game via Playnite.',
    emoji: '🥽',
  },
  first_franchise_finished: {
    key: 'first_franchise_finished',
    name: 'Franchise Finisher',
    description: "Beat every entry of a series you've added.",
    emoji: '📚',
  },
  first_tag_applied: {
    key: 'first_tag_applied',
    name: 'Archivist',
    description: 'Applied your first tag.',
    emoji: '🗂️',
  },
  first_dlc_completionist: {
    key: 'first_dlc_completionist',
    name: 'Full Package',
    description: "Beat a base game and every DLC you've added for it.",
    emoji: '🎁',
  },
  first_full_house: {
    key: 'first_full_house',
    name: 'Full House',
    description: 'Every member of a room voted on the same game.',
    emoji: '🃏',
  },
  first_promoted: {
    key: 'first_promoted',
    name: 'Promoted',
    description: 'Got promoted to Moderator or Room Master by someone else.',
    emoji: '🎖️',
  },
  first_spin_winner: {
    key: 'first_spin_winner',
    name: 'Jackpot',
    description: 'A game you added got picked by Spin the Wheel.',
    emoji: '🎰',
  },
  first_patient: {
    key: 'first_patient',
    name: 'Patient',
    description: 'A price alert fired for something on your wishlist.',
    emoji: '⏳',
  },
  first_bargain_hunter: {
    key: 'first_bargain_hunter',
    name: 'Bargain Hunter',
    description: 'Marked a game owned after it hit an all-time-low price alert.',
    emoji: '🏷️',
  },
  first_backlog_buster: {
    key: 'first_backlog_buster',
    name: 'Backlog Buster',
    description: 'Finally dealt with a long-neglected backlog game.',
    emoji: '🧹',
  },
  // Distinct from first_drop ("No Regrets", any drop at all) - this one specifically rewards
  // bailing on something fast, the mirror image of first_marathoner below.
  first_quick_drop: {
    key: 'first_quick_drop',
    name: 'Not For Me',
    description: 'Dropped a game within a day of starting it.',
    emoji: '👋',
  },
  first_marathoner: {
    key: 'first_marathoner',
    name: 'Marathoner',
    description: "Finished a game you'd been playing for a month or more straight.",
    emoji: '🏃',
  },
  first_comeback: {
    key: 'first_comeback',
    name: 'Comeback',
    description: 'Replayed a game and beat it again.',
    emoji: '🔂',
  },
  first_anniversary: {
    key: 'first_anniversary',
    name: 'Year One',
    description: "Been part of QueueUp for a year.",
    emoji: '🎂',
  },
  shelf_25: {
    key: 'shelf_25',
    name: 'Collector',
    description: 'Have 25 games on your Personal Shelf.',
    emoji: '📚',
  },
  shelf_100: {
    key: 'shelf_100',
    name: 'Hoarder',
    description: 'Have 100 games on your Personal Shelf.',
    emoji: '🗄️',
  },
  shelf_500: {
    key: 'shelf_500',
    name: 'Archivist',
    description: 'Have 500 games on your Personal Shelf.',
    emoji: '🏛️',
  },
  beaten_10: {
    key: 'beaten_10',
    name: 'Double Digits',
    description: 'Beaten 10 games on your Personal Shelf.',
    emoji: '🔟',
  },
  beaten_50: {
    key: 'beaten_50',
    name: 'Veteran',
    description: 'Beaten 50 games on your Personal Shelf.',
    emoji: '🎖️',
  },
  beaten_100: {
    key: 'beaten_100',
    name: 'Centurion',
    description: 'Beaten 100 games on your Personal Shelf.',
    emoji: '💯',
  },
  first_review: {
    key: 'first_review',
    name: 'Critic',
    description: 'Wrote a review of a game.',
    emoji: '✍️',
  },
  first_friend: {
    key: 'first_friend',
    name: 'Better Together',
    description: 'Became friends with someone on QueueUp.',
    emoji: '🤝',
  },
  first_api_key: {
    key: 'first_api_key',
    name: 'Tinkerer',
    description: 'Created an API key.',
    emoji: '🔧',
  },
  first_merge: {
    key: 'first_merge',
    name: 'Tidy Shelf',
    description: 'Merged two cards of the same game into one.',
    emoji: '🧹',
  },
  first_hidden_game: {
    key: 'first_hidden_game',
    name: 'Low Profile',
    description: 'Hid a game from friends and your public profile.',
    emoji: '🕶️',
  },
  first_price_alert: {
    key: 'first_price_alert',
    name: 'Price Watcher',
    description: 'Set a price alert on a game.',
    emoji: '🔔',
  },
  first_profile_link: {
    key: 'first_profile_link',
    name: 'Own Brand',
    description: 'Chose a custom profile link.',
    emoji: '🪪',
  },
  first_own_ai: {
    key: 'first_own_ai',
    name: 'Bring Your Own AI',
    description: 'Set up your own AI provider.',
    emoji: '🤖',
  },
  first_ai_backup: {
    key: 'first_ai_backup',
    name: 'Safety Net',
    description: 'Added a backup AI provider.',
    emoji: '🛟',
  },
  first_ai_used: {
    key: 'first_ai_used',
    name: 'AI Assisted',
    description: 'Got an answer from the AI.',
    emoji: '✨',
  },
  first_api_key_used: {
    key: 'first_api_key_used',
    name: 'Plugged In',
    description: 'Used an API key to talk to QueueUp.',
    emoji: '🔌',
  },
  first_discord_webhook: {
    key: 'first_discord_webhook',
    name: 'Webhook Wired',
    description: 'Connected a room to Discord.',
    emoji: '📣',
  },
  first_export: {
    key: 'first_export',
    name: 'Data Owner',
    description: 'Downloaded your data.',
    emoji: '📦',
  },
  first_email_alert: {
    key: 'first_email_alert',
    name: 'Stay Informed',
    description: 'Switched on an email alert.',
    emoji: '📬',
  },
  first_computer_specs: {
    key: 'first_computer_specs',
    name: "Spec'd Out",
    description: 'Told QueueUp what you play on.',
    emoji: '🖥️',
  },
  // Deliberately last, and deliberately excluded from its own completion check (see
  // unlockBadges in services/badges.ts) - otherwise it could never reach 100% itself.
  first_full_collection: {
    key: 'first_full_collection',
    name: 'Full Collection',
    description: 'Unlocked every other badge.',
    emoji: '👑',
  },
};

export const ALL_BADGE_KEYS = Object.keys(BADGE_DEFINITIONS) as BadgeKey[];

/** Which platform-sync badge (issue: "an achievement for syncing a game for each console") a given
 * RoomPlatform counts toward - grouped by family (Xbox/PlayStation generations share one badge
 * each) rather than one per hardware generation, so the panel doesn't end up with nine near-
 * duplicate tiles for what's really "have you synced anything from this console line yet." PC is
 * included even though it's not a "console" in the literal sense - Playnite commonly aggregates PC
 * storefronts (GOG, Epic, itself) too, and it's the only sync path that can tell platforms apart at
 * all (Steam import, first_library_sync, is PC-only by construction). Shared between the Playnite
 * import route (server/src/routes/apiV1.ts, unlocks live on import) and the "Refresh Achievements"
 * recheck (server/src/services/badges.ts, retroactively grants based on current ownership for
 * anyone who synced before these badges existed) so both key off exactly the same mapping. */
export const PLATFORM_SYNC_BADGE_KEY: Partial<Record<RoomPlatform, BadgeKey>> = {
  pc: 'first_pc_sync',
  xbox_360: 'first_xbox_sync',
  xbox_one: 'first_xbox_sync',
  xbox_series: 'first_xbox_sync',
  ps3: 'first_playstation_sync',
  ps4: 'first_playstation_sync',
  ps5: 'first_playstation_sync',
  switch: 'first_switch_sync',
  switch2: 'first_switch_sync',
  quest: 'first_quest_sync',
  quest2: 'first_quest_sync',
  quest3: 'first_quest_sync',
};

/** One row of GET /api/me/badges - the full catalog, always all `ALL_BADGE_KEYS.length` entries
 * regardless of whether the current user has unlocked them, so the panel can render locked tiles.
 * `rarityPercent` is computed against every user in the database (not room/friends-scoped) - see
 * server/src/routes/badges.ts. */
export interface BadgeSummary {
  key: BadgeKey;
  name: string;
  description: string;
  emoji: string;
  unlockedAt: string | null;
  rarityPercent: number;
}

export interface BadgesResponse {
  badges: BadgeSummary[];
}

/** Response for POST /api/me/badges/refresh ("Refresh Achievements") - whichever badges this call
 * newly unlocked (often empty - most calls find nothing new). Same shape as every other
 * unlockedBadges field returned around the app, so the caller can feed it straight into the same
 * unlock-celebration plumbing (useAnnounceUnlock). */
export interface RefreshBadgesResponse {
  unlockedBadges: BadgeDefinition[];
}

/** One currently-playing/play-next entry on a public profile page (issue #511) - a deliberately
 * small slice of Game, not the full shape, since the viewer might not even be signed in and this
 * is scoped to only what a public showcase should ever expose. */
export interface PublicProfileGame {
  id: string;
  title: string;
  coverImageUrl: string | null;
  platform: string;
  /** True when the signed-in viewer (someone other than the profile owner) owns this game too, on a
   * platform in common with the owner - "you can play this together". Never set for an anonymous
   * viewer or the owner themself. */
  bothOwn?: boolean;
  /** IGDB id, so a signed-in viewer can add the game to their own shelf from the profile. */
  igdbId: number;
  /** True when the signed-in viewer (someone other than the profile owner) already has this game -
   * on their Personal Shelf in any status, or marked owned. Never set for an anonymous viewer or the
   * owner themself. */
  viewerHas?: boolean;
  /** True when the game is Paused (it shows in the profile's Up next list, with a pause emoji). */
  paused?: boolean;
}

/** Response for GET /api/public/users/:id (issue #511) - the shareable, unauthenticated
 * counterpart to a user's Personal Shelf, reachable at `/u/:id` regardless of whether the viewer
 * is signed in. Only ever returned when the target user has opted in (User.publicProfileEnabled);
 * a disabled or nonexistent id 404s identically, so a scan of ids can't distinguish "no such user"
 * from "exists but private." Only unlocked badges are included (unlike GET /api/me/badges' full
 * locked+unlocked catalog) - a public showcase is "here's what I've earned," not "here's what I
 * haven't done yet." Personal Shelf only, same scope as the release-watch alerts (#510) and the
 * Franchise Finisher/DLC Completionist badges this reuses data alongside - a room game isn't
 * "theirs" to show off the same way. */
/** One linked gaming account shown on a public profile. `url` is the account's public profile page. */
export interface PublicProfileGamertag {
  platform: 'steam' | 'xbox' | 'retroachievements';
  /** The name to show (the Xbox gamertag, the RetroAchievements username; Steam has no stored name,
   * so it shows the 64-bit id). */
  name: string;
  url: string;
}

export interface PublicUserProfile {
  displayName: string;
  avatarColor: string;
  avatarUrl: string | null;
  badges: BadgeSummary[];
  beatenGameCount: number;
  /** How many of those beaten games were 100%'d (every achievement). */
  fullyCompletedCount: number;
  currentlyPlaying: PublicProfileGame[];
  /** Systems the user owns (User.ownedPlatforms), as display labels. */
  systems: string[];
  /** Linked Steam / Xbox / RetroAchievements accounts, each with a link to its public profile. */
  gamertags: PublicProfileGamertag[];
  /** Beaten/Replay games not marked hidden, reviewed ones first. */
  beatenGames: PublicProfileBeatenGame[];
  /** When the account was created (ISO). */
  memberSince: string;
  /** The person's Year in Review story (issue #826), only when they chose to share it on their
   * profile and have not hidden it. `edited` false means the AI's own wording (shown with an AI flag). */
  yearStory: { text: string; edited: boolean } | null;
  /** The Personal Shelf's Wishlist (hidden games excluded), highest-voted first. */
  wishlist: PublicProfileGame[];
  /** Up to 10 of the Personal Shelf's Play Next list, topped up with its highest-voted backlog games. */
  upNext: PublicProfileGame[];
  /** Games the user has marked as owned (their Personal Shelf entries with an ownership claim). */
  library: PublicProfileGame[];
  /** The library games the signed-in viewer also owns (see PublicProfileGame.bothOwn). Always empty
   * for an anonymous viewer or the owner themself. */
  bothOwn: PublicProfileGame[];
  /** Who's looking: the owner themself, or a friend (who sees the profile even when it isn't public). */
  viewer: 'self' | 'friend' | 'public';
  /** The user id, so a signed-in viewer can load friend-only extras. */
  userId: string;
}

/** GET /api/me/sensitive-games - Personal Shelf games IGDB tags as adult that the owner hasn't answered
 * the "hide from your public library?" prompt for yet. */
export interface SensitiveGamesResponse {
  games: { id: string; title: string; coverImageUrl: string | null }[];
}

/** POST /api/games/:id/sensitive-check - whether the owner's own AI was asked, and whether the game is now flagged. */
export interface SensitiveCheckResponse {
  checked: boolean;
  flagged: boolean;
}

export interface ResolveSensitiveGamesRequest {
  /** Ids to hide from the public profile and friends. */
  hideIds: string[];
  /** Ids to leave visible. Every id in hideIds + keepIds is marked as answered. */
  keepIds: string[];
}

export interface PublicProfileBeatenGame {
  id: string;
  title: string;
  coverImageUrl: string | null;
  genre: string | null;
  replaying: boolean;
  /** Beaten as part of a group (finished in a room, then marked Beaten on the shelf from there). */
  inGroup: boolean;
  /** Dropped rather than finished - listed with the played games, flagged with a red border. */
  dropped: boolean;
  review: GameReview | null;
  /** Every achievement unlocked (100%) - shown first, with a trophy. */
  fullyCompleted: boolean;
}

// ---- Friends -------------------------------------------------------------------------------

export type FriendEventKind = 'added' | 'wishlist' | 'playing' | 'beaten' | 'dropped' | 'ach' | 'console';

export interface FriendUser {
  id: string;
  displayName: string;
  avatarColor: string;
  avatarUrl: string | null;
}

export interface FriendSummary extends FriendUser {
  /** ISO timestamp the friendship was accepted. */
  since: string;
  beatenCount: number;
  achievementCount: number;
  sharedRoomCount: number;
  /** The friend's most recent visible activity, if any. */
  lastEvent: { kind: FriendEventKind; title: string; at: string } | null;
  /** True when the friend set their profile to Private: their counts and activity are hidden from everyone. */
  profilePrivate: boolean;
}

export interface FriendRequestDto {
  id: string;
  user: FriendUser;
  createdAt: string;
  sharedRoomCount: number;
}

export interface FriendsResponse {
  myCode: string;
  /** When myCode (and the /add/<code> link built from it) stops working; a fresh one replaces it. */
  myCodeExpiresAt: string;
  /** True on a PRIVATE_INSTANCE: everyone is a friend, so the UI hides friend codes and requests. */
  privateInstance: boolean;
  friends: FriendSummary[];
  incoming: FriendRequestDto[];
  outgoing: FriendRequestDto[];
}

/** One item in the friends' activity feed (and a single friend's profile feed). */
/** The reactions people can leave on an activity feed entry. */
export const FEED_REACTION_EMOJI = ['👍', '❤️', '😂', '🔥', '🎉', '💩', '😡', '💸'] as const;

/** How many people reacted to a feed entry with one emoji, and whether the viewer is one of them. */
export interface FeedReactionSummary {
  emoji: string;
  count: number;
  mine: boolean;
  /** Display names of the other people who used this emoji and are friends of the viewer. Reactors the
   * viewer isn't friends with are only counted (in `count`), never named. The viewer is not listed
   * here (see `mine`). */
  names: string[];
}

/** Body for POST /api/feed-reactions. A null emoji removes the viewer's reaction. */
export interface SetFeedReactionRequest {
  entryId: string;
  emoji: string | null;
}

export interface FriendActivityEntry {
  id: string;
  user: FriendUser;
  kind: FriendEventKind;
  /** Game title, the achievement name for kind 'ach', or the system name for kind 'console'. */
  title: string;
  /** Achievement emoji for kind 'ach'; a controller for kind 'console'. */
  emoji: string | null;
  coverImageUrl: string | null;
  /** ISO timestamp. */
  at: string;
  review: GameReview | null;
  /** True on the viewer's own entries for a game they've hidden from others. */
  onlyYou: boolean;
  /** Reactions left on this entry, one summary per emoji used. */
  reactions: FeedReactionSummary[];
}

export interface FriendActivityPage {
  entries: FriendActivityEntry[];
  nextBefore: string | null;
}

export interface FriendProfile {
  user: FriendUser;
  since: string;
  sharedRoomCount: number;
  beatenCount: number;
  achievementCount: number;
  playing: { id: string; title: string; coverImageUrl: string | null; since: string }[];
  activity: FriendActivityEntry[];
}

/** Either a friend code, or the id of someone you share a room with (the room settings member list). */
/** GET /api/games/:id/trailer - a YouTube video id for the game's trailer, or null if IGDB has none. */
export interface GameTrailerResponse {
  trailer: { youtubeId: string; name: string | null } | null;
}

export interface SendFriendRequestRequest {
  code?: string;
  userId?: string;
}

/** GET /api/play-together/:notificationId/rooms - rooms both people are in, as options for adding the game. */
export interface PlayTogetherRoomsResponse {
  rooms: { id: string; name: string }[];
}

/** POST /api/play-together/:notificationId/accept - add to an existing shared room (roomId), or
 * omit it to create a new room with just the two of you. */
export interface AcceptPlayTogetherRequest {
  roomId?: string;
}
export interface AcceptPlayTogetherResponse {
  roomId: string;
  roomName: string;
  created: boolean;
}

// ---------------------------------------------------------------------------------------------
// AI backend - the call layer other features will use to talk to a language model. Server-wide
// settings come from env / Administrator settings; a person can set their own on top.
// ---------------------------------------------------------------------------------------------

export const AI_PROVIDERS = ['anthropic', 'openai', 'gemini', 'ollama', 'openai_compatible'] as const;
export type AiProvider = (typeof AI_PROVIDERS)[number];

/** The model suggested for each brand in the AI settings: a balanced, general-purpose pick (not the
 * priciest, not the smallest) from the vendor's own model list. Null where there is nothing to
 * suggest - Ollama and OpenAI-compatible servers serve whatever model the person has loaded. Model
 * names change often; update this one table when a vendor retires or renames one. */
export const AI_RECOMMENDED_MODELS: Record<AiProvider, string | null> = {
  anthropic: 'claude-sonnet-5-5',
  openai: 'gpt-6.1-sol',
  gemini: 'gemini-3.8-flash',
  ollama: null,
  openai_compatible: null,
};

/** Where the settings an AI call would use come from: the person's own, the room's sponsor (a member
 * who applied their own to the room), the server's, or none. */
export type AiSettingsSource = 'user' | 'room' | 'server' | 'none';

/** A room's AI sponsor: the member whose personal AI settings the room uses for people who have none
 * of their own. Their key is never shown; what's billed to them is the room's AI use. */
export interface RoomAiResponse {
  sponsor: User | null;
  youAreSponsor: boolean;
  /** You have usable personal AI settings, nobody else is sponsoring, and this server allows it. */
  canApply: boolean;
  /** You are the sponsor, or the Room Master or a Moderator. */
  canRemove: boolean;
  /** Whether your own usable AI settings exist (applying needs them). */
  hasOwnSettings: boolean;
}

/** Most backups one list can hold behind its first provider. */
export const AI_MAX_FALLBACKS = 4;

/** One extra provider and key, tried in order when the one before it fails. Write-only key, like the rest. */
export interface AiFallbackEntry {
  /** Stable handle so a saved key is kept when the list is reordered or edited without retyping it. */
  id: string;
  provider: AiProvider;
  model: string | null;
  baseUrl: string | null;
  hasApiKey: boolean;
  /** Switched off: kept saved but not used. */
  disabled: boolean;
}

/** What goes in when saving a backup. `apiKey` left out keeps the saved key of the same `id`; null or '' removes it. */
export interface AiFallbackInput {
  id?: string;
  provider: AiProvider;
  model?: string | null;
  baseUrl?: string | null;
  apiKey?: string | null;
  /** Left out keeps the saved setting (on for a new entry). */
  disabled?: boolean;
}

/** The latest time a provider failed and a backup answered instead. Shown as a warning so the person
 * knows the first key needs attention (expired, out of credit, rate limited...). */
export interface AiFallbackNotice {
  at: string;
  failedProvider: AiProvider;
  failedModel: string;
  /** Why it failed. Never contains a key. */
  error: string;
  usedProvider: AiProvider;
  usedModel: string;
}

/** One game the AI picked for an unmatched import. `auto` is true when it was sure enough that the
 * title was matched and added without asking (the row is then gone from the review list). */
export interface AiMatchSuggestion {
  /** The PendingLibraryImport id. */
  id: string;
  igdbId: number;
  /** 0 to 1. */
  confidence: number;
  auto: boolean;
}

/** Result of POST /api/library/pending-imports/ai-match. */
export interface AiMatchPendingResponse {
  suggestions: AiMatchSuggestion[];
  /** How many titles were matched without asking. */
  autoMatched: number;
  /** How many waiting titles the AI looked at. */
  checked: number;
  fallback: AiFallbackNotice | null;
  /** Where the next chunk starts (send it back as `after`), or null once every waiting title has been looked at. */
  next: string | null;
  /** How many waiting titles are still to be looked at after this chunk. */
  remaining: number;
  /** Why the run ended early (provider error, the daily limit on the shared AI), if it did; what was done is kept. */
  stopped: string | null;
}

/** What an imported title looks like to the AI. Only `soundtrack`, `tool`, `demo` and `bundle` are
 * suggested for skipping; `edition` and `dlc` are flagged so matching can point them at the right game. */
export type AiImportKind = 'game' | 'edition' | 'dlc' | 'soundtrack' | 'tool' | 'demo' | 'bundle';

export const AI_SKIPPABLE_IMPORT_KINDS: readonly AiImportKind[] = ['soundtrack', 'tool', 'demo'];

export interface AiImportClassification {
  /** The PendingLibraryImport id. */
  id: string;
  kind: AiImportKind;
  /** 0 to 1. */
  confidence: number;
  /** True when the AI is sure this is not a game and suggests skipping it. */
  suggestSkip: boolean;
}

/** Result of POST /api/library/pending-imports/ai-classify. Only titles that are not plain games are listed. */
export interface AiClassifyPendingResponse {
  items: AiImportClassification[];
  checked: number;
  fallback: AiFallbackNotice | null;
  next: string | null;
  remaining: number;
  stopped: string | null;
}

/** Body for POST /api/library/pending-imports/dismiss-many. */
/** Body for POST /api/library/pending-imports/ai-match and ai-classify: carry on after the `next`
 * the previous chunk returned (leave out to start from the newest). */
export interface AiPendingChunkRequest {
  after?: string | null;
}

export interface DismissPendingLibraryImportsRequest {
  ids: string[];
}

/** A room's AI weekly recap (issue #830): its settings and the latest recap. */
export interface RoomWeeklyRecapResponse {
  enabled: boolean;
  /** Also post each recap to the room's Discord webhook. */
  postToDiscord: boolean;
  /** Whether the room has a Discord webhook to post to. */
  hasDiscordWebhook: boolean;
  /** The Room Master or a Moderator: may change the settings and write one now. */
  canManage: boolean;
  recap: { text: string; windowStart: string; createdAt: string } | null;
}

/** Body for PUT /api/rooms/:id/weekly-recap. */
export interface UpdateRoomWeeklyRecapRequest {
  enabled?: boolean;
  postToDiscord?: boolean;
}

/** The computed numbers and titles a Year in Review story is written from (issue #826). Only these
 * go to the AI: never notes, reviews' text or journal entries. The server clamps every field. */
export interface YearStoryFacts {
  windowStart: string;
  windowEnd: string;
  finishedCount: number;
  /** Total of the finished games' time to beat, null when unknown. */
  estimatedHours: number | null;
  finishedTitles: string[];
  topGenres: { genre: string; count: number }[];
  /** The longest games finished (personal story). */
  longestGames: { title: string; hours: number }[];
  /** Most-voted games. */
  mostVoted: string[];
  /** Rooms the person finished games in, with the titles (personal story). Names of people are never included. */
  rooms: { name: string; games: string[] }[];
  /** Rarest achievements earned (personal story). */
  rarestAchievements: { game: string; name: string }[];
  /** People in the room (room story). */
  memberCount: number | null;
}

/** Body for POST /api/me/year-story/generate and /api/rooms/:id/year-story/generate. */
export interface GenerateYearStoryRequest {
  facts: YearStoryFacts;
}

/** A saved Year in Review story. The text may have been edited by the person; it is always shown with the AI flag unless edited. */
export interface YearStoryDto {
  text: string;
  /** The person changed the AI's wording, so it is no longer shown as AI-written. */
  edited: boolean;
  hidden: boolean;
  /** Personal story only: shown on the public profile. */
  sharedOnProfile: boolean;
  generatedAt: string;
  updatedAt: string;
  /** Room story: the person may edit, hide or delete it (the Room Master, a Moderator, or whoever generated it). */
  canManage: boolean;
}

/** Body for PUT /api/me/year-story and /api/rooms/:id/year-story. */
export interface UpdateYearStoryRequest {
  text?: string;
  hidden?: boolean;
  /** Personal story only. */
  sharedOnProfile?: boolean;
}

/** What a plain-language search was understood as (issue #823): the app's own filters plus a text
 * query. Shown as chips the person can change or remove. Never contains a game. */
export interface AiSearchFilters {
  /** Keywords or a title for IGDB's text search, or null. */
  query: string | null;
  platforms: RoomPlatform[];
  coop: boolean;
  /** IGDB genre names. */
  genres: string[];
  /** Longest main-story length wanted, in hours. */
  maxHours: number | null;
  releasedFrom: number | null;
  releasedTo: number | null;
}

/** Body for POST /api/games/ai-search: a sentence, for the shelf or (with roomId) a room. */
export interface AiSearchRequest {
  text: string;
  roomId?: string | null;
  /** Same switch as the normal search: false scopes to the person's owned systems. */
  allPlatforms?: boolean;
}

/** Body for POST /api/games/ai-search/run: re-runs (edited) filters without asking the AI again. */
export interface AiSearchRunRequest {
  filters: AiSearchFilters;
  roomId?: string | null;
  allPlatforms?: boolean;
}

export interface AiSearchResponse {
  filters: AiSearchFilters;
  /** Parts of the sentence the app cannot filter by (for example a price), shown so nothing is silently dropped. */
  unsupported: string[];
  results: GameSearchResult[];
  fallback: AiFallbackNotice | null;
}

/** What the backlog coach suggests doing to a card (issue #827). Each is a status change the person accepts. */
export type AiCoachAction = 'wont_play' | 'play_next';

export interface AiCoachSuggestion {
  gameId: string;
  title: string;
  coverImageUrl: string | null;
  action: AiCoachAction;
  /** One sentence from the AI, shown as plain text. */
  reason: string;
}

/** Result of POST /api/games/ai-backlog-coach. Nothing is changed by the call itself. */
export interface AiBacklogCoachResponse {
  /** False when there is too little history or backlog to say anything; then nothing was asked of the AI. */
  enoughData: boolean;
  /** A few plain-language observations about the person's play history. */
  patterns: string[];
  suggestions: AiCoachSuggestion[];
  fallback: AiFallbackNotice | null;
}

/** A game the AI recommended (issues #820, #821). Always a real IGDB game that is not already on the
 * shelf or in the room; the AI only names titles and each one is matched against IGDB. */
export interface AiRecommendation extends GameSearchResult {
  /** One short sentence from the AI, shown as plain text. */
  reason: string;
  /** IGDB's 0-100 review score, when IGDB has one. */
  reviewScore: number | null;
  /** IGDB's genres, e.g. "Shooter, Adventure"; null when IGDB lists none. */
  genre: string | null;
}

/** Body for POST /api/games/ai-recommend. Without a roomId it is for the Personal Shelf. */
export interface AiRecommendRequest {
  roomId?: string | null;
}

/** Result of POST /api/games/ai-recommend. */
export interface AiRecommendResponse {
  recommendations: AiRecommendation[];
  fallback: AiFallbackNotice | null;
}

/** A backlog game the AI picked for tonight (issue #825). Always a card on the person's own shelf. */
export interface AiTonightPick {
  gameId: string;
  title: string;
  coverImageUrl: string | null;
  platform: string;
  timeToBeatHours: number | null;
  /** One or two sentences from the AI, shown as plain text. */
  reason: string;
}

/** Body for POST /api/games/ai-tonight. `excludeIds` are cards already offered, for "show another". */
export interface AiTonightRequest {
  request: string;
  excludeIds?: string[];
  /** Pick from this room's queue for the whole group, instead of from your own shelf. */
  roomId?: string;
}

export interface AiTonightResponse {
  pick: AiTonightPick;
  alternate: AiTonightPick | null;
  fallback: AiFallbackNotice | null;
}

/** A DLC or expansion for a game on the shelf that releases soon (issue #869), shown in the Coming
 * soon strip with "Add to wishlist" and "Ignore". */
export interface UpcomingDlc {
  igdbId: number;
  title: string;
  platform: string;
  coverImageUrl: string | null;
  /** ISO date. */
  releaseDate: string;
  /** The shelf card of the game this DLC belongs to. */
  baseGameId: string;
  baseGameTitle: string;
}

/** One card in a suggested duplicate pair. */
export interface DuplicateSuggestionGame {
  id: string;
  igdbId: number;
  title: string;
  platform: string;
  releaseYear: number | null;
  coverImageUrl: string | null;
  status: GameStatus;
}

/** Two shelf cards the AI thinks are the same game (issue #824). Never merged automatically. */
export interface DuplicateSuggestion {
  a: DuplicateSuggestionGame;
  b: DuplicateSuggestionGame;
  /** Which card to keep when merging: the base game or the earlier release (never a remaster folded into its original). */
  keep: 'a' | 'b';
  /** 0 to 1. */
  confidence: number;
  /** One short sentence from the AI on why they look the same. */
  reason: string;
  /** Where it came from: the AI (the default), other people having merged the same pair, or IGDB
   * listing both cards as the same game (`igdb`) - the last two need no AI request at all. */
  source?: 'ai' | 'community' | 'igdb';
  /** For `community`: how many other people merged this pair. */
  mergedBy?: number;
}

/** Result of POST /api/games/duplicates/ai-scan. */
export interface AiDuplicateScanResponse {
  pairs: DuplicateSuggestion[];
  /** How many pairs on the shelf look alike by title (the ones earlier answers are looked up for). */
  candidates: number;
  /** How many shelf games the AI looked through this time (the whole shelf, unless it stopped early). */
  checked: number;
  /** Pairs suggested from what other people already merged or an earlier AI answer. */
  reused: number;
  /** Games skipped because an earlier scan already checked them (not on "Scan again"). */
  alreadyChecked: number;
  /** Games still to check because the scan stopped early (e.g. the daily AI limit) - the next scan picks them up. */
  remaining: number;
  fallback: AiFallbackNotice | null;
  /** Why the scan ended early (provider error, the daily limit on the shared AI), if it did; what was found is kept. */
  stopped: string | null;
}

/** Result of GET /api/games/duplicates/count: pairs that look like the same game by title alone. */
export interface DuplicateCandidateCountResponse {
  count: number;
}

/** Result of GET /api/games/duplicates: the pairs behind the count, by title alone (no AI). */
export interface DuplicateCandidatesResponse {
  pairs: { a: DuplicateSuggestionGame; b: DuplicateSuggestionGame; keep: 'a' | 'b'; /** How many other people merged this pair (0 when none, or too few to count). */ communityMergedBy: number }[];
}

/** Body for POST /api/games/duplicates/dismiss: the two cards that are not duplicates. */
export interface MarkBundleRequest {
  gameId: string;
}

export interface DismissDuplicateRequest {
  gameIdA: string;
  gameIdB: string;
}

/** A person's own AI settings. The API key is write-only: it is never sent back, only whether one is saved. */
export interface UserAiSettings {
  provider: AiProvider;
  model: string | null;
  baseUrl: string | null;
  hasApiKey: boolean;
  /** The first provider is switched off: kept saved but not used. */
  disabled: boolean;
  /** Backups tried in order when the provider above fails. */
  fallbacks: AiFallbackEntry[];
}

export interface AiSettingsResponse {
  /** The person's own settings, or null when they haven't set any. */
  user: UserAiSettings | null;
  /** The server-wide settings, without the key. Null when the server has none. */
  server: { provider: AiProvider; model: string | null; baseUrl: string | null } | null;
  /** The last time the person's own first provider failed and a backup took over, if it did. */
  lastFallback: AiFallbackNotice | null;
  /** Which of the two an AI call would use right now. */
  effectiveSource: AiSettingsSource;
  /** Whether this server lets people set their own. */
  userSettingsAllowed: boolean;
  /** Whether a person's own settings may use a custom base URL (needed for ollama / openai_compatible). */
  userBaseUrlAllowed: boolean;
  providers: AiProvider[];
}

/** Sets the person's own AI settings. `apiKey` left out keeps the saved key; null or '' removes it. */
export interface SetUserAiSettingsRequest {
  provider: AiProvider;
  model?: string | null;
  baseUrl?: string | null;
  apiKey?: string | null;
  /** Switch the first provider off or on. Left out keeps it as it is. */
  disabled?: boolean;
  /** Backups, in the order to try them. Left out keeps the saved list; [] clears it. */
  fallbacks?: AiFallbackInput[];
}

/** Body for POST /api/me/ai/models and /api/admin/ai/models: which saved entry to list models for, by its
 * position in the settings list (0 is the first, then the backups). The address and key are the saved ones. */
export interface AiModelsRequest {
  index: number;
}

export interface AiModelsResponse {
  models: string[];
}

/** What the AI is doing for the signed-in person right now, for one kind of request (`label`: duplicates,
 * importMatch, importClassify, picks, search, tonight, price, story, coach, test or ai). */
export interface AiActivityEntry {
  label: string;
  running: number;
  /** Waiting for a free slot because the server limits how many AI requests run at once. */
  queued: number;
  /** Where the first waiting request is in the line (1 = next), across everyone. Null when none is waiting. */
  nextPosition: number | null;
}

export interface AiActivityResponse {
  activity: AiActivityEntry[];
}

export interface AiTestResponse {
  ok: boolean;
  source: AiSettingsSource;
  provider: AiProvider;
  model: string;
  /** The model's short reply to the test prompt. */
  reply: string;
  /** Set when the first provider failed and a backup answered this test. */
  fallback: AiFallbackNotice | null;
}

/** Administrator settings: the server-wide first provider (each part may come from Docker env) and its backups. */
export interface AdminAiResponse {
  provider: AiProvider | null;
  model: string | null;
  baseUrl: string | null;
  sources: Record<'AI_PROVIDER' | 'AI_API_KEY' | 'AI_BASE_URL' | 'AI_MODEL', ConfigSource>;
  /** The first provider is switched off: kept saved but not used. */
  disabled: boolean;
  fallbacks: AiFallbackEntry[];
  lastFallback: AiFallbackNotice | null;
  providers: AiProvider[];
}

/** Saves the server-wide AI settings. A part set by Docker env is left alone. `apiKey` left out keeps the
 * saved one. `fallbacks` left out keeps the saved list. */
export interface SetAdminAiRequest {
  provider: AiProvider;
  model?: string | null;
  baseUrl?: string | null;
  apiKey?: string | null;
  /** Switch the first provider off or on. Left out keeps it as it is. */
  disabled?: boolean;
  fallbacks?: AiFallbackInput[];
}

// ---------------------------------------------------------------------------------------------
// Native Xbox library sync: link a Microsoft account with the device-code login, then pull the
// Xbox library without Playnite in between.
// ---------------------------------------------------------------------------------------------

export interface XboxStatusResponse {
  /** The server has an Xbox app (client id) set up. Without one, nothing here can be linked. */
  configured: boolean;
  connected: boolean;
  gamertag: string | null;
  lastSyncedAt: string | null;
}

/** Started by POST /api/me/xbox/connect: show `userCode` and send the person to `verificationUri`. */
export interface XboxConnectStartResponse {
  userCode: string;
  verificationUri: string;
  /** Seconds until the code stops working. */
  expiresIn: number;
  /** Seconds to wait between polls. */
  interval: number;
}

export type XboxConnectPollResponse =
  | { status: 'pending' }
  | { status: 'connected'; gamertag: string | null }
  | { status: 'expired' | 'declined' };

/** Progress of a native library sync (same shape for every store, same as the Playnite import). */
export type LibrarySyncProgress = PlayniteImportProgress;

// ---------------------------------------------------------------------------------------------
// Exophase library sync: read a person's public Exophase profile (their PlayStation, Xbox, Steam,
// Epic, GOG and other libraries, gathered by Exophase) and sync it to the Personal Shelf.
// ---------------------------------------------------------------------------------------------

export interface ExophaseStatusResponse {
  connected: boolean;
  playerId: string | null;
  lastSyncedAt: string | null;
}

/** `profile` is whatever the person has: their Exophase profile link, their profile name, or the
 * numeric player id. */
export interface ConnectExophaseRequest {
  profile: string;
}

// ---------------------------------------------------------------------------------------------
// Native PlayStation library sync: link a PlayStation account with a one-off NPSSO code, then pull
// the purchased PS4 and PS5 games without Playnite in between.
// ---------------------------------------------------------------------------------------------

export interface PsnStatusResponse {
  connected: boolean;
  lastSyncedAt: string | null;
  /** When Sony stops accepting the saved login and the person has to link again. Null when unknown. */
  linkExpiresAt: string | null;
}

/** `npsso` is the 64-character code from Sony's sign-in cookie page. It is traded for a long-lived
 * login right away and never stored. */
export interface ConnectPsnRequest {
  npsso: string;
}

// ---------------------------------------------------------------------------------------------
// RetroAchievements sync: read a person's RetroAchievements profile (the retro games they have
// played, and which they have beaten or mastered) with their personal web API key.
// ---------------------------------------------------------------------------------------------

export interface RetroAchievementsStatusResponse {
  connected: boolean;
  username: string | null;
  lastSyncedAt: string | null;
}

/** `apiKey` is the personal web API key from the person's RetroAchievements settings. It is stored
 * encrypted and never returned. */
export interface ConnectRetroAchievementsRequest {
  username: string;
  apiKey: string;
}
