// Groupements (joint bids) from TED eForms award notices.
//
// The search API flattens tendering parties, so for award notices whose
// `tendering-party-leader` flag says a party has several members, we read the
// notice XML once and store each party with its members (leader flag, SIRET,
// city, NUTS region and the contact email published in the notice).
//
//   npm run import:ted-parties -w server -- --limit 50
//
// Idempotent: a notice is fetched once (tenders.parties_fetched_at); its
// consortia are replaced on every fetch.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sql } from 'drizzle-orm';
import { db, pool, runMigrations } from '../db';
import { consortia, consortiumMembers, organisations } from '../db/schema';
import { normaliseName } from './ted';

const XML_URL = (pub: string) => `https://ted.europa.eu/en/notice/${encodeURIComponent(pub)}/xml`;
const DELAY_MS = 350; // stay well under TED's rate limit

export type PartyOrg = {
  ref: string;
  name: string;
  siret: string | null;
  city: string | null;
  postalCode: string | null;
  nuts: string | null;
  country: string | null;
  email: string | null;
};
export type Party = { ref: string; name: string | null; won: boolean; members: { ref: string; leader: boolean }[] };

// ---------- XML (eForms has a regular, non-recursive structure for these blocks) ----------

const decode = (s: string) =>
  s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#0?39;/g, "'")
    .replace(/&amp;/g, '&')
    .trim();

function blocks(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, 'g');
  return [...xml.matchAll(re)].map((m) => m[1]);
}

function first(xml: string, tag: string, attr = ''): string | null {
  const m = xml.match(new RegExp(`<${tag}${attr ? `[^>]*${attr}` : '(?:\\s[^>]*)?'}>([\\s\\S]*?)</${tag}>`));
  return m ? decode(m[1]) || null : null;
}

// Buyers often fill the winner's email with a placeholder ("mailgenerique@titulaire.fr").
const PLACEHOLDER_EMAIL = /^(mailgenerique|no-?reply|nomail|x+|a)@|@(titulaire|fournisseurs?|example|exemple|test|domaine)\./i;

const ids = (xml: string, scheme: string) =>
  [...xml.matchAll(new RegExp(`<cbc:ID schemeName="${scheme}">([^<]+)</cbc:ID>`, 'g'))].map((m) => m[1].trim());

/** Tendering parties and the organisations they reference, from one notice's XML. */
export function parseParties(xml: string): { parties: Party[]; orgs: Map<string, PartyOrg> } {
  // Lot tenders that ended in a settled contract (the winning ones).
  const settled = new Set(blocks(xml, 'efac:SettledContract').flatMap((b) => ids(b, 'tender')));
  const tenderParty = new Map<string, string>(); // TEN-x -> TPA-x
  for (const b of blocks(xml, 'efac:LotTender')) {
    const ten = ids(b, 'tender')[0];
    const tpa = ids(b, 'tendering-party')[0];
    if (ten && tpa) tenderParty.set(ten, tpa);
  }
  const wonParties = new Set([...settled].map((t) => tenderParty.get(t)).filter(Boolean));

  const parties: Party[] = [];
  for (const b of blocks(xml, 'efac:TenderingParty')) {
    if (!b.includes('<efac:Tenderer>')) continue; // a reference, not the definition
    const ref = ids(b, 'tendering-party')[0];
    if (!ref) continue;
    const members = blocks(b, 'efac:Tenderer')
      .map((t) => ({ ref: ids(t, 'organization')[0], leader: /<efbc:GroupLeadIndicator>true</.test(t) }))
      .filter((m) => m.ref);
    parties.push({ ref, name: first(b, 'cbc:Name'), won: settled.size === 0 || wonParties.has(ref), members });
  }

  const orgs = new Map<string, PartyOrg>();
  for (const b of blocks(xml, 'efac:Organization')) {
    const ref = ids(b, 'organization')[0];
    const name = first(b, 'cbc:Name');
    if (!ref || !name) continue;
    const email = first(b, 'cbc:ElectronicMail');
    const siret = first(b, 'cbc:CompanyID')?.replace(/\s+/g, '') ?? null;
    orgs.set(ref, {
      ref,
      name,
      siret: siret && /^\d{9}(\d{5})?$/.test(siret) ? siret : null,
      city: first(b, 'cbc:CityName'),
      postalCode: first(b, 'cbc:PostalZone'),
      nuts: first(b, 'cbc:CountrySubentityCode'),
      country: first(b, 'cbc:IdentificationCode'),
      email: email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !PLACEHOLDER_EMAIL.test(email) ? email.toLowerCase() : null,
    });
  }
  return { parties, orgs };
}

// ---------- fetch + store ----------

