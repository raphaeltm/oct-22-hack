// Renders the film for any time t (seconds): window.seek(t). Nothing animates on
// its own, so render.mjs can step frame by frame and get identical output.
//
// Facts: every record below is real. Paris Habitat's match, gaps, partners and
// the invite draft come from the live partner finder on dev (demo company, 22 Oct
// 2026, 13:05 UTC); the draft is the output of server/src/lib/invites.ts
// draftEmail() for that partner. The groupement notices were checked against
// TED's search API. The 199 count (of 2,610) uses TED's party-leader flag, as
// on the landing page (#48). The reply rubric mirrors scoreResponse(); no reply is shown or scored.
import { buildTimeline } from './timeline.mjs';

const [durations, words] = await Promise.all([
  fetch('vo-durations.json').then((r) => r.json()),
  fetch('vo-words.json').then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
]);
const TL = buildTimeline(durations);
const S = Object.fromEntries(TL.scenes.map((s) => [s.id, s]));

// ---------- data ----------
const GROUPS = [
  { pub: '17241-2025', buyer: 'Société nationale SNCF', a: 'DELOITTE CONSEIL', b: 'KSHUTTLE', kind: 'groupement' },
  { pub: '4575-2025', buyer: 'Département des Bouches-du-Rhône', a: 'ENGIT', b: 'MEJA', kind: 'co-traitance' },
  { pub: '9502-2025', buyer: 'Agence de Services et de Paiement', a: 'LATITUDE GEOSYSTEMS', b: 'GEOSERVE', kind: 'groupement' },
];
const GROUPEMENT_COUNT = 199; // of 2,610 award notices; TED's party-leader flag marks a multi-member bid
const GAPS = [
  { name: 'GIS / géomatique', quote: "…plateforme de Système d'Information Géographique (SIG) en mode SaaS ou hébergé…" },
  { name: 'Application maintenance (TMA)', quote: '…son exploitation et son maintien en conditions opérationnelles et de sécurité…' },
];
const PARTNERS = [
  { name: 'AKKODIS I&S', score: 59, why: 'Joint-bid history on TED (led at least one) · based in Villeurbanne, your region', ev: ['581992-2026', 'Tierce Maintenance Applicative · Agence de l’eau Seine Normandie'] },
  { name: 'CIRIL GROUP', score: 52, why: 'Covers TMA and GIS on past public awards', ev: ['109064-2026', 'Plateforme centralisatrice · Toulouse Métropole'] },
  { name: 'NAOMIS', score: 52, why: 'Covers TMA and GIS on past public awards', ev: ['188641-2026', 'Infrastructure SIG · Saint-Brieuc Armor Agglomération'] },
  { name: 'ATEXO', score: 50, why: 'Covers TMA and GIS on past public awards', ev: ['503524-2026', 'Maintenance de logiciels · Conseil Départemental du Nord'] },
];
const SUBJECT = "Proposition de groupement – Fourniture, prestations et maintenance d'une plateforme de Système d'Information…";
const MAIL = `Bonjour,

Je me permets de vous contacter au nom de Rivage Numérique, entreprise du numérique basée à Lyon.

Nous préparons une réponse à la consultation « Fourniture, prestations et maintenance d'une plateforme de Système d'Information Géographique (SIG) en mode SaaS ou hébergé » publiée par Paris Habitat - OPH (avis TED 667222-2026, date limite de remise des offres le 26 octobre 2026).

Pour présenter l’offre la plus complète, nous recherchons un partenaire pour : la tierce maintenance applicative (TMA) et le SIG et la géomatique.
Vos références sur des marchés publics comparables (« Tierce Maintenance Applicative de l’application de gestion des redevances ARAMIS » pour Agence de l'eau Seine Normandie ; « SUPPORT POUR LES UTILISATEURS DE LA PLATEFORME EDITO » pour MERCATOR OCEAN) nous ont conduits vers AKKODIS I&S.

Nous vous proposerions d’intervenir en tant que cotraitant au sein d’un groupement momentané d’entreprises dont nous serions mandataires.`;
const RUBRIC = [
  ['Interest', 'yes, maybe or no', 25],
  ['Covers the need', 'TMA and GIS named in the reply', 25],
  ['References', 'checked against their TED awards', 25],
  ['Identity', 'SIRET checksum and match with TED', 10],
  ['Speed', 'hours from your email to the reply', 10],
  ['Completeness', 'contact, email, availability, role', 5],
];
const RECEIPTS = ['667222-2026', '581992-2026', '188641-2026', '107505-2026', '17241-2025', '4575-2025'];
const BLIPS = [
  { a: 38, r: 34, label: "Musée de l'Air et de l'Espace", fit: 80 },
  { a: 118, r: 27, label: 'Saint-Quentin-en-Yvelines', fit: 79.7 },
  { a: 212, r: 40, label: 'Ville de Clichy-la-Garenne', fit: 65.6 },
  { a: 300, r: 30, label: 'Économat des Armées', fit: 68.5 },
  { a: 72, r: 44 }, { a: 95, r: 16 }, { a: 150, r: 41 }, { a: 168, r: 22 },
  { a: 245, r: 18 }, { a: 268, r: 45 }, { a: 330, r: 42 }, { a: 12, r: 20 },
  { a: 190, r: 12 }, { a: 350, r: 26 },
];
const LINKS = [[0, 4], [1, 6], [2, 8], [3, 10], [3, 13]]; // tender ↔ partner pairs in the reveal scope
// On-screen honesty labels, per scene (AGENTS.md: keep demo facts distinct from evidence).
const LABELS = {
  hook: "Radar's live verdict for the fictional demo company Rivage Numérique · 22 Oct 2026",
  insight: 'Of 2,610 French IT award notices since 2025 · counted from TED’s party-leader flag, 22 Oct 2026',
  gap: 'Gaps and quotes from the TED notice, matched against the demo profile',
  partners: 'Fit is a heuristic for ordering a shortlist, not a probability · a past award is evidence, not proof of interest',
  outreach: "Radar's draft for this tender and partner · it never sends email on its own",
  replies: 'Response score is a heuristic for triage, not a guarantee',
};

