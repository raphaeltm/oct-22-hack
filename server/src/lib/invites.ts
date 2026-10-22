// Partner outreach: invites (drafted here, sent by the user from their own mail
// client), the partner's response through a token-scoped public page, response
// scoring, and claiming a Radar account from a response (network effect).
import { randomBytes } from 'node:crypto';
import { z } from 'zod';
import { baseURL } from '../auth';
import { pool } from '../db';
import type { CompanyRow } from '../mastra/tools/company';
import { awardIndex } from './competitors';
import { CAPABILITIES } from './partners';
import { aliasKey, fmtEur, fold, isoDate } from './text';

export const ROLES = ['cotraitant', 'sous-traitant', 'mandataire'] as const;
export type Role = (typeof ROLES)[number];

const ROLE_FR: Record<Role, string> = {
  cotraitant: 'cotraitant au sein d’un groupement momentané d’entreprises dont nous serions mandataires',
  'sous-traitant': 'sous-traitant sur une partie de la prestation',
  mandataire: 'mandataire d’un groupement auquel nous participerions en tant que cotraitant',
};

const INVITE_DAYS = 45;
const newToken = () => randomBytes(24).toString('base64url');
export const inviteLink = (token: string) => `${baseURL}/p/${token}`;

type TenderRow = { id: string; publication_number: string; title: string; buyer_name: string | null; deadline: Date | null; estimated_value: number | null; url: string | null };

async function tenderRow(id: string) {
  const { rows } = await pool.query<TenderRow>(
    `SELECT id, publication_number, title, buyer_name, deadline, CASE WHEN estimated_value > 1 THEN estimated_value::float8 END AS estimated_value, url
     FROM tenders WHERE id = $1`,
    [id],
  );
  return rows[0] ?? null;
}

const frDate = (d: Date | null) => (d ? d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Paris' }) : null);

/** French outreach email built only from known facts (tender, need, the partner's TED evidence). */
export function draftEmail(o: {
  company: CompanyRow; tender: TenderRow; partnerName: string; role: Role; need: string; evidence?: { title: string; buyer: string | null }[]; link: string;
}) {
  const { company, tender: t } = o;
  const deadline = frDate(t.deadline);
  const subject = `Proposition de groupement – ${t.title.slice(0, 80)}${t.title.length > 80 ? '…' : ''}`;
  const ev = (o.evidence ?? []).slice(0, 2);
  const hq = typeof company.profile?.headquarters === 'string' ? company.profile.headquarters : null;
  const lines = [
    'Bonjour,',
    '',
    `Je me permets de vous contacter au nom de ${company.name}${hq ? `, entreprise du numérique basée à ${hq}` : ''}.`,
    '',
    `Nous préparons une réponse à la consultation « ${t.title} » publiée par ${t.buyer_name ?? 'l’acheteur'} (avis TED ${t.publication_number}${deadline ? `, date limite de remise des offres le ${deadline}` : ''}).`,
    '',
    `Pour présenter l’offre la plus complète, nous recherchons un partenaire pour : ${o.need}.`,
    ev.length
      ? `Vos références sur des marchés publics comparables (${ev.map((e) => `« ${e.title} »${e.buyer ? ` pour ${e.buyer}` : ''}`).join(' ; ')}) nous ont conduits vers ${o.partnerName}.`
      : `Votre expérience des marchés publics nous a conduits vers ${o.partnerName}.`,
    '',
    `Nous vous proposerions d’intervenir en tant que ${ROLE_FR[o.role]}.`,
    '',
    `Si le sujet vous intéresse, vous pouvez nous répondre en deux minutes via ce lien (intérêt, disponibilité, références) : ${o.link}`,
    '',
    'Nous restons bien sûr disponibles pour en discuter par téléphone.',
    '',
    'Bien cordialement,',
    company.name,
  ];
  return { subject, body: lines.join('\n') };
}

export async function createInvite(
  company: CompanyRow,
  input: { tenderId: string; organisationId?: string | null; partnerName?: string | null; contactEmail?: string | null; role: Role; need: string; fitScore?: number | null; signals?: Record<string, unknown> | null },
) {
  const t = await tenderRow(input.tenderId);
  if (!t) return { error: 'tender not found' as const };
  let partnerName = input.partnerName?.trim() || null;
  let contactEmail = input.contactEmail?.trim() || null;
  let evidence: { title: string; buyer: string | null }[] = [];
  if (input.organisationId) {
    const { rows } = await pool.query<{ name: string; contact_email: string | null }>(
      `SELECT name, contact_email FROM organisations WHERE id = $1`,
      [input.organisationId],
    );
    if (!rows[0]) return { error: 'organisation not found' as const };
    partnerName ??= rows[0].name;
    contactEmail ??= rows[0].contact_email;
    const { notices } = await awardIndex();
    const key = aliasKey(rows[0].name);
    evidence = notices
      .filter((n) => n.winners.some((w) => aliasKey(w.name) === key))
      .sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''))
      .slice(0, 2)
      .map((n) => ({ title: n.title, buyer: n.buyerName }));
  }
  if (!partnerName) return { error: 'partnerName or organisationId is required' as const };
  const token = newToken();
  const { subject, body } = draftEmail({ company, tender: t, partnerName, role: input.role, need: input.need, evidence, link: inviteLink(token) });
  const expires = new Date(Math.max(Date.now(), t.deadline?.getTime() ?? 0) + INVITE_DAYS * 86_400_000);
  const { rows } = await pool.query<{ id: string }>(
    `INSERT INTO partner_invites (token, company_id, tender_id, organisation_id, partner_name, contact_email, role, need, subject, body, fit_score, signals, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING id`,
    [token, company.id, t.id, input.organisationId ?? null, partnerName, contactEmail, input.role, input.need, subject, body, input.fitScore ?? null, input.signals ?? null, expires],
  );
  return { invite: (await listInvites(company.id, { inviteId: rows[0].id }))[0] };
}

