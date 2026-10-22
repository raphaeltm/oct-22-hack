import { sql } from 'drizzle-orm';
import {
  customType,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

const tsvector = customType<{ data: string }>({ dataType: () => 'tsvector' });

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

// One company per user for now. user_id is the BetterAuth user id (no FK:
// BetterAuth owns its own tables).
export const companies = pgTable('companies', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: text('user_id').unique(),
  name: text('name').notNull(),
  description: text('description'),
  services: text('services').array().notNull().default(sql`'{}'`),
  sectors: text('sectors').array().notNull().default(sql`'{}'`),
  regions: text('regions').array().notNull().default(sql`'{}'`),
  cpvCodes: text('cpv_codes').array().notNull().default(sql`'{}'`),
  size: text('size'),
  differentiators: text('differentiators').array().notNull().default(sql`'{}'`),
  // Free-form extras the agent learns (past wins, known competitors, ...).
  profile: jsonb('profile').$type<Record<string, unknown>>().notNull().default({}),
  ...timestamps,
});

// TED notices: cn-standard (open tenders) and can-standard (awards).
// Text is mostly French; search uses the 'french' config.
export const tenders = pgTable(
  'tenders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    publicationNumber: text('publication_number').notNull().unique(),
    noticeType: text('notice_type').notNull(),
    title: text('title').notNull(),
    description: text('description'),
    buyerName: text('buyer_name'),
    buyerCountry: text('buyer_country'),
    cpvCodes: text('cpv_codes').array().notNull().default(sql`'{}'`),
    estimatedValue: numeric('estimated_value', { mode: 'number' }),
    currency: text('currency'),
    deadline: timestamp('deadline', { withTimezone: true }),
    publicationDate: timestamp('publication_date', { withTimezone: true }),
    url: text('url'),
    // eForms procedure identifier (BT-04): shared by a tender and its award notice.
    procedureId: text('procedure_id'),
    raw: jsonb('raw'),
    // When the notice XML was read for tendering parties (groupements); null = not yet.
    partiesFetchedAt: timestamp('parties_fetched_at', { withTimezone: true }),
    search: tsvector('search').generatedAlwaysAs(
      sql`setweight(to_tsvector('french', coalesce(title, '')), 'A') || setweight(to_tsvector('french', coalesce(buyer_name, '')), 'B') || setweight(to_tsvector('french', coalesce(description, '')), 'C')`,
    ),
    ...timestamps,
  },
  (t) => [
    index('tenders_search_idx').using('gin', t.search),
    index('tenders_cpv_idx').using('gin', t.cpvCodes),
    index('tenders_type_deadline_idx').on(t.noticeType, t.deadline),
    index('tenders_buyer_idx').on(t.buyerName),
    index('tenders_procedure_idx').on(t.procedureId),
  ],
);

// Normalised companies seen as winners (i.e. competitors).
export const organisations = pgTable('organisations', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name').notNull(),
  normalisedName: text('normalised_name').notNull().unique(),
  country: text('country'),
  website: text('website'),
  summary: text('summary'),
  // From eForms notice XML (Organization block): SIRET, location and the contact
  // email published in the notice (contactSource = that notice's publication number).
  siret: text('siret'),
  city: text('city'),
  nuts: text('nuts'),
  contactEmail: text('contact_email'),
  contactSource: text('contact_source'),
  lastResearchedAt: timestamp('last_researched_at', { withTimezone: true }),
  ...timestamps,
});

// One row per winner per award notice (frameworks often have many winners).
export const awards = pgTable(
  'awards',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenderId: uuid('tender_id').notNull().references(() => tenders.id, { onDelete: 'cascade' }),
    organisationId: uuid('organisation_id').references(() => organisations.id, { onDelete: 'set null' }),
    winnerName: text('winner_name').notNull(),
    winnerCountry: text('winner_country'),
    value: numeric('value', { mode: 'number' }),
    currency: text('currency'),
    awardDate: timestamp('award_date', { withTimezone: true }),
    createdAt: timestamps.createdAt,
  },
  (t) => [
    index('awards_tender_idx').on(t.tenderId),
    index('awards_org_idx').on(t.organisationId),
  ],
);

export const researchNotes = pgTable(
  'research_notes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }),
    organisationId: uuid('organisation_id').references(() => organisations.id, { onDelete: 'cascade' }),
    tenderId: uuid('tender_id').references(() => tenders.id, { onDelete: 'cascade' }),
    source: text('source').notNull(), // 'ted' | 'keenable' | 'chat'
    content: text('content').notNull(),
    url: text('url'),
    createdAt: timestamps.createdAt,
  },
  (t) => [index('research_notes_org_idx').on(t.organisationId)],
);

export const tenderMatches = pgTable(
  'tender_matches',
  {
    companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
    tenderId: uuid('tender_id').notNull().references(() => tenders.id, { onDelete: 'cascade' }),
    score: real('score').notNull(),
    rationale: text('rationale'),
    signals: jsonb('signals').$type<Record<string, unknown>>(),
    createdAt: timestamps.createdAt,
  },
  (t) => [primaryKey({ columns: [t.companyId, t.tenderId] })],
);

// ---------- Autopilot (issue #19) ----------

// Pre-bid dossier the agent builds on its own when a tender matches a company.
export const prebidDossiers = pgTable(
  'prebid_dossiers',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
    tenderId: uuid('tender_id').notNull().references(() => tenders.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('queued'), // queued | running | ready | failed
    trigger: text('trigger').notNull().default('autopilot'), // autopilot | manual
    score: real('score'),
    content: jsonb('content').$type<Record<string, unknown>>(),
    error: text('error'),
    seenAt: timestamp('seen_at', { withTimezone: true }),
    ...timestamps,
  },
  (t) => [uniqueIndex('prebid_dossiers_company_tender_idx').on(t.companyId, t.tenderId)],
);

