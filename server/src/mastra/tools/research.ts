import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import { enqueueResearch } from '../../jobs/queues';
import { getResearchNotes as loadResearchNotes } from '../../lib/research';

export const researchCompetitors = createTool({
  id: 'researchCompetitors',
  description:
    'Queue background web research (Keenable search + summary) on competitor organisations, e.g. the top 5 ' +
    'past winners for a tender. Returns immediately with a jobId; results land in research notes after ' +
    'a minute or so. Organisations researched in the last 7 days are skipped unless force is true.',
  inputSchema: z.object({
    organisationIds: z.array(z.string().uuid()).min(1).max(10),
    force: z.boolean().optional(),
  }),
  execute: async ({ organisationIds, force }) => {
    const jobId = await enqueueResearch(organisationIds, { force });
    return { jobId, queued: organisationIds.length, note: 'Research runs in the background; call getResearchNotes later.' };
  },
});

export const getResearchNotes = createTool({
  id: 'getResearchNotes',
  description:
    'Read the web research for a competitor organisation: summary, website, last researched date, and source notes with URLs.',
  inputSchema: z.object({ organisationId: z.string().uuid() }),
  execute: async ({ organisationId }) => {
    const res = await loadResearchNotes(organisationId);
    return res ?? { error: 'organisation not found' };
  },
});

export const researchTools = { researchCompetitors, getResearchNotes };
