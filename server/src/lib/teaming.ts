// "Bid together?" signal for a tender: capabilities the company lacks (from the
// partner finder's gap check) and whether the value is large for its size.
// A heuristic for flagging tenders, like the dossier's groupement checklist item.
import { pool } from '../db';
import type { CompanyRow } from '../mastra/tools/company';
import { tenderGaps } from './partners';

export type Teaming = { gaps: string[]; large: boolean };

/** Same rule as the dossier checklist: over €1M for a firm under 50 staff. */
export const largeForCompany = (company: CompanyRow, value: number | null | undefined) =>
  value != null && value > 1_000_000 && /\b([1-4]?\d)\b/.test(company.size ?? '');

export async function teamingFor(company: CompanyRow, tenderIds: string[]): Promise<Map<string, Teaming>> {
  const out = new Map<string, Teaming>();
  if (!tenderIds.length) return out;
  const { rows } = await pool.query<{ id: string; title: string; description: string | null; value: number | null }>(
    `SELECT id, title, description, estimated_value::float8 AS value FROM tenders WHERE id = ANY($1::uuid[])`,
    [tenderIds],
  );
  for (const r of rows) {
    out.set(r.id, {
      gaps: tenderGaps(company, `${r.title}\n${r.description ?? ''}`).gaps.map((g) => g.label),
      large: largeForCompany(company, r.value),
    });
  }
  return out;
}
