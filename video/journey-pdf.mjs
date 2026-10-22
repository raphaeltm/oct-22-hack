// Builds an evidence PDF from a journey.mjs run: summary page + captioned screenshots.
// Usage: node journey-pdf.mjs <journeyOutDir> [out.pdf]
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';

const DIR = process.argv[2] || 'journey-out';
const OUT = process.argv[3] || `${DIR}/radar-evidence.pdf`;
const facts = JSON.parse(await readFile(`${DIR}/facts.json`, 'utf8'));
const shots = JSON.parse(await readFile(`${DIR}/shots.json`, 'utf8'));
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const pct = (a, b) => (b ? `${Math.round((100 * a) / b)}%` : '?');

const sc = facts.scorecard;
const r = facts.response;
const t = facts.tender;
const ted = (id) => `https://ted.europa.eu/en/notice/-/detail/${id}`;

const imgs = [];
for (const [i] of shots.entries()) imgs.push((await readFile(`${DIR}/shot-${String(i + 1).padStart(2, '0')}.png`)).toString('base64'));

const html = `<!doctype html><meta charset="utf-8"><style>
  @page{size:A4 landscape;margin:0}
  body{font:12.5px/1.45 system-ui,sans-serif;margin:0;color:#14231b}
  section{page-break-after:always;padding:26px 34px;box-sizing:border-box;height:210mm;overflow:hidden}
  h1{font-size:25px;margin:0 0 2px} h2{font-size:15px;margin:0 0 6px} h3{font-size:13px;margin:12px 0 4px;text-transform:uppercase;letter-spacing:.05em;color:#3d5a49}
  .meta{color:#5d6b63;font-size:10.5px;margin:0 0 8px;word-break:break-all}
  .grid{display:grid;grid-template-columns:1fr 1fr;gap:18px}
  .big{font-size:30px;font-weight:700;line-height:1}
  .kpis{display:flex;gap:14px;margin:8px 0}.kpi{border:1px solid #cfd8d2;border-radius:8px;padding:8px 12px;flex:1}
  .kpi small{display:block;color:#5d6b63}
  table{border-collapse:collapse;width:100%} td,th{border-bottom:1px solid #e1e7e3;padding:3px 6px;text-align:left;vertical-align:top}
  .warn{background:#fff6dd;border:1px solid #e8cf7a;border-radius:8px;padding:8px 12px;margin-top:10px}
  blockquote{margin:4px 0;padding:6px 10px;border-left:3px solid #3d5a49;background:#f3f6f4;font-size:11px;white-space:pre-wrap}
  img{width:100%;max-height:165mm;object-fit:contain;border:1px solid #cfd8d2;border-radius:6px}
  a{color:#22553a}
</style>
<section>
  <h1>Radar: evidence it works</h1>
  <p class="meta">One live run on the dev deployment, recorded as video (radar-live-run.mp4), ${esc(shots[0]?.at)} to ${esc(shots.at(-1)?.at)} UTC.
  Signed in as the fictional demo company Rivage Numérique (Lyon). Tenders, awards, joint bids and partner evidence are real TED notices. Nothing is mocked.</p>
  <div class="grid">
    <div>
      <h3>1 · Backtest against a naive baseline (live scorecard)</h3>
      ${sc?.backtest ? `<div class="kpis">
        <div class="kpi"><span class="big">${sc.backtest.top5Hits}/${sc.backtest.graded}</span><small>Radar agent: an actual winner in its top 5 (${pct(sc.backtest.top5Hits, sc.backtest.graded)})</small></div>
        <div class="kpi"><span class="big">${sc.baseline.top5Hits}/${sc.baseline.graded}</span><small>Naive baseline: the 5 most frequent winners in the CPV area (${pct(sc.baseline.top5Hits, sc.baseline.graded)})</small></div>
      </div>
      <p>Same past French IT tenders for both methods. The agent only saw awards published <i>before</i> each tender, and the target award was excluded. A tender with no prediction counts as a miss. Live predictions are graded automatically when the award notice is published (${sc.live?.graded ?? 0} graded so far, ${sc.live?.pending ?? '?'} pending).</p>` : '<p>Scorecard unavailable in this run.</p>'}
      <h3>2 · The partner finder on a real tender</h3>
      <p><b>Tender:</b> <a href="${ted(t?.publicationNumber)}">TED ${esc(t?.publicationNumber)}</a>, ${esc(t?.buyer)}: “${esc(t?.title)}”.<br>
      <b>Gaps found in the French notice</b> (capabilities Rivage's profile lacks): ${esc((facts.gaps ?? []).join(', ') || 'none (capacity partners)')}.<br>
      <b>Top-ranked partner:</b> ${esc(facts.partner?.name)}, fit ${esc(facts.partner?.score)}, with ${esc(facts.partner?.wins)} TED awards and ${esc(facts.partner?.coBids)} recorded joint bid(s) from eForms tendering parties.</p>
    </div>
    <div>
      <h3>3 · Invite → reply → score</h3>
      <p>The agent drafted a French invite with a private reply link. Radar sends nothing; the user sends it from their own mailbox.
      The reply was scored <b>${esc(r?.score)}/100</b>:</p>
      <table>${(r?.breakdown?.parts ?? []).map((p) => `<tr><td>${esc(p.label)}</td><td><b>${p.points}/${p.max}</b></td><td>${esc(p.note)}</td></tr>`).join('')}</table>
      <h3>4 · The agent, asked in chat (live Claude output, excerpt)</h3>
      <blockquote>${esc((facts.agentAnswer ?? '').slice(0, 700))}${(facts.agentAnswer ?? '').length > 700 ? '…' : ''}</blockquote>
      <div class="warn"><b>Read this before quoting:</b> the partner reply was <b>simulated by the Radar team</b> (it's marked “[DÉMO, réponse simulée]”). Its references are the partner's real TED awards, which is why the reference check passed. Because the agent ran after the reply, its “answered 1/1 Radar invites” comes from our simulated reply, not from a real partner.
      ${sc?.backtest ? `The backtest hit rate is low in absolute terms (${pct(sc.backtest.top5Hits, sc.backtest.graded)}). A past winner is evidence, not proof of the next bidder.` : ''} Fit scores are heuristics, not win probabilities.</div>
    </div>
  </div>
</section>
${shots.map((s, i) => `<section><h2>${i + 1}. ${esc(s.caption)}</h2><p class="meta">${esc(s.url.replace(/\/p\/[^/?#]+/, '/p/<token>'))} · ${esc(s.at)}</p><img src="data:image/png;base64,${imgs[i]}"></section>`).join('')}`;

const b = await chromium.launch();
const p = await b.newPage();
await p.setViewportSize({ width: 1123, height: 794 });
await p.setContent(html, { waitUntil: 'load' });
if (process.env.COVER_PNG) await p.screenshot({ path: process.env.COVER_PNG });
await p.pdf({ path: OUT, format: 'A4', landscape: true, printBackground: true });
await b.close();
console.log('wrote', OUT);
