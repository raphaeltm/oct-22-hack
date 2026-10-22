import { createTool } from '@mastra/core/tools';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db, schema } from '../../db';
import { getUserId } from '../context';

const { companies } = schema;

export type CompanyRow = typeof companies.$inferSelect;

export type CompanyProfileUpdate = {
  name?: string;
  description?: string;
  size?: string;
  services?: string[];
  sectors?: string[];
  regions?: string[];
  cpvCodes?: string[];
  differentiators?: string[];
  /** Extra facts (pastWins, knownCompetitors, ...). Arrays are merged, other values replace. */
  profile?: Record<string, unknown>;
};

const ARRAY_FIELDS = ['services', 'sectors', 'regions', 'cpvCodes', 'differentiators'] as const;

/** Merge two lists, de-duplicating case-insensitively (first spelling wins). */
export function mergeList<T>(a: T[] = [], b: T[] = []): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of [...a, ...b]) {
    const s = typeof item === 'string' ? item.trim() : item;
    if (s === '' || s == null) continue;
    const key = typeof s === 'string' ? s.toLowerCase() : JSON.stringify(s);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(s as T);
  }
  return out;
}

function mergeProfile(prev: Record<string, unknown>, next: Record<string, unknown> = {}) {
  const out: Record<string, unknown> = { ...prev };
  for (const [k, v] of Object.entries(next)) {
    if (v === undefined) continue;
    const old = out[k];
    out[k] = Array.isArray(v) && Array.isArray(old) ? mergeList(old, v) : v;
  }
  return out;
}

/** Normalise CPV codes to the 8-digit form (drops the "-check digit" suffix). */
function normaliseCpv(codes: string[] = []) {
  return codes.map((c) => c.trim().split('-')[0]).filter((c) => /^\d{8}$/.test(c));
}

export async function getCompany(userId: string): Promise<CompanyRow | null> {
  const [row] = await db.select().from(companies).where(eq(companies.userId, userId)).limit(1);
  return row ?? null;
}

/** Partial update; creates the row on first call. Arrays are merged and de-duplicated. */
export async function upsertCompany(userId: string, update: CompanyProfileUpdate): Promise<CompanyRow> {
  const existing = await getCompany(userId);
  const patch = { ...update, cpvCodes: update.cpvCodes && normaliseCpv(update.cpvCodes) };

  const merged = {
    name: patch.name?.trim() || existing?.name || 'Unnamed company',
    description: patch.description ?? existing?.description ?? null,
    size: patch.size ?? existing?.size ?? null,
    profile: mergeProfile(existing?.profile ?? {}, patch.profile),
    updatedAt: new Date(),
  } as Partial<typeof companies.$inferInsert> & { name: string };
  for (const f of ARRAY_FIELDS) merged[f] = mergeList(existing?.[f] ?? [], patch[f] ?? []);

  if (existing) {
    const [row] = await db.update(companies).set(merged).where(eq(companies.id, existing.id)).returning();
    return row;
  }
  const [row] = await db
    .insert(companies)
    .values({ ...merged, userId })
    .onConflictDoUpdate({ target: companies.userId, set: merged })
    .returning();
  return row;
}

/** Shape returned to the model (no internal ids/timestamps). */
export function toProfile(row: CompanyRow | null) {
  if (!row) return null;
  return {
    name: row.name,
    description: row.description,
    size: row.size,
    services: row.services,
    sectors: row.sectors,
    regions: row.regions,
    cpvCodes: row.cpvCodes,
    differentiators: row.differentiators,
    profile: row.profile,
  };
}

/** Fields still missing, so the agent knows what to ask next. */
export function profileGaps(row: CompanyRow | null): string[] {
  if (!row) return ['name', 'services', 'sectors', 'regions', 'size', 'pastWins', 'differentiators', 'knownCompetitors', 'cpvCodes'];
  const gaps: string[] = [];
  if (!row.name || row.name === 'Unnamed company') gaps.push('name');
  for (const f of ['services', 'sectors', 'regions'] as const) if (!row[f].length) gaps.push(f);
  if (!row.size) gaps.push('size');
  const p = row.profile ?? {};
  if (!Array.isArray(p.pastWins) || !p.pastWins.length) gaps.push('pastWins');
  if (!row.differentiators.length) gaps.push('differentiators');
  if (!Array.isArray(p.knownCompetitors) || !p.knownCompetitors.length) gaps.push('knownCompetitors');
  if (!row.cpvCodes.length) gaps.push('cpvCodes');
  return gaps;
}

