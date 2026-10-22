// Hackathon presentation at /hackathon: a keyboard-driven slide deck about what
// we built, why, and the evidence that it works. Public; no data is fetched
// unless the viewer is signed in (the live check on the proof slide).
// Every number below is either fetched live (labelled LIVE) or copied from the
// dev snapshot in /hackathon/evidence.json (labelled SNAPSHOT with its time).
import { ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import '../hackathon.css';

const APP_URL = 'https://r1-app-3000-01m5hdrkrrdjwzypfyr1tmy68g.apps.simple-agent-manager.org';
const REPO = 'https://github.com/raphaeltm/oct-22-hack';
const TED = (pub: string) => `https://ted.europa.eu/en/notice/-/detail/${pub}`;
const SNAP = 'Snapshot from dev · 22 Oct 2026, 11:52 UTC';

// Copied from evidence.json (dev, 22 Oct 2026 11:52 UTC).
const SNAPSHOT = {
  tedTotal: 6939,
  dbTotal: 6939,
  notices: 4329,
  awardNotices: 2610,
  open: 192,
  backtest: { graded: 151, hits: 18 },
  baseline: { graded: 151, hits: 9 },
  live: { predicted: 22, graded: 1, hits: 1, pending: 21 },
  incumbent: { graded: 35, hits: 1 },
};

type Tag = 'C1' | 'C2' | 'C3' | 'C4' | 'C5';
const CRITERIA: Record<Tag, string> = {
  C1: 'Customer problem',
  C2: 'Agent capability',
  C3: 'Data at the core',
  C4: 'Evidence it works',
  C5: 'Execution & pitch',
};

type Label = 'live' | 'snapshot' | 'recorded' | 'fictional' | 'planned';
const LABELS: Record<Label, string> = {
  live: 'Live',
  snapshot: 'Snapshot',
  recorded: 'Recorded run',
  fictional: 'Fictional demo company',
  planned: 'Not built yet',
};

type SlideDef = {
  id: string;
  title: string;
  tags?: Tag[];
  labels?: Label[];
  dark?: boolean;
  notes: string;
  body: ReactNode;
};

export function Hackathon() {
  const slides = useMemo(() => orderSlides(buildSlides()), []);
  const [i, setI] = useState(() => initialIndex(slides));
  const [notes, setNotes] = useState(false);
  const [overview, setOverview] = useState(false);
  const deck = useRef<HTMLDivElement>(null);
  const n = slides.length;

  const go = useCallback((to: number) => setI(Math.max(0, Math.min(n - 1, to))), [n]);

  useEffect(() => {
    const id = slides[i].id;
    if (location.hash.slice(1) !== id) history.replaceState(null, '', `#${id}`);
    deck.current?.querySelector<HTMLElement>(`[data-slide="${id}"] h1, [data-slide="${id}"] h2`)?.focus({ preventScroll: true });
  }, [i, slides]);

  useEffect(() => {
    const onHash = () => setI(initialIndex(slides));
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [slides]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if ((e.target as Element).closest('input, textarea, select')) return;
      if (window.innerWidth <= 900) return;
      const k = e.key;
      if (k === 'ArrowRight' || k === 'PageDown' || (k === ' ' && !e.shiftKey)) go(i + 1);
      else if (k === 'ArrowLeft' || k === 'PageUp' || (k === ' ' && e.shiftKey)) go(i - 1);
      else if (k === 'Home') go(0);
      else if (k === 'End') go(n - 1);
      else if (k === 'n' || k === 'N') setNotes((v) => !v);
      else if (k === 'o' || k === 'O' || k === 'Escape') setOverview((v) => (k === 'Escape' ? false : !v));
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [i, n, go]);

  useEffect(() => {
    const prev = document.title;
    document.title = 'Radar · Hackathon presentation';
    return () => {
      document.title = prev;
    };
  }, []);

  const s = slides[i];
  return (
    <div className={`hk${overview ? ' hk-overview' : ''}`} ref={deck}>
      <header className="hk-bar">
        <Link to="/" className="hk-logo" aria-label="Radar home">
          radar<i>.</i> <span>hackathon</span>
        </Link>
        <span className="hk-bar-title" aria-live="polite">
          {i + 1} / {n} · {s.title}
        </span>
        <span className="hk-bar-actions">
          <button type="button" onClick={() => setOverview((v) => !v)} aria-pressed={overview}>
            Overview <kbd>O</kbd>
          </button>
          <button type="button" onClick={() => setNotes((v) => !v)} aria-pressed={notes}>
            Notes <kbd>N</kbd>
          </button>
          <a href={APP_URL} target="_blank" rel="noreferrer" className="hk-bar-cta">
            Live app ↗
          </a>
        </span>
      </header>

      <main className="hk-stage">
        {slides.map((sl, k) => (
          <section
            key={sl.id}
            id={sl.id}
            data-slide={sl.id}
            className={`hk-slide${sl.dark ? ' hk-dark' : ''}${k === i ? ' is-current' : ''}`}
            aria-label={`Slide ${k + 1}: ${sl.title}`}
            onClick={overview ? () => (go(k), setOverview(false)) : undefined}
          >
            <div className="hk-slide-inner">
              {(sl.tags?.length || sl.labels?.length) && (
                <div className="hk-meta">
                  {sl.tags?.map((t) => (
                    <span key={t} className="hk-crit" title={`Judging criterion: ${CRITERIA[t]}`}>
                      {CRITERIA[t]}
                    </span>
                  ))}
                  {sl.labels?.map((l) => (
                    <span key={l} className={`hk-label hk-label-${l}`}>
                      {LABELS[l]}
                    </span>
                  ))}
                </div>
              )}
              {sl.body}
            </div>
            {notes && k === i && (
              <aside className="hk-notes" aria-label="Speaker notes">
                <strong>Speaker notes</strong> {sl.notes}
              </aside>
            )}
          </section>
        ))}
      </main>

      <nav className="hk-nav" aria-label="Slides">
        <button type="button" onClick={() => go(i - 1)} disabled={i === 0} aria-label="Previous slide">
          ←
        </button>
        <ol>
          {slides.map((sl, k) => (
            <li key={sl.id}>
              <button
                type="button"
                className={k === i ? 'on' : ''}
                aria-current={k === i ? 'step' : undefined}
                aria-label={`Go to slide ${k + 1}: ${sl.title}`}
                title={sl.title}
                onClick={() => go(k)}
              />
            </li>
          ))}
        </ol>
        <button type="button" onClick={() => go(i + 1)} disabled={i === n - 1} aria-label="Next slide">
          →
        </button>
      </nav>
      <div className="hk-progress" style={{ width: `${((i + 1) / n) * 100}%` }} />
    </div>
  );
}

// Story order: the pivot comes right after the problem; the rest follows the build.
const ORDER = ['title', 'problem', 'edge', 'pitch', 'foundation', 'brainstorm', 'timeline'];
function orderSlides(all: SlideDef[]) {
  const rank = (id: string) => (ORDER.includes(id) ? ORDER.indexOf(id) : ORDER.length);
  return all.map((sl, k) => ({ sl, k })).sort((x, y) => rank(x.sl.id) - rank(y.sl.id) || x.k - y.k).map((x) => x.sl);
}

function initialIndex(slides: SlideDef[]) {
  const h = decodeURIComponent(location.hash.slice(1));
  const k = slides.findIndex((s) => s.id === h);
  if (k >= 0) return k;
  const num = Number(h);
  return Number.isInteger(num) && num >= 1 && num <= slides.length ? num - 1 : 0;
}

/* ------------------------------------------------------------------ slides */

function buildSlides(): SlideDef[] {
  return [
    {
      id: 'title',
      title: 'Radar',
      dark: true,
      tags: ['C5'],
      notes:
        'Open with the one-liner: "a platform that helps small French IT firms find the partners to bid together". Be clear that the radar underneath is live and the partner finder is what we are building now.',
      body: (
        <div className="hk-title">
          <p className="hk-kicker">Future Founders · Data-Centric Agents · 22 Oct 2026</p>
          <h1 tabIndex={-1}>
            Win the tenders <br /><em>too big to bid alone.</em>
          </h1>
          <p className="hk-lede">
            Radar is a collaborative platform that helps small French IT firms find the partners they need to bid together, as a
            <i> groupement</i>. Underneath sits a working agent that reads every French public IT tender on TED, says which to
            bid on and who won work like it, and does the pre-bid homework on its own.{' '}
            <strong>Every claim links to its TED notice.</strong>
          </p>
          <div className="hk-row">
            <a className="hk-btn hk-btn-primary" href={APP_URL} target="_blank" rel="noreferrer">
              Open the live app ↗
            </a>
            <a className="hk-btn" href={REPO} target="_blank" rel="noreferrer">
              Source on GitHub ↗
            </a>
            <span className="hk-hint">
              <kbd>←</kbd> <kbd>→</kbd> to move · <kbd>N</kbd> notes · <kbd>O</kbd> overview
            </span>
          </div>
        </div>
      ),
    },
    {
      id: 'problem',
      title: 'The customer and the problem',
      tags: ['C1'],
      labels: ['fictional', 'snapshot'],
      notes:
        'The user is specific: a French ESN of 10 to 250 people with one or two people doing business development. Rivage is fictional; say so. The TED numbers are real and come from the dev database.',
      body: (
        <div className="hk-split">
          <div>
            <h2 tabIndex={-1}>
              Small agencies <em>bid alone, and blind.</em>
            </h2>
            <p className="hk-lede">
              French public buyers publish every IT tender and every award on TED. Large integrators have bid offices that read
              it all. A 40-person agency has two people doing sales next to delivery.
            </p>
            <ul className="hk-list">
              <li>
                <b>They miss tenders.</b> Notices are long, in French and spread over thousands of buyers.
              </li>
              <li>
                <b>They spend days on bids they can't win</b>, because nobody checked who usually wins with that buyer.
              </li>
              <li>
                <b>They don't know the competition.</b> The award notices name every winner, but nobody joins them up.
              </li>
              <li>
                <b>They can't cover the whole lot.</b> Tenders bundle design, build, hosting and support. Missing one piece
                turns a tender that mostly fits into a no-go, unless you find a partner in time.
              </li>
            </ul>
          </div>
          <div className="hk-card hk-persona">
            <p className="hk-kicker">Our demo user (fictional)</p>
            <h3>Rivage Numérique, Lyon</h3>
            <p>
              40-person digital agency (ESN). RGAA accessibility, DSFR, sovereign cloud, open data. Sells to métropoles,
              départements, hospitals.
            </p>
            <div className="hk-stats">
              <Stat value={fmt(SNAPSHOT.tedTotal)} label="French IT notices on TED since Jan 2025 (CPV 72*)" />
              <Stat value={fmt(SNAPSHOT.awardNotices)} label="award notices naming the winners" />
              <Stat value={fmt(SNAPSHOT.open)} label="tenders open right now" />
              <Stat value="155" label="award notices with a multi-company bidder (groupement)" />
            </div>
            <p className="hk-foot">
              {SNAP}. Counts from our Postgres; the TED total matches TED's own API (see “Proof”). Groupements: TED API, 12:35 UTC.
            </p>
          </div>
        </div>
      ),
    },
    {
      id: 'pitch',
      title: 'Pitch slide',
      dark: true,
      tags: ['C1', 'C5'],
      notes:
        'The one pitch slide the rules ask for: who, why now, first users. The platform grows itself: every partner invite brings a new company onto Radar.',
      body: (
        <div>
          <p className="hk-kicker">The one pitch slide</p>
          <h2 tabIndex={-1}>
            Who it's for, why now, <em>how we reach them.</em>
          </h2>
          <div className="hk-grid3">
            <div className="hk-card">
              <h3>Who</h3>
              <p>
                French SME digital agencies and IT consultancies (10–250 staff) that bid on public contracts without a bid team,
                and the partners they need to cover a whole tender. Next: any SME selling to the public sector.
              </p>
            </div>
            <div className="hk-card">
              <h3>Why now</h3>
              <p>
                Since 2023–24, TED publishes every EU notice as structured <b>eForms</b> with a free API, including{' '}
                <b>who bid together</b>, who won and how many bids came in. Agents can now read the French text, find the
                gap in your offer and draft the approach to a partner.
              </p>
            </div>
            <div className="hk-card">
              <h3>First users</h3>
              <p>
                <b>Every invite is a new user.</b> A partner who gets a proposal can claim their profile and get their own
                radar. Seed it from the data: every award notice names its winners, so we can reach each firm with its own
                matches. Channels: Numeum, CINOV, regional digital clusters.
              </p>
            </div>
          </div>
          <p className="hk-statement">
            Others alert you to tenders or draft your answer. <em>Radar finds who to bid with, and the network gets better
            with every reply.</em>
          </p>
        </div>
      ),
    },
    {
      id: 'brainstorm',
      title: 'How we brainstormed',
      tags: ['C5'],
      notes:
        'Show the reasoning, not just the result. We started from the YC landscape, found it was US-federal heavy, picked EU SMEs, then pushed for a point of difference: autonomy plus learning from outcomes.',
      body: (
        <div className="hk-split hk-split-wide">
          <div>
            <h2 tabIndex={-1}>
              From a market map <em>to one sharp user.</em>
            </h2>
            <ol className="hk-steps">
              <li>
                <b>Mapped the RFP space.</b> YC companies in three segments: responding (Inventive, GovEagle), issuing
                (Hazel, Bonfire) and discovery (Usul, Govly). Almost all target US federal contracting.
              </li>
              <li>
                <b>Found the gap.</b> European public procurement and small professional-services firms that can't afford a
                bid team.
              </li>
              <li>
                <b>Picked the data first.</b> TED is free, structured and has both tenders <i>and</i> awards, so an agent can
                learn who wins what.
              </li>
              <li>
                <b>Asked “what makes it unique?”</b> French tools split into alert feeds and AI writers. None we found learns
                from outcomes. That became Autopilot: it does the homework unprompted, logs predictions, grades itself.
              </li>
              <li>
                <b>A mentor: “you have no edge.”</b> Fair. A radar is easy to copy. We pivoted to what only French data plus a
                network gives: helping small firms find the partners to bid together.
              </li>
            </ol>
          </div>
          <div className="hk-card">
            <p className="hk-kicker">Ideas we dropped, and why</p>
            <table className="hk-table">
              <tbody>
                <tr>
                  <td>Security-questionnaire responder</td>
                  <td>Listed in our ideas file; not chosen. The market map pointed at EU tenders for SMEs instead.</td>
                </tr>
                <tr>
                  <td>Buyer-side RFP evaluator</td>
                  <td>Listed in our ideas file; not chosen for the same reason.</td>
                </tr>
                <tr>
                  <td>Irish IT services</td>
                  <td>Switched to France two minutes after agreeing to it: the owner's call.</td>
                </tr>
                <tr>
                  <td>ClickHouse, Kafka, OpenSearch</td>
                  <td>“Overkill for the timeframe.” A few thousand award rows fit Postgres full-text search.</td>
                </tr>
                <tr>
                  <td>Companies House, GDELT, DECP bulk data</td>
                  <td>Too much to integrate in 5 hours; DECP and BOAMP are on the roadmap.</td>
                </tr>
                <tr>
                  <td>SWOT generator (#14)</td>
                  <td>The Autopilot dossier already covers it with sourced facts.</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ),
    },
    {
      id: 'edge',
      title: 'The pivot: bid together',
      tags: ['C1', 'C3', 'C5'],
      labels: ['planned'],
      notes:
        'A mentor told us we had no edge. Our answer comes from the data: French buyers let SMEs bid together as a groupement, and TED records those groups. The partner finder is being designed now; the count on this slide is real, the feature is not built yet.',
      body: (
        <div className="hk-split hk-split-wide">
          <div>
            <p className="hk-kicker">The pivot · 12:30, after mentor feedback</p>
            <h2 tabIndex={-1}>
              “You have no edge.” <em>So we looked for one only French data gives.</em>
            </h2>
            <p className="hk-lede">
              A small agency often can't cover a whole tender alone. French public procurement lets SMEs bid together as a
              <i> groupement</i> (co-traitance), and TED award notices record who teamed up with whom. Today we flatten those
              groups into plain winners and throw the signal away.
            </p>
            <div className="hk-stats hk-stats-row">
              <Stat value="155" label="French IT award notices since 2025 with a multi-company bidder" />
              <Stat value={fmt(SNAPSHOT.awardNotices)} label="award notices checked" />
            </div>
            <p className="hk-foot">
              Counted from TED's API at 12:35 UTC: a bidding party with more member companies than party names (a heuristic;
              some may be subcontracting). Examples:{' '}
              <a href={TED('17241-2025')} target="_blank" rel="noreferrer">17241-2025</a> “GRP KSHUTTLE” = Deloitte Conseil + KSHUTTLE
              for SNCF;{' '}
              <a href={TED('4575-2025')} target="_blank" rel="noreferrer">4575-2025</a> ENGIT + MEJA (co-traitance) for the
              Bouches-du-Rhône département.
            </p>
          </div>
          <div className="hk-card">
            <p className="hk-kicker">Partner finder (being built now, not in the demo)</p>
            <ol className="hk-steps">
              <li>
                <b>Find:</b> for a tender, rank firms that fill your gaps, have bid jointly before, know this buyer and don't
                compete with you. Every signal links to its notice.
              </li>
              <li>
                <b>Reach out:</b> the agent drafts a formal French proposal citing the tender and the partner's own wins.{' '}
                <i>You</i> send it; Radar never emails anyone on its own.
              </li>
              <li>
                <b>Score the reply:</b> interest, role, capacity, references. Reply text is treated as untrusted input.
              </li>
              <li>
                <b>Grow:</b> the reply page invites the partner to claim their profile and get their own radar.
              </li>
            </ol>
            <p className="hk-callout">
              Why it's hard to copy: a network. Who answers, how fast and with which references is data nobody can scrape,
              and every invite brings a new company onto the platform.
            </p>
          </div>
        </div>
      ),
    },
    {
      id: 'foundation',
      title: 'What the platform stands on',
      tags: ['C2', 'C3'],
      labels: ['live', 'planned'],
      notes:
        'The pivot does not throw work away. Every partner-finder step reuses something that already runs on dev. Be precise about which column is live.',
      body: (
        <div>
          <h2 tabIndex={-1}>
            The radar is live. <em>The network builds on it.</em>
          </h2>
          <table className="hk-table hk-table-big">
            <thead>
              <tr>
                <th>Partner-finder step (planned)</th>
                <th>Already running on dev</th>
              </tr>
            </thead>
            <tbody>
              {FOUNDATION.map((f) => (
                <tr key={f[0]}>
                  <td>
                    <b>{f[0]}</b>
                  </td>
                  <td>{f[1]}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="hk-callout">
            Live today: a pre-bid dossier for a tender worth more than €1M already tells a small firm to consider a groupement
            or subcontracting. What's missing is <i>who</i> to call. That's the partner finder.
          </p>
        </div>
      ),
    },
    {
      id: 'timeline',
      title: 'How we built it in one morning',
      tags: ['C5'],
      labels: ['snapshot'],
      notes:
        'One human steering many parallel coding agents (SAM sessions), coordinated through GitHub issues, a build-it label and agent channels. Times are UTC. The browser user test found real bugs, which we fixed.',
      body: (
        <div>
          <h2 tabIndex={-1}>
            One human, many agents, <em>one morning.</em>
          </h2>
          <div className="hk-timeline">
            {TIMELINE.map((t) => (
              <div key={t.t} className="hk-tl">
                <span className="hk-mono">{t.t}</span>
                <p>{t.e}</p>
              </div>
            ))}
          </div>
          <div className="hk-stats hk-stats-row">
            <Stat value="~4h20" label="first commit 08:08 → last merge 12:30 UTC" />
            <Stat value="36" label="commits on main" />
            <Stat value="18" label="pull requests merged" />
            <Stat value="25" label="agent sessions (SAM), many in parallel" />
            <Stat value="3" label="people: one steering the agents, two filing issues and reviewing" />
          </div>
          <p className="hk-foot">
            From git history, GitHub and SAM session logs. Issues labelled <code>build-it</code> are implemented, tested in a
            browser, merged and deployed to dev by an agent.
          </p>
        </div>
      ),
    },
    {
      id: 'decisions',
      title: 'Why we built it this way',
      tags: ['C3', 'C5'],
      notes:
        'Each choice was deliberate and has a trade-off. Highlight that the verdict is rule-based and Claude only writes prose: that keeps the decision auditable.',
      body: (
        <div>
          <h2 tabIndex={-1}>
            Decisions <em>and their trade-offs.</em>
          </h2>
          <table className="hk-table hk-table-big">
            <thead>
              <tr>
                <th>Decision</th>
                <th>Why</th>
                <th>Trade-off we accept</th>
              </tr>
            </thead>
            <tbody>
              {DECISIONS.map((d) => (
                <tr key={d[0]}>
                  <td>
                    <b>{d[0]}</b>
                  </td>
                  <td>{d[1]}</td>
                  <td>{d[2]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ),
    },
    {
      id: 'dataflow',
      title: 'The data layer',
      dark: true,
      tags: ['C3'],
      notes:
        'Walk the arrows left to right. The point: the agent is useless without the joined tender → award → winner → buyer data, and that data refreshes itself every six hours.',
      body: (
        <div>
          <h2 tabIndex={-1}>
            Where the data lives <em>and how it flows.</em>
          </h2>
          <div className="hk-flow" role="list">
            {FLOW.map((f, k) => (
              <div key={f.k} className="hk-flow-step" role="listitem">
                <span className="hk-mono">{String(k + 1).padStart(2, '0')}</span>
                <h3>{f.k}</h3>
                <p>{f.d}</p>
              </div>
            ))}
          </div>
          <div className="hk-grid3 hk-tight">
            <div className="hk-card">
              <h3>Fresh</h3>
              <p>BullMQ re-imports TED every 6 hours. Each import re-grades predictions and wakes Autopilot.</p>
            </div>
            <div className="hk-card">
              <h3>Grounded</h3>
              <p>
                Generated French <code>tsvector</code> (title &gt; buyer &gt; description) with GIN indexes; winners merged across
                name variants (“CGI FRANCE” = “CGI France”).
              </p>
            </div>
            <div className="hk-card">
              <h3>Remembered</h3>
              <p>Company profile, chat memory, decisions, learned rules and every prediction live in the same Postgres.</p>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'agent',
      title: 'The agent',
      tags: ['C2'],
      notes:
        'Beyond a single LLM call: a tool-using chat agent, three helper agents, and an autonomous loop that runs without a prompt and learns from feedback.',
      body: (
        <div className="hk-split hk-split-wide">
          <div>
            <h2 tabIndex={-1}>
              It works <em>while you don't.</em>
            </h2>
            <div className="hk-loop">
              {LOOP.map((l, k) => (
                <div key={l.k} className="hk-loop-step">
                  <span className="hk-mono">{k + 1}</span>
                  <div>
                    <b>{l.k}</b>
                    <p>{l.d}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="hk-card">
            <p className="hk-kicker">Copilot: Mastra + Claude, 12 tools</p>
            <ul className="hk-tools">
              {TOOLS.map((t) => (
                <li key={t[0]}>
                  <code>{t[0]}</code> {t[1]}
                </li>
              ))}
            </ul>
            <p className="hk-foot">
              Plus three helper agents (match rationales, dossier memo, competitor research). All 12 tools are also exposed
              over an <b>MCP server with OAuth 2.1</b>, so you can use Radar from Claude or ChatGPT.
            </p>
          </div>
        </div>
      ),
    },
    {
      id: 'journey',
      title: 'The end-to-end journey',
      tags: ['C1', 'C2'],
      labels: ['snapshot', 'fictional'],
      notes:
        'This is the demo path. If presenting live, switch to the app here. The screenshots are a fallback and are labelled as such.',
      body: (
        <div>
          <h2 tabIndex={-1}>
            One journey, <em>start to finish.</em>
          </h2>
          <div className="hk-journey">
            <Shot src="autopilot" step="1" caption="Autopilot inbox: 22 dossiers built without being asked; Go first." />
            <Shot src="dossier" step="2" caption="A dossier: verdict, calendar, criteria, likely bidders, draft questions in French." />
            <Shot src="competitors" step="3" caption="Competitors ranked from real award notices, not seeded." />
            <Shot src="tenders" step="4" caption="Matched tenders with a fit score and a one-line reason." />
          </div>
          <p className="hk-foot">Screenshots of the dev deployment, 22 Oct 2026 ~11:55 UTC, demo user. Try it yourself: last slide.</p>
        </div>
      ),
    },
    {
      id: 'live-run',
      title: 'A real agent run',
      tags: ['C2', 'C3'],
      labels: ['recorded'],
      notes:
        'This was a real run on dev at 11:58 UTC with a live model; it took about two minutes including tool calls. Note it refuses to call anyone an incumbent because the award data starts in 2025.',
      body: (
        <div className="hk-split hk-split-shot">
          <div>
            <h2 tabIndex={-1}>
              “Who are we <em>up against?”</em>
            </h2>
            <p className="hk-quote">
              “Who are we likely up against on this Clichy website tender, and who won similar contracts from this buyer? Cite TED
              notices.”
            </p>
            <p>
              The agent called its tools, read the award history, and answered with a ranked table drawn from real awards:
            </p>
            <table className="hk-table">
              <thead>
                <tr>
                  <th>Bidder</th>
                  <th>Similar wins</th>
                  <th>Known value</th>
                  <th>Last win</th>
                </tr>
              </thead>
              <tbody>
                <tr><td>STRATIS</td><td>3 (3 buyers)</td><td>€417k</td><td>Aug 2026</td></tr>
                <tr><td>NET COM</td><td>2 (2 buyers)</td><td>€480k</td><td>Aug 2026</td></tr>
                <tr><td>ADIMEO</td><td>3 (3 buyers)</td><td>€1.77M</td><td>Dec 2025</td></tr>
                <tr><td>Advency</td><td>2 (2 buyers)</td><td>€404k</td><td>Mar 2026</td></tr>
                <tr><td>Orange Business Services</td><td>1</td><td>€238k</td><td>Aug 2026</td></tr>
              </tbody>
            </table>
            <p className="hk-callout">
              It also said what it <i>can't</i> know: “TED award data only goes back to 2025, so this doesn't mean there's no
              incumbent, just that we can't see one in the data.”
            </p>
            <p className="hk-foot">
              Tender <a href={TED('708553-2026')} target="_blank" rel="noreferrer">TED 708553-2026</a> · run on dev at 11:58 UTC, ~2 min
              end to end · Rivage profile is fictional, award data is real.
            </p>
          </div>
          <Shot src="chat" caption="The same run in the copilot panel." tall />
        </div>
      ),
    },
    {
      id: 'proof',
      title: 'Proof the data is real',
      dark: true,
      tags: ['C3', 'C4'],
      labels: ['snapshot', 'live'],
      notes:
        'Two independent counts that match: TED says 6,939 notices for our query, our database holds 6,939. Click any publication number to open the notice on TED. If signed in, press the button to fetch live numbers.',
      body: (
        <div className="hk-split hk-split-wide">
          <div>
            <h2 tabIndex={-1}>
              Real sources, <em>checkable by you.</em>
            </h2>
            <pre className="hk-term" aria-label="Terminal output">
              <span className="c"># TED's own API, 22 Oct 2026 11:52 UTC</span>
              {'\n'}$ curl -X POST https://api.ted.europa.eu/v3/notices/search \{'\n'}
              {'    '}-d '{'{'}"query":"buyer-country=FRA AND classification-cpv IN (72* 79411000){'\n'}
              {'         '}AND publication-date&gt;=20250101 AND notice-type IN (cn-standard can-standard)"{'}'}'{'\n'}
              <b>totalNoticeCount: 6939</b>
              {'\n\n'}
              <span className="c"># Radar on dev, same minute</span>
              {'\n'}$ curl -b cookies $APP/api/tenders?limit=1{'\n'}
              <b>{'{'}"total": 6939{'}'}</b>, newest: "731322-2026" EPSF, €450,000{'\n'}
              {'\n'}
              <span className="c"># dev app logs (SAM deployment logs)</span>
              {'\n'}seeded company: Rivage Numérique{'\n'}[jobs] workers started{'\n'}server listening on :3000
            </pre>
            <p className="hk-foot">
              Raw responses: <a href="/hackathon/evidence.json">evidence.json</a>. Spot-check any notice:{' '}
              <a href={TED('731322-2026')} target="_blank" rel="noreferrer">731322-2026</a>,{' '}
              <a href={TED('708553-2026')} target="_blank" rel="noreferrer">708553-2026</a>,{' '}
              <a href={TED('566577-2026')} target="_blank" rel="noreferrer">566577-2026</a>.
            </p>
          </div>
          <LiveCheck />
        </div>
      ),
    },
    {
      id: 'evidence',
      title: 'Evidence it works',
      tags: ['C4'],
      labels: ['snapshot'],
      notes:
        'The question: does past award data point to the eventual winner? On 151 past tenders, an actual winner was in the agent\'s top 5 for 18; the naive "most frequent winners" baseline got 9. Same tenders, same scoring. Say the limitations out loud.',
      body: (
        <div className="hk-split hk-split-wide">
          <div>
            <h2 tabIndex={-1}>
              2× the naive baseline, <em>on a backtest.</em>
            </h2>
            <p className="hk-lede">
              For each past tender that now has an award notice, the agent names 5 likely winners using only awards published
              <i> before</i> the tender. A hit means a real winner is in that top 5.
            </p>
            <BarCompare />
            <div className="hk-stats hk-stats-row">
              <Stat value={`${SNAPSHOT.live.predicted}`} label="live tenders predicted by Autopilot" />
              <Stat value={`${SNAPSHOT.live.hits}/${SNAPSHOT.live.graded}`} label="live predictions graded so far: hit" />
              <Stat value={`${SNAPSHOT.live.pending}`} label="still waiting for their award notice" />
            </div>
          </div>
          <div className="hk-card">
            <p className="hk-kicker">Graded examples (real TED awards)</p>
            <ul className="hk-hits">
              {HITS.map((h) => (
                <li key={h.pub}>
                  <a href={TED(h.pub)} target="_blank" rel="noreferrer" className="hk-mono">
                    {h.pub}
                  </a>{' '}
                  {h.buyer}: <b>{h.winner}</b> was in the top 5
                </li>
              ))}
            </ul>
            <p className="hk-kicker hk-mt">What this does not show</p>
            <ul className="hk-list hk-small">
              <li>Not who actually bid: TED doesn't publish bidder lists. Not whether you should bid.</li>
              <li>Multi-winner frameworks make hits easier (1.3 winners per tender on average).</li>
              <li>The common-word list for text matching uses all notices, including later ones (a small leak we disclose).</li>
              <li>“Last similar supplier wins again” held in only 1/35 tenders, so we never call anyone the incumbent.</li>
              <li>Fit scores are heuristics, not win probabilities.</li>
            </ul>
          </div>
        </div>
      ),
    },
    {
      id: 'learning',
      title: 'It learns from you',
      tags: ['C2', 'C4'],
      labels: ['snapshot', 'fictional'],
      notes:
        'Show the feedback loop: one skip with a reason creates a visible ranking rule. Rules are explainable, not hidden weights. Weights only re-learn after enough decisions.',
      body: (
        <div className="hk-split hk-split-shot">
          <div>
            <h2 tabIndex={-1}>
              Every decision <em>changes the ranking.</em>
            </h2>
            <p className="hk-lede">Mark a tender Bid, Skip (with a reason), Won or Lost. Radar turns it into an explicit rule:</p>
            <table className="hk-table">
              <tbody>
                <tr><td>Skip · buyer we don't work with</td><td>−20 for that buyer</td></tr>
                <tr><td>Skip · outside our services</td><td>−15 for those specific CPV codes</td></tr>
                <tr><td>Skip · too large / too small</td><td>−15 / −10 for similar values</td></tr>
                <tr><td>Skip · wrong region</td><td>−10 outside the region</td></tr>
                <tr><td>Bid / Won</td><td>+5 / +10 for that buyer</td></tr>
              </tbody>
            </table>
            <p>
              After 2+ positive and 2+ negative decisions it also re-weights its signals (CPV, text, buyer, region), shrunk
              toward the defaults so one click can't swing it.
            </p>
            <p className="hk-callout">
              On dev now: the demo user skipped “Prestations de refonte de l'application FUNYMOP” as outside their services.
              The tender left the inbox and a <b>−15</b> rule for CPV 72262000 appeared.
            </p>
          </div>
          <Shot src="scorecard" caption="“What it learned from you” and the prediction scorecard, in the product." tall />
        </div>
      ),
    },
    {
      id: 'status',
      title: "What works, what doesn't",
      tags: ['C4', 'C5'],
      notes:
        'Be candid. Judges reward honest limits. The big gap against the rules: we are not on Aiven yet. The app only needs DATABASE_URL and REDIS_URL, and a teammate has an unmerged branch for Aiven Runtime.',
      body: (
        <div>
          <h2 tabIndex={-1}>
            Honest status, <em>22 Oct 2026.</em>
          </h2>
          <div className="hk-grid3">
            <StatusCol kind="ok" title="Working on dev" items={STATUS.ok} />
            <StatusCol kind="partial" title="Works, with limits" items={STATUS.partial} />
            <StatusCol kind="no" title="Not done" items={STATUS.no} />
          </div>
        </div>
      ),
    },
    {
      id: 'roadmap',
      title: "What's next",
      tags: ['C5'],
      labels: ['planned'],
      notes: 'Everything here is planned, not built. Most items already have a GitHub issue.',
      body: (
        <div>
          <h2 tabIndex={-1}>
            What we'd build <em>next.</em>
          </h2>
          <div className="hk-grid3 hk-grid4">
            {ROADMAP.map((r) => (
              <div className="hk-card" key={r.h}>
                <p className="hk-kicker">{r.when}</p>
                <h3>{r.h}</h3>
                <ul className="hk-list hk-small">
                  {r.items.map((it) => (
                    <li key={it}>{it}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      ),
    },
    {
      id: 'try',
      title: 'Try it',
      dark: true,
      tags: ['C5'],
      notes: 'Invite a judge to type their own question. A live run on judge input beats any slide.',
      body: (
        <div className="hk-title">
          <p className="hk-kicker">Your turn</p>
          <h2 tabIndex={-1}>
            Ask it something <em>we didn't rehearse.</em>
          </h2>
          <ol className="hk-steps hk-steps-light">
            <li>
              Open <a href={APP_URL} target="_blank" rel="noreferrer">the live app</a> and click <b>Try the live demo</b>.
            </li>
            <li>
              Sign in with <code>demo@rivage-numerique.fr</code> / <code>rivage-demo-2026</code> (a fictional company; the data is real).
            </li>
            <li>
              Ask: <i>“What should we bid on this month?”</i>, <i>“Which open tenders are too big for us alone?”</i>, or open Autopilot and press
              <b> Skip…</b> to watch it learn.
            </li>
          </ol>
          <div className="hk-row">
            <a className="hk-btn hk-btn-primary" href={`${APP_URL}/login?demo=1`} target="_blank" rel="noreferrer">
              Try the live demo ↗
            </a>
            <a className="hk-btn" href={REPO} target="_blank" rel="noreferrer">
              Read the code ↗
            </a>
          </div>
        </div>
      ),
    },
  ];
}

/* ------------------------------------------------------------------ content */

const TIMELINE = [
  { t: '08:08', e: 'Empty repo. Research the RFP market (YC map) and paste in the challenge rules.' },
  { t: '08:50', e: 'Pick the RFP/tender direction. “Postgres for everything”, Redis for queues and live streams.' },
  { t: '09:06', e: 'Scope: TED + a fictional company + competitors from past winners. Ten GitHub issues filed.' },
  { t: '09:27', e: '“Actually, let\'s make it a French company.” Ireland → France.' },
  { t: '09:40', e: 'Schema, login, TED importer, job queue, UI and matching land in parallel.' },
  { t: '10:23', e: 'Browser user test on dev finds bad matches, wrong deadlines, noisy research. Fixed.' },
  { t: '10:45', e: '“Lots of competitors. What makes us unique?” → Autopilot: autonomy + learning.' },
  { t: '11:21', e: 'Autopilot ships; MCP server with OAuth; scorecard made fair (same tenders for both).' },
  { t: '12:07', e: 'Teammates\' issues ship: deadline sort, richer company page, read time, a one-minute homepage film.' },
  { t: '12:30', e: 'A mentor says “you have no edge”. Brainstorm what only French data allows → partner finder.' },
];

const FOUNDATION: [string, string][] = [
  ['Spot the tender you can\'t do alone', 'Matching on CPV, text, buyer and region; Autopilot dossiers flag scope and size gaps.'],
  ['Find partners who fill the gap', 'Award index of 2,610 notices with winners merged across name variants; ranking by buyer, CPV, text and recency.'],
  ['Check they are real and relevant', 'Keenable web research on any company, saved with sources.'],
  ['Draft the approach in French', 'Claude agent with 12 tools already writes French buyer questions and memos from sourced facts.'],
  ['Learn who answers and who wins', 'Feedback rules and a prediction scorecard graded against real TED awards.'],
  ['Bring partners onto the platform', 'Sign-up, one company profile per user built by chat, MCP access from Claude or ChatGPT.'],
];

const DECISIONS: [string, string, string][] = [
  ['One source: TED, France, CPV 72*', 'Free API, structured eForms, tenders and awards linked by procedure id.', 'No BOAMP/DECP yet; award history starts in 2025.'],
  ['Postgres for everything', 'Full-text search, analytics, agent memory and job state in one place. Small data, one day.', 'No ClickHouse/OpenSearch; fine at this scale.'],
  ['Redis: BullMQ + Streams', 'Slow imports and research never block a request; answers stream over resumable SSE.', 'One more service to run.'],
  ['Rules decide, Claude writes', 'Go / Consider / No-go comes from explicit rules; Claude writes the memo and questions.', 'Less “magic”, but every verdict is auditable.'],
  ['Past winner ≠ incumbent', 'The last similar winner won again only 1/35 times in the backtest.', 'Less dramatic copy, more honest.'],
  ['Fictional company, real data', 'We can demo freely without inventing evidence.', 'Rivage\'s past wins are invented and labelled.'],
  ['MCP + OAuth 2.1', 'Bring Radar into Claude or ChatGPT; same tools, same per-user data.', 'Extra auth surface to secure.'],
];

const FLOW = [
  { k: 'TED Search API', d: 'POST /v3/notices/search, 45 eForms fields, FRA + CPV 72*, since 2025.' },
  { k: 'BullMQ on Redis', d: 'Idempotent import every 6 h; research and Autopilot jobs with retries.' },
  { k: 'Postgres', d: 'Tenders, awards, merged organisations, French full-text search, predictions, memory.' },
  { k: 'Matching + rivals', d: 'CPV depth, text, buyer and region signals; award-history ranking with recency.' },
  { k: 'Mastra + Claude', d: '12 tools, user-scoped; Keenable web search for competitor research.' },
  { k: 'Redis Streams → SSE', d: 'Answers and job progress stream live to the UI; reconnect-safe.' },
];

const LOOP = [
  { k: 'Import', d: 'Every 6 h, new French IT notices and awards arrive from TED.' },
  { k: 'Match', d: 'Each company\'s profile is re-scored against open tenders.' },
  { k: 'Prepare', d: 'Strong matches with a week+ left get a pre-bid dossier, unprompted.' },
  { k: 'Predict', d: 'It logs the 5 firms most likely to win, before anyone knows.' },
  { k: 'Grade', d: 'When TED publishes the award, each prediction is marked hit or miss.' },
  { k: 'Learn', d: 'Your Bid / Skip / Won / Lost decisions become ranking rules.' },
];

const TOOLS: [string, string][] = [
  ['getCompanyProfile / updateCompanyProfile', 'onboarding by chat'],
  ['searchTenders', 'French full-text + CPV filters'],
  ['matchTenders', 'scored matches with reasons'],
  ['getTender', 'full notice, lots, winners'],
  ['findCompetitors', 'likely bidders from awards'],
  ['getCompetitorProfile', 'award history + research'],
  ['researchCompetitors / getResearchNotes', 'Keenable web research'],
  ['getPrebidDossier / getAutopilotInbox', 'Autopilot output'],
  ['recordTenderDecision', 'feedback that re-ranks'],
];

const HITS = [
  { pub: '316248-2026', buyer: 'Université de Picardie', winner: 'LEGAVOTE' },
  { pub: '327807-2026', buyer: 'KEDGE Business School', winner: 'Sopra Steria' },
  { pub: '379250-2026', buyer: 'Euro-Métropole de Metz', winner: 'SPIE ICS' },
  { pub: '374693-2026', buyer: 'Mairie de Caudebec-lès-Elbeuf', winner: 'SFR' },
];

const STATUS = {
  ok: [
    'TED import every 6 h: 6,939 notices, 2,610 award notices',
    'Login, one company per user, profile built by chat',
    'Tender matching with reasons; French full-text search',
    'Competitors from real awards, merged across name variants',
    'Copilot chat with 12 tools, streamed over SSE',
    'Autopilot dossiers, live predictions, grading, learned rules',
    'Backtest vs baseline scorecard in the product',
    'Deployed with Docker Compose on dev (SAM)',
  ],
  partial: [
    'Only 1 live prediction graded so far: awards take weeks',
    'Keenable research can pick up namesake companies',
    'Imports re-read everything since 2025 (not incremental)',
    'Backtest and job events are global, not per company',
    'Without a model key, chat falls back to a stub',
    'MCP server: OAuth discovery and client registration answer on dev; a full Claude session timed out in an earlier test and has not been re-verified',
  ],
  no: [
    'Aiven Runtime / managed Postgres + Valkey: not yet (config-only change; a teammate\'s branch is unmerged)',
    'BOAMP and DECP sources',
    'Automated test suite (we typecheck, build and browser-test)',
    'Citation checking and per-user rate limits (#30)',
    'Partner finder, the core of the pivot: designed, being built, not in the demo',
  ],
};

const ROADMAP = [
  {
    when: 'Building now',
    h: 'Partner finder',
    items: ['Import TED joint-bid groups (group → members, lead)', 'Score partners per tender; agent drafts the French outreach, you send it', 'Score replies; invite → claim profile → network effect'],
  },
  {
    when: 'Next week',
    h: 'Meet the challenge rules',
    items: ['Move Postgres and Redis to Aiven managed services, deploy on Aiven Runtime', 'Weekly “tenders you missed” email', 'Citation check on every agent claim (#30)'],
  },
  {
    when: 'Next month',
    h: 'More data, better answers',
    items: ['BOAMP and DECP for full French coverage', 'Price-range estimate from past awards (#14)', 'Search-first start screen and analytics (#15, #17, #28)'],
  },
  {
    when: 'First users',
    h: 'Prove it with agencies',
    items: ['Email the winners of French IT awards with their own matches', '10 agencies on the free tier, track bid / skip / won', 'Expand to other EU countries: TED covers all of them'],
  },
];

/* ------------------------------------------------------------------ pieces */

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="hk-stat">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function Shot({ src, caption, step, tall }: { src: string; caption: string; step?: string; tall?: boolean }) {
  return (
    <figure className={`hk-shot${tall ? ' hk-shot-tall' : ''}`}>
      <a href={`/hackathon/${src}.jpg`} target="_blank" rel="noreferrer">
        <img src={`/hackathon/${src}.jpg`} alt={caption} loading="lazy" />
      </a>
      <figcaption>
        {step && <span className="hk-mono">{step}</span>} {caption}
      </figcaption>
    </figure>
  );
}

function StatusCol({ kind, title, items }: { kind: 'ok' | 'partial' | 'no'; title: string; items: string[] }) {
  const icon = kind === 'ok' ? '✓' : kind === 'partial' ? '◐' : '✕';
  return (
    <div className={`hk-card hk-status hk-status-${kind}`}>
      <h3>
        <span aria-hidden="true">{icon}</span> {title}
      </h3>
      <ul>
        {items.map((it) => (
          <li key={it}>{it}</li>
        ))}
      </ul>
    </div>
  );
}

function BarCompare({ data = SNAPSHOT }: { data?: Pick<typeof SNAPSHOT, 'backtest' | 'baseline'> }) {
  const rows = [
    { k: 'Radar agent', hits: data.backtest.hits, n: data.backtest.graded, cls: 'agent', d: 'ranks past winners by buyer, CPV, text and recency' },
    { k: 'Naive baseline', hits: data.baseline.hits, n: data.baseline.graded, cls: 'base', d: 'the 5 most frequent winners in the same CPV area' },
  ];
  const max = Math.max(...rows.map((r) => r.hits / r.n));
  return (
    <figure className="hk-bars" aria-label="Backtest: share of past tenders where an actual winner was in the top 5">
      <figcaption>Actual winner in the top 5 · same {data.backtest.graded} past tenders</figcaption>
      {rows.map((r) => {
        const pct = (r.hits / r.n) * 100;
        return (
          <div key={r.k} className="hk-bar-row" title={`${r.k}: ${r.hits} of ${r.n} tenders (${pct.toFixed(1)}%). ${r.d}.`}>
            <span className="hk-bar-label">{r.k}</span>
            <span className="hk-bar-track">
              <span className={`hk-bar-fill hk-bar-${r.cls}`} style={{ width: `${(pct / (max * 100)) * 100}%` }} />
            </span>
            <span className="hk-bar-val">
              <b>{pct.toFixed(0)}%</b> {r.hits}/{r.n}
            </span>
          </div>
        );
      })}
      <p className="hk-foot">{SNAP}, GET /api/autopilot/scorecard.</p>
    </figure>
  );
}

type Live =
  | { state: 'idle' | 'loading' }
  | { state: 'signed-out'; health: boolean }
  | { state: 'error'; message: string }
  | {
      state: 'ok';
      at: Date;
      health: { ok: boolean; model: boolean; redis: boolean };
      total: number;
      awards: number;
      open: number;
      sc: { backtest: { graded: number; top5Hits: number }; baseline: { graded: number; top5Hits: number }; live: { predicted: number; graded: number; top5Hits: number } };
    };

function LiveCheck() {
  const [live, setLive] = useState<Live>({ state: 'idle' });

  async function run() {
    setLive({ state: 'loading' });
    try {
      const get = async (p: string) => {
        const r = await fetch(p, { credentials: 'include' });
        if (r.status === 401) throw new Error('401');
        if (!r.ok) throw new Error(`${p} returned ${r.status}`);
        return r.json();
      };
      const health = await get('/api/health');
      let all;
      try {
        all = await get('/api/tenders?limit=1');
      } catch (e) {
        if ((e as Error).message === '401') return setLive({ state: 'signed-out', health: !!health.ok });
        throw e;
      }
      const [awards, open, sc] = await Promise.all([
        get('/api/tenders?limit=1&type=can-standard'),
        get('/api/tenders?limit=1&open=1'),
        get('/api/autopilot/scorecard'),
      ]);
      setLive({ state: 'ok', at: new Date(), health, total: all.total, awards: awards.total, open: open.total, sc });
    } catch (e) {
      setLive({ state: 'error', message: (e as Error).message });
    }
  }

  return (
    <div className="hk-card hk-live">
      <p className="hk-kicker">
        <span className="hk-dot" /> Live check against this deployment
      </p>
      {live.state === 'idle' && <p>Fetch the current numbers from this app's API instead of trusting the snapshot.</p>}
      {live.state === 'loading' && <p>Fetching…</p>}
      {live.state === 'error' && <p className="hk-err">Live check failed: {live.message}. The snapshot numbers are still on the left.</p>}
      {live.state === 'signed-out' && (
        <p>
          Health: {live.health ? 'ok' : 'not ok'}. The data API needs a session.{' '}
          <Link to={`/login?demo=1&next=${encodeURIComponent('/hackathon#proof')}`}>Sign in as the demo user</Link>, then come
          back and run it again.
        </p>
      )}
      {live.state === 'ok' && (
        <>
          <dl className="hk-dl">
            <dt>Notices in Radar</dt>
            <dd>{fmt(live.total)}</dd>
            <dt>Award notices</dt>
            <dd>{fmt(live.awards)}</dd>
            <dt>Open tenders</dt>
            <dd>{fmt(live.open)}</dd>
            <dt>Backtest, agent</dt>
            <dd>
              {live.sc.backtest.top5Hits}/{live.sc.backtest.graded}
            </dd>
            <dt>Backtest, baseline</dt>
            <dd>
              {live.sc.baseline.top5Hits}/{live.sc.baseline.graded}
            </dd>
            <dt>Live predictions</dt>
            <dd>
              {live.sc.live.predicted} made · {live.sc.live.top5Hits}/{live.sc.live.graded} hits
            </dd>
            <dt>Model / Redis</dt>
            <dd>
              {live.health.model ? 'up' : 'down'} / {live.health.redis ? 'up' : 'down'}
            </dd>
          </dl>
          <p className="hk-foot">
            <span className="hk-label hk-label-live">Live</span> fetched {live.at.toLocaleTimeString()} from this deployment. Compare
            with TED's own count at ted.europa.eu.
          </p>
        </>
      )}
      <button type="button" className="hk-btn hk-btn-primary" onClick={run} disabled={live.state === 'loading'}>
        {live.state === 'ok' ? 'Run again' : 'Run the live check'}
      </button>
    </div>
  );
}

function fmt(n: number) {
  return n.toLocaleString('en-GB');
}
