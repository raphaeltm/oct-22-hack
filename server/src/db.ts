import pg from 'pg';

// App data (company profiles, tenders, scored matches, decisions) lives in
// Postgres next to Mastra's memory tables. Schema is applied on boot.

// For Aiven PostgreSQL use ...?sslmode=no-verify (TLS with Aiven's project CA).
export const DATABASE_URL = process.env.DATABASE_URL ?? 'postgres://app:app@localhost:5432/app';
export const pool = new pg.Pool({ connectionString: DATABASE_URL });

export async function migrate() {
  await pool.query(`
    create table if not exists companies (
      id serial primary key,
      name text not null,
      pitch text not null default '',
      cpv text[] not null default '{}',
      countries text[] not null default '{}',
      keywords text[] not null default '{}',
      min_value numeric,
      max_value numeric,
      learned_rules text not null default '',
      created_at timestamptz not null default now()
    );
    create table if not exists past_bids (
      id serial primary key,
      company_id int not null references companies(id) on delete cascade,
      title text not null,
      buyer text not null default '',
      year int,
      value numeric,
      outcome text not null default 'won',
      summary text not null default ''
    );
    create table if not exists tenders (
      id text primary key,
      title text not null,
      buyer text not null default '',
      country text not null default '',
      cpv text[] not null default '{}',
      notice_type text not null default '',
      nature text not null default '',
      value numeric,
      currency text,
      published date,
      deadline timestamptz,
      description text not null default '',
      url text not null,
      raw jsonb,
      ingested_at timestamptz not null default now()
    );
    create table if not exists matches (
      company_id int not null references companies(id) on delete cascade,
      tender_id text not null references tenders(id) on delete cascade,
      score int not null,
      verdict text not null,
      headline text not null default '',
      reasons jsonb not null default '[]',
      risks jsonb not null default '[]',
      effort text,
      scored_by text not null,
      brief text,
      decision text,
      decision_reason text,
      decided_at timestamptz,
      scored_at timestamptz not null default now(),
      primary key (company_id, tender_id)
    );
    -- score before the latest re-read, so the UI can show what the team's rules changed
    alter table matches add column if not exists prev_score int;
    create table if not exists scans (
      id serial primary key,
      company_id int not null references companies(id) on delete cascade,
      started_at timestamptz not null default now(),
      finished_at timestamptz,
      fetched int not null default 0,
      fresh int not null default 0,
      error text
    );
  `);
}

export type Company = {
  id: number;
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
  id: number;
  title: string;
  buyer: string;
  year: number | null;
  value: number | null;
  outcome: 'won' | 'lost';
  summary: string;
};

export async function getCompany(id: number): Promise<Company | null> {
  const { rows } = await pool.query('select * from companies where id = $1', [id]);
  return rows[0] ? normalizeCompany(rows[0]) : null;
}

export async function listCompanies(): Promise<Company[]> {
  const { rows } = await pool.query('select * from companies order by id');
  return rows.map(normalizeCompany);
}

function normalizeCompany(r: any): Company {
  return {
    ...r,
    min_value: r.min_value == null ? null : Number(r.min_value),
    max_value: r.max_value == null ? null : Number(r.max_value),
  };
}

export async function getPastBids(companyId: number): Promise<PastBid[]> {
  const { rows } = await pool.query('select * from past_bids where company_id = $1 order by year desc nulls last, id', [
    companyId,
  ]);
  return rows.map((r) => ({ ...r, value: r.value == null ? null : Number(r.value) }));
}

export async function getDecisions(companyId: number, limit = 12) {
  const { rows } = await pool.query(
    `select t.title, t.buyer, t.country, t.cpv, t.value, m.score, m.verdict, m.decision, m.decision_reason, m.decided_at
       from matches m join tenders t on t.id = m.tender_id
      where m.company_id = $1 and m.decision is not null
      order by m.decided_at desc limit $2`,
    [companyId, limit],
  );
  return rows as {
    title: string;
    buyer: string;
    country: string;
    cpv: string[];
    value: string | null;
    score: number;
    verdict: string;
    decision: 'go' | 'no-go';
    decision_reason: string | null;
    decided_at: string;
  }[];
}
