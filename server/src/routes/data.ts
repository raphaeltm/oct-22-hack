// Read-only JSON routes over the imported TED data.
import { Hono } from 'hono';
import { sql, type SQL } from 'drizzle-orm';
import { db } from '../db';

export const data = new Hono();

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function paging(limitRaw?: string, offsetRaw?: string, max = 200) {
  const limit = Math.min(Math.max(Number(limitRaw) || 50, 1), max);
  const offset = Math.max(Number(offsetRaw) || 0, 0);
  return { limit, offset };
}

const tenderColumns = sql`
  t.id, t.publication_number AS "publicationNumber", t.notice_type AS "noticeType", t.title,
  t.description, t.buyer_name AS "buyerName", t.buyer_country AS "buyerCountry", t.cpv_codes AS "cpvCodes",
  t.estimated_value::float8 AS "estimatedValue", t.currency, t.deadline, t.publication_date AS "publicationDate", t.url`;

// GET /api/tenders?q=&cpv=&open=1&scope=both|name|description&limit=&offset=
data.get('/tenders', async (c) => {
  const q = c.req.query('q')?.trim();
  const cpv = c.req.query('cpv')?.trim();
  const open = c.req.query('open');
  const type = c.req.query('type')?.trim();
  const scope = c.req.query('scope')?.trim() as 'name' | 'description' | 'both' | undefined;
  const { limit, offset } = paging(c.req.query('limit'), c.req.query('offset'));

  const where: SQL[] = [];
  if (q) {
    if (scope === 'name') {
      where.push(sql`to_tsvector('french', t.title) @@ websearch_to_tsquery('french', ${q})`);
    } else if (scope === 'description') {
      where.push(sql`to_tsvector('french', coalesce(t.description, '')) @@ websearch_to_tsquery('french', ${q})`);
    } else {
      where.push(sql`t.search @@ websearch_to_tsquery('french', ${q})`);
    }
  }
  if (cpv) {
    const prefixes = cpv.split(',').map((p) => p.trim()).filter(Boolean);
    where.push(
      sql`EXISTS (SELECT 1 FROM unnest(t.cpv_codes) code WHERE ${sql.join(
        prefixes.map((p) => sql`code LIKE ${p + '%'}`),
        sql` OR `,
      )})`,
    );
  }
  if (open === '1' || open === 'true') where.push(sql`t.notice_type = 'cn-standard' AND t.deadline > now()`);
  if (type) where.push(sql`t.notice_type = ${type}`);
  const whereSql = where.length ? sql`WHERE ${sql.join(where, sql` AND `)}` : sql``;

  const rankExpr = q
    ? scope === 'name'
      ? sql`ts_rank(to_tsvector('french', t.title), websearch_to_tsquery('french', ${q}))`
      : scope === 'description'
        ? sql`ts_rank(to_tsvector('french', coalesce(t.description, '')), websearch_to_tsquery('french', ${q}))`
        : sql`ts_rank(t.search, websearch_to_tsquery('french', ${q}))`
    : null;

  const orderSql = rankExpr
    ? sql`ORDER BY ${rankExpr} DESC, t.publication_date DESC`
    : open === '1' || open === 'true'
      ? sql`ORDER BY t.deadline ASC`
      : sql`ORDER BY t.publication_date DESC NULLS LAST`;

  const keywordCountCol = q
    ? sql`, (SELECT count(*)::int FROM regexp_matches(coalesce(t.description, ''), ${q}, 'gi')) AS "keywordCount"`
    : sql`, 0 AS "keywordCount"`;

  const [rows, count] = await Promise.all([
    db.execute(sql`
      SELECT ${tenderColumns},
        (SELECT count(*)::int FROM awards a WHERE a.tender_id = t.id) AS "awardCount"
        ${keywordCountCol}
      FROM tenders t ${whereSql} ${orderSql} LIMIT ${limit} OFFSET ${offset}`),
    db.execute(sql`SELECT count(*)::int AS total FROM tenders t ${whereSql}`),
  ]);
  return c.json({ total: (count.rows[0] as { total: number }).total, limit, offset, tenders: rows.rows });
});

