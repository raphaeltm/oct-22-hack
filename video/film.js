// Renders the film for any time t (seconds): window.seek(t). Nothing animates on
// its own, so render.mjs can step frame by frame and get identical output.
//
// Every tender, award, rival and figure below is copied from
// web/src/components/Landing.tsx (TED records, dev snapshot 22 Oct 2026).
import { buildTimeline } from './timeline.mjs';

const [durations, words] = await Promise.all([
  fetch('vo-durations.json').then((r) => r.json()),
  fetch('vo-words.json').then((r) => (r.ok ? r.json() : {})).catch(() => ({})),
]);
const TL = buildTimeline(durations);
const S = Object.fromEntries(TL.scenes.map((s) => [s.id, s]));

// ---------- data ----------
const NOTICES = [
  ['661657-2026', "Musée de l'Air et de l'Espace", 'Refonte architecturale, créative et technique du site internet'],
  ['708553-2026', 'Mairie de Clichy-la-Garenne', 'Refonte du site internet de la Ville de Clichy'],
  ['725720-2026', 'Saint-Quentin-en-Yvelines', 'Hébergement, maintenance et accessibilité numérique des sites'],
  ['666267-2026', 'ANSES', "Refonte du socle technique de l'application Salsa"],
  ['653428-2026', 'Métropole de Lyon', 'Maintenance et évolution du réseau informatique'],
  ['704928-2026', 'Université de Tours', 'Infrastructure numérique du portail « Bibliothèques virtuelles humanistes »'],
  ['730783-2026', 'Département du Val de Marne', "Maintenance et prestations complémentaires pour l'Intranet"],
  ['665766-2026', "Domaine d'O, Montpellier", 'Nouvelle identité graphique et site internet'],
  ['667222-2026', 'Paris Habitat', "Plateforme de Système d'Information Géographique"],
  ['654109-2026', 'Agence Française de Développement', 'TMA Verso et autres applications Bonita'],
  ['702985-2026', 'Économat des Armées', 'Site web, plateforme évènementielle et application mobile du Forum de Paris'],
  ['233673-2026', "Ministère de l'Éducation nationale", "Tierce maintenance applicative de l'application Oper@"],
];
const PROBLEM = [1, 0, 2, 3, 4]; // indexes into NOTICES; first row is the one we focus on
const PROFILE_CPV = ['72000000', '72200000', '72413000', '72224000', '79411000', '72212000'];
const PROFILE_KW = ['RGAA', 'DSFR', 'SecNumCloud', 'accessibilité', 'refonte', 'souverain', 'open data', 'logiciel libre'];
const MATCHES = [
  { pub: '661657-2026', buyer: "Musée de l'Air et de l'Espace", fit: 80, bid: true, deadline: '26 Oct 2026',
    title: 'Refonte architecturale, créative et technique, maintenance et hébergement du site internet',
    why: 'Website redesign and hosting fits core CPV 72413000 plus accessibility/RGAA expertise; verify incumbent and tight fixed-price fit.' },
  { pub: '725720-2026', buyer: 'Saint-Quentin-en-Yvelines', fit: 79.7, bid: true, deadline: '17 Nov 2026',
    title: "Hébergement, maintenance et gestion des sites internet de l'agglomération, accessibilité numérique",
    why: 'Strong match: website hosting, maintenance and accessibility align with RGAA/DSFR expertise and sovereign cloud offer.' },
  { pub: '708553-2026', buyer: 'Mairie de Clichy-la-Garenne', fit: 65.6, bid: true, deadline: '23 Nov 2026', value: '€210k est.',
    title: 'Refonte du site internet de la Ville de Clichy',
    why: 'Pure website refonte matches core offer; €210k fits fixed-price delivery, but Mairie may favor larger incumbent agencies.' },
  { pub: '702985-2026', buyer: 'Économat des Armées', fit: 68.5, bid: false, deadline: '23 Oct 2026',
    title: 'Site web, plateforme évènementielle et application mobile du Forum de Paris pour la Défense et la Stratégie',
    why: 'Mobile app and event platform scope exceeds small senior team capacity, though CPV matches.' },
];
const RIVALS = [
  { name: 'STRATIS', wins: 3, buyers: 3, value: 417, unit: 'k', last: 'Aug 2026',
    ex: { pub: '583632-2026', title: 'Refonte du site internet de la Ville de Poitiers', value: '€141k' } },
  { name: 'NET COM', alias: 'also filed as “NET.COM”', wins: 2, buyers: 2, value: 480, unit: 'k', last: 'Aug 2026',
    ex: { pub: '560331-2026', title: 'Refonte graphique et technique du site du Groupe Polylogis', value: '€280k' } },
  { name: 'ADIMEO', wins: 3, buyers: 3, value: 1.8, unit: 'M', last: 'Dec 2025' },
];
const DOSSIER = [
  'Go / Consider / No-go verdict, with reasons',
  'Award criteria and weights',
  'Notice requirements checked against your profile',
  'Buyer history and bids received',
  'Likely bidders and value range',
  'Draft buyer questions in French (never sent)',
];
const RECEIPTS = ['661657-2026', '725720-2026', '708553-2026', '583632-2026', '560331-2026', '619988-2026'];
const BLIPS = [
  { a: 38, r: 34, label: "Musée de l'Air et de l'Espace", fit: 80 },
  { a: 118, r: 27, label: 'Saint-Quentin-en-Yvelines', fit: 79.7 },
  { a: 212, r: 40, label: 'Ville de Clichy-la-Garenne', fit: 65.6 },
  { a: 300, r: 30, label: 'Économat des Armées', fit: 68.5 },
  { a: 72, r: 44 }, { a: 95, r: 16 }, { a: 150, r: 41 }, { a: 168, r: 22 },
  { a: 245, r: 18 }, { a: 268, r: 45 }, { a: 330, r: 42 }, { a: 12, r: 20 },
  { a: 190, r: 12 }, { a: 350, r: 26 },
];
// On-screen honesty labels, per scene (AGENTS.md: keep demo facts distinct from evidence).
const LABELS = {
  hook: 'Source: TED, EU Publications Office · dev snapshot, 22 Oct 2026',
  profile: 'Rivage Numérique is a fictional demo company',
  matches: 'Real TED notices · fit is a heuristic out of 100, not a win probability',
  rivals: "A past win shows relevant experience. It doesn't prove the company will bid.",
  auto: 'Backtest on 150 past French IT tenders, 22 Oct 2026 · not a win probability',
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
const lanes = [...document.querySelectorAll('.lane')];
lanes.forEach((lane, li) => {
  for (let copy = 0; copy < 2; copy++) {
    for (let i = 0; i < NOTICES.length; i++) {
      const [pub, buyer, title] = NOTICES[(i * 5 + li * 4) % NOTICES.length];
      const row = h('div', 'row');
      row.innerHTML = `<span class="mono">TED ${pub}</span><b>${esc(buyer)}</b><span class="t" lang="fr">${esc(title)}</span>`;
      lane.appendChild(row);
    }
  }
});
const probRows = PROBLEM.map((idx, i) => {
  const [pub, buyer, title] = NOTICES[idx];
  const row = h('div', 'row');
  row.innerHTML = `<span class="mono">${pub}</span><b>${esc(buyer)}</b><span class="t" lang="fr">${esc(title)}</span><span class="tag">${i === 0 ? 'Up against: ?' : 'unread'}</span>`;
  $('probList').appendChild(row);
  return row;
});

function buildScope(el, quiet) {
  el.innerHTML = '<div class="scope-rings"></div><div class="scope-sweep"></div>';
  const blips = [];
  if (!quiet) {
    BLIPS.forEach((b) => {
      const rad = (b.a * Math.PI) / 180;
      const bl = h('span', `blip ${b.label ? 'major' : ''} ${b.a > 180 ? 'left' : ''}`);
      bl.style.left = `${50 + b.r * Math.sin(rad)}%`;
      bl.style.top = `${50 - b.r * Math.cos(rad)}%`;
      if (b.label) bl.innerHTML = `<span class="blip-label">${esc(b.label)}<i>fit ${b.fit}</i></span>`;
      el.appendChild(bl);
      blips.push({ el: bl, a: b.a, label: bl.firstChild });
    });
    el.appendChild(h('span', 'scope-center', 'You'));
  }
  return { sweep: el.querySelector('.scope-sweep'), rings: el.querySelector('.scope-rings'), blips };
}
const revScope = buildScope($('revScope'), false);
const ctaScope = buildScope($('ctaScope'), true);

PROFILE_CPV.forEach((c) => $('profCpv').appendChild(h('span', 'chip mono', c)));
PROFILE_KW.forEach((c) => $('profKw').appendChild(h('span', 'chip', esc(c))));
const BUBBLE = "We're a 40-person agency in Lyon doing accessible websites, DSFR and sovereign cloud for local authorities.";

const matchEls = MATCHES.map((m) => {
  const el = h('div', 'match');
  el.innerHTML = `
    <div class="fit"><svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15.5"/><circle cx="18" cy="18" r="15.5" pathLength="100" stroke-dasharray="0 100"/></svg><span>0</span></div>
    <div class="match-body">
      <div class="match-meta"><span class="verdict ${m.bid ? 'bid' : 'nobid'}">${m.bid ? 'Bid' : 'No-bid'}</span><span>${esc(m.buyer)}</span></div>
      <b lang="fr">${esc(m.title)}</b>
      <p>${esc(m.why)}</p>
      <div class="match-foot"><span>TED ${m.pub}</span><span>Closes ${m.deadline}</span>${m.value ? `<span>${m.value}</span>` : ''}</div>
    </div>`;
  $('matchCard').appendChild(el);
  return { el, m, ring: el.querySelectorAll('circle')[1], num: el.querySelector('.fit span') };
});

const rivalEls = RIVALS.map((r, i) => {
  const el = h('div', 'rival');
  el.innerHTML = `
    <div class="rival-top">
      <span class="rank">#${i + 1}</span>
      <span class="avatar">${r.name.slice(0, 2)}</span>
      <div><b>${r.name}</b>${r.alias ? `<span class="alias">${esc(r.alias)}<span class="merged">merged</span></span>` : `<span class="alias">Last similar win ${r.last}</span>`}</div>
      <dl>
        <div><dt>Similar wins</dt><dd data-k="wins">0</dd></div>
        <div><dt>Buyers</dt><dd data-k="buyers">0</dd></div>
        <div><dt>Known value</dt><dd data-k="value">€0</dd></div>
      </dl>
    </div>
    ${r.ex ? `<div class="rival-ex"><span class="mono">TED ${r.ex.pub}</span><span lang="fr">${esc(r.ex.title)}</span><span class="mono">${r.ex.value}</span></div>` : ''}`;
  $('rivList').appendChild(el);
  return { el, r, dd: [...el.querySelectorAll('dd')] };
});

const dossierEls = DOSSIER.map((d) => {
  const li = h('li', '', `<span class="tick">✓</span><span>${esc(d)}</span>`);
  $('dossierList').appendChild(li);
  return li;
});

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
  const inP = s.start === 0 ? 1 : E.inOut(P(t, s.start - X, 2 * X));
  const outP = s.id === 'cta' ? 1 : 1 - E.inOut(P(t, s.end - X, 2 * X));
  return Math.min(inP, outP);
}

