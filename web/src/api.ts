// Typed API client for the Hono routes (server/src/routes/data.ts, routes/matches.ts).
// Tender and competitor detail fall back to mock data (web/src/mocks.ts) only for
// ids that belong to the mock data, so old links from mock views still work.
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

export type Match = {
  tender: Tender;
  score: number;
  rationale: string | null;
  /** 'recent' = recently published but the deadline passed or is not stated. */
  status: 'open' | 'recent';
};

export type MatchRefresh = { matches: Match[]; notes: string[]; polished: boolean };

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

export type CompetitorExample = {
  tenderId: string;
  publicationNumber: string;
  title: string;
  buyer: string | null;
  date: string | null;
  value: number | null;
  coWinners: number;
  sameBuyer: boolean;
  url: string | null;
};

export type TenderCompetitor = CompetitorSummary & {
  winsWithBuyer: number;
  /** Won a similar contract from this buyer before. */
  incumbent: boolean;
  /** Wins as one of 5+ holders of a framework (weaker signal). */
  frameworkWins: number;
  score: number;
  why: string | null;
  aliases: string[];
  examples: CompetitorExample[];
};

export type TenderCompetitors = {
  competitors: TenderCompetitor[];
  buyerAwards: Award[];
  notes: string[];
};

export type Me = { user: User | null; company: Company | null };

// ---------- autopilot (issue #19) ----------

export type Verdict = 'go' | 'consider' | 'no-go';
export type Decision = 'bid' | 'skip' | 'won' | 'lost';
export type SkipReason = 'scope' | 'too_large' | 'too_small' | 'buyer' | 'region' | 'deadline' | 'incumbent' | 'other';

export const SKIP_REASONS: Record<SkipReason, string> = {
  scope: 'Outside our services',
  too_large: 'Too large for us',
  too_small: 'Too small to be worth it',
  buyer: "Buyer we don't work with",
  region: 'Wrong region',
  deadline: 'Deadline too short',
  incumbent: 'Incumbent too strong',
  other: 'Other',
};

export type Dossier = {
  generatedAt: string;
  tender: {
    id: string; publicationNumber: string; title: string; buyerName: string | null; url: string | null;
    procedureType: string | null; estimatedValue: number | null; deadline: string | null; publicationDate: string | null;
    lots: number; daysLeft: number | null;
  };
  fit: { score: number | null; rationale: string | null; learned: { delta: number; label: string }[] };
  calendar: { label: string; date: string; kind: 'official' | 'estimate' | 'suggested'; note?: string }[];
  criteria: { items: { type: string; name: string | null; weight: number | null }[]; priceWeight: number | null; environmental: boolean; note: string };
  contract: { framework: string | null; duration: string | null; renewals: number | null; endDate: string | null };
  documents: { dceUrl: string | null; submissionUrl: string | null };
  requirements: { key: string; label: string; evidence: string; covered: boolean | null }[];
  buyerHistory: {
    awardNotices: number;
    recent: { tenderId: string; title: string; date: string | null; winners: string[]; bidsReceived: number | null; url: string | null }[];
  };
  incumbent: { name: string; organisationId: string | null; basis: string; url: string | null } | null;
  competitors: { name: string; organisationId: string | null; incumbent: boolean; why: string; url: string | null }[];
  market: { similarAwards: number; valueN: number; valueMedian: number | null; valueP25: number | null; valueP75: number | null; bidsN: number; bidsMedian: number | null };
  checklist: { item: string; note?: string }[];
  questions: { fr: string; en: string }[];
  recommendation: { verdict: Verdict; reasons: string[] };
  memo: string | null;
  memoBy: 'model' | 'rules';
  sources: { label: string; url: string }[];
};

export type DossierState = {
  status: 'none' | 'queued' | 'running' | 'ready' | 'failed';
  tenderId: string;
  trigger?: 'autopilot' | 'manual';
  content?: Dossier | null;
  error?: string | null;
  updatedAt?: string;
  decision?: Decision | null;
  reason?: SkipReason | null;
};

export type InboxItem = {
  tenderId: string;
  status: DossierState['status'];
  trigger: 'autopilot' | 'manual';
  score: number | null;
  error: string | null;
  seenAt: string | null;
  createdAt: string;
  verdict: Verdict | null;
  /** Winner of the buyer's last similar award (not necessarily the incumbent). */
  lastSimilarWinner: string | null;
  criteria: number;
  title: string;
  buyerName: string | null;
  publicationNumber: string;
  deadline: string | null;
  estimatedValue: number | null;
  decision: Decision | null;
  reason: SkipReason | null;
};

export type Learned = {
  decisions: number;
  skippedHidden: number;
  weights: Record<string, number>;
  weightNote: string | null;
  rules: { kind: string; delta: number; label: string }[];
};

export type Scorecard = {
  live: { predicted: number; graded: number; pending: number; top5Hits: number; incumbentGraded: number; incumbentHits: number };
  backtest: { graded: number; predicted: number; top5Hits: number; incumbentGraded: number; incumbentHits: number; avgWinners: number };
  baseline: { graded: number; predicted: number; top5Hits: number };
  examples: {
    tenderId: string; publicationNumber: string; title: string; buyerName: string | null; url: string | null; awardUrl: string | null;
    source: string; predicted: { name: string; hit: boolean }[]; winners: string[];
  }[];
  notes: string[];
};

export type AutopilotInbox = {
  dossiers: InboxItem[];
  learned: Learned;
  scorecard: Scorecard;
  feedback: { tenderId: string; decision: Decision; reason: SkipReason | null; title: string; buyerName: string | null; updatedAt: string }[];
};

export type Result<T> = { data: T; mock: boolean };