export type InviteView = Awaited<ReturnType<typeof listInvites>>[number];

/** The company's invites (newest first), with responses. Only ever scoped by company id. */
export async function listInvites(companyId: string, opts: { tenderId?: string; inviteId?: string } = {}) {
  const { rows } = await pool.query(
    `SELECT i.id, i.token, i.tender_id, t.title AS tender_title, t.publication_number, t.buyer_name, t.deadline, i.organisation_id,
       i.partner_name, i.contact_email, i.role, i.need, i.subject, i.body, i.fit_score, i.status, i.sent_at, i.opened_at,
       i.responded_at, i.expires_at, i.created_at, row_to_json(r.*) AS response
     FROM partner_invites i JOIN tenders t ON t.id = i.tender_id
     LEFT JOIN partner_responses r ON r.invite_id = i.id
     WHERE i.company_id = $1 AND ($2::uuid IS NULL OR i.tender_id = $2) AND ($3::uuid IS NULL OR i.id = $3)
     ORDER BY i.created_at DESC LIMIT 100`,
    [companyId, opts.tenderId ?? null, opts.inviteId ?? null],
  );
  return rows.map((r) => {
    const resp = r.response as Record<string, unknown> | null;
    return {
      id: r.id as string,
      link: inviteLink(r.token),
      tender: { id: r.tender_id as string, title: r.tender_title as string, publicationNumber: r.publication_number as string, buyerName: r.buyer_name as string | null, deadline: isoDate(r.deadline) },
      organisationId: r.organisation_id as string | null,
      partnerName: r.partner_name as string,
      contactEmail: r.contact_email as string | null,
      role: r.role as Role,
      need: r.need as string,
      subject: r.subject as string,
      body: r.body as string,
      fitScore: r.fit_score as number | null,
      status: r.status as string,
      sentAt: r.sent_at ? new Date(r.sent_at).toISOString() : null,
      openedAt: r.opened_at ? new Date(r.opened_at).toISOString() : null,
      respondedAt: r.responded_at ? new Date(r.responded_at).toISOString() : null,
      expiresAt: new Date(r.expires_at).toISOString(),
      createdAt: new Date(r.created_at).toISOString(),
      response: resp
        ? {
            interest: resp.interest as string,
            role: resp.role as string | null,
            companyName: resp.company_name as string | null,
            siret: resp.siret as string | null,
            contactName: resp.contact_name as string | null,
            contactEmail: resp.contact_email as string | null,
            website: resp.website as string | null,
            capabilities: resp.capabilities as string | null,
            availability: resp.availability as string | null,
            references: (resp.references as { title: string; buyer?: string; year?: string }[]) ?? [],
            message: resp.message as string | null,
            score: resp.score as number | null,
            breakdown: resp.breakdown as ResponseBreakdown | null,
            joinedRadar: Boolean(resp.claimed_company_id),
            createdAt: String(resp.created_at),
          }
        : null,
    };
  });
}

