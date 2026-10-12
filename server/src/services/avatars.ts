import { createHash } from 'node:crypto';
import { AVATAR_CHOICES, type AvatarChoice } from '@queueup/shared';
import { prisma } from '../db/client.js';

export { AVATAR_CHOICES };

/** Which stored picture a sign-in provider's avatar belongs to. Anything that is not Steam or Discord
 * (Google, a single sign-on server, ...) is just "provider": used by Automatic, not offered by name. */
export function avatarSourceKey(oidcSubOrProvider: string): 'steam' | 'discord' | 'provider' {
  const provider = oidcSubOrProvider.split(':')[0];
  return provider === 'steam' || provider === 'discord' ? provider : 'provider';
}

export type AvatarSources = Partial<Record<'steam' | 'discord' | 'provider', string>>;

export function readSources(value: unknown): AvatarSources {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: AvatarSources = {};
  for (const key of ['steam', 'discord', 'provider'] as const) {
    const v = (value as Record<string, unknown>)[key];
    if (typeof v === 'string' && /^https:\/\//.test(v)) out[key] = v;
  }
  return out;
}

/** Gravatar's picture for an email address. `d=404` makes it answer 404 when the address has none. */
export function gravatarUrl(email: string): string {
  const hash = createHash('sha256').update(email.trim().toLowerCase()).digest('hex');
  return `https://gravatar.com/avatar/${hash}?s=256&d=404`;
}

/** Whether the address has a Gravatar. A network failure counts as "no" so a hiccup cannot save a
 * picture that may not exist. */
export async function gravatarExists(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(5000) });
    return res.ok;
  } catch {
    return false;
  }
}

interface AvatarFields {
  avatarChoice: string;
  avatarBlocked: boolean;
  email: string;
  emailVerified: boolean;
}

/** The picture URL to show for a person, or null for their colour and first letter. `latest` is the
 * picture the provider they last signed in with gave (what Automatic uses). A picture an administrator
 * removed stays removed whatever is chosen. */
export function effectiveAvatarUrl(user: AvatarFields, sources: AvatarSources, latest: string | null): string | null {
  if (user.avatarBlocked) return null;
  switch (user.avatarChoice as AvatarChoice) {
    case 'letter':
      return null;
    case 'steam':
      return sources.steam ?? null;
    case 'discord':
      return sources.discord ?? null;
    case 'gravatar':
      return user.emailVerified ? gravatarUrl(user.email) : null;
    default:
      return latest;
  }
}

/** Remembers the picture of an account the person just linked (Steam, Discord, ...), so it can be chosen.
 * What is shown only changes if they chose that source already. Best effort. */
export async function recordLinkedAvatar(userId: string, provider: string, picture: string | null): Promise<void> {
  if (!picture) return;
  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) return;
    const sources = readSources(user.avatarSources);
    sources[avatarSourceKey(provider)] = picture;
    const avatarUrl = user.avatarChoice === 'auto' ? user.avatarUrl : effectiveAvatarUrl(user, sources, user.avatarUrl);
    await prisma.user.update({ where: { id: userId }, data: { avatarSources: sources, avatarUrl } });
  } catch (err) {
    console.error('[avatars] could not record a linked account picture', err);
  }
}
