import { betterAuth } from 'better-auth';
import { getMigrations } from 'better-auth/db/migration';
import { createMiddleware } from 'hono/factory';
import { pool } from './db';

// BetterAuth stores its own tables (user, session, account, verification) in
// the same Postgres database via its built-in Kysely adapter. They are managed
// by BetterAuth's migrator, not Drizzle.
const options = {
  database: pool,
  secret: process.env.BETTER_AUTH_SECRET ?? 'dev-secret-change-me-dev-secret-change-me',
  baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:3000',
  trustedOrigins: [
    'http://localhost:5173',
    'http://localhost:3000',
    ...(process.env.BETTER_AUTH_TRUSTED_ORIGINS?.split(',').filter(Boolean) ?? []),
  ],
  emailAndPassword: { enabled: true, autoSignIn: true },
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
