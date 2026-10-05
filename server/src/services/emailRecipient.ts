// Addresses made up for sign-in providers that gave no email (steamcommunity.unknown,
// discord.unknown, xbox.unknown, <sso name>.unknown) go nowhere.
export const isUndeliverableAddress = (address: string): boolean => /\.unknown$/i.test(address.split('@')[1] ?? '');

/** The one rule for who QueueUp may email about an account: the alert address the person confirmed
 * (or set while this server couldn't send mail to confirm with), else the account's sign-in email
 * - but only when the provider vouched for it and it is a real address. Null means nobody: an
 * unverified sign-in email (anyone can type one into a Discord or SSO profile) is never mailed, so
 * someone can't make QueueUp send mail to a stranger by signing up as them. */
export function mailRecipient(user: { email: string; alertEmail: string | null; emailVerified: boolean }): string | null {
  if (user.alertEmail) return user.alertEmail;
  if (!user.emailVerified || isUndeliverableAddress(user.email)) return null;
  return user.email;
}