export type TenderSearch = { total: number; tenders: (Tender & { keywordCount?: number })[] };

export type BuyerAnalytics = {
  buyerKey: string;
  buyerName: string;
  openTenders: number;
  pastAwards: number;
  totalNotices: number;
  winnerConcentration: number;
};

class HttpError extends Error {
  constructor(public status: number) {
    super(`Request failed (${status})`);
  }
}

/** Session expired or missing: clear it so <RequireAuth> redirects to the login page. */
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

async function send(method: 'POST' | 'DELETE', path: string, body?: unknown): Promise<any> {
  const res = await fetch(path, {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 401) onUnauthorized();
  if (!res.ok) {
    const err = await res.json().catch(() => null);
    throw new Error(err?.error ?? `Request failed (${res.status})`);
  }
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

  tenders: (params: { q?: string; cpv?: string; open?: boolean; type?: string; scope?: 'name' | 'description' | 'both'; limit?: number; offset?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.q) qs.set('q', params.q);
    if (params.cpv) qs.set('cpv', params.cpv);
    if (params.open) qs.set('open', '1');
    if (params.type) qs.set('type', params.type);
    if (params.scope && params.scope !== 'both') qs.set('scope', params.scope);
    if (params.limit) qs.set('limit', String(params.limit));
    if (params.offset) qs.set('offset', String(params.offset));
    return withFallback<TenderSearch>(
      `/api/tenders?${qs}`,
      (r) => {
        const tenders = arr<any>(r.tenders ?? r).map((t) => ({ ...remember(toTender(t)), awardCount: t.awardCount, keywordCount: t.keywordCount ?? 0 }));
        return { total: Number(r.total ?? tenders.length), tenders };
      },
      null,
    );
  },

  buyerAnalytics: () =>
    withFallback<{ buyers: BuyerAnalytics[] }>(
      '/api/tenders/buyer-analytics',
      (r) => ({ buyers: arr<BuyerAnalytics>(r.buyers) }),
      null,
    ),

  tender: (id: string) =>
    withFallback<{ tender: Tender; awards: Award[] }>(
      `/api/tenders/${encodeURIComponent(id)}`,
      (r) => ({ tender: remember(toTender(r.tender ?? r)), awards: arr<any>(r.awards).map(toAward) }),
      mocks.getTender(id) ? () => mocks.getTender(id)! : null,
    ),

  matches: () => withFallback<Match[]>('/api/matches', (r) => arr<any>(r.matches ?? r).map(toMatch), null),

  /** Recompute and save the shortlist for the user's company. */
  refreshMatches: async (): Promise<MatchRefresh> => {
    const res = await fetch('/api/matches/refresh', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: '{}',
    });
    if (res.status === 401) onUnauthorized();
    if (!res.ok) throw new HttpError(res.status);
    const r = await res.json();
    return { matches: arr<any>(r.matches).map(toMatch), notes: arr<string>(r.notes), polished: Boolean(r.polished) };
  },

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

  tenderCompetitors: (id: string) =>
    withFallback<TenderCompetitors>(
      `/api/tenders/${encodeURIComponent(id)}/competitors`,
      normaliseBrief,
      mocks.getTender(id) ? () => mocks.tenderCompetitors(id, tenderCache.get(id)?.buyerName ?? null) : null,
    ),

  autopilot: () => withFallback<AutopilotInbox>('/api/autopilot', (r) => r as AutopilotInbox, null),

  dossier: (id: string) =>
    withFallback<DossierState>(`/api/tenders/${encodeURIComponent(id)}/dossier`, (r) => r as DossierState, null),

  /** Build (or rebuild) the pre-bid dossier; progress arrives on /api/jobs/events. */
  buildDossier: (id: string): Promise<{ jobId: string | null }> => send('POST', `/api/tenders/${encodeURIComponent(id)}/dossier`, {}),

  feedback: (id: string, decision: Decision, reason?: SkipReason): Promise<{ learned: Learned; notes: string[] }> =>
    send('POST', `/api/tenders/${encodeURIComponent(id)}/feedback`, { decision, reason }),

  undoFeedback: (id: string): Promise<{ learned: Learned }> => send('DELETE', `/api/tenders/${encodeURIComponent(id)}/feedback`),

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

function toMatch(m: any): Match {
  const tender = remember(toTender(m.tender ?? { ...m, id: m.tenderId ?? m.id }));
  return {
    tender,
    score: normaliseScore(Number(m.score ?? 0)),
    rationale: m.rationale ?? null,
    status: m.status === 'recent' ? 'recent' : 'open',
  };
}

function normaliseBrief(r: any): TenderCompetitors {
  return {
    competitors: arr<any>(r.competitors ?? r).map((c) => ({
      ...toCompetitor(c),
      buyers: num(c.buyers ?? c.distinctBuyers),
      winsWithBuyer: Number(c.winsWithBuyer ?? c.sameBuyerWins ?? c.buyerWins ?? 0),
      incumbent: Boolean(c.incumbent),
      frameworkWins: Number(c.frameworkWins ?? 0),
      score: Number(c.score ?? 0),
      why: c.why ?? null,
      aliases: arr<string>(c.aliases),
      examples: arr<CompetitorExample>(c.examples),
    })),
    buyerAwards: arr<any>(r.buyerAwards ?? r.pastAwards ?? r.awards).map(toAward),
    notes: arr<string>(r.notes),
  };
}

function sum(values: (number | null)[]) {
  const nums = values.filter((v): v is number => v != null);
  return nums.length ? nums.reduce((a, b) => a + b, 0) : null;
}

function latest(dates: (string | null)[]) {
  return dates.filter(Boolean).sort().at(-1) ?? null;
}
