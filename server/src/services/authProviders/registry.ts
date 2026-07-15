import { env } from '../../config/env.js';
import { createOidcProvider } from './oidcProvider.js';
import { createDiscordProvider } from './discordProvider.js';
import { createSteamProvider } from './steamProvider.js';
import type { AuthProvider } from './types.js';

export async function buildAuthProviders(): Promise<Map<string, AuthProvider>> {
  const providers = new Map<string, AuthProvider>();

  if (env.OIDC_ISSUER_URL && env.OIDC_CLIENT_ID && env.OIDC_CLIENT_SECRET && env.OIDC_REDIRECT_URI) {
    const provider = await createOidcProvider({
      name: 'oidc',
      subPrefix: 'oidc',
      issuerUrl: env.OIDC_ISSUER_URL,
      clientId: env.OIDC_CLIENT_ID,
      clientSecret: env.OIDC_CLIENT_SECRET,
      redirectUri: env.OIDC_REDIRECT_URI,
      scopes: env.OIDC_SCOPES,
    });
    providers.set(provider.name, provider);
  }

  if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REDIRECT_URI) {
    const provider = await createOidcProvider({
      name: 'google',
      subPrefix: 'google',
      issuerUrl: 'https://accounts.google.com',
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      redirectUri: env.GOOGLE_REDIRECT_URI,
      scopes: 'openid profile email',
    });
    providers.set(provider.name, provider);
  }

  if (env.DISCORD_CLIENT_ID && env.DISCORD_CLIENT_SECRET && env.DISCORD_REDIRECT_URI) {
    providers.set(
      'discord',
      createDiscordProvider({
        clientId: env.DISCORD_CLIENT_ID,
        clientSecret: env.DISCORD_CLIENT_SECRET,
        redirectUri: env.DISCORD_REDIRECT_URI,
      }),
    );
  }

  if (env.STEAM_API_KEY && env.STEAM_REDIRECT_URI) {
    providers.set('steam', createSteamProvider({ apiKey: env.STEAM_API_KEY, redirectUri: env.STEAM_REDIRECT_URI }));
  }

  return providers;
}
