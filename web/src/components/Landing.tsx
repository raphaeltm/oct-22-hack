import { CSSProperties, ReactNode, useEffect, useRef } from 'react';
import { Link } from 'react-router';
import { useSession } from '../auth';
import '../landing.css';

// Every tender, award and competitor below is a real TED record, copied from the
// dev environment's database on 22 Oct 2026 (Rivage Numérique demo profile).
// Do not edit the figures by hand. Refresh them from the API if needed.
const SNAPSHOT = 'Dev database snapshot, 22 Oct 2026';
const ted = (pub: string) => `https://ted.europa.eu/en/notice/-/detail/${pub}`;

const STATS = [
  { value: '6,939', label: 'French IT notices indexed from TED since 2025' },
  { value: '2,610', label: 'contract award notices mined for winners' },
  { value: '192', label: 'tenders open for bids on snapshot day' },
];

// Radar blips: angle (deg, clockwise from 12 o'clock) and radius (% of the scope).
const BLIPS: { a: number; r: number; label?: string; fit?: number }[] = [
  { a: 38, r: 34, label: "Musée de l'Air et de l'Espace", fit: 80 },
  { a: 118, r: 27, label: 'Saint-Quentin-en-Yvelines', fit: 79.7 },
  { a: 212, r: 40, label: 'Ville de Clichy-la-Garenne', fit: 65.6 },
  { a: 300, r: 30, label: 'Économat des Armées', fit: 68.5 },
  { a: 72, r: 44 }, { a: 95, r: 16 }, { a: 150, r: 41 }, { a: 168, r: 22 },
  { a: 245, r: 18 }, { a: 268, r: 45 }, { a: 330, r: 42 }, { a: 12, r: 20 },
  { a: 190, r: 12 }, { a: 350, r: 26 },
];

const TICKER = [
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
];

const MATCHES = [
  {
    pub: '661657-2026', buyer: "Musée de l'Air et de l'Espace", fit: 80, bid: true, deadline: '26 Oct 2026',
    title: "Refonte architecturale, créative et technique, maintenance et hébergement du site internet",
    why: 'Website redesign and hosting fits core CPV 72413000 plus accessibility/RGAA expertise; verify incumbent and tight fixed-price fit.',
  },
  {
    pub: '725720-2026', buyer: 'Saint-Quentin-en-Yvelines', fit: 79.7, bid: true, deadline: '17 Nov 2026',
    title: "Hébergement, maintenance et gestion des sites internet de l'agglomération, accessibilité numérique",
    why: 'Strong match: website hosting, maintenance and accessibility align with RGAA/DSFR expertise and sovereign cloud offer.',
  },
  {
    pub: '708553-2026', buyer: 'Mairie de Clichy-la-Garenne', fit: 65.6, bid: true, deadline: '23 Nov 2026', value: '€210k est.',
    title: 'Refonte du site internet de la Ville de Clichy',
    why: 'Pure website refonte matches core offer; €210k fits fixed-price delivery, but Mairie may favor larger incumbent agencies.',
  },
  {
    pub: '657204-2026', buyer: "Commissariat à l'énergie atomique", fit: 65, bid: false, deadline: '23 Oct 2026',
    title: 'Tierce Maintenance Multi-Applicatives (TMMA) et DevOps',
    why: 'Large infra/ops scope misaligned with a design-focused team; incumbent CS GROUP entrenched.',
  },
];

const RIVALS = [
  {
    name: 'STRATIS', wins: 3, buyers: 3, value: '€417k', last: 'Aug 2026',
    ex: { pub: '583632-2026', title: 'Refonte du site internet de la Ville de Poitiers', value: '€141k' },
  },
  {
    name: 'NET COM', alias: 'also filed as “NET.COM”', wins: 2, buyers: 2, value: '€480k', last: 'Aug 2026',
    ex: { pub: '560331-2026', title: 'Refonte graphique et technique du site du Groupe Polylogis', value: '€280k' },
  },
  {
    name: 'ADIMEO', wins: 3, buyers: 3, value: '€1.8M', last: 'Dec 2025',
  },
];

const PROFILE_CPV = ['72000000', '72200000', '72413000', '72224000', '79411000', '72212000'];
const PROFILE_KW = ['RGAA', 'DSFR', 'SecNumCloud', 'accessibilité', 'refonte', 'souverain', 'open data', 'tableau de bord', 'logiciel libre'];

