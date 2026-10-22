// Typed API client for the Hono routes (server/src/routes/data.ts).
// Endpoints that are still being built (/api/matches, /api/tenders/:id/competitors)
// fall back to mock data (web/src/mocks.ts) when they fail. Real endpoints only
// fall back for ids that belong to the mock data, so links from mock views work.
import * as mocks from './mocks';
import { signOut } from './auth';

export type User = { id: string; name?: string | null; email?: string | null; image?: string | null };

export type Company = {
  id: string;
  name: string;
  description: string | null;
  services: string[];
  sectors: string[];
  regions: string[];
  cpvCodes: string[];
  size: string | null;
  differentiators: string[];
  profile?: Record<string, unknown>;
};

export type Tender = {
  id: string;
  publicationNumber: string;
  noticeType: string;
  title: string;
  description: string | null;
  buyerName: string | null;
  buyerCountry: string | null;
  cpvCodes: string[];
  estimatedValue: number | null;
  currency: string | null;
  deadline: string | null;
  publicationDate: string | null;
  url: string | null;
  awardCount?: number;
};

export type Award = {
  id: string;
  tenderId: string;
  organisationId: string | null;
  winnerName: string;
  winnerCountry: string | null;
  value: number | null;
  currency: string | null;
  awardDate: string | null;
  /** Number of winners on the same notice (>1 means a multi-winner framework). */
  coWinners?: number | null;
  /** Joined tender info, when the API includes it. */
  tender?: Pick<Tender, 'id' | 'title' | 'buyerName' | 'publicationNumber' | 'url'> | null;
};

export type Match = { tender: Tender; score: number; rationale: string | null };

export type CompetitorSummary = {
  id: string;
  name: string;
  country: string | null;
  website: string | null;
  summary: string | null;
  wins: number;
  /** Distinct buyers they won with (frameworks inflate raw win counts). */
  buyers: number | null;
  totalValue: number | null;
  lastWin: string | null;
};

export type ResearchNote = {
  id: string;
  source: string;
  content: string;
  url: string | null;
  createdAt: string | null;
};

export type CompetitorDetail = CompetitorSummary & {
  lastResearchedAt: string | null;
  awards: Award[];
  notes: ResearchNote[];
};

export type TenderCompetitor = CompetitorSummary & { winsWithBuyer: number };

export type TenderCompetitors = {
  competitors: TenderCompetitor[];
  buyerAwards: Award[];
};

export type Me = { user: User | null; company: Company | null };

export type Result<T> = { data: T; mock: boolean };

export type TenderSearch = { total: number; tenders: Tender[] };

class HttpError extends Error {
  constructor(public status: number) {
    super(`Request failed (${status})`);
  }
}

/** Session expired or missing: clear it so <AuthGate> renders the login page. */
function onUnauthorized() {
  signOut().catch(() => {});
}

async function getJson(path: string): Promise<any> {
  const res = await fetch(path, { headers: { Accept: 'application/json' }, credentials: 'include' });
  if (res.status === 401) onUnauthorized();
  if (!res.ok) throw new HttpError(res.status);
  if (!res.headers.get('content-type')?.includes('json')) throw new Error('Not JSON');
  return res.json();
}

async function withFallback<T>(
  path: string,
  normalise: (raw: any) => T,
  fallback: (() => T) | null,
): Promise<Result<T>> {
  if (!fallback) return { data: normalise(await getJson(path)), mock: false };
  try {
    return { data: normalise(await getJson(path)), mock: false };
  } catch (err) {
    // An expired session must show the login page, not sample data.
    if (err instanceof HttpError && err.status === 401) throw err;
    console.info(`[api] ${path} unavailable (${(err as Error).message}); using mock data`);
    return { data: fallback(), mock: true };
  }
}

// --- normalisers: tolerate small shape differences while the backend settles ---

const num = (v: unknown): number | null => (v == null || v === '' ? null : Number(v));
const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? v : []);

function toTender(t: any): Tender {
  return {
    id: String(t.id),
    publicationNumber: t.publicationNumber ?? t.publication_number ?? '',
    noticeType: t.noticeType ?? t.notice_type ?? 'cn-standard',
    title: t.title ?? '(untitled)',
    description: t.description ?? null,
    buyerName: t.buyerName ?? t.buyer_name ?? null,
    buyerCountry: t.buyerCountry ?? t.buyer_country ?? null,
    cpvCodes: arr(t.cpvCodes ?? t.cpv_codes),
    estimatedValue: num(t.estimatedValue ?? t.estimated_value),
    currency: t.currency ?? null,
    deadline: t.deadline ?? null,
    publicationDate: t.publicationDate ?? t.publication_date ?? null,
    url: t.url ?? (t.publicationNumber ? tedUrl(t.publicationNumber) : null),
  };
}