async function fetchXml(pub: string): Promise<string | null> {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(XML_URL(pub), { headers: { Accept: 'application/xml' }, redirect: 'follow' });
    if (res.ok) return res.text();
    if (res.status === 404) return null;
    if (attempt >= 4 || (res.status < 500 && res.status !== 429)) throw new Error(`TED XML ${pub}: ${res.status}`);
    await new Promise((r) => setTimeout(r, 1500 * 2 ** attempt));
  }
}

async function storeParties(tenderId: string, publicationNumber: string, xml: string) {
  const { parties, orgs } = parseParties(xml);
  const groups = parties.filter((p) => p.members.length >= 2);
  await db.transaction(async (tx) => {
    await tx.delete(consortia).where(sql`${consortia.tenderId} = ${tenderId}`);
    for (const p of groups) {
      const [row] = await tx
        .insert(consortia)
        .values({ tenderId, partyRef: p.ref, name: p.name, won: p.won ? 1 : 0 })
        .returning({ id: consortia.id });
      for (const m of p.members) {
        const o = orgs.get(m.ref);
        if (!o) continue;
        const key = normaliseName(o.name);
        let organisationId: string | null = null;
        if (key) {
          const [org] = await tx
            .insert(organisations)
            .values({
              name: o.name, normalisedName: key, country: o.country, siret: o.siret, city: o.city, nuts: o.nuts,
              contactEmail: o.email, contactSource: o.email ? publicationNumber : null,
            })
            .onConflictDoUpdate({
              target: organisations.normalisedName,
              set: {
                updatedAt: new Date(),
                siret: sql`coalesce(${organisations.siret}, excluded.siret)`,
                city: sql`coalesce(excluded.city, ${organisations.city})`,
                nuts: sql`coalesce(excluded.nuts, ${organisations.nuts})`,
                contactEmail: sql`coalesce(excluded.contact_email, ${organisations.contactEmail})`,
                contactSource: sql`CASE WHEN excluded.contact_email IS NOT NULL THEN excluded.contact_source ELSE ${organisations.contactSource} END`,
              },
            })
            .returning({ id: organisations.id });
          organisationId = org.id;
        }
        await tx
          .insert(consortiumMembers)
          .values({ consortiumId: row.id, orgRef: m.ref, organisationId, name: o.name, leader: m.leader ? 1 : 0 })
          .onConflictDoNothing();
      }
    }
    await tx.execute(sql`UPDATE tenders SET parties_fetched_at = now() WHERE id = ${tenderId}`);
  });
  return groups.length;
}

export interface EnrichPartiesResult {
  notices: number;
  consortia: number;
  failed: number;
}

/** Read the XML of award notices that report a multi-member tendering party (newest first). */
export async function enrichParties(
  opts: { limit?: number; onProgress?: (done: number, total: number) => void } = {},
): Promise<EnrichPartiesResult> {
  const { rows } = await pool.query<{ id: string; publication_number: string }>(
    `SELECT id, publication_number FROM tenders
     WHERE notice_type = 'can-standard' AND parties_fetched_at IS NULL
       AND raw->'tendering-party-leader' @> 'true'::jsonb
     ORDER BY publication_date DESC NULLS LAST
     LIMIT $1`,
    [Math.min(Math.max(opts.limit ?? 300, 1), 2000)],
  );
  const out: EnrichPartiesResult = { notices: 0, consortia: 0, failed: 0 };
  let streak = 0;
  for (const [i, r] of rows.entries()) {
    // TED down or rate-limiting hard: stop and retry on the next import.
    if (streak >= 5) throw new Error(`TED XML: ${streak} failures in a row, stopping after ${out.notices} notices`);
    try {
      const xml = await fetchXml(r.publication_number);
      out.consortia += xml ? await storeParties(r.id, r.publication_number, xml) : 0;
      if (!xml) await pool.query(`UPDATE tenders SET parties_fetched_at = now() WHERE id = $1`, [r.id]);
      out.notices++;
      streak = 0;
    } catch (err) {
      out.failed++;
      streak++;
      console.error(`[ted-parties] ${r.publication_number}:`, (err as Error).message);
    }
    opts.onProgress?.(i + 1, rows.length);
    await new Promise((res) => setTimeout(res, DELAY_MS));
  }
  return out;
}

// ---------- CLI ----------

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const i = args.indexOf('--limit');
  try {
    await runMigrations();
    const res = await enrichParties({
      limit: i >= 0 ? Number(args[i + 1]) : undefined,
      onProgress: (d, t) => d % 25 === 0 && console.log(`read ${d}/${t} notices`),
    });
    console.log(`done: ${res.notices} notices, ${res.consortia} groupements, ${res.failed} failed`);
  } catch (err) {
    console.error(err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}