// ---------- helpers ----------
const $ = (id) => document.getElementById(id);
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const P = (lt, t0, d) => clamp((lt - t0) / d);
const E = {
  out: (p) => 1 - Math.pow(1 - p, 3),
  expo: (p) => (p >= 1 ? 1 : 1 - Math.pow(2, -10 * p)),
  inOut: (p) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2),
  back: (p) => { const c = 1.6; return 1 + (c + 1) * Math.pow(p - 1, 3) + c * Math.pow(p - 1, 2); },
};
const lerp = (a, b, p) => a + (b - a) * p;
function rise(el, lt, t0, d = 0.9, dist = 46) {
  const p = E.expo(P(lt, t0, d));
  el.style.opacity = p;
  el.style.transform = `translateY(${(1 - p) * dist}px)`;
  return p;
}
function pop(el, lt, t0, d = 0.5) {
  const p = P(lt, t0, d);
  el.style.opacity = clamp(p * 3);
  el.style.transform = `scale(${lerp(0.6, 1, E.back(p))})`;
  return p;
}
// Cards centred with translateY(-50%) keep that offset while they rise.
function riseCentered(el, lt, t0, d = 1.0, dist = 60) {
  const p = E.expo(P(lt, t0, d));
  el.style.opacity = p;
  el.style.transform = `translateY(calc(-50% + ${(1 - p) * dist}px))`;
  return p;
}
const h = (tag, cls, html) => { const el = document.createElement(tag); if (cls) el.className = cls; if (html != null) el.innerHTML = html; return el; };
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

// When a word is spoken, relative to the start of its scene. Falls back to a
// fraction of the line if the transcript is missing.
function W(id, word, n = 0, frac = 0.5) {
  const s = S[id];
  const list = words[s.vo]?.words ?? [];
  const norm = (x) => x.toLowerCase().replace(/[^a-z0-9]/g, '');
  const hits = list.filter((w) => norm(w[0]) === norm(word));
  const t = hits[n] ? hits[n][1] : frac * s.voDur;
  return s.lead + t;
}

// ---------- build DOM ----------
const groupEls = GROUPS.map((g) => {
  const el = h('div', 'grp', `
    <span class="mono">TED ${g.pub}</span>
    <span class="buyer">${esc(g.buyer)}</span>
    <div class="pair"><span class="co a">${esc(g.a)}</span><span class="plus">+</span><span class="co b">${esc(g.b)}</span></div>
    <span class="kind">${g.kind}</span>`);
  $('grpRow').appendChild(el);
  return { el, a: el.querySelector('.co.a'), b: el.querySelector('.co.b'), plus: el.querySelector('.plus') };
});

