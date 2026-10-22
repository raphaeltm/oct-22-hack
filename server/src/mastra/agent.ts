import { Agent } from '@mastra/core/agent';
import { createTool } from '@mastra/core/tools';
import { Memory } from '@mastra/memory';
import { PostgresStore } from '@mastra/pg';
import { z } from 'zod';
import { DATABASE_URL, getCompany, pool } from '../db';
import { MODEL } from '../model';
import { companyContext, learnRules } from '../radar';
import { searchAwards, searchTenders } from '../ted';

export const storage = new PostgresStore({
  id: 'app-store',
  connectionString: DATABASE_URL,
});

export const memory = new Memory({
  storage,
  options: { lastMessages: 20 },
});

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? s[Math.floor(s.length / 2)] : null;
};

/** Tools bound to one company, so the agent can't wander into another firm's data. */
function companyTools(companyId: number) {
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
          `select t.id, t.title, t.buyer, t.country, t.value, t.deadline, m.score, m.verdict, m.headline, m.decision
             from matches m join tenders t on t.id = m.tender_id
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
          `select t.id, t.title, t.buyer, t.country, t.cpv, t.nature, t.value, t.currency, t.published, t.deadline, t.description, t.url,
                  m.score, m.verdict, m.headline, m.reasons, m.risks, m.effort
             from tenders t left join matches m on m.tender_id = t.id and m.company_id = $2
            where t.id = $1`,
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
          'update matches set decision = $3, decision_reason = $4, decided_at = now() where company_id = $1 and tender_id = $2',
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

export function makeAnalyst(companyId: number) {
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
  instructions: `You turn a short description of a company into a public-procurement search profile for TED.
- Name: use the company name if given; otherwise a short plain description such as "Lyon accessibility studio". Never invent a brand name.
- CPV: use real CPV 2008 codes only, preferring these when they fit (code: meaning):
  72000000 IT services · 72200000 software programming and consultancy · 72212000 application software development · 72413000 website design · 72400000 internet services · 72300000 data services · 72322000 data management · 72500000 computer-related services · 72510000 IT management/hosting operations · 72267000 software maintenance · 72224000 IT project management consultancy · 72600000 computer support and consultancy · 48000000 software packages · 79411000 general management consultancy · 79400000 business and management consultancy · 79340000 advertising and marketing · 80500000 training · 71000000 architecture and engineering · 71300000 engineering services · 90700000 environmental services · 73000000 R&D.
- Countries: only where the description says they work (ISO-3). Keywords: short phrases in those countries' languages.
- Infer sensible contract-size defaults from the company size when not stated.`,
  model: MODEL,
});

/** Onboarding: one paragraph about the firm in, a full radar profile out. */
export async function draftProfile(description: string) {
  const r = await profiler.generate(description, { structuredOutput: { schema: ProfileSchema } });
  return r.object as z.infer<typeof ProfileSchema>;
}