function scope(sc, t, lt, appear) {
  const angle = (t * 72) % 360; // one turn every 5 s
  sc.sweep.style.transform = `rotate(${angle}deg)`;
  sc.blips.forEach((b) => {
    const since = (angle - b.a + 360) % 360; // degrees since the sweep passed
    const seen = lt > (b.a / 72) + appear; // swept at least once since appearing
    const glow = seen ? Math.exp(-since / 70) : 0;
    b.el.style.opacity = seen ? 0.3 + 0.7 * glow : 0;
    b.el.style.boxShadow = `0 0 ${18 * glow}px ${4 * glow}px rgb(198 243 107 / ${0.8 * glow})`;
    if (b.label) b.label.style.opacity = seen ? 0.55 + 0.45 * Math.exp(-since / 140) : 0;
  });
}

let labelText = '';
function render(t) {
  // background drift
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

  // feed lanes across hook + problem
  {
    const end = S.problem.end;
    const fadeIn = E.out(P(t, 0, 0.6));
    const fadeOut = 1 - E.inOut(P(t, end - 0.5, 0.8));
    $('feed').style.opacity = fadeIn * fadeOut;
    $('feed').style.transform = `scale(${lerp(1, 0.9, E.inOut(P(t, end - 0.5, 0.8)))})`;
    // distance travelled: fast in the hook, slowing through the problem
    const v0 = 260, v1 = 26, tS = S.hook.end - 0.8, tE = S.problem.start + 2.2;
    const dist = (tt) => {
      if (tt <= tS) return v0 * tt;
      const k = Math.min(tt, tE) - tS, span = tE - tS;
      const decel = v0 * k - ((v0 - v1) * k * k) / (2 * span);
      return v0 * tS + decel + (tt > tE ? v1 * (tt - tE) : 0);
    };
    const d = dist(t);
    lanes.forEach((lane, i) => {
      const hgt = lane.scrollHeight / 2;
      const off = ((d * [1, 1.3, 0.85][i] + i * 230) % hgt);
      lane.style.transform = `translateY(${-off}px)`;
    });
    const dim = E.inOut(P(t, S.problem.start, 1.2));
    $('feedShade').style.background = `radial-gradient(${lerp(48, 70, dim)}% ${lerp(52, 75, dim)}% at 50% 50%, rgb(10 21 16 / 0.96) 30%, rgb(10 21 16 / ${lerp(0.55, 0.85, dim)}) 70%, rgb(10 21 16 / ${lerp(0.2, 0.7, dim)}))`;
  }

  // logo: appears with the reveal, stays to the end (except under the CTA wordmark-free hold)
  const logoA = E.out(P(t, S.reveal.start + 0.3, 0.8));
  $('logo').style.opacity = logoA;
  $('logo').style.transform = `translateY(${(1 - logoA) * -20}px)`;

  // honesty label for the current scene
  const cur = TL.scenes.find((s) => t >= s.start && t < s.end) ?? TL.scenes[TL.scenes.length - 1];
  const txt = LABELS[cur.id] ?? '';
  if (txt && txt !== labelText) { $('label').textContent = txt; labelText = txt; }
  const lt = t - cur.start;
  const la = txt ? Math.min(E.out(P(lt, 0.7, 0.6)), 1 - E.inOut(P(t, cur.end - 0.45, 0.4))) : 0;
  $('label').style.opacity = la;
  $('label').style.transform = `translateY(${(1 - la) * 14}px)`;
}