const gapEls = GAPS.map((g) => {
  const el = h('div', 'gap-row missing', `
    <b>${esc(g.name)}<q lang="fr">${esc(g.quote)}</q></b>
    <span class="st gap">Gap</span>`);
  $('gapList').appendChild(el);
  return { el, st: el.querySelector('.st') };
});

const pfEls = PARTNERS.slice(0, 3).map((p, i) => {
  const el = h('div', 'pf', `
    <div class="pf-top"><span class="rank">#${i + 1}</span><span class="avatar">${esc(p.name.slice(0, 2))}</span><b>${esc(p.name)}</b>
      <div class="fit"><svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15.5"/><circle cx="18" cy="18" r="15.5" pathLength="100" stroke-dasharray="0 100"/></svg><span>0</span></div></div>
    <div class="sigs"><span class="sig">Covers: TMA</span><span class="sig">Covers: GIS</span></div>
    ${i === 0 ? `<p class="pf-why">${esc(p.why)}</p>` : ''}
    <div class="pf-ev"><span class="mono">TED ${p.ev[0]}</span><span lang="fr">${esc(p.ev[1])}</span></div>`);
  $('pfList').appendChild(el);
  return { el, p, sigs: [...el.querySelectorAll('.sig')], ring: el.querySelectorAll('circle')[1], num: el.querySelector('.fit span') };
});

$('pfList').insertAdjacentHTML('beforeend', `<p class="pf-more">+ ${PARTNERS.length - 3} more · next: ${PARTNERS.slice(3).map((p) => `${esc(p.name)} (${p.score})`).join(', ')}</p>`);

const rubEls = RUBRIC.map(([k, note, max]) => {
  const el = h('div', 'rub', `<span><b>${k}</b><small>${note}</small></span><i></i><em>/${max}</em>`);
  $('replyList').appendChild(el);
  return { el, max, bar: el.querySelector('i') };
});
const claim = h('span', 'claim', 'Créer mon radar gratuit →');
claim.lang = 'fr';
$('replyList').appendChild(claim);

// network graph: you, the partner, and the partners' own networks
const SVGNS = 'http://www.w3.org/2000/svg';
const net = $('net');
net.setAttribute('viewBox', '0 0 470 700');
const NODES = [
  { x: 120, y: 350, r: 16, cls: 'you', label: 'You' },
  { x: 300, y: 300, r: 13, label: 'Partner' },
  { x: 420, y: 170, r: 8 }, { x: 440, y: 330, r: 8 }, { x: 380, y: 470, r: 8 },
  { x: 250, y: 520, r: 7 }, { x: 330, y: 610, r: 6 }, { x: 450, y: 560, r: 6 }, { x: 220, y: 120, r: 7 },
];
const EDGES = [[0, 1], [1, 2], [1, 3], [1, 4], [4, 5], [4, 6], [4, 7], [2, 8], [0, 5]];
const edgeEls = EDGES.map(([a, b]) => {
  const l = document.createElementNS(SVGNS, 'line');
  l.setAttribute('x1', NODES[a].x); l.setAttribute('y1', NODES[a].y);
  l.setAttribute('x2', NODES[b].x); l.setAttribute('y2', NODES[b].y);
  l.setAttribute('pathLength', '1'); l.setAttribute('stroke-dasharray', '1');
  net.appendChild(l);
  return l;
});
const nodeEls = NODES.map((n) => {
  const g = document.createElementNS(SVGNS, 'g');
  g.innerHTML = `<circle cx="${n.x}" cy="${n.y}" r="${n.r}" class="${n.cls ?? ''}"/>${n.label ? `<text x="${n.x}" y="${n.y + n.r + 24}" text-anchor="middle">${n.label}</text>` : ''}`;
  g.style.transformOrigin = `${n.x}px ${n.y}px`;
  net.appendChild(g);
  return g;
});

