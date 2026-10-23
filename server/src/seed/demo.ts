// Seeds the demo user and the Rivage Numérique company profile (issue #12).
// Usage: npm run seed:demo   (idempotent; safe to rerun)
import { hashPassword, verifyPassword } from 'better-auth/crypto';
import { auth, runAuthMigrations } from '../auth';
import { pool, runMigrations } from '../db';
import { seedCompany } from './rivage';

export const DEMO_USER = {
  name: 'Camille Martin (Rivage Numérique)',
  email: process.env.DEMO_EMAIL ?? 'demo@rivage-numerique.fr',
};

/** Seeds the Rivage user/profile and synchronizes its password. Assumes migrations ran. */
export async function seedDemo() {
  const password = process.env.DEMO_PASSWORD;
  if (!password || password.length < 8 || password.length > 128) {
    throw new Error('Set DEMO_PASSWORD to a private password of 8–128 characters before seeding');
  }

  const existing = await pool.query<{ id: string }>('select id from "user" where email = $1', [DEMO_USER.email]);
  let userId = existing.rows[0]?.id;
  if (userId) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const account = await client.query<{ id: string; password: string | null }>(
        'select id, password from account where "userId" = $1 and "providerId" = $2 for update',
        [userId, 'credential'],
      );
      if (account.rows.length !== 1) throw new Error('Demo user must have exactly one credential account');
      const credential = account.rows[0];
      if (!credential.password || !await verifyPassword({ hash: credential.password, password })) {
        await client.query('update account set password = $1, "updatedAt" = now() where id = $2',
          [await hashPassword(password), credential.id]);
        await client.query('delete from session where "userId" = $1', [userId]);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
    console.log(`demo user exists: ${DEMO_USER.email} (${userId})`);
  } else {
    const res = await auth.api.signUpEmail({ body: { ...DEMO_USER, password } });
    userId = res.user.id;
    console.log(`created demo user: ${DEMO_USER.email} (${userId})`);
  }

  const company = await seedCompany(userId);
  console.log(`seeded company: ${company.name} -> user ${userId}`);
}

// CLI entry: npm run seed:demo
if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    await runMigrations();
    await runAuthMigrations();
    await seedDemo();
  } finally {
    await pool.end();
  }
}
