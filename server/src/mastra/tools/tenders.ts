import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { pool } from '../../db';
import { refreshMatches, searchTenders as runSearch } from '../../lib/matching';
import { isoDate } from '../../lib/text';
import { getUserId } from '../context';

export const searchTenders = createTool({
  id: 'searchTenders',
  description:
    'Search imported TED notices (French public tenders). `query` is French full-text (websearch syntax: words, "phrases", or, -exclude), ' +
    'e.g. `"site internet" or accessibilité`. Filter by CPV prefix(es) (e.g. "72413" or ["722","724"]), buyer name (substring), ' +
    'and openOnly (cn-standard with deadline in the future). Set noticeType "can-standard" to search past award notices (with winners).',
  inputSchema: z.object({
    query: z.string().optional(),
    cpv: z.union([z.string(), z.array(z.string())]).optional(),
    buyer: z.string().optional(),
    openOnly: z.boolean().optional(),
    noticeType: z.enum(['cn-standard', 'can-standard']).optional(),
    limit: z.number().int().min(1).max(50).default(10),
  }),
  execute: async (input) => ({ tenders: await runSearch(input) }),
});

export const matchTenders = createTool({
  id: 'matchTenders',
  description:
    "Rank open TED tenders for the user's company (CPV overlap, French keyword match of the profile, buyer history, region), " +
    'save them as the company shortlist, and return each with a score (0-100) and a short rationale. Use for "what should we bid on?". ' +
    'Status "recent" means the notice was published recently but the deadline passed or is not stated: say so.',
  inputSchema: z.object({ limit: z.number().int().min(1).max(30).default(10) }),
  execute: async ({ limit }, { requestContext }) => {
    const res = await refreshMatches(getUserId(requestContext), { limit: Math.max(limit, 25) });
    if (!res) return { error: 'No company profile yet: run the onboarding interview first.' };
    return {
      notes: res.notes,
      matches: res.matches.slice(0, limit).map(({ signals, ...m }) => ({
        ...m,
        matchedKeywords: signals.keywords,
        buyerSimilarAwards: signals.buyerSimilarAwards,
      })),
    };
  },
});

export const getTender = createTool({
  id: 'getTender',
  description:
    'Full details of one TED notice (by id or publication number): French title and description, buyer, CPV codes, value, deadline, ' +
    'TED URL, and winners if it is an award notice. Use it to summarise a tender and quote its French text.',
  inputSchema: z.object({ tenderId: z.string() }),
  execute: async ({ tenderId }) => {
    const uuid = /^[0-9a-f-]{36}$/i.test(tenderId);
    const { rows } = await pool.query(
      `SELECT t.id, t.publication_number AS "publicationNumber", t.notice_type AS "noticeType", t.title,
         left(t.description, 4000) AS description, t.buyer_name AS "buyerName", t.cpv_codes AS "cpvCodes",
         t.estimated_value::float8 AS "estimatedValue", t.currency, t.deadline, t.publication_date AS "publicationDate", t.url,
         t.raw->'title-lot' AS "lotTitles",
         (SELECT coalesce(json_agg(json_build_object('name', a.winner_name, 'value', a.value::float8, 'organisationId', a.organisation_id)), '[]')
            FROM awards a WHERE a.tender_id = t.id) AS winners
       FROM tenders t WHERE ${uuid ? 't.id = $1' : 't.publication_number = $1'}`,
      [tenderId],
    );
    const t = rows[0];
    if (!t) return { error: 'tender not found' };
    return { ...t, deadline: isoDate(t.deadline), publicationDate: isoDate(t.publicationDate) };
  },
});

export const tenderTools = { searchTenders, matchTenders, getTender };