function toAward(a: any): Award {
  const t = a.tender;
  return {
    id: String(a.id),
    tenderId: String(a.tenderId ?? a.tender_id ?? t?.id ?? ''),
    organisationId: a.organisationId ?? a.organisation_id ?? null,
    winnerName: a.organisationName ?? a.winnerName ?? a.winner_name ?? '',
    winnerCountry: a.winnerCountry ?? a.winner_country ?? null,
    value: num(a.value),
    currency: a.currency ?? null,
    awardDate: a.awardDate ?? a.award_date ?? null,
    coWinners: a.coWinners ?? null,
    tender: t
      ? { id: t.id, title: t.title, buyerName: t.buyerName ?? null, publicationNumber: t.publicationNumber, url: t.url ?? null }
      : (a.title ?? a.tenderTitle)
        ? {
            id: String(a.tenderId),
            title: a.title ?? a.tenderTitle,
            buyerName: a.buyerName ?? null,
            publicationNumber: a.publicationNumber ?? '',
            url: a.url ?? (a.publicationNumber ? tedUrl(a.publicationNumber) : null),
          }
        : null,
  };
}

function toCompetitor(c: any): CompetitorSummary {
  const o = c.organisation ?? c;
  return {
    id: String(o.id ?? c.organisationId),
    name: o.name ?? c.winnerName ?? '',
    country: o.country ?? null,
    website: o.website ?? null,
    summary: o.summary ?? null,
    wins: Number(c.wins ?? c.winCount ?? 0),
    buyers: num(c.buyers),
    totalValue: num(c.totalValue ?? c.total_value),
    lastWin: c.lastWin ?? c.lastWinAt ?? c.last_win ?? null,
  };
}

function toNote(n: any): ResearchNote {
  return {
    id: String(n.id),
    source: n.source ?? 'note',
    content: n.content ?? '',
    url: n.url ?? null,
    createdAt: n.createdAt ?? null,
  };
}

/** A real API list wins over mocks; remember tenders so detail pages can reuse them. */
const tenderCache = new Map<string, Tender>();
const remember = (t: Tender) => (tenderCache.set(t.id, t), t);

export function normaliseScore(score: number): number {
  return Math.round(score <= 1 ? score * 100 : score);
}

export function tedUrl(publicationNumber: string) {
  return `https://ted.europa.eu/en/notice/-/detail/${encodeURIComponent(publicationNumber)}`;
}

// --- endpoints ---

export const api = {
  me: () =>
    withFallback<Me>(
      '/api/me',
      (r) => ({ user: r.user ?? null, company: r.company ?? null }),
      null,
    ),

  tenders: (params: { q?: string; cpv?: string; open?: boolean; type?: string; limit?: number; offset?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.q) qs.set('q', params.q);
    if (params.cpv) qs.set('cpv', params.cpv);
    if (params.open) qs.set('open', '1');
    if (params.type) qs.set('type', params.type);
    if (params.limit) qs.set('limit', String(params.limit));
    if (params.offset) qs.set('offset', String(params.offset));
    return withFallback<TenderSearch>(
      `/api/tenders?${qs}`,
      (r) => {
        const tenders = arr<any>(r.tenders ?? r).map((t) => ({ ...remember(toTender(t)), awardCount: t.awardCount }));
        return { total: Number(r.total ?? tenders.length), tenders };
      },
      null,
    );
  },

  tender: (id: string) =>
    withFallback<{ tender: Tender; awards: Award[] }>(
      `/api/tenders/${encodeURIComponent(id)}`,
      (r) => ({ tender: remember(toTender(r.tender ?? r)), awards: arr<any>(r.awards).map(toAward) }),
      mocks.getTender(id) ? () => mocks.getTender(id)! : null,
    ),

  matches: () =>
    withFallback<Match[]>(
      '/api/matches',
      (r) =>
        arr<any>(r.matches ?? r).map((m) => ({
          tender: remember(toTender(m.tender ?? m)),
          score: normaliseScore(Number(m.score ?? 0)),
          rationale: m.rationale ?? null,
        })),
      () => mocks.matches,
    ),

  competitors: (params: { q?: string; limit?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.q) qs.set('q', params.q);
    if (params.limit) qs.set('limit', String(params.limit));
    return withFallback<CompetitorSummary[]>(
      `/api/competitors?${qs}`,
      (r) => arr<any>(r.competitors ?? r).map(toCompetitor),
      null,
    );
  },

  competitor: (id: string) =>
    withFallback<CompetitorDetail>(
      `/api/competitors/${encodeURIComponent(id)}`,
      (r) => {
        const base = toCompetitor(r.competitor ?? r);
        const o = r.organisation ?? r.competitor ?? r;
        const awards = arr<any>(r.awards ?? o.awards).map(toAward);
        return {
          ...base,
          wins: base.wins || awards.length,
          totalValue: base.totalValue ?? sum(awards.map((a) => a.value)),
          lastWin: base.lastWin ?? latest(awards.map((a) => a.awardDate)),
          buyers: base.buyers ?? new Set(awards.map((a) => a.tender?.buyerName).filter(Boolean)).size,
          lastResearchedAt: o.lastResearchedAt ?? null,
          awards,
          notes: arr<any>(r.notes ?? r.researchNotes ?? o.notes).map(toNote),
        };
      },
      mocks.getCompetitor(id) ? () => mocks.getCompetitor(id)! : null,
    ),

  tenderCompetitors: async (id: string, tender?: Tender): Promise<Result<TenderCompetitors>> => {
    if (mocks.getTender(id) || !tender) {
      return withFallback(`/api/tenders/${encodeURIComponent(id)}/competitors`, normaliseBrief, () =>
        mocks.tenderCompetitors(id, tenderCache.get(id)?.buyerName ?? null),
      );
    }
    try {
      return { data: normaliseBrief(await getJson(`/api/tenders/${encodeURIComponent(id)}/competitors`)), mock: false };
    } catch (err) {
      if (err instanceof HttpError && err.status === 401) throw err;
      // Endpoint not ready yet: derive the brief from the real award data.
      return { data: await deriveBrief(tender), mock: false };
    }
  },

  /** Queues agent research on a competitor; progress arrives on /api/jobs/events. */
  research: async (id: string, force = true): Promise<{ jobId?: string }> => {
    const res = await fetch(`/api/competitors/${encodeURIComponent(id)}/research`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ force }),
    });
    if (res.status === 401) onUnauthorized();
    if (!res.ok) throw new HttpError(res.status);
    return res.headers.get('content-type')?.includes('json') ? res.json() : {};
  },
};