/** Mark sent (the user copied the email or opened it in their mail client). */
export async function markSent(companyId: string, inviteId: string, contactEmail?: string | null) {
  const { rowCount } = await pool.query(
    `UPDATE partner_invites SET sent_at = coalesce(sent_at, now()), status = CASE WHEN status = 'draft' THEN 'sent' ELSE status END,
       contact_email = coalesce($3, contact_email), updated_at = now()
     WHERE id = $1 AND company_id = $2`,
    [inviteId, companyId, contactEmail?.trim() || null],
  );
  return rowCount === 1;
}

export async function deleteInvite(companyId: string, inviteId: string) {
  const { rowCount } = await pool.query(
    `DELETE FROM partner_invites WHERE id = $1 AND company_id = $2 AND responded_at IS NULL`,
    [inviteId, companyId],
  );
  return rowCount === 1;
}

// ---------- public, token-scoped ----------

type PublicInvite = {
  id: string; company_id: string; status: string; responded_at: Date | null; expires_at: Date; opened_at: Date | null; sent_at: Date | null; created_at: Date;
  company_name: string; company_regions: string[]; partner_name: string; role: Role; need: string;
  organisation_id: string | null; tender_id: string; tender_title: string; buyer_name: string | null; deadline: Date | null;
  estimated_value: number | null; publication_number: string; url: string | null;
};

async function inviteByToken(token: string): Promise<PublicInvite | null> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const { rows } = await pool.query<PublicInvite>(
    `SELECT i.id, i.company_id, i.status, i.responded_at, i.expires_at, i.opened_at, i.sent_at, i.created_at, c.name AS company_name,
       c.regions AS company_regions, i.partner_name, i.role, i.need, i.organisation_id,
       t.id AS tender_id, t.title AS tender_title, t.buyer_name, t.deadline,
       CASE WHEN t.estimated_value > 1 THEN t.estimated_value::float8 END AS estimated_value, t.publication_number, t.url
     FROM partner_invites i JOIN companies c ON c.id = i.company_id JOIN tenders t ON t.id = i.tender_id
     WHERE i.token = $1`,
    [token],
  );
  return rows[0] ?? null;
}

/** What the partner sees. Marks the invite opened. Never exposes contact data or scores. */
export async function publicInvite(token: string) {
  const i = await inviteByToken(token);
  if (!i) return { status: 404 as const };
  const expired = i.expires_at.getTime() < Date.now();
  if (!i.opened_at && !expired) {
    await pool.query(
      `UPDATE partner_invites SET opened_at = now(), status = CASE WHEN status IN ('draft', 'sent') THEN 'opened' ELSE status END WHERE id = $1`,
      [i.id],
    );
  }
  return {
    status: 200 as const,
    invite: {
      from: { name: i.company_name, regions: i.company_regions },
      partnerName: i.partner_name,
      role: i.role,
      need: i.need,
      tender: {
        title: i.tender_title, buyerName: i.buyer_name, deadline: isoDate(i.deadline), deadlineAt: i.deadline?.toISOString() ?? null,
        estimatedValue: i.estimated_value, estimatedValueLabel: fmtEur(i.estimated_value), publicationNumber: i.publication_number, url: i.url,
      },
      responded: Boolean(i.responded_at),
      expired,
    },
  };
}

const trimmed = (max: number) => z.string().trim().max(max);
const optional = (max: number) => trimmed(max).optional().transform((v) => (v ? v : null));

export const ResponseInput = z.object({
  interest: z.enum(['yes', 'maybe', 'no']),
  role: z.enum(ROLES).optional().nullable(),
  companyName: optional(200),
  siret: optional(20),
  contactName: optional(120),
  contactEmail: z.string().trim().max(200).email().optional().or(z.literal('').transform(() => undefined)).transform((v) => v || null),
  website: optional(300),
  capabilities: optional(3000),
  availability: optional(500),
  references: z
    .array(z.object({ title: trimmed(300).min(1), buyer: trimmed(200).optional(), year: trimmed(10).optional() }))
    .max(5)
    .default([]),
  message: optional(3000),
});
export type ResponseInputT = z.infer<typeof ResponseInput>;

export type ResponseBreakdown = {
  total: number;
  parts: { key: string; label: string; points: number; max: number; note: string }[];
  verified: { siret: boolean | null; references: { title: string; matched: { title: string; buyer: string | null; url: string | null } | null }[] };
};