// What the agent predicted for a tender (likely bidders, possible incumbent),
// graded later against the award notice (same procedure id).
export const predictions = pgTable(
  'predictions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    companyId: uuid('company_id').references(() => companies.id, { onDelete: 'cascade' }),
    tenderId: uuid('tender_id').notNull().references(() => tenders.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(), // competitor | incumbent
    source: text('source').notNull().default('live'), // live | backtest
    organisationId: uuid('organisation_id').references(() => organisations.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    aliasKey: text('alias_key').notNull(),
    rank: integer('rank').notNull(),
    outcome: text('outcome').notNull().default('pending'), // pending | hit | miss
    awardTenderId: uuid('award_tender_id').references(() => tenders.id, { onDelete: 'set null' }),
    gradedAt: timestamp('graded_at', { withTimezone: true }),
    createdAt: timestamps.createdAt,
  },
  (t) => [
    index('predictions_tender_idx').on(t.tenderId),
    index('predictions_outcome_idx').on(t.source, t.outcome),
  ],
);

// Bid / skip / won / lost decisions with a reason; the match scorer learns from these.
export const tenderFeedback = pgTable(
  'tender_feedback',
  {
    companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
    tenderId: uuid('tender_id').notNull().references(() => tenders.id, { onDelete: 'cascade' }),
    decision: text('decision').notNull(), // bid | skip | won | lost
    reason: text('reason'), // scope | too_large | too_small | buyer | region | deadline | incumbent | other
    note: text('note'),
    // Snapshot of the match signals when the decision was made.
    signals: jsonb('signals').$type<Record<string, unknown>>(),
    ...timestamps,
  },
  (t) => [primaryKey({ columns: [t.companyId, t.tenderId] })],
);

// ---------- Partner finder ----------

// Groupements (co-contracting groups) from eForms award notices: one row per
// tendering party with 2+ members. Evidence that these firms bid together.
export const consortia = pgTable(
  'consortia',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tenderId: uuid('tender_id').notNull().references(() => tenders.id, { onDelete: 'cascade' }),
    partyRef: text('party_ref').notNull(), // eForms TPA-xxxx
    name: text('name'),
    won: integer('won').notNull().default(1), // 1 = referenced by a settled contract / lot result
    createdAt: timestamps.createdAt,
  },
  (t) => [uniqueIndex('consortia_tender_party_idx').on(t.tenderId, t.partyRef)],
);

export const consortiumMembers = pgTable(
  'consortium_members',
  {
    consortiumId: uuid('consortium_id').notNull().references(() => consortia.id, { onDelete: 'cascade' }),
    orgRef: text('org_ref').notNull(), // eForms ORG-xxxx
    organisationId: uuid('organisation_id').references(() => organisations.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    leader: integer('leader').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.consortiumId, t.orgRef] }), index('consortium_members_org_idx').on(t.organisationId)],
);

// Outreach from a company to a potential partner for one tender. The token is a
// capability for the public response page (/p/:token): it only reveals this
// invite's tender summary and accepts one response.
export const partnerInvites = pgTable(
  'partner_invites',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    token: text('token').notNull().unique(),
    companyId: uuid('company_id').notNull().references(() => companies.id, { onDelete: 'cascade' }),
    tenderId: uuid('tender_id').notNull().references(() => tenders.id, { onDelete: 'cascade' }),
    organisationId: uuid('organisation_id').references(() => organisations.id, { onDelete: 'set null' }),
    partnerName: text('partner_name').notNull(),
    contactEmail: text('contact_email'),
    role: text('role').notNull(), // cotraitant | sous-traitant | mandataire
    need: text('need').notNull(), // what we need from the partner (shown to them)
    subject: text('subject').notNull(),
    body: text('body').notNull(),
    fitScore: real('fit_score'),
    signals: jsonb('signals').$type<Record<string, unknown>>(),
    status: text('status').notNull().default('draft'), // draft | sent | opened | responded
    sentAt: timestamp('sent_at', { withTimezone: true }),
    openedAt: timestamp('opened_at', { withTimezone: true }),
    respondedAt: timestamp('responded_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ...timestamps,
  },
  (t) => [
    index('partner_invites_company_idx').on(t.companyId, t.tenderId),
    index('partner_invites_org_idx').on(t.organisationId),
  ],
);

// The partner's answer (untrusted input) and how it scored.
export const partnerResponses = pgTable('partner_responses', {
  inviteId: uuid('invite_id').primaryKey().references(() => partnerInvites.id, { onDelete: 'cascade' }),
  interest: text('interest').notNull(), // yes | maybe | no
  role: text('role'),
  companyName: text('company_name'),
  siret: text('siret'),
  contactName: text('contact_name'),
  contactEmail: text('contact_email'),
  website: text('website'),
  capabilities: text('capabilities'),
  availability: text('availability'),
  references: jsonb('references').$type<{ title: string; buyer?: string; year?: string }[]>().notNull().default([]),
  message: text('message'),
  score: real('score'),
  breakdown: jsonb('breakdown').$type<Record<string, unknown>>(),
  // Company created when the partner signed up from the response page (network effect).
  claimedCompanyId: uuid('claimed_company_id').references(() => companies.id, { onDelete: 'set null' }),
  createdAt: timestamps.createdAt,
});

export type Company = typeof companies.$inferSelect;
export type Tender = typeof tenders.$inferSelect;
export type Organisation = typeof organisations.$inferSelect;
export type Award = typeof awards.$inferSelect;