function buildScope(el, quiet) {
  el.innerHTML = '<div class="scope-rings"></div><div class="scope-sweep"></div>';
  const blips = [];
  let links = [];
  if (!quiet) {
    const svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;overflow:visible';
    const pos = (b) => { const rad = (b.a * Math.PI) / 180; return [50 + b.r * Math.sin(rad), 50 - b.r * Math.cos(rad)]; };
    links = LINKS.map(([i, j]) => {
      const [x1, y1] = pos(BLIPS[i]); const [x2, y2] = pos(BLIPS[j]);
      const l = document.createElementNS(SVGNS, 'line');
      Object.entries({ x1, y1, x2, y2, pathLength: 1, 'stroke-dasharray': 1, 'stroke-dashoffset': 1 }).forEach(([k, v]) => l.setAttribute(k, v));
      l.style.cssText = 'stroke: rgb(198 243 107 / 0.7); stroke-width: 0.35';
      svg.appendChild(l);
      return l;
    });
    el.appendChild(svg);
    BLIPS.forEach((b) => {
      const [x, y] = pos(b);
      const bl = h('span', `blip ${b.label ? 'major' : ''} ${b.a > 180 ? 'left' : ''}`);
      bl.style.left = `${x}%`;
      bl.style.top = `${y}%`;
      if (b.label) bl.innerHTML = `<span class="blip-label">${esc(b.label)}<i>fit ${b.fit}</i></span>`;
      el.appendChild(bl);
      blips.push({ el: bl, a: b.a, label: bl.firstChild });
    });
    el.appendChild(h('span', 'scope-center', 'You'));
  }
  return { sweep: el.querySelector('.scope-sweep'), blips, links };
}
const revScope = buildScope($('revScope'), false);
const ctaScope = buildScope($('ctaScope'), true);

const ARROW = '<svg viewBox="0 0 16 16"><path d="M3 8h10M9 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const receiptEls = RECEIPTS.map((p) => {
  const el = h('div', 'receipt', `<span>TED</span><b>${p}</b>${ARROW}`);
  $('rcList').appendChild(el);
  return el;
});

// ---------- render ----------
const sceneEls = Object.fromEntries(TL.scenes.map((s) => [s.id, $(`s-${s.id}`)]));
const X = 0.28; // half crossfade

function sceneAlpha(s, t) {
  const inP = s.start === 0 ? E.out(P(t, 0, 0.35)) : E.inOut(P(t, s.start - X, 2 * X));
  const outP = s.id === 'cta' ? 1 : 1 - E.inOut(P(t, s.end - X, 2 * X));
  return Math.min(inP, outP);
}

function scope(sc, t, lt, appear) {
  const angle = (t * 72) % 360; // one turn every 5 s
  sc.sweep.style.transform = `rotate(${angle}deg)`;
  sc.blips.forEach((b) => {
    const since = (angle - b.a + 360) % 360; // degrees since the sweep passed
    const seen = lt > b.a / 72 + appear;
    const glow = seen ? Math.exp(-since / 70) : 0;
    b.el.style.opacity = seen ? 0.3 + 0.7 * glow : 0;
    b.el.style.boxShadow = `0 0 ${18 * glow}px ${4 * glow}px rgb(198 243 107 / ${0.8 * glow})`;
    if (b.label) b.label.style.opacity = seen ? 0.55 + 0.45 * Math.exp(-since / 140) : 0;
  });
}

let labelText = '';
function render(t) {
  $('bgGrid').style.transform = `translate(${(t * 6) % 96}px, ${(t * -4) % 96}px)`;
  $('bgGlow').style.transform = `translateX(${Math.sin(t / 9) * 40}px)`;

  for (const s of TL.scenes) {
    const a = sceneAlpha(s, t);
    const el = sceneEls[s.id];
    el.style.opacity = a;
    el.style.transform = `scale(${1 + 0.03 * clamp((t - s.start) / s.dur)})`;
    el.style.visibility = a <= 0.001 ? 'hidden' : 'visible';
    if (a > 0.001) RENDER[s.id](t - s.start, s, t);
  }

  // logo: appears with the reveal and stays to the end
  const logoA = E.out(P(t, S.reveal.start + 0.3, 0.8));
  $('logo').style.opacity = logoA;
  $('logo').style.transform = `translateY(${(1 - logoA) * -20}px)`;

  // honesty label for the current scene; consecutive scenes with the same label keep it on screen
  const i = TL.scenes.findIndex((s) => t >= s.start && t < s.end);
  const cur = TL.scenes[i < 0 ? TL.scenes.length - 1 : i];
  const txt = LABELS[cur.id] ?? '';
  if (txt && txt !== labelText) { $('label').textContent = txt; labelText = txt; }
  const prev = TL.scenes[TL.scenes.indexOf(cur) - 1];
  const next = TL.scenes[TL.scenes.indexOf(cur) + 1];
  const fadeIn = prev && LABELS[prev.id] === txt ? 1 : E.out(P(t - cur.start, 0.6, 0.6));
  const fadeOut = next && LABELS[next.id] === txt ? 1 : 1 - E.inOut(P(t, cur.end - 0.45, 0.4));
  const la = txt ? Math.min(fadeIn, fadeOut) : 0;
  $('label').style.opacity = la;
  $('label').style.transform = `translateY(${(1 - la) * 14}px)`;
}

