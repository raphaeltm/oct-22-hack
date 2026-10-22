// Live end-to-end run on dev, recorded as video, with screenshots for an evidence PDF.
// Usage: node journey.mjs [baseUrl] [outDir]
// Journey: log in → Bid together → a tender with capability gaps → partner finder →
// draft invite → (we play the partner) answer on the public page → scored reply →
// ask the agent → backtest scorecard. Captions are injected into the page so they
// appear in the recording. The partner reply is SIMULATED by us and labelled so.
import { chromium } from 'playwright';
import { mkdir, writeFile, readdir, rename } from 'node:fs/promises';

const BASE = process.argv[2] || 'https://r1-app-3000-01m5hdrkrrdjwzypfyr1tmy68g.apps.simple-agent-manager.org';
const OUT = process.argv[3] || 'journey-out';
const EMAIL = process.env.DEMO_EMAIL ?? 'demo@rivage-numerique.fr';
const PASSWORD = process.env.DEMO_PASSWORD ?? 'rivage-demo-2026';
const W = 1280, H = 720;
await mkdir(OUT, { recursive: true });

const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s]`, ...a);
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: W, height: H },
  recordVideo: { dir: OUT, size: { width: W, height: H } },
  permissions: ['clipboard-read', 'clipboard-write'],
});
const page = await ctx.newPage();
const shots = [];
const facts = {};

async function say(text, ms = 0) {
  await page.evaluate((text) => {
    let el = document.getElementById('__cap');
    if (!el) {
      el = document.createElement('div');
      el.id = '__cap';
      el.style.cssText = 'position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:2147483647;max-width:88%;' +
        'background:rgba(12,24,18,.92);color:#fff;font:600 17px/1.35 system-ui,sans-serif;padding:10px 18px;border-radius:10px;' +
        'box-shadow:0 6px 24px rgba(0,0,0,.35);pointer-events:none;text-align:center';
      const tag = document.createElement('div');
      tag.id = '__live';
      tag.textContent = 'LIVE RUN · dev · ' + new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
      tag.style.cssText = 'position:fixed;top:10px;right:12px;z-index:2147483647;background:#c8f169;color:#10241a;' +
        'font:700 11px/1 ui-monospace,monospace;padding:6px 8px;border-radius:6px;pointer-events:none;letter-spacing:.04em';
      document.body.append(el, tag);
    }
    el.textContent = text;
  }, text).catch(() => {});
  if (ms) await page.waitForTimeout(ms);
}
async function snap(caption) {
  const png = await page.screenshot();
  shots.push({ caption, url: page.url(), at: new Date().toISOString(), png: png.toString('base64') });
}
async function go(path, wait = 1500) {
  await page.goto(BASE + path, { waitUntil: 'networkidle' }).catch(() => {});
  await page.waitForTimeout(wait);
}
async function scrollTo(locator, block = 'start') {
  await locator.first().evaluate((el, block) => el.scrollIntoView({ behavior: 'smooth', block }), block).catch(() => {});
  await page.waitForTimeout(900);
}
const api = async (p, init) => {
  const r = init ? await ctx.request.post(BASE + p, init) : await ctx.request.get(BASE + p);
  if (!r.ok()) throw new Error(`${p}: ${r.status()}`);
  return r.json();
};

try {
  // 1. Landing + login
  await go('/', 1200);
  await say('Radar: small French IT firms find the partners to win public tenders together.', 3500);
  await go('/login', 600);
  await say('We log in as Rivage Numérique, a fictional 40-person Lyon agency.');
  await page.locator('input[type=email]').fill(EMAIL);
  await page.locator('input[type=password]').fill(PASSWORD);
  await page.waitForTimeout(500);
  await page.locator('form button[type=submit]').click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20000 });
  await page.waitForLoadState('networkidle').catch(() => {});
  await page.waitForTimeout(2000);
  await say('Home is "Bid together": open French IT tenders on TED that are too big to bid alone.', 3500);
  await snap('Bid together home: open TED tenders (France, CPV 72) worth bidding on as a groupement.');

  // 2. Pick a tender with capability gaps and a partner with joint-bid history (via the same API the UI uses)
  const m = await api('/api/matches');
  const list = (Array.isArray(m) ? m : m.matches ?? m.items ?? []).slice(0, 15);
  let pick = null;
  for (const x of list) {
    const id = x.tenderId ?? x.tender?.id ?? x.id;
    const f = await api(`/api/tenders/${id}/partners`).catch(() => null);
    if (!f?.partners?.length) continue;
    const p = f.partners.find((p) => p.coBids.length && p.evidence.length) ?? f.partners.find((p) => p.evidence.length);
    if (!p) continue;
    const cand = { id, f, p };
    if (f.mode === 'gap') { pick = cand; break; }
    pick ??= cand;
  }
  if (!pick) throw new Error('no tender with partner candidates');
  facts.tender = { id: pick.id, publicationNumber: pick.f.tender.publicationNumber, title: pick.f.tender.title, buyer: pick.f.tender.buyerName };
  facts.gaps = pick.f.gaps.map((g) => g.label);
  facts.partner = { name: pick.p.name, score: pick.p.score, coBids: pick.p.coBids.length, wins: pick.p.wins };
  log('tender', facts.tender.publicationNumber, 'partner', pick.p.name);

  await go(`/tenders/${pick.id}`, 2500);
  await say(`TED notice ${facts.tender.publicationNumber}: ${facts.tender.buyer ?? ''}. Real tender, French text kept verbatim.`, 3500);
  await snap(`Tender ${facts.tender.publicationNumber} (${facts.tender.buyer}): match score and reasons against the company profile.`);

  const finder = page.locator('section.partners');
  await scrollTo(finder);
  await say(pick.f.mode === 'gap'
    ? `Gaps the notice asks for that Rivage lacks: ${facts.gaps.join(', ')}. Quoted from the French notice.`
    : 'Rivage covers the scope, so the agent looks for capacity partners with similar wins.', 4500);
  await snap('Partner finder: capability gaps quoted from the French notice.');

  const card = page.locator('.partner-card').filter({ hasText: pick.p.name }).first();
  await scrollTo(card, 'center');
  await say(`${pick.p.name}: ${pick.p.wins} TED awards, ${pick.p.coBids.length} recorded joint bid(s). Every signal links to a TED notice.`, 4500);
  await snap(`Ranked partner ${pick.p.name} (score ${pick.p.score}): TED award evidence and recorded joint bids (eForms tendering parties).`);

  // 3. Draft the invite
  await card.getByRole('button', { name: 'Draft invite' }).click();
  await page.waitForTimeout(800);
  const composer = page.locator('form.composer');
  await scrollTo(composer, 'center');
  await say('Draft an invite: role and need are pre-filled in French from the gap.', 2500);
  const created = page.waitForResponse((r) => r.url().includes('/api/partners/invites') && r.request().method() === 'POST');
  await composer.getByRole('button', { name: /Draft the email/ }).click();
  const inv = await (await created).json();
  const invite = inv.invite ?? inv;
  facts.invite = { id: invite.id, subject: invite.subject };
  const link = invite.link;
  await page.waitForTimeout(1500);
  const draft = page.locator('.composer').filter({ hasText: 'Email to' });
  await scrollTo(draft, 'start');
  await say('The agent drafts a formal French email with a private reply link. You send it from your own mailbox; Radar never emails anyone.', 5000);
  await snap('Drafted French invite with a private, token-scoped reply link. Nothing is sent by Radar.');
  await draft.getByRole('button', { name: /Copy email/ }).click();
  await page.waitForTimeout(800);
  await say('Copied and marked as sent.', 1500);

  // 4. Play the partner on the public page (simulated reply)
  const path = new URL(link, BASE).pathname;
  await go(path, 2000);
  await say(`SIMULATION: we now play ${pick.p.name} and open the link they would receive. No login needed.`, 4000);
  await snap(`Public reply page (/p/:token) as the partner would see it. The reply below is simulated by the Radar team for this demo.`);
  await page.locator('label.radio-pill').filter({ hasText: 'Oui' }).click();
  const company = page.locator('label:has-text("Entreprise") input');
  if (!(await company.inputValue())) await company.fill(pick.p.name);
  await page.locator('label:has-text("Votre nom") input').fill('Démo Radar (réponse simulée)');
  await page.locator('label:has-text("Email") input[type=email]').fill('demo-partenaire@example.fr');
  const caps = page.locator('textarea').first();
  await caps.fill(`[DÉMO, réponse simulée] ${facts.gaps.length ? facts.gaps.join(', ') : 'Renfort sur le périmètre du marché'} : équipe disponible, références publiques ci-dessous.`);
  await page.locator('label:has-text("Disponibilit") input, input[placeholder^="Ex. 2"]').first().fill('2 consultants à partir de janvier').catch(() => {});
  // References: the partner's own TED awards, so the scorer can match them.
  const refs = pick.p.evidence.slice(0, 2);
  for (const [i, e] of refs.entries()) {
    if (i > 0) await page.getByRole('button', { name: /Ajouter une référence/ }).click().catch(() => {});
    await page.getByLabel(`Référence ${i + 1} : intitulé`).fill(e.title.slice(0, 280)).catch(() => {});
    if (e.buyer) await page.getByLabel(`Référence ${i + 1} : acheteur`).fill(e.buyer.slice(0, 190)).catch(() => {});
    if (e.date) await page.getByLabel(`Référence ${i + 1} : année`).fill(e.date.slice(0, 4)).catch(() => {});
  }
  await page.locator('form.public-form textarea').last().fill('Réponse de démonstration générée par l’équipe Radar pour le hackathon.');
  await say('The partner says yes and lists references. Here we reuse their real TED awards so the scorer can check them.', 3500);
  await page.getByRole('button', { name: /Envoyer ma réponse/ }).click();
  await page.waitForTimeout(2500);
  await say('Reply sent. The partner is invited to open their own Radar: every invite can bring a new company onto the network.', 4500);
  await snap('After replying, the partner is invited to create their own Radar (network effect).');

  // 5. Back as Rivage: the scored reply
  await go('/partners', 2500);
  const row = page.locator('.invite-row').filter({ hasText: pick.p.name }).first();
  await scrollTo(row, 'center');
  await row.getByRole('button', { name: 'Show response' }).click().catch(() => {});
  await page.waitForTimeout(1200);
  await scrollTo(row, 'start');
  const invites = await api(`/api/partners/invites?tenderId=${pick.id}`).catch(() => null);
  const mine = (invites?.invites ?? invites ?? []).find?.((x) => x.id === facts.invite.id);
  facts.response = mine?.response ?? null;
  await say(`Back as Rivage: the reply is scored ${mine?.response?.score ?? '?'}/100 on interest, coverage, references checked against TED and completeness.`, 5000);
  await snap(`Scored partner reply: ${mine?.response?.score ?? '?'}/100. References are checked against the partner's TED awards. (Simulated reply.)`);

  // 6. Ask the agent
  await go(`/tenders/${pick.id}`, 2000);
  const input = page.locator('textarea[placeholder^="Message the agent"]');
  if (!(await input.count())) await page.getByRole('button', { name: /agent|copilot|chat/i }).first().click().catch(() => {});
  await say('Ask the agent directly.', 800);
  const q = `In 3 short bullet points: who should we team up with for this tender (${facts.tender.publicationNumber}) and why? Cite TED notice ids.`;
  await input.fill(q);
  await input.press('Enter');
  await say('The agent (Claude via Mastra) calls its tools on the same Postgres data: gaps, partners, joint bids.');
  const t = Date.now();
  let last = '', stable = 0;
  while (Date.now() - t < 75000) {
    await page.waitForTimeout(1500);
    const txt = await page.locator('.msg.assistant.md').last().innerText().catch(() => '');
    const busy = await page.locator('.agent-dot[data-busy="true"]').count();
    if (txt && txt === last && !busy) { if (++stable >= 2) break; } else stable = 0;
    last = txt;
  }
  facts.agentAnswer = last;
  await page.locator('.chat-log').evaluate((el) => (el.scrollTop = el.scrollHeight)).catch(() => {});
  await say('A sourced answer, with the TED notice ids it relied on.', 4000);
  await snap('The agent answers in chat, citing TED notice ids (live model output).');

  // 7. Evidence: backtest scorecard
  facts.scorecard = await api('/api/autopilot/scorecard').catch(() => null);
  await go('/autopilot', 2500);
  const sc = facts.scorecard;
  await say(sc?.backtest ? `Backtest on ${sc.backtest.graded} past tenders: a real winner in the agent's top 5 for ${sc.backtest.top5Hits}, vs ${sc.baseline.top5Hits} for a naive baseline.` : 'Autopilot scorecard.', 2000);
  const card2 = page.getByText(/baseline/i).first();
  await scrollTo(card2, 'center');
  await page.waitForTimeout(3000);
  await snap('Autopilot scorecard: backtest vs naive "most frequent winners" baseline, same tenders (live).');
  await say('Every claim traces back to a public TED notice. The bidding war is over: bid together.', 3500);
} catch (e) {
  log('ERROR', e.message);
  facts.error = e.message;
  await snap(`Run stopped: ${e.message}`).catch(() => {});
} finally {
  const video = page.video();
  await ctx.close();
  await browser.close();
  if (video) await rename(await video.path(), `${OUT}/journey.webm`);
}

await writeFile(`${OUT}/facts.json`, JSON.stringify(facts, null, 2));
for (const [i, s] of shots.entries()) await writeFile(`${OUT}/shot-${String(i + 1).padStart(2, '0')}.png`, Buffer.from(s.png, 'base64'));
await writeFile(`${OUT}/shots.json`, JSON.stringify(shots.map(({ png, ...s }) => s), null, 2));
log('done', shots.length, 'shots');