// GET /api/tenders/buyer-analytics?buyers=buyer1,buyer2,...
data.get('/tenders/buyer-analytics', async (c) => {
  const { rows } = await db.execute(sql`
    WITH buyer_stats AS (
      SELECT
        lower(trim(t.buyer_name)) AS buyer_key,
        t.buyer_name,
        count(*) FILTER (WHERE t.notice_type = 'cn-standard' AND t.deadline > now())::int AS "openTenders",
        count(*) FILTER (WHERE t.notice_type LIKE 'can-%')::int AS "pastAwards",
        count(*)::int AS "totalNotices"
      FROM tenders t
      WHERE t.buyer_name IS NOT NULL
      GROUP BY lower(trim(t.buyer_name)), t.buyer_name
    ),
    winner_concentration AS (
      SELECT
        lower(trim(t.buyer_name)) AS buyer_key,
        CASE WHEN count(a.id) = 0 THEN 0
          ELSE (max(winner_counts.cnt)::float / count(a.id)::float * 100)::int
        END AS "winnerConcentration"
      FROM tenders t
      JOIN awards a ON a.tender_id = t.id
      LEFT JOIN LATERAL (
        SELECT a2.winner_name, count(*)::int AS cnt
        FROM awards a2
        JOIN tenders t2 ON t2.id = a2.tender_id
        WHERE lower(trim(t2.buyer_name)) = lower(trim(t.buyer_name))
        GROUP BY a2.winner_name
        ORDER BY cnt DESC
        LIMIT 1
      ) winner_counts ON true
      WHERE t.buyer_name IS NOT NULL
      GROUP BY lower(trim(t.buyer_name))
    )
    SELECT
      bs.buyer_key,
      bs.buyer_name AS "buyerName",
      bs."openTenders",
      bs."pastAwards",
      bs."totalNotices",
      coalesce(wc."winnerConcentration", 0) AS "winnerConcentration"
    FROM buyer_stats bs
    LEFT JOIN winner_concentration wc ON wc.buyer_key = bs.buyer_key
    ORDER BY bs."totalNotices" DESC
    LIMIT 200`);
  return c.json({ buyers: rows });
});

// GET /api/tenders/:id  (id = uuid or TED publication number)
data.get('/tenders/:id', async (c) => {
  const id = c.req.param('id');
  const match = UUID_RE.test(id) ? sql`t.id = ${id}` : sql`t.publication_number = ${id}`;
  const { rows } = await db.execute(sql`SELECT ${tenderColumns} FROM tenders t WHERE ${match}`);
  const tender = rows[0] as { id: string } | undefined;
  if (!tender) return c.json({ error: 'not found' }, 404);
  const awards = await db.execute(sql`
    SELECT a.id, a.winner_name AS "winnerName", a.winner_country AS "winnerCountry",
      a.value::float8 AS value, a.currency, a.award_date AS "awardDate",
      a.organisation_id AS "organisationId", o.name AS "organisationName"
    FROM awards a LEFT JOIN organisations o ON o.id = a.organisation_id
    WHERE a.tender_id = ${tender.id} ORDER BY a.winner_name`);
  return c.json({ ...tender, awards: awards.rows });
});

// GET /api/competitors?q=&limit=&offset=  organisations ranked by wins
data.get('/competitors', async (c) => {
  const q = c.req.query('q')?.trim();
  const { limit, offset } = paging(c.req.query('limit'), c.req.query('offset'));
  const whereSql = q ? sql`WHERE o.normalised_name ILIKE ${'%' + q.toLowerCase() + '%'} OR o.name ILIKE ${'%' + q + '%'}` : sql``;
  const { rows } = await db.execute(sql`
    SELECT o.id, o.name, o.normalised_name AS "normalisedName", o.country, o.website, o.summary,
      count(a.id)::int AS wins,
      count(DISTINCT t.buyer_name)::int AS buyers,
      coalesce(sum(a.value), 0)::float8 AS "totalValue",
      max(a.award_date) AS "lastWin"
    FROM organisations o
    JOIN awards a ON a.organisation_id = o.id
    JOIN tenders t ON t.id = a.tender_id
    ${whereSql}
    GROUP BY o.id
    ORDER BY wins DESC, "totalValue" DESC
    LIMIT ${limit} OFFSET ${offset}`);
  return c.json({ limit, offset, competitors: rows });
});

// GET /api/competitors/:id  award history
data.get('/competitors/:id', async (c) => {
  const id = c.req.param('id');
  if (!UUID_RE.test(id)) return c.json({ error: 'not found' }, 404);
  const { rows } = await db.execute(sql`
    SELECT o.id, o.name, o.normalised_name AS "normalisedName", o.country, o.website, o.summary,
      o.last_researched_at AS "lastResearchedAt"
    FROM organisations o WHERE o.id = ${id}`);
  const org = rows[0];
  if (!org) return c.json({ error: 'not found' }, 404);
  const awards = await db.execute(sql`
    SELECT a.id, a.winner_name AS "winnerName", a.value::float8 AS value, a.currency,
      a.award_date AS "awardDate",
      t.id AS "tenderId", t.publication_number AS "publicationNumber", t.title,
      t.buyer_name AS "buyerName", t.cpv_codes AS "cpvCodes", t.publication_date AS "publicationDate", t.url,
      (SELECT count(*)::int FROM awards a2 WHERE a2.tender_id = t.id) AS "coWinners"
    FROM awards a JOIN tenders t ON t.id = a.tender_id
    WHERE a.organisation_id = ${id}
    ORDER BY a.award_date DESC NULLS LAST`);
  const list = awards.rows as { value: number | null; buyerName: string | null }[];
  const notes = await db.execute(sql`
    SELECT n.id, n.source, n.content, n.url, n.created_at AS "createdAt"
    FROM research_notes n WHERE n.organisation_id = ${id}
    ORDER BY n.created_at DESC LIMIT 50`);
  return c.json({
    ...org,
    wins: list.length,
    totalValue: list.reduce((s, a) => s + (a.value ?? 0), 0),
    awards: list,
    notes: notes.rows,
  });
});
