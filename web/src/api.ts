import { useEffect, useRef } from 'react';

export type Verdict = 'go' | 'maybe' | 'no';

export type Match = {
  id: string;
  title: string;
  buyer: string;
  country: string;
  cpv: string[];
  value: number | null;
  currency: string | null;
  published: string | null;
  deadline: string | null;
  url: string;
  score: number;
  verdict: Verdict;
  headline: string;
  reasons: string[];
  risks: string[];
  effort: 'low' | 'medium' | 'high' | null;
  scored_by: string;
  decision: 'go' | 'no-go' | null;
  decision_reason: string | null;
  has_brief?: boolean;
  brief?: string | null;
  description?: string;
};

export type Company = {
  id: string;
  name: string;
  pitch: string;
  cpv: string[];
  countries: string[];
  keywords: string[];
  min_value: number | null;
  max_value: number | null;
  learned_rules: string;
};

export type PastBid = {
  id: string;
  title: string;
  buyer: string;
  year: number | null;
  value: number | null;
  outcome: 'won' | 'lost';
  summary: string;
};

export type Stats = {
  matches: number;
  go: number;
  maybe: number;
  decided: number;
  pipeline: number;
  next_deadline: string | null;
  scanned: number;
  sweeps: number;
  lastScan: { started_at: string; finished_at: string | null; fetched: number; fresh: number; error: string | null } | null;
};

export type ProfileDraft = {
  name: string;
  pitch: string;
  cpv: string[];
  cpvLabels?: string[];
  countries: string[];
  keywords: string[];
  minValue: number | null;
  maxValue: number | null;
};

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json', ...init.headers } : init?.headers,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json();
}

export const api = {
  health: () => req<{ model: string | null; redis: boolean; db: boolean }>('/api/health'),
  companies: () => req<{ companies: { id: string; name: string }[] }>('/api/companies'),
  company: (id: string) => req<{ company: Company; pastBids: PastBid[] }>(`/api/companies/${id}`),
  draftProfile: (description: string) =>
    req<{ profile: ProfileDraft }>('/api/companies/draft', { method: 'POST', body: JSON.stringify({ description }) }),
  createCompany: (p: ProfileDraft) => req<{ id: string }>('/api/companies', { method: 'POST', body: JSON.stringify(p) }),
  updateCompany: (id: string, p: ProfileDraft) =>
    req<{ ok: true }>(`/api/companies/${id}`, { method: 'PUT', body: JSON.stringify(p) }),
  addBid: (id: string, b: Omit<PastBid, 'id'>) =>
    req<{ ok: true }>(`/api/companies/${id}/bids`, { method: 'POST', body: JSON.stringify(b) }),
  deleteBid: (id: string, bidId: string) => req<{ ok: true }>(`/api/companies/${id}/bids/${bidId}`, { method: 'DELETE' }),
  matches: (id: string) => req<{ matches: Match[] }>(`/api/companies/${id}/matches`),
  stats: (id: string) => req<Stats>(`/api/companies/${id}/stats`),
  scan: (id: string) => req<{ ok: true }>(`/api/companies/${id}/scan`, { method: 'POST' }),
  tender: (id: string, tid: string) => req<{ tender: Match }>(`/api/companies/${id}/tenders/${encodeURIComponent(tid)}`),
  decide: (id: string, tid: string, decision: 'go' | 'no-go' | null, reason?: string) =>
    req<{ ok: true }>(`/api/companies/${id}/tenders/${encodeURIComponent(tid)}/decision`, {
      method: 'POST',
      body: JSON.stringify({ decision, reason }),
    }),
  brief: (id: string, tid: string) =>
    req<{ threadId: string; runId: string }>(`/api/companies/${id}/tenders/${encodeURIComponent(tid)}/brief`, { method: 'POST' }),
  messages: (threadId: string) =>
    req<{ messages: { id: string; role: 'user' | 'assistant'; content: string }[] }>(`/api/threads/${threadId}/messages`),
  chat: (companyId: string, threadId: string, message: string, messageId: string) =>
    req<{ runId: string }>('/api/chat', { method: 'POST', body: JSON.stringify({ companyId, threadId, message, messageId }) }),
};

/** Subscribe to a server-sent event stream; handlers keyed by event type. */
export function useEventStream(url: string | null, handlers: Record<string, (data: any) => void>) {
  const ref = useRef(handlers);
  ref.current = handlers;
  useEffect(() => {
    if (!url) return;
    const source = new EventSource(url);
    const types = Object.keys(ref.current);
    const listeners = types.map((type) => {
      const fn = (e: MessageEvent) => ref.current[type]?.(JSON.parse(e.data));
      source.addEventListener(type, fn);
      return [type, fn] as const;
    });
    return () => {
      listeners.forEach(([type, fn]) => source.removeEventListener(type, fn));
      source.close();
    };
    // Handler identity changes every render; the ref keeps the latest.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);
}

// ---------- formatting ----------

const COUNTRY: Record<string, string> = {
  FRA: 'France', BEL: 'Belgium', LUX: 'Luxembourg', DEU: 'Germany', NLD: 'Netherlands', ESP: 'Spain', ITA: 'Italy',
  PRT: 'Portugal', IRL: 'Ireland', AUT: 'Austria', POL: 'Poland', CZE: 'Czechia', SWE: 'Sweden', DNK: 'Denmark',
  FIN: 'Finland', GRC: 'Greece', ROU: 'Romania', HUN: 'Hungary', SVK: 'Slovakia', SVN: 'Slovenia', HRV: 'Croatia',
  BGR: 'Bulgaria', EST: 'Estonia', LVA: 'Latvia', LTU: 'Lithuania', CYP: 'Cyprus', MLT: 'Malta', NOR: 'Norway', CHE: 'Switzerland',
};
export const countryName = (iso3: string) => COUNTRY[iso3] ?? iso3;

export function money(v: number | null | undefined, currency = 'EUR') {
  if (v == null) return '—';
  const sym = currency === 'EUR' ? '€' : `${currency} `;
  if (v >= 1_000_000) return `${sym}${(v / 1_000_000).toFixed(v >= 10_000_000 ? 0 : 1)}M`;
  if (v >= 1_000) return `${sym}${Math.round(v / 1_000)}k`;
  return `${sym}${Math.round(v)}`;
}

export function daysLeft(deadline: string | null) {
  if (!deadline) return null;
  return Math.ceil((new Date(deadline).getTime() - Date.now()) / 86_400_000);
}

export function shortDate(d: string | null) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

export function ago(d: string | null | undefined) {
  if (!d) return 'never';
  const min = Math.round((Date.now() - new Date(d).getTime()) / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
}

export const VERDICT_LABEL: Record<Verdict, string> = { go: 'Bid', maybe: 'Read', no: 'Skip' };