const PIPELINE = [
  { k: 'TED Search API', d: 'French notices and award results, CPV 72*, since 2025' },
  { k: 'BullMQ on Redis', d: 'Idempotent import every 6 hours, plus research jobs' },
  { k: 'Postgres', d: 'Tenders, awards, merged organisations, French full-text search, agent memory' },
  { k: 'Mastra + Claude', d: 'Tools to save profiles, search and match tenders, and rank rivals' },
  { k: 'Keenable search', d: 'Web research on each competitor, saved with sources' },
  { k: 'Redis Streams → SSE', d: 'Answers and job progress stream live, resumable' },
];

export function Landing() {
  const { data: session } = useSession();
  const root = useRef<HTMLDivElement>(null);

  // Reveal-on-scroll for anything marked data-reveal.
  useEffect(() => {
    const els = root.current?.querySelectorAll<HTMLElement>('[data-reveal]') ?? [];
    if (!('IntersectionObserver' in window)) {
      els.forEach((el) => el.classList.add('in'));
      return;
    }
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) {
            e.target.classList.add('in');
            io.unobserve(e.target);
          }
        }),
      { rootMargin: '0px 0px -10% 0px', threshold: 0.12 },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    const prev = document.title;
    document.title = 'Radar: the bid office your agency never had';
    return () => {
      document.title = prev;
    };
  }, []);

  const cta = session ? (
    <Link to="/tenders" className="lp-btn lp-btn-primary">
      Open your workspace <Arrow />
    </Link>
  ) : (
    <Link to="/login?demo=1" className="lp-btn lp-btn-primary">
      Try the live demo <Arrow />
    </Link>
  );

  return (
    <div className="lp" ref={root}>
      <a href="#main" className="lp-skip">Skip to content</a>
      <header className="lp-nav">
        <Link to="/" className="lp-logo" aria-label="Radar home">
          <RadarMark />
          <span>radar<i>.</i></span>
        </Link>
        <nav aria-label="Sections" className="lp-nav-links">
          <a href="#how">How it works</a>
          <a href="#evidence">Evidence</a>
          <a href="#stack">Under the hood</a>
        </nav>
        <div className="lp-nav-cta">
          {session ? (
            <Link to="/tenders" className="lp-btn lp-btn-sm lp-btn-light">Workspace <Arrow /></Link>
          ) : (
            <>
              <Link to="/login" className="lp-nav-signin">Sign in</Link>
              <Link to="/login?demo=1" className="lp-btn lp-btn-sm lp-btn-light">Live demo <Arrow /></Link>
            </>
          )}
        </div>
      </header>

      <main id="main">
        {/* ---------------- hero ---------------- */}
        <section className="lp-hero">
          <div className="lp-hero-grid" aria-hidden />
          <div className="lp-hero-copy">
            <p className="lp-eyebrow lp-rise" style={{ '--d': '0ms' } as CSSProperties}>
              <span className="lp-live" /> Live on TED · France · IT services
            </p>
            <h1 className="lp-rise" style={{ '--d': '80ms' } as CSSProperties}>
              The bid office
              <br />
              your agency <em>never had.</em>
            </h1>
            <p className="lp-lede lp-rise" style={{ '--d': '160ms' } as CSSProperties}>
              Radar reads every French public IT tender, matches it to what your company actually does, and shows
              you who won contracts like it before. Every claim links to its TED notice.
            </p>
            <div className="lp-hero-cta lp-rise" style={{ '--d': '240ms' } as CSSProperties}>
              {cta}
              <a href="#how" className="lp-btn lp-btn-ghost">See how it works</a>
            </div>
          </div>
          <div className="lp-scope-wrap lp-rise" style={{ '--d': '200ms' } as CSSProperties}>
            <Scope />
          </div>
          <a href="#how" className="lp-scroll" aria-label="Scroll to how it works"><span /></a>
        </section>

        {/* ---------------- ticker ---------------- */}
        <section className="lp-ticker" aria-label="Recently published French IT tenders">
          <div className="lp-ticker-track">
            {[0, 1].map((copy) => (
              <ul key={copy} aria-hidden={copy === 1 || undefined}>
                {TICKER.map(([pub, buyer, title]) => (
                  <li key={pub}>
                    <span className="lp-mono">{pub}</span>
                    <b>{buyer}</b>
                    <span>{title}</span>
                  </li>
                ))}
              </ul>
            ))}
          </div>
        </section>

        {/* ---------------- problem ---------------- */}
        <section className="lp-section lp-problem">
          <div className="lp-wrap">
            <p className="lp-kicker" data-reveal>The problem</p>
            <h2 className="lp-statement" data-reveal>
              French public procurement is an open book. <em>No small agency has time to read it.</em>
            </h2>
            <div className="lp-pains">
              <Pain n="01" title="They miss the tenders that fit">
                Notices are scattered across portals, written in dense French and coded by CPV. Two people doing
                business development between deliveries can't keep up.
              </Pain>
              <Pain n="02" title="They bid blind">
                Every award notice names its winner. But nobody connects those names to the bid on your desk, so
                you find out who you were up against after you've lost.
              </Pain>
              <Pain n="03" title="They burn days on bad bids">
                Qualifying one tender means reading the specification, the award criteria and the buyer's history.
                Most of it ends in a no-go.
              </Pain>
            </div>
            <dl className="lp-stats" data-reveal>
              {STATS.map((s) => (
                <div key={s.label}>
                  <dt>{s.label}</dt>
                  <dd>{s.value}</dd>
                </div>
              ))}
            </dl>
            <p className="lp-footnote" data-reveal>{SNAPSHOT}. Source: TED, EU Publications Office.</p>
          </div>
        </section>

        {/* ---------------- how it works ---------------- */}
        <section className="lp-section lp-how" id="how">
          <div className="lp-wrap">
            <p className="lp-kicker" data-reveal>How it works</p>
            <h2 className="lp-h2" data-reveal>
              From a two-minute chat to a <em>sourced competitor brief.</em>
            </h2>

            <Step
              n="01"
              title="Tell it who you are"
              body="Describe your company in plain words. The agent turns it into a structured profile with services, CPV codes, regions and differentiators, and keeps refining it as you talk."
              tag="Fictional demo company · seeded profile"
            >
              <div className="lp-card lp-chat">
                <div className="lp-bubble lp-bubble-user">
                  We're a 40-person agency in Lyon doing accessible websites, DSFR and sovereign cloud for local
                  authorities.
                </div>
                <div className="lp-profile">
                  <div className="lp-profile-head">
                    <span className="lp-avatar">RN</span>
                    <div>
                      <b>Rivage Numérique</b>
                      <span>Saved company profile</span>
                    </div>
                    <span className="lp-check" aria-hidden>✓</span>
                  </div>
                  <p className="lp-label">CPV codes</p>
                  <div className="lp-chips">
                    {PROFILE_CPV.map((c) => <span key={c} className="lp-chip lp-mono">{c}</span>)}
                  </div>
                  <p className="lp-label">Search terms</p>
                  <div className="lp-chips">
                    {PROFILE_KW.map((c) => <span key={c} className="lp-chip">{c}</span>)}
                  </div>
                </div>
              </div>
            </Step>

            <Step
              n="02"
              title="See what fits, and why"
              body="Postgres full-text search in French narrows thousands of notices to the ones matching your profile. Claude then writes a one-line bid or no-bid rationale for each, including the reasons to walk away."
              tag={`Real TED notices · ${SNAPSHOT}`}
              flip
            >
              <div className="lp-card lp-matches">
                {MATCHES.map((m) => (
                  <a key={m.pub} className="lp-match" href={ted(m.pub)} target="_blank" rel="noreferrer">
                    <div className="lp-fit" style={{ '--fit': m.fit } as CSSProperties}>
                      <svg viewBox="0 0 36 36" aria-hidden>
                        <circle cx="18" cy="18" r="15.5" />
                        <circle cx="18" cy="18" r="15.5" pathLength={100} />
                      </svg>
                      <span>{m.fit}</span>
                    </div>
                    <div className="lp-match-body">
                      <div className="lp-match-meta">
                        <span className={`lp-verdict ${m.bid ? 'bid' : 'nobid'}`}>{m.bid ? 'Bid' : 'No-bid'}</span>
                        <span>{m.buyer}</span>
                      </div>
                      <b lang="fr">{m.title}</b>
                      <p>{m.why}</p>
                      <div className="lp-match-foot lp-mono">
                        <span>TED {m.pub}</span>
                        <span>Closes {m.deadline}</span>
                        {m.value && <span>{m.value}</span>}
                      </div>
                    </div>
                  </a>
                ))}
                <p className="lp-card-note">Fit is a heuristic score out of 100, not a win probability.</p>
              </div>
            </Step>

            <Step
              n="03"
              title="Know who you're up against"
              body="For any tender, Radar ranks the companies that won similar contracts by CPV, buyer and value, then researches them on the web. Name variants of the same company are merged, and framework co-winners are flagged."
              tag={`Clichy website tender · ${SNAPSHOT}`}
            >
              <div className="lp-card lp-rivals">
                <div className="lp-rivals-head">
                  <span className="lp-mono">TED 708553-2026</span>
                  <b lang="fr">Refonte du site internet de la Ville de Clichy</b>
                  <span>No earlier awards from this buyer in the data, so these rivals come from similar contracts.</span>
                </div>
                {RIVALS.map((r, i) => (
                  <div key={r.name} className="lp-rival" style={{ '--i': i } as CSSProperties}>
                    <div className="lp-rival-top">
                      <span className="lp-avatar">{r.name.slice(0, 2)}</span>
                      <div>
                        <b>{r.name}</b>
                        {r.alias && <span className="lp-alias">{r.alias}</span>}
                      </div>
                      <dl>
                        <div><dt>Similar wins</dt><dd>{r.wins}</dd></div>
                        <div><dt>Buyers</dt><dd>{r.buyers}</dd></div>
                        <div><dt>Known value</dt><dd>{r.value}</dd></div>
                      </dl>
                    </div>
                    {r.ex && (
                      <a className="lp-rival-ex" href={ted(r.ex.pub)} target="_blank" rel="noreferrer">
                        <span className="lp-mono">{r.ex.pub}</span>
                        <span lang="fr">{r.ex.title}</span>
                        <span className="lp-mono">{r.ex.value}</span>
                      </a>
                    )}
                  </div>
                ))}
                <p className="lp-card-note">A past win shows relevant experience. It doesn't prove the company will bid.</p>
              </div>
            </Step>
          </div>
        </section>

        {/* ---------------- evidence ---------------- */}
        <section className="lp-section lp-evidence" id="evidence">
          <div className="lp-wrap">
            <p className="lp-kicker" data-reveal>Built on evidence</p>
            <h2 className="lp-h2" data-reveal>
              Every claim comes <em>with a receipt.</em>
            </h2>
            <div className="lp-receipts" data-reveal>
              {['661657-2026', '725720-2026', '708553-2026', '583632-2026', '560331-2026', '619988-2026'].map((p) => (
                <a key={p} href={ted(p)} target="_blank" rel="noreferrer" className="lp-receipt">
                  <span>TED</span>
                  <b className="lp-mono">{p}</b>
                  <Arrow />
                </a>
              ))}
            </div>
            <div className="lp-principles">
              <Principle title="Source links on everything">
                Tenders, awards and competitor wins all keep their TED publication number and URL. The agent replies
                in English and quotes the original French.
              </Principle>
              <Principle title="Messy data, handled">
                Public records are inconsistent. Sopra Steria appears under five different TED names, and Radar
                merges them into one competitor. Framework agreements with five or more winners are flagged.
              </Principle>
              <Principle title="Honest about uncertainty">
                Fit is a heuristic, not a win probability. Unknown values stay unknown and expired deadlines are
                labelled as expired. If data is missing, Radar says so.
              </Principle>
            </div>
          </div>
        </section>

        {/* ---------------- stack ---------------- */}
        <section className="lp-section lp-stack" id="stack">
          <div className="lp-wrap">
            <p className="lp-kicker" data-reveal>Under the hood</p>
            <h2 className="lp-h2" data-reveal>
              An agent that's <em>only as good as its data,</em> so we built the data first.
            </h2>
            <ol className="lp-pipe">
              {PIPELINE.map((p, i) => (
                <li key={p.k} data-reveal style={{ '--i': i } as CSSProperties}>
                  <span className="lp-pipe-n lp-mono">{String(i + 1).padStart(2, '0')}</span>
                  <b>{p.k}</b>
                  <span>{p.d}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        {/* ---------------- go to market ---------------- */}
        <section className="lp-section lp-gtm">
          <div className="lp-wrap lp-gtm-grid">
            <div data-reveal>
              <p className="lp-kicker">Route to first users</p>
              <h2 className="lp-h2">
                The data is <em>the lead list.</em>
              </h2>
            </div>
            <div className="lp-gtm-copy" data-reveal>
              <p>
                Every award notice names a company that just won French public IT work. That's our prospect list,
                and each one comes with a personal hook:
              </p>
              <blockquote>
                “You won the Poitiers website redesign. Here are three open tenders like it, and the agencies you'll
                face.”
              </blockquote>
              <ul>
                <li><b>Who:</b> French digital agencies and ESNs of 10–250 people that bid without a bid team.</li>
                <li><b>Hook:</b> a free weekly digest of tenders they're missing.</li>
                <li><b>Paid:</b> competitor briefs, bid strategy and alerts, priced per seat, well below a bid manager.</li>
                <li><b>Channels:</b> Numeum, the CINOV network, regional digital clusters.</li>
              </ul>
            </div>
          </div>
        </section>

        {/* ---------------- final cta ---------------- */}
        <section className="lp-final">
          <div className="lp-final-scope" aria-hidden><Scope quiet /></div>
          <h2 data-reveal>
            Stop bidding <em>blind.</em>
          </h2>
          <p data-reveal>Sign in as Rivage Numérique and ask the agent what to bid on.</p>
          <div data-reveal>{cta}</div>
        </section>
      </main>

      <footer className="lp-footer">
        <span className="lp-logo lp-logo-sm"><RadarMark /><span>radar<i>.</i></span></span>
        <p>
          Built for the 22 Oct 2026 founder hackathon. Tender data comes from TED (EU Publications Office). Rivage
          Numérique is a fictional company used for the demo, and figures come from the dev database snapshot of
          22 Oct 2026.
        </p>
      </footer>
    </div>
  );
}

function Scope({ quiet = false }: { quiet?: boolean }) {
  return (
    <div className={`lp-scope ${quiet ? 'quiet' : ''}`} role={quiet ? undefined : 'img'} aria-label={quiet ? undefined : 'Radar scope showing matching tenders as blips'}>
      <div className="lp-scope-rings" />
      <div className="lp-scope-sweep" />
      {!quiet &&
        BLIPS.map((b, i) => {
          const rad = (b.a * Math.PI) / 180;
          const style = {
            left: `${50 + b.r * Math.sin(rad)}%`,
            top: `${50 - b.r * Math.cos(rad)}%`,
            '--delay': `${(b.a / 360) * 6 - 6}s`,
          } as CSSProperties;
          return (
            <span key={i} className={`lp-blip ${b.label ? 'major' : ''} ${b.a > 180 ? 'left' : ''}`} style={style}>
              {b.label && (
                <span className="lp-blip-label">
                  {b.label}
                  <i className="lp-mono">fit {b.fit}</i>
                </span>
              )}
            </span>
          );
        })}
      {!quiet && <span className="lp-scope-center">You</span>}
    </div>
  );
}

function Step({ n, title, body, tag, flip, children }: { n: string; title: string; body: string; tag: string; flip?: boolean; children: ReactNode }) {
  return (
    <div className={`lp-step ${flip ? 'flip' : ''}`}>
      <div className="lp-step-copy" data-reveal>
        <span className="lp-step-n lp-mono">{n}</span>
        <h3>{title}</h3>
        <p>{body}</p>
        <span className="lp-tag">{tag}</span>
      </div>
      <div className="lp-step-visual" data-reveal>{children}</div>
    </div>
  );
}

function Pain({ n, title, children }: { n: string; title: string; children: ReactNode }) {
  return (
    <article className="lp-pain" data-reveal>
      <span className="lp-mono">{n}</span>
      <h3>{title}</h3>
      <p>{children}</p>
    </article>
  );
}

function Principle({ title, children }: { title: string; children: ReactNode }) {
  return (
    <article className="lp-principle" data-reveal>
      <h3>{title}</h3>
      <p>{children}</p>
    </article>
  );
}

function RadarMark() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden className="lp-mark">
      <circle cx="12" cy="12" r="10.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="6" fill="none" stroke="currentColor" strokeWidth="1.5" opacity=".55" />
      <path d="M12 12 L12 1.5 A10.5 10.5 0 0 1 21.6 7.7 Z" fill="currentColor" opacity=".35" />
      <circle cx="16.5" cy="6.5" r="1.8" fill="var(--lp-signal)" />
    </svg>
  );
}

function Arrow() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden className="lp-arrow">
      <path d="M3 8h10M9 4l4 4-4 4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
