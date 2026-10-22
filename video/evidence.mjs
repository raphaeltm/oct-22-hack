// Evidence PDF: screenshots of the live dev app plus the live backtest scorecard.
// Usage: node evidence.mjs [baseUrl] [out.pdf]
// Signs in as the fictional demo company; nothing is mocked. Each page is
// stamped with its URL and capture time (UTC).
import { chromium } from 'playwright';
import { writeFile } from 'node:fs/promises';

const BASE = process.argv[2] || 'https://r1-app-3000-01m5hdrkrrdjwzypfyr1tmy68g.apps.simple-agent-manager.org';
const OUT = process.argv[3] ?? 'radar-evidence.pdf';
const EMAIL = process.env.DEMO_EMAIL ?? 'demo@rivage-numerique.fr';
const PASSWORD = process.env.DEMO_PASSWORD ?? 'rivage-demo-2026';

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const page = await ctx.newPage();
const shots = [];

async function shot(path, caption, { full = false, wait = 2500, maxFrames = 4 } = {}) {
  await page.goto(BASE + path, { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(wait);
  // The app scrolls inside a panel, not the window, so page through the
  // largest scrollable element and capture up to `frames` viewports.
  const frames = full ? maxFrames : 1;
  for (let f = 0; f < frames; f++) {
    const more = f === 0 || (await page.evaluate((f) => {
      const els = [...document.querySelectorAll('*')].filter((e) => {
        const o = getComputedStyle(e).overflowY;
        return (o === 'auto' || o === 'scroll') && e.scrollHeight > e.clientHeight + 40;
      });
      const el = els.sort((a, b) => b.clientWidth * b.clientHeight - a.clientWidth * a.clientHeight)[0];
      if (!el) return false;
      const before = el.scrollTop;
      el.scrollTop = before + el.clientHeight * 0.9;
      return el.scrollTop > before + 20;
    }, f));
    if (!more) break;
    if (f) await page.waitForTimeout(600);
    const png = await page.screenshot();
    const label = frames > 1 && f ? `${caption} (continued)` : caption;
    shots.push({ url: page.url(), caption: label, png: png.toString('base64'), at: new Date().toISOString() });
  }
  console.log('captured', path);
}

// Public pages first.
await shot('/', 'Landing page: Radar leads with joint bidding (groupements).');
await shot('/hackathon#evidence', 'Backtest vs naive baseline (deck slide; numbers from the dev snapshot).');

// Sign in through the API; the cookie lands in the browser context.
const res = await ctx.request.post(BASE + '/api/auth/sign-in/email', {
  data: { email: EMAIL, password: PASSWORD },
  headers: { origin: BASE },
});
if (!res.ok()) throw new Error(`sign-in failed: ${res.status()} ${await res.text()}`);

const getJson = async (p) => {
  const r = await ctx.request.get(BASE + p);
  return r.ok() ? r.json() : { error: r.status() };
};
const scorecard = await getJson('/api/autopilot/scorecard');
const matches = await getJson('/api/matches');

await shot('/tenders', 'Open French IT tenders from TED, ranked against the Rivage Numérique profile.');
const list = Array.isArray(matches) ? matches : matches.matches ?? matches.items ?? [];
const first = list[0];
const tenderId = first?.tenderId ?? first?.tender?.id ?? first?.id;
if (tenderId) {
  await shot(`/tenders/${tenderId}`, 'Tender detail: sourced TED notice, fit reasons, competitors and partner panel.', { full: true, wait: 5000, maxFrames: 7 });
}
await shot('/partners', 'Partner finder: co-bidders ranked from TED awards and real joint bids; invites and scored replies.', { full: true, wait: 4000 });
await shot('/autopilot', 'Autopilot: dossiers built without being asked, plus the live backtest scorecard.', { full: true, wait: 4000 });
await shot('/competitors', 'Competitors: past TED award winners, merged across name variants.');

await browser.close();

const sc = scorecard?.backtest
  ? `<table><tr><th></th><th>Graded tenders</th><th>Actual winner in top 5</th></tr>
     <tr><td>Radar agent (backtest)</td><td>${scorecard.backtest.graded}</td><td><b>${scorecard.backtest.top5Hits}</b></td></tr>
     <tr><td>Naive baseline: 5 most frequent winners in the CPV area</td><td>${scorecard.baseline.graded}</td><td><b>${scorecard.baseline.top5Hits}</b></td></tr></table>
     <ul>${(scorecard.notes ?? []).map((n) => `<li>${n}</li>`).join('')}</ul>`
  : `<p>Scorecard unavailable: ${JSON.stringify(scorecard).slice(0, 200)}</p>`;

const html = `<!doctype html><meta charset="utf-8"><style>
  body{font:14px/1.45 system-ui,sans-serif;margin:0;color:#111}
  section{page-break-after:always;padding:28px 36px}
  h1{font-size:26px;margin:0 0 6px} h2{font-size:17px;margin:0 0 4px}
  .meta{color:#666;font-size:11px;margin-bottom:10px;word-break:break-all}
  img{width:100%;border:1px solid #ccc}
  table{border-collapse:collapse;margin:14px 0} td,th{border:1px solid #ccc;padding:6px 12px;text-align:left}
</style>
<section>
  <h1>Radar: evidence it works</h1>
  <p class="meta">Captured live from ${BASE} on ${new Date().toISOString()} (UTC). Signed in as the fictional demo company Rivage Numérique. Tender, award and partner data are real TED notices; nothing is mocked.</p>
  <h2>Live backtest scorecard (GET /api/autopilot/scorecard)</h2>
  ${sc}
  <p>A past winner is evidence, not proof of a future bidder. Fit scores are heuristics, not win probabilities.</p>
</section>
${shots.map((s, i) => `<section><h2>${i + 1}. ${s.caption}</h2><p class="meta">${s.url} · ${s.at}</p><img src="data:image/png;base64,${s.png}"></section>`).join('')}`;

const b2 = await chromium.launch();
const p2 = await b2.newPage();
await p2.setContent(html, { waitUntil: 'load' });
await p2.pdf({ path: OUT, format: 'A4', landscape: true, printBackground: true });
await b2.close();
await writeFile(OUT.replace(/\.pdf$/, '.scorecard.json'), JSON.stringify(scorecard, null, 2));
for (const [i, s] of shots.entries()) await writeFile(OUT.replace(/\.pdf$/, `.${i + 1}.png`), Buffer.from(s.png, 'base64'));
console.log('wrote', OUT);
