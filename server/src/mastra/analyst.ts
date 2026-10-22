import { Agent } from '@mastra/core/agent';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { getCompany, MATCH_SELECT, pool } from '../store';
import { MODEL } from '../model';
import { companyContext, learnRules } from '../radar';
import { searchAwards, searchTenders } from '../ted';
import { memory } from './agent';

// Radar agents: the bid analyst that writes tender briefs (tools bound to one
// company) and the profile drafter used by onboarding. The chat copilot lives
// in ./agent.ts.

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : null;
};

/** Tools bound to one company, so the agent can't wander into another firm's data. */
function companyTools(companyId: string) {
  return {
    companyProfile: createTool({
      id: 'company-profile',
      description: "The firm's profile, past bids (won and lost), past go/no-go decisions and learned preferences.",
      inputSchema: z.object({}),
      execute: async () => {
        const c = await getCompany(companyId);
        return { profile: c ? await companyContext(c) : 'unknown company' };
      },
    }),
    pipeline: createTool({
      id: 'pipeline',
      description: 'Tenders already found and scored by the radar for this firm, best first.',
      inputSchema: z.object({ verdict: z.enum(['go', 'maybe', 'no', 'any']).default('any'), limit: z.number().default(10) }),
      execute: async ({ verdict, limit }) => {
        const { rows } = await pool.query(
          `select t.publication_number as id, t.title, t.buyer_name as buyer, t.buyer_country as country,
                  t.estimated_value::float as value, t.deadline, t.url, m.score, m.verdict, m.headline, m.decision
             from tender_matches m join tenders t on t.id = m.tender_id
            where m.company_id = $1 and ($2 = 'any' or m.verdict = $2)
            order by m.score desc limit $3`,
          [companyId, verdict, Math.min(limit, 30)],
        );
        return { tenders: rows };
      },
    }),
    tenderDetails: createTool({
      id: 'tender-details',
      description: 'Full stored details of one tender by its TED publication number, with the radar score and reasoning.',
      inputSchema: z.object({ tenderId: z.string() }),
      execute: async ({ tenderId }) => {
        const { rows } = await pool.query(
          `select ${MATCH_SELECT}, t.description
             from tenders t left join tender_matches m on m.tender_id = t.id and m.company_id = $2
            where t.publication_number = $1`,
          [tenderId, companyId],
        );
        return rows[0] ?? { error: 'not found' };
      },
    }),
    searchTenders: createTool({
      id: 'search-tenders',
      description: 'Live search of open EU public tenders on TED. Use CPV codes (8 digits) and/or free text, ISO-3 countries.',
      inputSchema: z.object({
        text: z.string().optional(),
        cpv: z.array(z.string()).optional(),
        countries: z.array(z.string()).optional(),
        sinceDays: z.number().default(30),
      }),
      execute: async (q) => {
        const tenders = await searchTenders(q, 20);
        return {
          count: tenders.length,
          tenders: tenders.map(({ raw, description, ...t }) => ({ ...t, description: description.slice(0, 300) })),
        };
      },
    }),
    awardHistory: createTool({
      id: 'award-history',
      description:
        'Past contract awards from the TED archive: who won similar contracts, from which buyers, at what price. Use for competitor and pricing intelligence.',
      inputSchema: z.object({
        cpv: z.array(z.string()).optional(),
        buyer: z.string().optional().describe('Buyer name to look up its past awards'),
        countries: z.array(z.string()).optional(),
        years: z.number().default(3),
      }),
      execute: async (q) => {
        const awards = await searchAwards(q);
        const winners = new Map<string, number>();
        for (const a of awards) for (const w of a.winners) winners.set(w, (winners.get(w) ?? 0) + 1);
        const values = awards.map((a) => a.value).filter((v): v is number => v != null);
        return {
          awards: awards.length,
          topWinners: [...winners.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, wins]) => ({ name, wins })),
          medianValue: median(values),
          examples: awards.slice(0, 12),
        };
      },
    }),
    recordDecision: createTool({
      id: 'record-decision',
      description: "Record the team's go / no-go decision on a tender, with their reason. The radar learns from these.",
      inputSchema: z.object({ tenderId: z.string(), decision: z.enum(['go', 'no-go']), reason: z.string() }),
      execute: async ({ tenderId, decision, reason }) => {
        await pool.query(
          `update tender_matches m set decision = $3, decision_reason = $4, decided_at = now()
             from tenders t where t.id = m.tender_id and m.company_id = $1 and t.publication_number = $2`,
          [companyId, tenderId, decision, reason],
        );
        void learnRules(companyId).catch((e) => console.error('learnRules', e));
        return { ok: true };
      },
    }),
  };
}

export const ANALYST_INSTRUCTIONS = `You are the bid analyst of a small firm that sells to European public buyers.
You watch EU tenders (TED) for them, judge fit, size up competitors from past award data, and draft bid material.
Rules:
- Always ground claims in tool results: the firm's profile and past bids, the tender itself, and award history. Never invent buyers, winners, prices or past projects.
- Use the tools proactively. For any question about competitors or pricing, call award-history.
- Be concise and decisive, like a good bid manager. Use short markdown sections and bullet points. Prices in EUR.
- Link tenders as [publication number](url) when you have the url.`;

export function makeAnalyst(companyId: string) {
  return new Agent({
    id: `analyst-${companyId}`,
    name: 'Bid analyst',
    instructions: ANALYST_INSTRUCTIONS,
    model: MODEL,
    memory,
    tools: companyTools(companyId),
  });
}

const ProfileSchema = z.object({
  name: z.string(),
  pitch: z.string().describe('Two or three sentences: what the firm does, for whom, size, strengths'),
  cpv: z.array(z.string().regex(/^\d{8}$/)).describe('4-8 CPV codes (8 digits) covering what they sell, broad family codes preferred'),
  cpvLabels: z.array(z.string()).describe('Human label for each CPV code, same order'),
  countries: z.array(z.string().length(3)).describe('ISO-3 country codes where they can deliver'),
  keywords: z.array(z.string()).describe('4-8 short search keywords in the languages of those countries'),
  minValue: z.number().describe('Smallest contract worth bidding on, EUR'),
  maxValue: z.number().describe('Largest contract they can realistically deliver, EUR'),
});

const profiler = new Agent({
  id: 'profiler',
  name: 'Profile builder',
  instructions:
    'You turn a short description of a company into a public-procurement search profile. Use real CPV 2008 codes. Infer sensible defaults when unsure.',
  model: MODEL,
});

/** Onboarding: one paragraph about the firm in, a full radar profile out. */
export async function draftProfile(description: string) {
  const r = await profiler.generate(description, { structuredOutput: { schema: ProfileSchema } });
  return r.object as z.infer<typeof ProfileSchema>;
}