function normaliseBrief(r: any): TenderCompetitors {
  return {
    competitors: arr<any>(r.competitors ?? r).map((c) => ({
      ...toCompetitor(c),
      winsWithBuyer: Number(c.winsWithBuyer ?? c.buyerWins ?? 0),
    })),
    buyerAwards: arr<any>(r.buyerAwards ?? r.pastAwards ?? r.awards).map(toAward),
  };
}

/**
 * Client-side competitor brief from the real data routes: the buyer's past award
 * notices and their winners, topped up with the overall market leaders.
 */
async function deriveBrief(tender: Tender): Promise<TenderCompetitors> {
  const buyerAwards: Award[] = [];
  if (tender.buyerName) {
    const search = await getJson(
      `/api/tenders?${new URLSearchParams({ q: tender.buyerName, type: 'can-standard', limit: '40' })}`,
    );
    const buyer = tender.buyerName.toLowerCase();
    const past = arr<any>(search.tenders)
      .map(toTender)
      .filter((t) => t.id !== tender.id && t.buyerName?.toLowerCase() === buyer)
      .slice(0, 12);
    const details = await Promise.all(past.map((t) => getJson(`/api/tenders/${t.id}`).catch(() => null)));
    details.forEach((d, i) => {
      const t = past[i]!;
      const list = arr<any>(d?.awards);
      for (const a of list) {
        const award = toAward(a);
        buyerAwards.push({
          ...award,
          tenderId: t.id,
          awardDate: award.awardDate ?? t.publicationDate,
          coWinners: list.length,
          tender: { id: t.id, title: t.title, buyerName: t.buyerName, publicationNumber: t.publicationNumber, url: t.url },
        });
      }
    });
  }
  buyerAwards.sort((a, b) => (b.awardDate ?? '').localeCompare(a.awardDate ?? ''));

  const withBuyer = new Map<string, number>();
  for (const a of buyerAwards) if (a.organisationId) withBuyer.set(a.organisationId, (withBuyer.get(a.organisationId) ?? 0) + 1);
  const topIds = [...withBuyer.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([id]) => id);

  const fromBuyer = await Promise.all(
    topIds.map((id) => getJson(`/api/competitors/${id}`).then(toCompetitor).catch(() => null)),
  );
  const competitors: TenderCompetitor[] = fromBuyer
    .filter((c): c is CompetitorSummary => c != null)
    .map((c) => ({ ...c, winsWithBuyer: withBuyer.get(c.id) ?? 0 }));

  if (competitors.length < 3) {
    const leaders = await getJson('/api/competitors?limit=6').catch(() => ({ competitors: [] }));
    for (const c of arr<any>(leaders.competitors).map(toCompetitor)) {
      if (competitors.length >= 3) break;
      if (!competitors.some((x) => x.id === c.id)) competitors.push({ ...c, winsWithBuyer: 0 });
    }
  }
  return { competitors, buyerAwards };
}

function sum(values: (number | null)[]) {
  const nums = values.filter((v): v is number => v != null);
  return nums.length ? nums.reduce((a, b) => a + b, 0) : null;
}

function latest(dates: (string | null)[]) {
  return dates.filter(Boolean).sort().at(-1) ?? null;
}
