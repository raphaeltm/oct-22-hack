import { Agent } from '@mastra/core/agent';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db';
import { organisations, researchNotes } from '../db/schema';
import { search, type KeenableResult } from './keenable';

const RESEARCH_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const RESULTS_PER_QUERY = 4;
const NOTE_MAX_CHARS = 1200;

export interface ResearchResult {
  organisationId: string;
  name?: string;
  status: 'researched' | 'skipped' | 'not_found';
  notes: number;
  summarised: boolean;
  reason?: string;
}

type Topic = 'website' | 'services' | 'size' | 'news' | 'public-sector';

function queriesFor(name: string): { topic: Topic; query: string; published_after?: string }[] {
  const q = `"${name}"`;
  return [
    { topic: 'website', query: `${q} site officiel entreprise` },
    { topic: 'services', query: `${q} company services offering clients` },
    { topic: 'size', query: `${q} effectif chiffre d'affaires salariés` },
    { topic: 'news', query: `${q} news`, published_after: '1y' },
    { topic: 'public-sector', query: `${q} marchés publics attributaire collectivités` },
  ];
}

let summariser: Agent | null = null;
function getSummariser() {
  summariser ??= new Agent({
    id: 'competitor-researcher',
    name: 'Competitor researcher',
    instructions:
      'You summarise web search results about a company competing for French/EU public tenders. ' +
      'Be factual, cite only what the sources say, and answer in English.',
    model: process.env.MODEL ?? 'anthropic/claude-sonnet-5',
  });
  return summariser;
}

async function summarise(name: string, hits: { topic: Topic; r: KeenableResult }[]) {
  const sources = hits
    .map((h, i) => `[${i + 1}] (${h.topic}) ${h.r.title}\n${h.r.url}\n${(h.r.snippet || h.r.description).slice(0, 800)}`)
    .join('\n\n');
  const prompt =
    `Company: ${name}\n\nSearch results:\n\n${sources}\n\n` +
    'Return ONLY a JSON object: {"website": string|null, "summary": string}. ' +
    '"website" is the official homepage URL if clearly identified. "summary" is 5-8 sentences covering: ' +
    'what they do, size (staff/revenue) if known, notable recent news, and French public-sector work ' +
    '(buyers, contracts). Cite sources inline as [n]. Say "unknown" rather than guessing.';
  const res = await getSummariser().generate(prompt);
  const match = res.text.match(/\{[\s\S]*\}/);
  if (!match) return { summary: res.text.trim(), website: null as string | null };
  try {
    const parsed = JSON.parse(match[0]) as { summary?: string; website?: string | null };
    return { summary: parsed.summary?.trim() || res.text.trim(), website: parsed.website || null };
  } catch {
    return { summary: res.text.trim(), website: null as string | null };
  }
}

const AGGREGATOR_HOSTS = /linkedin|wikipedia|societe\.com|pappers|infogreffe|verif\.com|facebook|twitter|x\.com|youtube|europa\.eu|boamp|marchespublics|indeed|glassdoor/i;

/** Without a model, guess the website from the "site officiel" results. */
function guessWebsite(name: string, hits: { topic: Topic; r: KeenableResult }[]) {
  const tokens = name.toLowerCase().normalize('NFD').replace(/[^a-z0-9 ]/g, '').split(' ').filter((t) => t.length > 2);
  for (const { topic, r } of hits) {
    if (topic !== 'website') continue;
    try {
      const u = new URL(r.url);
      if (AGGREGATOR_HOSTS.test(u.hostname)) continue;
      if (tokens.some((t) => u.hostname.includes(t))) return `${u.protocol}//${u.hostname}`;
    } catch {}
  }
  return null;
}

/**
 * Web research on a competitor: Keenable searches (FR + EN), a Claude summary
 * into organisations.summary/website, and one research_notes row per source.
 * Skips organisations researched in the last 7 days unless `force`.
 * Without ANTHROPIC_API_KEY, stores the raw snippets as notes with no summary.
 */
export async function researchOrganisation(
  organisationId: string,
  opts: { force?: boolean; onProgress?: (message: string) => void | Promise<void> } = {},
): Promise<ResearchResult> {
  const [org] = await db.select().from(organisations).where(eq(organisations.id, organisationId));
  if (!org) return { organisationId, status: 'not_found', notes: 0, summarised: false };

  if (!opts.force && org.lastResearchedAt && Date.now() - org.lastResearchedAt.getTime() < RESEARCH_TTL_MS) {
    return { organisationId, name: org.name, status: 'skipped', notes: 0, summarised: false, reason: 'researched < 7 days ago' };
  }

  await opts.onProgress?.(`Searching the web for ${org.name}`);
  const seen = new Set<string>();
  const hits: { topic: Topic; r: KeenableResult }[] = [];
  const batches = await Promise.all(
    queriesFor(org.name).map(async ({ topic, query, published_after }) => ({
      topic,
      results: await search({ query, published_after, max_results: RESULTS_PER_QUERY, mode: 'pro' }),
    })),
  );
  for (const { topic, results } of batches) {
    for (const r of results) {
      if (!r.url || seen.has(r.url)) continue;
      seen.add(r.url);
      hits.push({ topic, r });
    }
  }

  let summary: string | null = null;
  let website: string | null = null;
  let summarised = false;
  if (hits.length && process.env.ANTHROPIC_API_KEY) {
    await opts.onProgress?.(`Summarising ${hits.length} sources for ${org.name}`);
    try {
      ({ summary, website } = await summarise(org.name, hits));
      summarised = true;
    } catch (err) {
      console.error(`[research] summary failed for ${org.name}`, err);
    }
  }
  website ??= guessWebsite(org.name, hits);

  await db.transaction(async (tx) => {
    // Replace previous Keenable notes so re-research doesn't pile up duplicates.
    if (hits.length) {
      await tx
        .delete(researchNotes)
        .where(and(eq(researchNotes.organisationId, org.id), eq(researchNotes.source, 'keenable')));
      await tx.insert(researchNotes).values(
        hits.map(({ topic, r }) => ({
          organisationId: org.id,
          source: 'keenable',
          url: r.url,
          content: `[${topic}] ${r.title}\n${(r.snippet || r.description || '').trim()}`.slice(0, NOTE_MAX_CHARS),
        })),
      );
    }
    await tx
      .update(organisations)
      .set({
        ...(summary ? { summary } : {}),
        ...(website && !org.website ? { website } : {}),
        lastResearchedAt: hits.length ? new Date() : org.lastResearchedAt,
        updatedAt: new Date(),
      })
      .where(eq(organisations.id, org.id));
  });

  return {
    organisationId,
    name: org.name,
    status: 'researched',
    notes: hits.length,
    summarised,
    ...(hits.length ? {} : { reason: 'no search results (Keenable unavailable?)' }),
  };
}

export async function getResearchNotes(organisationId: string, limit = 30) {
  const [org] = await db.select().from(organisations).where(eq(organisations.id, organisationId));
  if (!org) return null;
  const notes = await db
    .select({ source: researchNotes.source, content: researchNotes.content, url: researchNotes.url, createdAt: researchNotes.createdAt })
    .from(researchNotes)
    .where(eq(researchNotes.organisationId, organisationId))
    .orderBy(desc(researchNotes.createdAt))
    .limit(limit);
  return {
    organisation: {
      id: org.id,
      name: org.name,
      website: org.website,
      summary: org.summary,
      lastResearchedAt: org.lastResearchedAt?.toISOString() ?? null,
    },
    notes,
  };
}
