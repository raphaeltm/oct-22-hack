import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { pool } from '../../db';
import { queueDossier } from '../../lib/autopilot';
import { buildDossier, getDossier, listDossiers } from '../../lib/dossier';
import { DECISIONS, learnedSummary, recordFeedback, scorecard, SKIP_REASONS } from '../../lib/learning';
import { refreshMatches } from '../../lib/matching';
import { getUserId } from '../context';
import { getCompany } from './company';

async function tenderUuid(idOrPub: string) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(idOrPub);
  const { rows } = await pool.query<{ id: string }>(
    `SELECT id FROM tenders WHERE ${uuid ? 'id = $1::uuid' : 'publication_number = $1'}`,
    [idOrPub],
  );
  return rows[0]?.id ?? null;
}

export const getPrebidDossier = createTool({
  id: 'getPrebidDossier',
  description:
    'Get the pre-bid dossier for a tender (by id or publication number): go/no-go verdict and reasons, calendar (question and submission deadlines), ' +
    'award criteria and weights, contract duration/framework, requirements found in the notice vs the profile, buyer history with bids received, ' +
    'possible incumbent, likely bidders, market price range, admin checklist and draft questions to the buyer (French). ' +
    'The autopilot builds these automatically for strong matches; if none exists this builds one now (takes ~10-40 s).',
  inputSchema: z.object({ tenderId: z.string() }),
  execute: async ({ tenderId }, { requestContext }) => {
    const company = await getCompany(getUserId(requestContext));
    if (!company) return { error: 'No company profile yet: run the onboarding interview first.' };
    const id = await tenderUuid(tenderId);
    if (!id) return { error: 'tender not found' };
    const existing = await getDossier(company.id, id);
    if (existing?.status === 'ready') return { status: 'ready', trigger: existing.trigger, builtAt: existing.updatedAt, dossier: existing.content };
    // Build inline so the chat can answer now; the row keeps it for the UI.
    await queueDossier(company.id, id, 'manual').catch(() => null);
    const dossier = await buildDossier(company, id);
    await pool.query(
      `UPDATE prebid_dossiers SET status = 'ready', content = $3, error = NULL, updated_at = now() WHERE company_id = $1 AND tender_id = $2`,
      [company.id, id, dossier],
    );
    return { status: 'ready', trigger: 'manual', dossier };
  },
});

export const getAutopilotInbox = createTool({
  id: 'getAutopilotInbox',
  description:
    'What the autopilot did on its own: dossiers it built for new matching tenders (verdict, possible incumbent, status), what it learned from ' +
    "the user's bid/skip decisions, and the prediction scorecard (how often its predicted bidders actually won, live and backtested vs a baseline).",
  inputSchema: z.object({}),
  execute: async (_input, { requestContext }) => {
    const company = await getCompany(getUserId(requestContext));
    if (!company) return { error: 'No company profile yet.' };
    const [dossiers, learned, card] = await Promise.all([listDossiers(company.id, 15), learnedSummary(company.id), scorecard(company.id)]);
    return { dossiers, learned, scorecard: card };
  },
});

export const recordTenderDecision = createTool({
  id: 'recordTenderDecision',
  description:
    'Record the user\'s decision on a tender: bid, skip, won or lost, with a reason for skips ' +
    '(scope, too_large, too_small, buyer, region, deadline, incumbent, other). The matcher learns from it immediately ' +
    '(skipped tenders are hidden; similar ones are down-ranked) and the shortlist is re-ranked. Only call when the user states a decision.',
  inputSchema: z.object({
    tenderId: z.string(),
    decision: z.enum(DECISIONS),
    reason: z.enum(SKIP_REASONS).optional(),
    note: z.string().max(500).optional(),
  }),
  execute: async ({ tenderId, decision, reason, note }, { requestContext }) => {
    const userId = getUserId(requestContext);
    const company = await getCompany(userId);
    if (!company) return { error: 'No company profile yet.' };
    const id = await tenderUuid(tenderId);
    if (!id) return { error: 'tender not found' };
    await recordFeedback(company.id, id, { decision, reason: reason ?? null, note: note ?? null });
    const res = await refreshMatches(userId, { limit: 25, polish: false });
    return {
      ok: true,
      learned: await learnedSummary(company.id),
      newTop: res?.matches.slice(0, 3).map((m) => ({ tenderId: m.tenderId, title: m.title, score: m.score })),
      autopilotQueued: res?.autopilot.length ?? 0,
    };
  },
});

export const autopilotTools = { getPrebidDossier, getAutopilotInbox, recordTenderDecision };
