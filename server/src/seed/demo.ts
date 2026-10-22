// Seeds the demo user and the Rivage Numérique company profile (issue #12).
// Usage: npm run seed:demo   (idempotent; safe to rerun)
import { auth, runAuthMigrations } from '../auth';
import { pool, runMigrations } from '../db';
import { seedCompany } from './rivage';

export const DEMO_USER = {
  name: 'Camille Martin (Rivage Numérique)',
  email: process.env.DEMO_EMAIL ?? 'demo@rivage-numerique.fr',
  password: process.env.DEMO_PASSWORD ?? 'rivage-demo-2026',
};

/** Creates the demo user (if missing) and upserts the Rivage company. Assumes migrations ran. */
export async function seedDemo() {

  const existing = await pool.query<{ id: string }>('select id from "user" where email = $1', [DEMO_USER.email]);
  let userId = existing.rows[0]?.id;
  if (userId) {
    console.log(`demo user exists: ${DEMO_USER.email} (${userId})`);
  } else {
    const res = await auth.api.signUpEmail({ body: DEMO_USER });
    userId = res.user.id;
    console.log(`created demo user: ${DEMO_USER.email} (${userId})`);
  }

  const company = await seedCompany(userId);
  console.log(`seeded company: ${company.name} -> user ${userId}`);
  console.log(`log in with ${DEMO_USER.email} / ${DEMO_USER.password}`);
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