const RENDER = {
  hook(lt) {
    const cp = E.expo(P(lt, 0.05, 1.0));
    $('hookCard').style.opacity = cp;
    $('hookCard').style.transform = `translateY(${(1 - cp) * 50}px)`;
    const tNo = W('hook', 'weak', 0, 0.5) - 0.1;
    const vp = P(lt, tNo, 0.5);
    $('hookVerdict').style.transform = `scale(${1 + 0.35 * Math.sin(Math.PI * vp)})`;
    $('hookVerdict').style.boxShadow = `0 0 0 ${10 * Math.sin(Math.PI * vp)}px rgb(255 176 138 / ${0.3 * (1 - vp)})`;
    const tScope = W('hook', 'mapping', 0, 0.75) - 0.2;
    $('hookHl').style.setProperty('--hl', `${100 * E.inOut(P(lt, tScope, 1.4))}%`);
    // The headline lands early so the hook works on mute; the voice catches up.
    rise($('hookHead'), lt, 1.4, 1.0, 50);
  },
  insight(lt) {
    rise($('insHead'), lt, 0.1, 1.0);
    const tTog = W('insight', 'together', 0, 0.4) - 0.2;
    groupEls.forEach((g, i) => {
      rise(g.el, lt, 0.5 + i * 0.22, 1.0, 50);
      const jp = E.back(P(lt, tTog + i * 0.15, 0.8));
      g.a.style.transform = `translateX(${(1 - jp) * -46}px)`;
      g.b.style.transform = `translateX(${(1 - jp) * 46}px)`;
      g.plus.style.opacity = clamp(jp);
      g.plus.style.transform = `scale(${lerp(0.3, 1, clamp(jp))})`;
    });
    const tRec = W('insight', 'records', 0, 0.75) - 0.3;
    rise($('insCount'), lt, tRec, 0.9, 40);
    $('insNum').textContent = Math.round(GROUPEMENT_COUNT * E.out(P(lt, tRec, 1.4)));
  },
  reveal(lt, s, t) {
    rise($('revEyebrow'), lt, 0.25, 0.9);
    rise($('revL1'), lt, 0.4, 1.0, 60);
    const tPartners = W('reveal', 'partners', 0, 0.6);
    rise($('revL3'), lt, tPartners - 0.25, 1.0, 60);
    const p = E.expo(P(lt, 0.1, 1.4));
    $('revScope').style.opacity = p;
    $('revScope').style.transform = `scale(${lerp(0.7, 1, p)}) rotate(${(1 - p) * -30}deg)`;
    scope(revScope, t, lt, 0.5);
    revScope.links.forEach((l, i) => l.setAttribute('stroke-dashoffset', 1 - E.inOut(P(lt, tPartners + i * 0.18, 0.7))));
  },
  gap(lt) {
    rise($('gapCopy'), lt, 0.15, 1.0);
    riseCentered($('gapCard'), lt, 0.2);
    const tGis = W('gap', 'gis', 0, 0.62) - 0.15;
    const tTma = W('gap', 'maintenance', 0, 0.8) - 0.35;
    gapEls.forEach(({ el, st }, i) => {
      rise(el, lt, 0.6 + i * 0.25, 0.9, 30);
      const sp = P(lt, i === 0 ? tGis : tTma, 0.5);
      st.style.opacity = clamp(sp * 3);
      st.style.transform = `scale(${lerp(0.6, 1, E.back(sp))})`;
    });
  },
  partners(lt) {
    riseCentered($('pfCard'), lt, -0.1, 0.9);
    rise($('pfCopy'), lt, 0.1, 1.0);
    const tSig = W('partners', 'cover', 0, 0.3) - 0.2;
    pfEls.forEach(({ el, p, sigs, ring, num }, i) => {
      const t0 = 0.2 + i * 0.2;
      const e = E.expo(P(lt, t0, 0.9));
      el.style.opacity = e;
      el.style.transform = `translateX(${(1 - e) * -50}px)`;
      const fp = E.out(P(lt, t0 + 0.2, 1.3));
      ring.setAttribute('stroke-dasharray', `${p.score * fp} 100`);
      num.textContent = Math.round(p.score * fp);
      sigs.forEach((sg, k) => sg.classList.toggle('on', lt >= tSig + i * 0.2 + k * 0.15));
    });
  },
  outreach(lt) {
    rise($('outCopy'), lt, 0.15, 1.0);
    riseCentered($('mailCard'), lt, 0.2);
    $('mailSubject').textContent = SUBJECT.slice(0, Math.round(SUBJECT.length * E.out(P(lt, 0.5, 0.6))));
    const t0 = 1.0, t1 = Math.max(t0 + 3, W('outreach', 'send', 0, 0.6) + 0.6);
    $('mailBody').textContent = MAIL.slice(0, Math.round(MAIL.length * P(lt, t0, t1 - t0)));
    const sc = $('mailScroll');
    sc.scrollTop = sc.scrollHeight;
    const ap = E.expo(P(lt, W('outreach', 'send', 0, 0.6) - 0.2, 0.8));
    $('mailActions').style.opacity = ap;
    $('mailActions').style.transform = `translateY(${(1 - ap) * 20}px)`;
  },
  replies(lt) {
    riseCentered($('replyCard'), lt, -0.1, 0.9);
    rise($('repCopy'), lt, 0.1, 1.0);
    rubEls.forEach(({ el, bar, max }, i) => {
      rise(el, lt, 0.3 + i * 0.12, 0.8, 20);
      bar.style.setProperty('--w', `${(100 * max / 25) * E.out(P(lt, 0.5 + i * 0.12, 0.9))}%`);
    });
    const tClaim = W('replies', 'every', 0, 0.6) - 0.2;
    pop(claim, lt, tClaim, 0.6);
    nodeEls.forEach((g, i) => {
      const t0 = i < 2 ? 0.4 + i * 0.3 : tClaim + 0.3 + (i - 2) * 0.16;
      const p = P(lt, t0, 0.5);
      g.style.opacity = clamp(p * 3);
      g.style.transform = `scale(${lerp(0.3, 1, E.back(p))})`;
    });
    edgeEls.forEach((l, i) => {
      const t0 = i === 0 ? 0.8 : tClaim + 0.2 + i * 0.16;
      l.setAttribute('stroke-dashoffset', 1 - E.inOut(P(lt, t0, 0.6)));
    });
  },
  receipts(lt) {
    rise($('rcHead'), lt, 0.05, 0.9, 50);
    receiptEls.forEach((el, i) => {
      const p = E.expo(P(lt, 0.3 + i * 0.09, 0.9));
      const fromX = [-260, 0, 260][i % 3] * 1.4, fromY = i < 3 ? -60 : 140;
      el.style.opacity = p;
      el.style.transform = `translate(${(1 - p) * fromX}px, ${(1 - p) * fromY}px) rotate(${(1 - p) * (i % 2 ? 8 : -8)}deg)`;
      el.style.borderStyle = lt > 1.4 + i * 0.12 ? 'solid' : 'dashed';
    });
  },
  cta(lt, s, t) {
    const p = E.expo(P(lt, 0, 1.8));
    $('ctaScope').style.opacity = 0.5 * p;
    $('ctaScope').style.transform = `scale(${lerp(0.85, 1, p)})`;
    scope(ctaScope, t, lt, 0);
    rise($('ctaH'), lt, 0.25, 1.1, 70);
    const tTry = W('cta', 'try', 0, 0.55);
    rise($('ctaP'), lt, tTry - 0.2, 0.9);
    const bp = pop($('ctaBtn'), lt, tTry, 0.6);
    const glow = 0.55 + 0.25 * Math.sin(lt * 3);
    $('ctaBtn').style.boxShadow = `0 20px 70px -12px rgb(198 243 107 / ${bp >= 1 ? glow : 0.55})`;
    rise($('ctaFoot'), lt, tTry + 0.5, 0.9);
  },
};

await document.fonts.ready;
window.TIMELINE = TL;
window.seek = (t) => render(t);
render(Number(new URLSearchParams(location.search).get('t') ?? 0));
window.filmReady = true;