/** SIREN/SIRET checksum (Luhn); La Poste SIRETs are a known exception. */
export function validSiret(s: string | null): boolean {
  if (!s) return false;
  const d = s.replace(/\s+/g, '');
  if (!/^\d{9}$|^\d{14}$/.test(d)) return false;
  if (d.length === 14 && d.startsWith('356000000')) return true;
  let sum = 0;
  for (let i = 0; i < d.length; i++) {
    let n = Number(d[d.length - 1 - i]);
    if (i % 2 === 1) n = n * 2 > 9 ? n * 2 - 9 : n * 2;
    sum += n;
  }
  return sum % 10 === 0;
}

const words = (s: string) => new Set(fold(s).split(' ').filter((w) => w.length >= 5));

/**
 * Score a response 0-100 (heuristic): interest, coverage of the need, references
 * (and whether they match the firm's TED awards), SIRET checks, speed, completeness.
 */
export async function scoreResponse(
  invite: { need: string; role: Role; organisation_id: string | null; sent_at: Date | null; created_at: Date },
  r: ResponseInputT,
  now = new Date(),
): Promise<ResponseBreakdown> {
  const parts: ResponseBreakdown['parts'] = [];
  const add = (key: string, label: string, points: number, max: number, note: string) =>
    parts.push({ key, label, points: Math.round(Math.max(0, Math.min(max, points))), max, note });

  add('interest', 'Interest', r.interest === 'yes' ? 25 : r.interest === 'maybe' ? 12 : 0, 25, r.interest === 'yes' ? 'Interested' : r.interest === 'maybe' ? 'Maybe' : 'Declined');

  // Coverage: capabilities named in the need that the response text also shows.
  const needCaps = CAPABILITIES.filter((c) => c.re.test(invite.need) || c.profile.test(invite.need));
  const respText = [r.capabilities, r.message, ...r.references.map((x) => x.title)].filter(Boolean).join(' ');
  const hit = needCaps.filter((c) => c.re.test(respText) || c.profile.test(respText));
  const needWords = words(invite.need);
  const overlap = [...words(respText)].filter((w) => needWords.has(w)).length;
  const coverage = needCaps.length ? hit.length / needCaps.length : Math.min(1, overlap / 3);
  add('coverage', 'Covers the need', 25 * coverage, 25,
    needCaps.length ? `${hit.length}/${needCaps.length} needed capabilities mentioned${hit.length ? ` (${hit.map((c) => c.label).join(', ')})` : ''}` : `${overlap} key word(s) in common with the need`);

  // References, and which ones match the firm's own TED awards.
  let orgAwards: { title: string; buyer: string | null; url: string | null; key: string }[] = [];
  let tedSiret: string | null = null;
  if (invite.organisation_id) {
    const { rows } = await pool.query<{ name: string; siret: string | null }>(`SELECT name, siret FROM organisations WHERE id = $1`, [invite.organisation_id]);
    if (rows[0]) {
      tedSiret = rows[0].siret;
      const key = aliasKey(rows[0].name);
      const { notices } = await awardIndex();
      orgAwards = notices
        .filter((n) => n.winners.some((w) => aliasKey(w.name) === key))
        .map((n) => ({ title: n.title, buyer: n.buyerName, url: n.url, key: n.buyerKey }));
    }
  }
  const verifiedRefs = r.references.map((ref) => {
    const rw = words(ref.title);
    const rb = fold(ref.buyer);
    const matched = orgAwards.find((a) => {
      const shared = [...words(a.title)].filter((w) => rw.has(w)).length;
      return shared >= 2 || (rb.length >= 4 && a.key.includes(rb) && shared >= 1);
    });
    return { title: ref.title, matched: matched ? { title: matched.title, buyer: matched.buyer, url: matched.url } : null };
  });
  const nVerified = verifiedRefs.filter((v) => v.matched).length;
  add('references', 'References', 5 * Math.min(3, r.references.length) + 5 * Math.min(2, nVerified), 25,
    `${r.references.length} reference(s)${nVerified ? `, ${nVerified} matching their TED awards` : ''}`);

  // Identity: SIRET checksum, and match with the SIRET published on TED.
  const siret = r.siret?.replace(/\s+/g, '') ?? null;
  const siretOk = validSiret(siret);
  const siretMatch = siretOk && tedSiret ? tedSiret.slice(0, 9) === siret!.slice(0, 9) : null;
  add('identity', 'Identity', (siretOk ? 4 : 0) + (siretMatch ? 6 : 0), 10,
    !siret ? 'No SIRET given' : !siretOk ? 'SIRET fails the checksum' : siretMatch ? 'SIRET matches the one on TED' : siretMatch === false ? 'Valid SIRET, differs from TED (another entity of the group?)' : 'Valid SIRET');

  // Speed: hours from sending (or creation) to response.
  const hours = (now.getTime() - (invite.sent_at ?? invite.created_at).getTime()) / 3_600_000;
  add('speed', 'Response time', hours <= 24 ? 10 : hours <= 72 ? 6 : hours <= 168 ? 3 : 0, 10,
    hours < 1 ? 'under an hour' : hours < 48 ? `${Math.round(hours)} h` : `${Math.round(hours / 24)} days`);

  const complete = [r.contactName, r.contactEmail, r.availability, r.role].filter(Boolean).length;
  add('completeness', 'Completeness', complete * 1.25, 5, `${complete}/4 of contact, email, availability, role`);

  const total = r.interest === 'no' ? 0 : parts.reduce((s, p) => s + p.points, 0);
  return { total, parts, verified: { siret: siret ? siretMatch : null, references: verifiedRefs } };
}

