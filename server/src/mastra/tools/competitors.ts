import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { competitorProfile, competitorsForTender, competitorsForUser } from '../../lib/competitors';
import { getUserId } from '../context';
import { getCompany } from './company';

export const findCompetitors = createTool({
  id: 'findCompetitors',
  description:
    'Find likely competitors from real TED award notices. With tenderId: past winners with the same buyer (incumbents) and/or ' +
    'overlapping CPV codes and similar wording, plus the buyer\'s award history. Without tenderId: top competitors across the ' +
    "user's CPV codes and keywords. Each competitor has wins (deduped), distinctBuyers, sameBuyerWins, incumbent, frameworkWins, " +
    'totalValue (known values only), lastWin and example contracts with TED URLs. Use this for any "who are we up against?" question ' +
    'and for competitor briefs; cite the example TED URLs.',
  inputSchema: z.object({
    tenderId: z.string().optional().describe('Tender uuid or TED publication number'),
    limit: z.number().int().min(1).max(25).default(8),
  }),
  execute: async ({ tenderId, limit }, { requestContext }) => {
    if (tenderId) return (await competitorsForTender(tenderId, limit)) ?? { error: 'tender not found' };
    return (await competitorsForUser(getUserId(requestContext), limit)) ?? { error: 'No company profile yet.' };
  },
});

export const getCompetitorProfile = createTool({
  id: 'getCompetitorProfile',
  description:
    "One competitor's track record from TED: award history (all name variants), top buyers and CPV codes, framework share, " +
    'known contract value, plus web research summary and notes if researched (see researchCompetitors).',
  inputSchema: z.object({ organisationId: z.string().uuid() }),
  execute: async ({ organisationId }, { requestContext }) => {
    const company = await getCompany(getUserId(requestContext));
    return (await competitorProfile(organisationId, company?.id)) ?? { error: 'organisation not found' };
  },
});

export const competitorTools = { findCompetitors, getCompetitorProfile };