/** Short text summary for the system prompt. */
export function profileSummary(row: CompanyRow | null): string {
  if (!row) return 'No company profile saved yet.';
  const p = row.profile ?? {};
  const item = (x: unknown) => {
    if (typeof x === 'string') return x;
    const w = x as { title?: string; buyer?: string; year?: number; value?: string };
    if (w && typeof w.title === 'string') {
      const meta = [w.buyer, w.year, w.value].filter(Boolean).join(', ');
      return meta ? `${w.title} (${meta})` : w.title;
    }
    return JSON.stringify(x);
  };
  const list = (v: unknown) => (Array.isArray(v) && v.length ? v.map(item).join('; ') : '-');
  const lines = [
    `Name: ${row.name}${row.size ? ` (${row.size})` : ''}`,
    row.description ? `About: ${row.description}` : null,
    `Services: ${list(row.services)}`,
    `Sectors: ${list(row.sectors)}`,
    `Regions: ${list(row.regions)}`,
    `CPV codes: ${list(row.cpvCodes)}`,
    `Differentiators: ${list(row.differentiators)}`,
    `Past wins: ${list(p.pastWins)}`,
    `Known competitors: ${list(p.knownCompetitors)}`,
  ];
  const extra = Object.keys(p).filter((k) => k !== 'pastWins' && k !== 'knownCompetitors');
  if (extra.length) lines.push(`Other facts: ${extra.map((k) => `${k}=${JSON.stringify(p[k])}`).join('; ')}`);
  const gaps = profileGaps(row);
  if (gaps.length) lines.push(`Missing: ${gaps.join(', ')}`);
  return lines.filter(Boolean).join('\n');
}

const profileOutput = z.object({
  profile: z.any().nullable(),
  missing: z.array(z.string()),
});

export const getCompanyProfile = createTool({
  id: 'getCompanyProfile',
  description:
    "Get the current user's saved company profile (services, sectors, regions, CPV codes, size, differentiators, past wins, known competitors) and the list of fields still missing.",
  inputSchema: z.object({}),
  outputSchema: profileOutput,
  execute: async (_input, { requestContext }) => {
    const row = await getCompany(getUserId(requestContext));
    return { profile: toProfile(row), missing: profileGaps(row) };
  },
});

const str = z.array(z.string());

export const updateCompanyProfile = createTool({
  id: 'updateCompanyProfile',
  description:
    "Save facts about the user's company. Partial update: only send fields you learned. List fields are MERGED with existing values (never send the full list just to remove items). Put extra facts in `profile`, e.g. pastWins, knownCompetitors, certifications, typicalContractSize, founded, headcount. Call this as soon as the user tells you something new.",
  inputSchema: z.object({
    name: z.string().optional().describe('Company name'),
    description: z.string().optional().describe('One or two sentence description'),
    size: z.string().optional().describe('e.g. "40 staff", "SME, 10-50 employees"'),
    services: str.optional().describe('Services offered, short phrases'),
    sectors: str.optional().describe('Customer sectors, e.g. "local authorities", "hospitals"'),
    regions: str.optional().describe('Regions served, e.g. "Auvergne-Rhône-Alpes", "France"'),
    cpvCodes: str.optional().describe('8-digit CPV codes inferred from services, e.g. "72413000"'),
    differentiators: str.optional().describe('What sets them apart'),
    profile: z
      .object({
        pastWins: z
          .array(z.object({ title: z.string(), buyer: z.string().optional(), year: z.number().optional(), value: z.string().optional() }))
          .optional(),
        knownCompetitors: str.optional(),
      })
      .catchall(z.unknown())
      .optional()
      .describe('Extra facts. Arrays are merged with existing values.'),
  }),
  outputSchema: profileOutput,
  execute: async (input, { requestContext }) => {
    const row = await upsertCompany(getUserId(requestContext), input as CompanyProfileUpdate);
    return { profile: toProfile(row), missing: profileGaps(row) };
  },
});

export const companyTools = { getCompanyProfile, updateCompanyProfile };
