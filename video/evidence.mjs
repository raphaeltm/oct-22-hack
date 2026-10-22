// Evidence pack ("Evidence it works"): drives the live dev app as the fictional
// demo company through the joint-bidding loop, reads the live backtests and
// writes a PDF with stamped screenshots. Nothing is mocked; the one partner
// reply is typed by us on the public page and labelled as simulated.
//
// Usage: node evidence.mjs [baseUrl] [out.pdf]
import { chromium } from 'playwright';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE = process.argv[2] || 'https://r1-app-3000-01m5hdrkrrdjwzypfyr1tmy68g.apps.simple-agent-manager.org';
const OUT = process.argv[3] ?? 'out/radar-evidence.pdf';
const EMAIL = process.env.DEMO_EMAIL ?? 'demo@rivage-numerique.fr';
const PASSWORD = process.env.DEMO_PASSWORD ?? 'rivage-demo-2026';
await mkdir(path.dirname(OUT), { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const shots = [];
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

async function capture(caption, { scrollTo, frames = 1 } = {}) {
  if (scrollTo) await page.locator(scrollTo).first().scrollIntoViewIfNeeded().catch(() => {});
  for (let f = 0; f < frames; f++) {
    if (f) {
      const moved = await page.evaluate(() => {
        const els = [...document.querySelectorAll('*')].filter((e) => {
          const o = getComputedStyle(e).overflowY;
          return (o === 'auto' || o === 'scroll') && e.scrollHeight > e.clientHeight + 40;
        });
        const el = els.sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0] ?? document.scrollingElement;
        const before = el.scrollTop;
        el.scrollTop = before + el.clientHeight * 0.85;
        return el.scrollTop > before + 20;
      });
      if (!moved) break;
      await page.waitForTimeout(500);
    }
    shots.push({ url: page.url(), caption: f ? `${caption} (continued)` : caption, png: (await page.screenshot()).toString('base64'), at: new Date().toISOString() });
  }
  log('captured', caption);
}
const go = async (p, wait = 2500) => {
  await page.goto(BASE + p, { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(wait);
};

// ---- sign in (BetterAuth cookie lands in the browser context)
const res = await ctx.request.post(BASE + '/api/auth/sign-in/email', { data: { email: EMAIL, password: PASSWORD }, headers: { origin: BASE } });
if (!res.ok()) throw new Error(`sign-in failed: ${res.status()}`);
const getJson = async (p) => {
  const r = await ctx.request.get(BASE + p);
  if (!r.ok()) throw new Error(`${p}: ${r.status()}`);
  return r.json();
};
const timed = async (p) => {
  const t0 = performance.now();
  const body = await getJson(p);
  return { body, ms: Math.round(performance.now() - t0) };
};

// ---- live numbers
let partnerBt = await getJson('/api/partners/backtest');
for (let i = 0; i < 30 && typeof partnerBt.cases !== 'number'; i++) {
  log('waiting for the partner backtest job…');
  await new Promise((r) => setTimeout(r, 10_000));
  partnerBt = await getJson('/api/partners/backtest');
}
const scorecard = await getJson('/api/autopilot/scorecard');
const matchesRaw = await getJson('/api/matches');
const matches = Array.isArray(matchesRaw) ? matchesRaw : matchesRaw.matches ?? [];
const together = matches.filter((m) => m.teaming && (m.teaming.gaps?.length || m.teaming.large));
const days = (d) => (d ? (Date.parse(d) - Date.now()) / 86_400_000 : -1);
// A tender with time left to form a groupement, with gaps to fill.
const pick = together.filter((m) => days(m.tender?.deadline) >= 10 && m.teaming.gaps?.length).sort((a, b) => b.score - a.score)[0] ?? together[0];
if (!pick) throw new Error('no "Bid together" match for the demo company');
const tenderId = pick.tender?.id ?? pick.tenderId;

// Partner finder latency on the live app (3 runs, median).
const runs = [];
for (let i = 0; i < 3; i++) runs.push(await timed(`/api/tenders/${tenderId}/partners`));
const finder = runs[0].body;
const latency = runs.map((r) => r.ms).sort((a, b) => a - b)[1];
const withJoint = finder.partners.filter((p) => p.coBids?.length).length;
const coversGap = finder.partners.filter((p) => p.covers?.length).length;
const sourced = finder.partners.filter((p) => p.evidence?.length).length;
log('picked', finder.tender.publicationNumber, 'partners', finder.partners.length, 'latency', latency);

// ---- the journey
await go('/partners');
await capture('Bid together, the home page after sign-in: the groupement pipeline (invites, replies, scores) and the live partner backtest.');
await go('/tenders?together=1');
await capture(`Opportunities filtered to "Bid together": ${together.length} of ${matches.length} matches need a partner (capability gap or too big for a 40-person firm).`);
await go(`/tenders/${tenderId}`, 6000);
await capture(`Tender ${finder.tender.publicationNumber}: the partner finder names the gaps (${finder.gaps.map((g) => g.label).join(', ') || 'none'}) and ranks co-bidders from TED evidence.`, { frames: 3 });

// Draft the invite for the top partner (the user sends it; Radar never emails).
const top = finder.partners[0];
const created = await ctx.request.post(BASE + '/api/partners/invites', {
  data: { tenderId, organisationId: top.organisationId, role: top.role, need: (top.covers?.length ? top.covers : finder.gaps.map((g) => g.label)).join(', ') || 'Renfort de capacité', fitScore: top.score },
  headers: { origin: BASE },
});
if (!created.ok()) throw new Error(`invite failed: ${created.status()} ${await created.text()}`);
const { invite } = await created.json();
await ctx.request.post(BASE + `/api/partners/invites/${invite.id}/sent`, { data: {}, headers: { origin: BASE } });
log('invite', invite.id);

// The partner's side: a fresh browser with no session opens the private link.
const pctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const pp = await pctx.newPage();
await pp.goto(invite.link, { waitUntil: 'networkidle' });
await pp.waitForTimeout(1500);
const prevPage = page;
const partnerShot = async (caption) => {
  shots.push({ url: pp.url().replace(/\/p\/[^/?#]+/, '/p/<token>'), caption, png: (await pp.screenshot({ fullPage: true })).toString('base64'), at: new Date().toISOString() });
  log('captured', caption);
};
await partnerShot(`The partner opens the private invite link (no account needed): tender summary, the gap, the proposed role.`);
const ref = top.evidence?.[0];
await pp.getByLabel('SIRET').fill(top.siret ?? '');
await pp.getByLabel('Votre nom').fill('Réponse simulée (démo Radar)');
await pp.locator('textarea[placeholder^="Compétences"]').fill(`${(top.covers ?? []).join(', ') || 'Renfort de capacité'}. Réponse saisie par l'équipe Radar pour la démonstration.`);
await pp.getByLabel('Disponibilité', { exact: false }).fill('2 consultants à partir de janvier').catch(() => {});
if (ref) {
  await pp.getByLabel('Référence 1 : intitulé').fill(ref.title.slice(0, 300));
  if (ref.buyer) await pp.getByLabel('Référence 1 : acheteur').fill(ref.buyer.slice(0, 200));
  if (ref.date) await pp.getByLabel('Référence 1 : année').fill(ref.date.slice(0, 4));
}
await pp.locator('textarea').last().fill("SIMULATION : réponse saisie par l'équipe Radar pour démontrer le parcours. Ce partenaire n'a pas été contacté.");
await partnerShot('Partner reply form (filled by us as a labelled simulation, with a real reference from the partner\'s own TED awards).');
await pp.getByRole('button', { name: /Envoyer/ }).click();
await pp.waitForTimeout(2500);
await partnerShot('After replying, the partner is invited to open their own Radar: every invite can bring a new firm onto the network.');
await pctx.close();

// Back as the inviting firm: the reply is scored.
const invites = await getJson(`/api/partners/invites?tenderId=${tenderId}`);
const scored = (invites.invites ?? []).find((i) => i.id === invite.id);
await go('/partners', 3000);
await page.getByRole('button', { name: /response|réponse/i }).first().click().catch(() => {});
await page.waitForTimeout(800);
await capture('The pipeline: the (simulated) reply arrives scored 0–100, with the SIRET and references checked against TED.', { frames: 2 });
await go('/autopilot', 4000);
await capture('Autopilot: dossiers built unprompted, plus the bidder-prediction backtest vs the naive baseline.');
void prevPage;
// Note: answered invites can't be deleted, so each run leaves one labelled
// simulated reply in the demo account.
await browser.close();

// ---- PDF
const pct = (n, d) => (d ? `${Math.round((n / d) * 100)}%` : '—');
const x = (n, d) => (d ? (n / d) : 0);
const bt = partnerBt;
const sc = scorecard;
const resp = scored?.response;
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const now = new Date().toISOString().replace('T', ' ').slice(0, 16) + ' UTC';

const html = `<!doctype html><meta charset="utf-8"><style>
  @page { size: A4 landscape; margin: 0 }
  body{font:13px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif;margin:0;color:#14231b}
  section{page-break-after:always;padding:24px 34px;box-sizing:border-box;height:210mm;overflow:hidden}
  h1{font-size:28px;margin:0 0 4px;letter-spacing:-.01em} h2{font-size:17px;margin:0 0 6px} h3{font-size:14px;margin:14px 0 6px}
  .meta{color:#5d6b63;font-size:10.5px;margin-bottom:10px;word-break:break-all}
  .lede{font-size:14px;color:#2c3d33;margin:2px 0 10px}
  .tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin:8px 0 14px}
  .tile{border:1px solid #d9e2d6;border-radius:10px;padding:14px 16px;background:#f7faf5}
  .tile .k{font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#5d6b63}
  .tile .v{font-size:26px;font-weight:700;margin:4px 0 2px;color:#0f5132}
  .tile .s{font-size:12px;color:#2c3d33}
  table{border-collapse:collapse;width:100%;margin:6px 0 8px;font-size:12.5px} td,th{border-bottom:1px solid #d9e2d6;padding:4px 8px;text-align:left;vertical-align:top}
  th{color:#5d6b63;font-weight:600} tr.us td{font-weight:700;background:#eef6ea}
  .bar{display:inline-block;height:10px;background:#2f7d55;border-radius:2px;vertical-align:middle;margin-right:6px}
  .bar.b{background:#a9b8ae}
  .cols{display:grid;grid-template-columns:1fr 1fr;gap:26px}
  .small{font-size:11.5px;color:#3e4f45} ul{margin:4px 0;padding-left:18px} li{margin:2px 0}
  img{width:100%;max-height:165mm;object-fit:contain;object-position:top;border:1px solid #cfd8cc;border-radius:4px}
  .tag{display:inline-block;font-size:10px;font-weight:700;padding:2px 7px;border-radius:9px;background:#0f5132;color:#fff;margin-right:6px;vertical-align:middle}
  .tag.sim{background:#a15c00}
</style>

<section>
  <span class="tag">LIVE RUN</span><span class="meta">Captured from ${esc(BASE)} on ${now}. Signed in as the fictional demo firm Rivage Numérique (Lyon, ~40 staff). All tender, award and joint-bid data are real TED notices.</span>
  <h1>Radar: evidence it works</h1>
  <p class="lede">Radar helps a small French IT firm win public tenders it can't win alone by finding the right <i>groupement</i> partner from TED's record of who bid with whom. We measured it against naive baselines on real outcomes.</p>
  <div class="tiles">
    <div class="tile"><div class="k">Partner finder · held-out backtest</div><div class="v">${bt.radar.top3} vs ${Math.max(bt.baselineWinners.top3, bt.baselineJointBidders.top3)}</div>
      <div class="s">real partner in the top 3, out of ${bt.cases} real joint bids: Radar vs the best naive baseline (${x(bt.radar.top3, Math.max(bt.baselineWinners.top3, bt.baselineJointBidders.top3)).toFixed(1)}×)</div></div>
    <div class="tile"><div class="k">Bidder prediction · held-out backtest</div><div class="v">${sc.backtest.top5Hits} vs ${sc.baseline.top5Hits}</div>
      <div class="s">actual winner in the top 5, out of ${sc.backtest.graded} past tenders: agent vs naive baseline (${x(sc.backtest.top5Hits, sc.baseline.top5Hits).toFixed(1)}×)</div></div>
    <div class="tile"><div class="k">Partner shortlist · live</div><div class="v">${(latency / 1000).toFixed(1)} s</div>
      <div class="s">to rank ${finder.partners.length} sourced co-bidders for tender ${esc(finder.tender.publicationNumber)}. ${sourced}/${finder.partners.length} link to TED award notices, ${coversGap} cover a named gap and ${withJoint} have bid in a groupement before.</div></div>
  </div>
  <div class="cols">
    <div>
      <h3>1 · Would Radar have found the real partner?</h3>
      <table>
        <tr><th>Method (same ${bt.cases} joint bids)</th><th>Top 3</th><th>Top 10</th></tr>
        ${[['Radar partner finder', bt.radar, true], ['Naive: most frequent winners in the CPV area', bt.baselineWinners], ['Naive: most frequent joint bidders', bt.baselineJointBidders]]
          .map(([l, h, us]) => `<tr class="${us ? 'us' : ''}"><td>${l}</td><td><span class="bar ${us ? '' : 'b'}" style="width:${h.top3 * 6}px"></span>${h.top3} (${pct(h.top3, bt.cases)})</td><td>${h.top10} (${pct(h.top10, bt.cases)})</td></tr>`).join('')}
      </table>
      <p class="small">Each case is a real groupement on a French IT award notice since 2025. The lead firm plays "us", with a profile built only from its own earlier awards. Every method sees only awards and joint bids dated <b>before</b> the bid, and the bid and the rest of its procedure are hidden. Only ${bt.findable} of the ${bt.cases} cases had a partner with any earlier TED record, which caps every method.</p>
    </div>
    <div>
      <h3>2 · Before / after for the firm</h3>
      <table>
        <tr><th></th><th>Without Radar</th><th>With Radar</th></tr>
        <tr><td>Find tenders that need a partner</td><td>Read every notice</td><td>${together.length} of ${matches.length} matches flagged "Bid together", with the gap named</td></tr>
        <tr><td>Find who could fill the gap</td><td>Search award notices by hand; 2025+ joint bids are only in raw eForms XML</td><td>${finder.partners.length} ranked firms in ${(latency / 1000).toFixed(1)} s, each linked to its TED notices</td></tr>
        <tr><td>Know who already teams up</td><td>Not searchable</td><td>${withJoint} of ${finder.partners.length} shortlisted firms have earlier joint bids, shown with the partners and notice</td></tr>
        <tr><td>Approach and qualify</td><td>Cold email, unstructured replies</td><td>French invite drafted; reply scored <b>${resp?.score ?? '—'}/100</b> with SIRET and references checked against TED</td></tr>
      </table>
      <p class="small">Data: TED, buyer country FRA, CPV 72*, 2025+ (≈6.9k notices). 199 of 2,610 award notices flag a joint bid, and Radar parsed 119 groupements from their eForms XML. The bidder-prediction backtest replays ${sc.backtest.graded} tenders using only earlier awards; the baseline is the 5 most frequent winners in the CPV area.</p>
    </div>
  </div>
</section>

<section>
  <h2>Partner backtest: examples (live from GET /api/partners/backtest, run ${esc(bt.ranAt?.slice(0, 16).replace('T', ' '))} UTC)</h2>
  <table>
    <tr><th>TED notice</th><th>Lead ("us")</th><th>Real partner(s)</th><th>Radar rank</th><th>Naive rank</th><th>Radar's top 5</th></tr>
    ${bt.examples.slice(0, 8).map((e) => `<tr><td>${esc(e.publicationNumber)}<br><span class="small">${esc(e.title.slice(0, 70))} · ${esc(e.buyer ?? '')}</span></td><td>${esc(e.lead)}</td><td>${esc(e.partners.slice(0, 3).join(', '))}</td><td><b>${e.rank ?? '—'}</b></td><td>${e.baselineRank ?? '—'}</td><td class="small">${esc(e.shortlist.join(', '))}</td></tr>`).join('')}
  </table>
  <ul class="small">${bt.notes.map((n) => `<li>${esc(n)}</li>`).join('')}</ul>
</section>

<section>
  <h2>The joint-bidding loop in this run, and honest limits</h2>
  ${resp ? `<h3>The scored reply in this run <span class="tag sim">SIMULATED REPLY</span></h3>
  <table><tr><th>Part</th><th>Points</th><th>Note</th></tr>${(resp.breakdown?.parts ?? []).map((p) => `<tr><td>${esc(p.label)}</td><td>${p.points}/${p.max}</td><td class="small">${esc(p.note)}</td></tr>`).join('')}
  <tr class="us"><td>Total</td><td>${resp.score}/100</td><td class="small">Invite to ${esc(top.name)} for ${esc(finder.tender.publicationNumber)}</td></tr></table>` : ''}
  <p><b>Honest limits.</b> Absolute hit rates are low: who teams with whom depends on relationships that public data doesn't capture, and many 2025 partners had no earlier TED record. One ranking rule (no overlap penalty for capacity partners) was changed after looking at this backtest, so the partner numbers are not fully out-of-sample. A past award is evidence, not proof of capacity or interest. Fit scores order a shortlist; they are not probabilities. The partner reply in this run was typed by us on the public page and is labelled as a simulation; the score was computed live.</p>
</section>

${shots.map((s, i) => `<section><h2>${i + 1}. ${esc(s.caption)}</h2><p class="meta"><span class="tag ${/simulat/i.test(s.caption) ? 'sim' : ''}">${/simulat/i.test(s.caption) ? 'SIMULATED REPLY' : 'LIVE RUN'}</span>${esc(s.url)} · ${s.at.slice(0, 19).replace('T', ' ')} UTC</p><img src="data:image/png;base64,${s.png}"></section>`).join('')}`;

const b2 = await chromium.launch();
const p2 = await b2.newPage();
await p2.setContent(html, { waitUntil: 'load' });
await p2.pdf({ path: OUT, format: 'A4', landscape: true, printBackground: true });
await b2.close();
const base = OUT.replace(/\.pdf$/, '');
await writeFile(`${base}.json`, JSON.stringify({ capturedAt: now, partnerBacktest: bt, scorecard: { backtest: sc.backtest, baseline: sc.baseline }, live: { tender: finder.tender, gaps: finder.gaps, partners: finder.partners.map((p) => ({ name: p.name, score: p.score, covers: p.covers, coBids: p.coBids?.length ?? 0 })), latencyMs: runs.map((r) => r.ms), together: together.length, matches: matches.length, inviteId: invite.id, responseScore: resp?.score ?? null } }, null, 2));
for (const [i, s] of shots.entries()) await writeFile(`${base}.${String(i + 1).padStart(2, '0')}.png`, Buffer.from(s.png, 'base64'));
log('wrote', OUT);
