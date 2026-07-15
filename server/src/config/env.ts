import { z } from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  APP_BASE_URL: z.string().url(),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  SESSION_SECRET: z.string().min(16),

  DEV_FAKE_AUTH: z
    .string()
    .optional()
    .transform((v) => v === 'true'),

  // Generic OIDC provider (Authelia, Keycloak, Authentik, ...) - bring your own issuer.
  OIDC_ISSUER_URL: z.string().optional(),
  OIDC_CLIENT_ID: z.string().optional(),
  OIDC_CLIENT_SECRET: z.string().optional(),
  OIDC_REDIRECT_URI: z.string().optional(),
  OIDC_SCOPES: z.string().default('openid profile email'),

  // Google - also plain OIDC (fixed issuer), just its own named login button.
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().optional(),

  // Discord - OAuth2 only, no OIDC discovery/id_token, so it's handled separately from the above.
  DISCORD_CLIENT_ID: z.string().optional(),
  DISCORD_CLIENT_SECRET: z.string().optional(),
  DISCORD_REDIRECT_URI: z.string().optional(),

  // Steam - legacy OpenID 2.0 (not OAuth2/OIDC at all). The API key is only used afterward, to
  // fetch a username/avatar for the verified SteamID via the Steam Web API.
  STEAM_API_KEY: z.string().optional(),
  STEAM_REDIRECT_URI: z.string().optional(),

  GGDEALS_API_KEY: z.string().min(1),
  GGDEALS_DEFAULT_REGION: z.string().default('us'),

  IGDB_CLIENT_ID: z.string().min(1),
  IGDB_CLIENT_SECRET: z.string().min(1),

  // Comma-separated emails granted administrator access on login.
  ADMIN_EMAILS: z.string().optional().default(''),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('Invalid environment configuration:');
    console.error(parsed.error.flatten().fieldErrors);
    process.exit(1);
  }

  if (!parsed.data.DEV_FAKE_AUTH) {
    const data = parsed.data;
    const oidcReady = !!(data.OIDC_ISSUER_URL && data.OIDC_CLIENT_ID && data.OIDC_CLIENT_SECRET && data.OIDC_REDIRECT_URI);
    const googleReady = !!(data.GOOGLE_CLIENT_ID && data.GOOGLE_CLIENT_SECRET && data.GOOGLE_REDIRECT_URI);
    const discordReady = !!(data.DISCORD_CLIENT_ID && data.DISCORD_CLIENT_SECRET && data.DISCORD_REDIRECT_URI);
    const steamReady = !!(data.STEAM_API_KEY && data.STEAM_REDIRECT_URI);

    if (!oidcReady && !googleReady && !discordReady && !steamReady) {
      console.error(
        'No sign-in method is fully configured (generic OIDC, Google, Discord, and Steam are all incomplete). ' +
          'Set DEV_FAKE_AUTH=true for local dev without one, or finish configuring at least one provider.',
      );
      process.exit(1);
    }
  }

  return parsed.data;
}

export const env = loadEnv();
