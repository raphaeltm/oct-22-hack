// Typed client for the Keenable web search API (https://docs.keenable.ai/api-reference/search).
//
//   POST https://api.keenable.ai/v1/search         X-API-Key: keen_...   (billed)
//   POST https://api.keenable.ai/v1/search/public  X-Keenable-Title: ... (keyless, rate limited per IP)
//
// With KEENABLE_API_KEY set we use the authenticated endpoint. Without it we
// fall back to the keyless public endpoint (set KEENABLE_KEYLESS=0 to disable
// that, in which case search() returns []). Errors never throw: they log and
// return [] so research jobs degrade gracefully.

const BASE_URL = process.env.KEENABLE_BASE_URL ?? 'https://api.keenable.ai/v1';
const APP_TITLE = 'rfp-copilot';

export type KeenableMode = 'pro' | 'realtime';

export interface KeenableSearchRequest {
  query: string;
  /** 'pro' (default, deeper) or 'realtime' (fastest). */
  mode?: KeenableMode;
  /** Restrict to a domain, e.g. "lesechos.fr". */
  site?: string;
  /** Date filters: YYYY-MM-DD, ISO 8601, or relative deltas like "7d", "1y". */
  acquired_after?: string;
  acquired_before?: string;
  published_after?: string;
  published_before?: string;
  query_time?: string;
  /** 180–10000 characters. */
  snippet_max_length?: number;
  /** 1–50, default 10. */
  max_results?: number;
}

export interface KeenableResult {
  title: string;
  url: string;
  description: string;
  snippet: string;
  published_at?: string | null;
  acquired_at?: string | null;
}

export interface KeenableSearchResponse {
  query: string;
  mode: KeenableMode;
  results: KeenableResult[];
}

let warnedNoKey = false;

export function keenableAvailable() {
  return Boolean(process.env.KEENABLE_API_KEY) || process.env.KEENABLE_KEYLESS !== '0';
}

export async function search(req: KeenableSearchRequest): Promise<KeenableResult[]> {
  const key = process.env.KEENABLE_API_KEY;
  if (!key && !warnedNoKey) {
    warnedNoKey = true;
    console.warn(
      process.env.KEENABLE_KEYLESS === '0'
        ? '[keenable] KEENABLE_API_KEY not set and keyless mode disabled; web research returns no results'
        : '[keenable] KEENABLE_API_KEY not set; using the rate-limited keyless /search/public endpoint',
    );
  }
  if (!key && process.env.KEENABLE_KEYLESS === '0') return [];

  const url = key ? `${BASE_URL}/search` : `${BASE_URL}/search/public`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (key) headers['X-API-Key'] = key;
  else headers['X-Keenable-Title'] = APP_TITLE;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(req),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      console.warn(`[keenable] ${res.status} for "${req.query}": ${(await res.text()).slice(0, 200)}`);
      return [];
    }
    const body = (await res.json()) as KeenableSearchResponse;
    return body.results ?? [];
  } catch (err) {
    console.warn(`[keenable] search failed for "${req.query}":`, (err as Error).message);
    return [];
  }
}