export async function respond(token: string, input: ResponseInputT) {
  const i = await inviteByToken(token);
  if (!i) return { status: 404 as const, error: 'Invite not found' };
  if (i.expires_at.getTime() < Date.now()) return { status: 410 as const, error: 'This invite has expired' };
  if (i.responded_at) return { status: 409 as const, error: 'A response was already recorded' };
  const breakdown = await scoreResponse(i, input);
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Write-once: the conditional update wins the race between two submissions.
    const upd = await client.query(
      `UPDATE partner_invites SET responded_at = now(), status = 'responded', opened_at = coalesce(opened_at, now()), updated_at = now()
       WHERE id = $1 AND responded_at IS NULL`,
      [i.id],
    );
    if (upd.rowCount !== 1) {
      await client.query('ROLLBACK');
      return { status: 409 as const, error: 'A response was already recorded' };
    }
    await client.query(
      `INSERT INTO partner_responses (invite_id, interest, role, company_name, siret, contact_name, contact_email, website, capabilities,
         availability, "references", message, score, breakdown)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [i.id, input.interest, input.role ?? null, input.companyName, input.siret, input.contactName, input.contactEmail, input.website,
        input.capabilities, input.availability, JSON.stringify(input.references), input.message, breakdown.total, breakdown],
    );
    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
  return { status: 200 as const, ok: true };
}

/**
 * The signed-in user joins Radar from a response: seed their company profile from
 * what they told us (only if they have none yet) and link the response.
 */
export async function claimFromInvite(userId: string, token: string) {
  const i = await inviteByToken(token);
  if (!i) return { status: 404 as const, error: 'Invite not found' };
  const { rows } = await pool.query<{
    claimed_company_id: string | null; company_name: string | null; capabilities: string | null; siret: string | null; website: string | null;
  }>(`SELECT claimed_company_id, company_name, capabilities, siret, website FROM partner_responses WHERE invite_id = $1`, [i.id]);
  const r = rows[0];
  if (!r) return { status: 409 as const, error: 'Respond to the invite first' };
  const own = await pool.query<{ id: string; user_id: string | null }>(`SELECT id, user_id FROM companies WHERE user_id = $1`, [userId]);
  if (r.claimed_company_id && r.claimed_company_id !== own.rows[0]?.id) {
    return { status: 409 as const, error: 'This response is already linked to another account' };
  }
  if (own.rows[0]?.id === i.company_id) return { status: 409 as const, error: 'You sent this invite; it is for the partner to claim' };
  let companyId = own.rows[0]?.id ?? null;
  let created = false;
  if (!companyId) {
    const services = (r.capabilities ?? '')
      .split(/\n|;|•|,/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 3)
      .slice(0, 8);
    const ins = await pool.query<{ id: string }>(
      `INSERT INTO companies (user_id, name, description, services, profile)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [userId, r.company_name || i.partner_name, r.capabilities?.slice(0, 500) ?? null, services,
        { siret: r.siret, website: r.website, organisationId: i.organisation_id, joinedVia: 'partner-invite' }],
    );
    companyId = ins.rows[0].id;
    created = true;
  }
  await pool.query(`UPDATE partner_responses SET claimed_company_id = $2 WHERE invite_id = $1`, [i.id, companyId]);
  return { status: 200 as const, companyId, created };
}
