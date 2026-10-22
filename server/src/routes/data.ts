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

// GET /api/tenders?q=&cpv=&open=1&limit=&offset=
data.get('/tenders', async (c) => {
  const q = c.req.query('q')?.trim();
  const cpv = c.req.query('cpv')?.trim();
  const open = c.req.query('open');
  const type = c.req.query('type')?.trim();
  const { limit, offset } = paging(c.req.query('limit'), c.req.query('offset'));

  const where: SQL[] = [];
  if (q) where.push(sql`t.search @@ websearch_to_tsquery('french', ${q})`);
  if (cpv) {
    // cpv=72 matches any code starting with 72; comma-separated for several.
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
  const orderSql = q
    ? sql`ORDER BY ts_rank(t.search, websearch_to_tsquery('french', ${q})) DESC, t.publication_date DESC`
    : open === '1' || open === 'true'
      ? sql`ORDER BY t.deadline ASC`
      : sql`ORDER BY t.publication_date DESC NULLS LAST`;

  const [rows, count] = await Promise.all([
    db.execute(sql`
      SELECT ${tenderColumns},
        (SELECT count(*)::int FROM awards a WHERE a.tender_id = t.id) AS "awardCount"
      FROM tenders t ${whereSql} ${orderSql} LIMIT ${limit} OFFSET ${offset}`),
    db.execute(sql`SELECT count(*)::int AS total FROM tenders t ${whereSql}`),
  ]);
  return c.json({ total: (count.rows[0] as { total: number }).total, limit, offset, tenders: rows.rows });
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
  return c.json({
    ...org,
    wins: list.length,
    totalValue: list.reduce((s, a) => s + (a.value ?? 0), 0),
    awards: list,
  });
});
