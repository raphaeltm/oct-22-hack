import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { test } from 'node:test';

// Opt in with a dedicated disposable database: this runs app/auth migrations.
test('demo seed requires a secret, rotates credentials and preserves other users', {
  skip: !process.env.DEMO_SEED_TEST_DATABASE_URL,
}, async () => {
  process.env.DATABASE_URL = process.env.DEMO_SEED_TEST_DATABASE_URL;
  process.env.DEMO_EMAIL = `demo-${randomBytes(8).toString('hex')}@example.test`;
  const { pool, runMigrations } = await import('../src/db');
  const { auth, runAuthMigrations } = await import('../src/auth');
  const { seedDemo, DEMO_USER } = await import('../src/seed/demo');
  const oldPassword = randomBytes(24).toString('base64url');
  const newPassword = randomBytes(24).toString('base64url');
  const otherEmail = `other-${randomBytes(8).toString('hex')}@example.test`;
  const logs: string[] = [];
  const originalLog = console.log;
  console.log = (...args) => { logs.push(args.join(' ')); };
  async function login(email: string, password: string) {
    return auth.handler(new Request('http://localhost:3000/api/auth/sign-in/email', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }));
  }
  async function session(response: Response) {
    const cookie = response.headers.get('set-cookie')?.split(';')[0] ?? '';
    return auth.api.getSession({ headers: new Headers({ cookie }) });
  }
  try {
    await runMigrations();
    await runAuthMigrations();
    for (const invalid of ['', 'short', 'x'.repeat(129)]) {
      process.env.DEMO_PASSWORD = invalid;
      await assert.rejects(seedDemo(), /Set DEMO_PASSWORD/);
    }
    delete process.env.DEMO_PASSWORD;
    await assert.rejects(seedDemo(), /Set DEMO_PASSWORD/);
    process.env.DEMO_PASSWORD = oldPassword;
    await seedDemo();
    const first = await login(DEMO_USER.email, oldPassword);
    assert.equal(first.status, 200);
    const firstSession = await session(first);
    assert.ok(firstSession);
    await auth.api.signUpEmail({ body: { email: otherEmail, password: oldPassword, name: 'Other test user' } });
    const other = await login(otherEmail, oldPassword);
    assert.ok(await session(other));
    assert.equal(await auth.api.getSession({ headers: new Headers() }), null);
    await seedDemo();
    assert.ok(await session(first), 'unchanged password preserves sessions');
    process.env.DEMO_PASSWORD = newPassword;
    await seedDemo();
    assert.equal((await login(DEMO_USER.email, oldPassword)).status, 401);
    assert.equal((await login(DEMO_USER.email, newPassword)).status, 200);
    assert.equal(await session(first), null, 'rotation revokes old sessions');
    assert.ok(await session(other), 'rotation preserves another user session');
    assert.equal((await login(otherEmail, oldPassword)).status, 200);
    assert.equal((await pool.query('select count(*) from companies where user_id = $1', [firstSession.user.id])).rows[0].count, '1');
    assert.ok(logs.every(line => !line.includes(oldPassword) && !line.includes(newPassword)), 'no plaintext passwords in seed logs');
  } finally {
    console.log = originalLog;
    await pool.query('delete from "user" where email = ANY($1)', [[DEMO_USER.email, otherEmail]]);
    await pool.end();
  }
});
