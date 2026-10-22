// Partner finder routes. `partnersRoutes` is mounted at /api behind auth and
// scoped to the user's company; `publicPartnerRoutes` is mounted at /api/public
// (no session) and only accepts an invite token.
import { Hono } from 'hono';
import { z } from 'zod';
import type { AuthVariables } from '../auth';
import { redis } from '../events';
import { enqueueAutopilot } from '../jobs/queues';
import { claimFromInvite, createInvite, deleteInvite, listInvites, markSent, publicInvite, respond, ResponseInput, ROLES } from '../lib/invites';
import { partnerBacktest } from '../lib/partner-backtest';
import { partnersForTender } from '../lib/partners';
import { getCompany } from '../mastra/tools/company';

export const partnersRoutes = new Hono<{ Variables: AuthVariables }>();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// GET /api/tenders/:id/partners  ranked co-bidding partners for one tender
partnersRoutes.get('/tenders/:id/partners', async (c) => {
  const company = await getCompany(c.get('user')!.id);
  if (!company) return c.json({ error: 'no company profile' }, 404);
  const limit = Math.min(Math.max(Number(c.req.query('limit')) || 8, 1), 20);
  const res = await partnersForTender(company, c.req.param('id'), limit);
  return res ? c.json(res) : c.json({ error: 'not found' }, 404);
});

// GET /api/partners/backtest  partner finder replayed on real joint bids (shared, market-wide)
partnersRoutes.get('/partners/backtest', async (c) => c.json((await partnerBacktest()) ?? { status: 'not run' }));

// POST /api/partners/backtest  re-run it in the background
partnersRoutes.post('/partners/backtest', async (c) => {
  const jobId = await enqueueAutopilot({ kind: 'partner-backtest' });
  return c.json({ jobId }, 202);
});

// GET /api/partners/invites?tenderId=
partnersRoutes.get('/partners/invites', async (c) => {
  const company = await getCompany(c.get('user')!.id);
  if (!company) return c.json({ invites: [] });
  const tenderId = c.req.query('tenderId');
  if (tenderId && !UUID_RE.test(tenderId)) return c.json({ error: 'invalid tenderId' }, 400);
  return c.json({ invites: await listInvites(company.id, { tenderId: tenderId || undefined }) });
});

const CreateInvite = z.object({
  tenderId: z.string().regex(UUID_RE),
  organisationId: z.string().regex(UUID_RE).optional().nullable(),
  partnerName: z.string().trim().max(200).optional().nullable(),
  contactEmail: z.string().trim().max(200).email().optional().nullable().or(z.literal('')),
  role: z.enum(ROLES),
  need: z.string().trim().min(3).max(500),
  fitScore: z.number().min(0).max(100).optional().nullable(),
});

// POST /api/partners/invites  draft an invite (the user sends it themselves)
partnersRoutes.post('/partners/invites', async (c) => {
  const company = await getCompany(c.get('user')!.id);
  if (!company) return c.json({ error: 'no company profile' }, 404);
  const parsed = CreateInvite.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'invalid input', issues: parsed.error.issues.map((i) => i.message) }, 400);
  const res = await createInvite(company, { ...parsed.data, contactEmail: parsed.data.contactEmail || null });
  if ('error' in res) return c.json({ error: res.error }, 400);
  return c.json(res, 201);
});

// POST /api/partners/invites/:id/sent  {contactEmail?}
partnersRoutes.post('/partners/invites/:id/sent', async (c) => {
  const company = await getCompany(c.get('user')!.id);
  const id = c.req.param('id');
  if (!company || !UUID_RE.test(id)) return c.json({ error: 'not found' }, 404);
  const body = await c.req.json<{ contactEmail?: string }>().catch(() => ({}) as { contactEmail?: string });
  const email = z.string().trim().max(200).email().safeParse(body.contactEmail);
  const ok = await markSent(company.id, id, email.success ? email.data : null);
  return ok ? c.json({ ok: true }) : c.json({ error: 'not found' }, 404);
});

// DELETE /api/partners/invites/:id  (only before a response)
partnersRoutes.delete('/partners/invites/:id', async (c) => {
  const company = await getCompany(c.get('user')!.id);
  const id = c.req.param('id');
  if (!company || !UUID_RE.test(id)) return c.json({ error: 'not found' }, 404);
  return (await deleteInvite(company.id, id)) ? c.json({ ok: true }) : c.json({ error: 'not found or already answered' }, 404);
});

// POST /api/partners/claim {token}  signed-in partner joins Radar from their response
partnersRoutes.post('/partners/claim', async (c) => {
  const body = await c.req.json<{ token?: string }>().catch(() => ({}) as { token?: string });
  if (typeof body.token !== 'string') return c.json({ error: 'token required' }, 400);
  const res = await claimFromInvite(c.get('user')!.id, body.token);
  if (res.status !== 200) return c.json({ error: res.error }, res.status);
  return c.json({ companyId: res.companyId, created: res.created });
});

// ---------- public (token-scoped, no session) ----------

export const publicPartnerRoutes = new Hono();

const RATE = { windowSec: 60, max: 30 };

/** Per-IP fixed-window limit in Redis (last X-Forwarded-For hop = the address our proxy saw); fails open if Redis is down. */
publicPartnerRoutes.use('*', async (c, next) => {
  const ip = c.req.header('x-forwarded-for')?.split(',').pop()?.trim() || c.req.header('x-real-ip') || 'unknown';
  const key = `rl:public:${ip}`;
  const n = await redis
    .multi()
    .incr(key)
    .expire(key, RATE.windowSec, 'NX')
    .exec()
    .then((r) => Number(r?.[0]?.[1] ?? 0))
    .catch(() => 0);
  if (n > RATE.max) return c.json({ error: 'Too many requests' }, 429);
  c.header('Cache-Control', 'no-store');
  c.header('X-Robots-Tag', 'noindex');
  await next();
});

// GET /api/public/invites/:token
publicPartnerRoutes.get('/invites/:token', async (c) => {
  const res = await publicInvite(c.req.param('token'));
  if (res.status !== 200) return c.json({ error: 'Invite not found' }, 404);
  return c.json(res.invite);
});

// POST /api/public/invites/:token/response
publicPartnerRoutes.post('/invites/:token/response', async (c) => {
  const len = Number(c.req.header('content-length') ?? 0);
  if (len > 32_000) return c.json({ error: 'Response too large' }, 413);
  const text = await c.req.text();
  if (text.length > 32_000) return c.json({ error: 'Response too large' }, 413);
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400);
  }
  const parsed = ResponseInput.safeParse(json);
  if (!parsed.success) {
    return c.json({ error: 'Please check the form', issues: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) }, 400);
  }
  const res = await respond(c.req.param('token'), parsed.data);
  if (res.status !== 200) return c.json({ error: res.error }, res.status);
  return c.json({ ok: true });
});
