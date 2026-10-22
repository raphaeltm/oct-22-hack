// Tender matches and competitor routes (issues #7, #8). Mounted at /api, behind auth.
import { Hono } from 'hono';
import type { AuthVariables } from '../auth';
import { competitorsForTender, competitorsForUser } from '../lib/competitors';
import { refreshMatches, savedMatches } from '../lib/matching';

export const matchesRoutes = new Hono<{ Variables: AuthVariables }>();

const lim = (raw: string | undefined, def: number, max: number) => Math.min(Math.max(Number(raw) || def, 1), max);

// GET /api/matches  saved shortlist for the user's company (computed on first call)
matchesRoutes.get('/matches', async (c) => {
  const userId = c.get('user')!.id;
  const limit = lim(c.req.query('limit'), 25, 50);
  let saved = await savedMatches(userId, limit);
  if (!saved) return c.json({ error: 'no company profile' }, 404);
  if (!saved.matches.length) {
    await refreshMatches(userId, { limit: 25 });
    saved = await savedMatches(userId, limit);
  }
  return c.json(saved);
});

// POST /api/matches/refresh  recompute and save; returns signals and notes too
matchesRoutes.post('/matches/refresh', async (c) => {
  const userId = c.get('user')!.id;
  const body = await c.req.json<{ limit?: number; polish?: boolean }>().catch(() => ({}) as { limit?: number; polish?: boolean });
  const res = await refreshMatches(userId, { limit: body.limit ? Math.min(Math.max(body.limit, 1), 50) : 25, polish: body.polish });
  if (!res) return c.json({ error: 'no company profile' }, 404);
  return c.json(res);
});

// GET /api/tenders/:id/competitors  likely bidders for one tender (id = uuid or publication number)
matchesRoutes.get('/tenders/:id/competitors', async (c) => {
  const res = await competitorsForTender(c.req.param('id'), lim(c.req.query('limit'), 10, 25));
  if (!res) return c.json({ error: 'not found' }, 404);
  return c.json(res);
});

// GET /api/competitors/relevant (alias: GET /api/competitors?forCompany=1)
async function relevant(userId: string, limitRaw?: string) {
  return competitorsForUser(userId, lim(limitRaw, 15, 50));
}
matchesRoutes.get('/competitors/relevant', async (c) => {
  const res = await relevant(c.get('user')!.id, c.req.query('limit'));
  return res ? c.json(res) : c.json({ error: 'no company profile' }, 404);
});
matchesRoutes.get('/competitors', async (c, next) => {
  const f = c.req.query('forCompany');
  if (f !== '1' && f !== 'true') return next();
  const res = await relevant(c.get('user')!.id, c.req.query('limit'));
  return res ? c.json(res) : c.json({ error: 'no company profile' }, 404);
});