const RENDER = {
  hook(lt) {
    const tLand = Math.max(1.6, W('hook', 'seven', 0, 0.55) + 0.25);
    const p = E.expo(P(lt, 0.15, tLand - 0.15));
    $('hookNum').textContent = Math.round(6939 * p).toLocaleString('en-US');
    const bump = P(lt, tLand - 0.1, 0.5);
    $('hookNum').style.transform = `scale(${1 + 0.05 * Math.sin(Math.PI * bump)})`;
    $('hookNum').style.opacity = E.out(P(lt, 0, 0.35));
    rise($('hookSub'), lt, 0.5, 1.0, 40);
  },
  problem(lt) {
    rise($('probA'), lt, 0.1, 0.9);
    const tSo = W('problem', 'so', 0, 0.48) - 0.05;
    rise($('probB'), lt, tSo, 0.9);
    probRows.forEach((row, i) => {
      rise(row, lt, 0.35 + i * 0.09, 0.8, 30);
      const tag = row.querySelector('.tag');
      if (i === 0) {
        const tHot = W('problem', 'blind', 0, 0.75) - 0.15;
        const hp = E.out(P(lt, tHot, 0.5));
        row.classList.toggle('hot', hp > 0.02);
        tag.style.opacity = hp;
        row.style.transform += ` scale(${1 + 0.02 * hp})`;
      } else {
        const tu = 1.1 + (i - 1) * 0.35;
        const up = E.out(P(lt, tu, 0.5));
        row.style.opacity = Math.min(parseFloat(row.style.opacity), 1 - 0.68 * up);
        tag.style.opacity = up;
      }
    });
  },
  reveal(lt, s, t) {
    rise($('revEyebrow'), lt, 0.25, 0.9);
    rise($('revL1'), lt, 0.4, 1.0, 60);
    rise($('revL2'), lt, 0.52, 1.0, 60);
    rise($('revL3'), lt, W('reveal', 'never', 0, 0.7) - 0.25, 1.0, 60);
    const p = E.expo(P(lt, 0.1, 1.4));
    $('revScope').style.opacity = p;
    $('revScope').style.transform = `scale(${lerp(0.7, 1, p)}) rotate(${(1 - p) * -30}deg)`;
    scope(revScope, t, lt, 0.5);
  },
  profile(lt) {
    rise($('profCopy'), lt, 0.15, 1.0);
    const cp = E.expo(P(lt, 0.2, 1.0));
    $('profCard').style.opacity = cp;
    $('profCard').style.transform = `translateY(calc(-50% + ${(1 - cp) * 60}px))`;
    const t0 = 0.55, t1 = 2.4;
    pop($('profBubble'), lt, t0 - 0.2, 0.5);
    const n = Math.round(BUBBLE.length * clamp((lt - t0) / (t1 - t0)));
    $('profText').textContent = BUBBLE.slice(0, n);
    $('profCaret').style.opacity = lt < t1 + 0.2 && Math.floor(lt * 3) % 2 === 0 ? 1 : lt < t1 ? 1 : 0;
    // agent "typing" dots between the message and the saved profile
    const typing = $('profTyping');
    const ty = lt > t1 + 0.1 && lt < t1 + 0.9;
    typing.style.opacity = ty ? 1 : 0;
    [...typing.children].forEach((d, i) => { d.style.opacity = 0.35 + 0.65 * Math.max(0, Math.sin((lt * 7) - i * 0.9)); });
    const pp = $('profProfile');
    const tp = t1 + 0.9;
    rise(pp, lt, tp, 0.8, 30);
    pop($('profCheck'), lt, tp + 0.35, 0.5);
    [...$('profCpv').children, ...$('profKw').children].forEach((c, i) => pop(c, lt, tp + 0.3 + i * 0.07, 0.45));
  },
  matches(lt, s) {
    const cp = E.expo(P(lt, -0.1, 0.8));
    $('matchCard').style.opacity = cp;
    $('matchCard').style.transform = `translateY(calc(-50% + ${(1 - cp) * 60}px))`;
    rise($('matchCopy'), lt, 0.1, 1.0);
    const tWalk = W('matches', 'walk', 0, 0.85) - 0.3;
    matchEls.forEach(({ el, m, ring, num }, i) => {
      const t0 = 0.15 + i * 0.24;
      const p = E.expo(P(lt, t0, 0.9));
      el.style.opacity = p;
      el.style.transform = `translateX(${(1 - p) * -50}px)`;
      const fp = E.out(P(lt, t0 + 0.25, 1.4));
      ring.setAttribute('stroke-dasharray', `${m.fit * fp} 100`);
      num.textContent = fp >= 1 ? String(m.fit) : String(Math.round(m.fit * fp));
      if (!m.bid) {
        const f = E.out(P(lt, tWalk, 0.6));
        el.classList.toggle('focus', f > 0.02);
        el.style.transform += ` scale(${1 + 0.015 * f})`;
      } else {
        const f = E.out(P(lt, tWalk, 0.6));
        el.style.opacity = p * (1 - 0.35 * f);
      }
    });
  },
  rivals(lt) {
    rise($('rivCopy'), lt, 0.15, 1.0);
    const cp = E.expo(P(lt, 0.2, 1.0));
    $('rivCard').style.opacity = cp;
    $('rivCard').style.transform = `translateY(calc(-50% + ${(1 - cp) * 60}px))`;
    rivalEls.forEach(({ el, r, dd }, i) => {
      const t0 = 0.7 + i * 0.45;
      const p = E.expo(P(lt, t0, 0.9));
      el.style.opacity = p;
      el.style.transform = `translateY(${(1 - p) * 34}px)`;
      const cnt = E.out(P(lt, t0 + 0.2, 1.1));
      dd[0].textContent = Math.round(r.wins * cnt);
      dd[1].textContent = Math.round(r.buyers * cnt);
      const v = r.value * cnt;
      dd[2].textContent = `€${r.unit === 'M' ? v.toFixed(1) : Math.round(v)}${r.unit}`;
    });
  },
  auto(lt) {
    rise($('autoHead'), lt, 0.1, 1.0);
    rise($('autoDossier'), lt, 0.4, 1.0, 50);
    rise($('autoBt'), lt, 0.6, 1.0, 50);
    const tScore = W('auto', 'grades', 0, 0.6) - 0.2;
    dossierEls.forEach((li, i) => {
      const td = 1.0 + i * ((tScore - 1.2) / DOSSIER.length);
      li.classList.toggle('done', lt >= td);
      const p = P(lt, td, 0.35);
      li.querySelector('.tick').style.transform = `scale(${lt >= td ? lerp(0.6, 1, E.back(p)) : 1})`;
      li.style.opacity = 0.45 + 0.55 * E.out(p);
    });
    const bp = E.out(P(lt, tScore, 1.4));
    $('btA').style.setProperty('--w', `${(17 / 149) * 400 * bp}%`);
    $('btB').style.setProperty('--w', `${(9 / 150) * 400 * bp}%`);
    const ratio = 1 + 0.9 * E.out(P(lt, tScore + 0.3, 1.3));
    $('btNum').textContent = `${ratio.toFixed(1)}×`;
    $('btNum').style.opacity = E.out(P(lt, tScore, 0.5));
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
    rise($('ctaP'), lt, W('cta', 'try', 0, 0.55) - 0.2, 0.9);
    const bp = pop($('ctaBtn'), lt, W('cta', 'try', 0, 0.55), 0.6);
    const glow = 0.55 + 0.25 * Math.sin(lt * 3);
    $('ctaBtn').style.boxShadow = `0 20px 70px -12px rgb(198 243 107 / ${bp >= 1 ? glow : 0.55})`;
    rise($('ctaFoot'), lt, W('cta', 'try', 0, 0.55) + 0.5, 0.9);
  },
};

await document.fonts.ready;
window.TIMELINE = TL;
window.seek = (t) => render(t);
render(Number(new URLSearchParams(location.search).get('t') ?? 0));
window.filmReady = true;
