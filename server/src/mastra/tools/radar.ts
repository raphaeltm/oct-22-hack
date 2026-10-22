import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { pool } from '../../store';
import { searchAwards } from '../../ted';
import { getUserId } from '../context';

// Radar tools for the chat copilot: the TED watcher's scored shortlist for the
// user's company, and live award history from the TED archive.

async function companyIdFor(userId: string): Promise<string | null> {
  const { rows } = await pool.query('select id from companies where user_id = $1', [userId]);
  return rows[0]?.id ?? null;
}

export const getRadarShortlist = createTool({
  id: 'getRadarShortlist',
  description:
    "The radar's shortlist: open TED tenders already found and scored against the user's company profile, best first, " +
    'with verdict (go = bid, maybe = read closely, no = skip), the one-line reason, value and deadline, and the team\'s own go/no-go decisions. ' +
    'Use this first for "what should we bid on?".',
  inputSchema: z.object({
    verdict: z.enum(['go', 'maybe', 'no', 'any']).default('any'),
    limit: z.number().int().min(1).max(30).default(10),
  }),
  execute: async ({ verdict, limit }, ctx) => {
    const companyId = await companyIdFor(getUserId(ctx?.requestContext));
    if (!companyId) return { error: 'No company profile yet' };
    const { rows } = await pool.query(
      `select t.publication_number as id, t.title, t.buyer_name as buyer, t.estimated_value::float as value, t.deadline, t.url,
              m.score, m.verdict, m.headline, m.reasons, m.risks, m.decision, m.decision_reason
         from tender_matches m join tenders t on t.id = m.tender_id
        where m.company_id = $1 and m.scored_by <> 'quick' and ($2 = 'any' or m.verdict = $2)
          and (t.deadline is null or t.deadline > now())
        order by m.score desc limit $3`,
      [companyId, verdict, limit],
    );
    return { tenders: rows };
  },
});

export const getAwardHistory = createTool({
  id: 'getAwardHistory',
  description:
    'Live lookup of past contract award notices on TED: who won similar contracts (by CPV codes and country) or contracts from a given buyer, ' +
    'and at what value. Use for "who are we up against?" and pricing.',
  inputSchema: z.object({
    cpv: z.array(z.string()).optional(),
    buyer: z.string().optional(),
    countries: z.array(z.string()).optional().describe('ISO-3 codes, e.g. FRA'),
    years: z.number().default(3),
  }),
  execute: async (q) => {
    const awards = await searchAwards(q);
    const winners = new Map<string, number>();
    for (const a of awards) for (const w of a.winners) winners.set(w, (winners.get(w) ?? 0) + 1);
    return {
      awards: awards.length,
      topWinners: [...winners.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, wins]) => ({ name, wins })),
      examples: awards.slice(0, 12),
    };
  },
});

export const radarTools = { getRadarShortlist, getAwardHistory };
