import { oauthProvider } from '@better-auth/oauth-provider';
import { betterAuth } from 'better-auth';
import { getMigrations } from 'better-auth/db/migration';
import { jwt } from 'better-auth/plugins';
import { createMiddleware } from 'hono/factory';
import { pool } from './db';

// BetterAuth stores its own tables (user, session, account, verification) in
// the same Postgres database via its built-in Kysely adapter. They are managed
// by BetterAuth's migrator, not Drizzle.
export const baseURL = (process.env.BETTER_AUTH_URL ?? 'http://localhost:3000').replace(/\/+$/, '');

/** The MCP endpoint's canonical URL; OAuth access tokens are minted for it (JWT `aud`). */
export const mcpResource = `${baseURL}/mcp`;

const options = {
  database: pool,
  secret: process.env.BETTER_AUTH_SECRET ?? 'dev-secret-change-me-dev-secret-change-me',
  baseURL,
  trustedOrigins: [
    'http://localhost:5173',
    'http://localhost:3000',
    ...(process.env.BETTER_AUTH_TRUSTED_ORIGINS?.split(',').filter(Boolean) ?? []),
  ],
  emailAndPassword: { enabled: true, autoSignIn: true },
  // The OAuth provider signs JWT access tokens with the jwt plugin's keys; its
  // session-to-JWT /token endpoint isn't needed.
  disabledPaths: ['/token'],
  plugins: [
    jwt(),
    // OAuth 2.1 authorization server for MCP clients (Claude, ChatGPT, ...).
    // They self-register via dynamic client registration, send the user to
    // /login and /oauth/consent, then call /mcp with a Bearer token.
    oauthProvider({
      loginPage: '/login',
      consentPage: '/oauth/consent',
      allowDynamicClientRegistration: true,
      allowUnauthenticatedClientRegistration: true,
      clientRegistrationDefaultApplicationType: 'infer',
      scopes: ['openid', 'profile', 'email', 'offline_access'],
      clientRegistrationDefaultScopes: ['openid', 'profile', 'email', 'offline_access'],
      // Some clients send the origin as the resource, others the MCP URL.
      resources: [mcpResource, baseURL],
      clientRegistrationDefaultResources: [mcpResource, baseURL],
    }),
  ],
};

export const auth = betterAuth(options);

export type AuthUser = typeof auth.$Infer.Session.user;
export type AuthSession = typeof auth.$Infer.Session.session;

export type AuthVariables = {
  user: AuthUser | null;
  session: AuthSession | null;
};

export async function runAuthMigrations() {
  const { runMigrations } = await getMigrations(options);
  await runMigrations();
}

/** Loads the session (if any) into c.get('user') / c.get('session'). */
export const sessionMiddleware = createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
  const result = await auth.api.getSession({ headers: c.req.raw.headers });
  c.set('user', result?.user ?? null);
  c.set('session', result?.session ?? null);
  await next();
});

/** Returns 401 unless the request has a valid session. Loads it if needed. */
export const requireAuth = createMiddleware<{ Variables: AuthVariables }>(async (c, next) => {
  if (c.get('user') === undefined) {
    const result = await auth.api.getSession({ headers: c.req.raw.headers });
    c.set('user', result?.user ?? null);
    c.set('session', result?.session ?? null);
  }
  if (!c.get('user')) return c.json({ error: 'Unauthorized' }, 401);
  await next();
});
