// One-screen pitch at /hackathon: the value prop, the joint-bidding edge and the tech,
// with a real partner-finder result from the dev deployment. The full deck is at
// /hackathon/full. Numbers are snapshots from dev / TED's API on 22 Oct 2026 (see
// /hackathon/evidence.json and the deck's proof slide).
import { useEffect } from 'react';
import { Link } from 'react-router';
import '../hackathon.css';

const APP_URL = 'https://r1-app-3000-01m5hdrkrrdjwzypfyr1tmy68g.apps.simple-agent-manager.org';
const TED = (pub: string) => `https://ted.europa.eu/en/notice/-/detail/${pub}`;

const EDGE = [
  {
    k: 'Data nobody uses',
    d: (
      <>
        French award notices record who bid <i>together</i>: <b>199 of 2,610</b> since 2025 flag a multi-company{' '}
        <i>groupement</i>. Other tools flatten them into “winners”. We parse them.
      </>
    ),
  },
  {
    k: 'Verified, not claimed',
    d: (
      <>
        Every partner comes with TED evidence. Replies are scored, their references matched against their own TED awards and
        their SIRET checked.
      </>
    ),
  },
  {
    k: 'A network that compounds',
    d: (
      <>
        You send the invite; the partner replies and can claim a profile. Every invite is a new user, and who answers, how fast
        and with what, can't be scraped.
      </>
    ),
  },
];

const FLOW = ['Open tender', 'Gap in your offer', 'Partner who fills it', 'Invite (you send)', 'Reply, scored'];

const STACK = [
  { k: 'TED eForms API', d: '6,939 French IT notices since 2025, the same count TED reports' },
  { k: 'BullMQ + Redis', d: 'Import every 6 h, XML parsing of joint bids, live SSE' },
  { k: 'Postgres', d: 'French full-text search, award index, groupements, memory' },
  { k: 'Claude agent (Mastra)', d: '15 tools: match, rivals, dossiers, partners, invites' },
  { k: 'Web app + MCP', d: 'React, OAuth 2.1 MCP for Claude and ChatGPT' },
];

export function HackathonPitch() {
  useEffect(() => {
    const prev = document.title;
    document.title = 'Radar · Win the tenders too big to bid alone';
    return () => {
      document.title = prev;
    };
  }, []);

  return (
    <div className="hk hk-pitch">
      <header className="hk-bar">
        <Link to="/" className="hk-logo" aria-label="Radar home">
          radar<i>.</i> <span>hackathon</span>
        </Link>
        <span className="hk-bar-title">Future Founders · Data-Centric Agents · 22 Oct 2026</span>
        <span className="hk-bar-actions">
          <Link to="/hackathon/full" className="hk-bar-link">
            Full presentation →
          </Link>
          <a href={APP_URL} target="_blank" rel="noreferrer" className="hk-bar-cta">
            Live app ↗
          </a>
        </span>
      </header>

      <main className="hk-pitch-main">
        <section className="hk-pitch-value" aria-labelledby="pitch-title">
          <h1 id="pitch-title">
            Win the tenders <em>too big to bid alone.</em>
          </h1>
          <p className="hk-pitch-lede">
            Small French IT firms lose public tenders because they can't cover the whole lot. <b>Radar</b> reads every tender,
            finds the gap in your offer and finds the partner who fills it, from evidence of who actually bid together.
          </p>
          <ol className="hk-pitch-edge" aria-label="Our edge">
            {EDGE.map((e, i) => (
              <li key={e.k}>
                <span className="hk-mono">{String(i + 1).padStart(2, '0')}</span>
                <div>
                  <b>{e.k}</b>
                  <p>{e.d}</p>
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section className="hk-pitch-proof" aria-label="Live example">
          <div className="hk-pitch-proof-head">
            <span className="hk-label hk-label-live">Live on dev</span>
            <ol className="hk-pitch-flow" aria-label="Partner finder flow">
              {FLOW.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ol>
          </div>
          <a className="hk-pitch-shot" href="/hackathon/partner-finder.jpg" target="_blank" rel="noreferrer">
            <img
              src="/hackathon/partner-finder.jpg"
              alt="Partner finder on a real tender: two gaps quoted from the French notice, and ranked partners with TED evidence"
            />
          </a>
          <p className="hk-pitch-caption">
            <b>Paris Habitat, GIS platform</b> (
            <a href={TED('667222-2026')} target="_blank" rel="noreferrer">
              TED 667222-2026
            </a>
            ). For our demo firm, the agent quotes two gaps from the French notice (application maintenance, GIS) and ranks{' '}
            <b>AKKODIS I&amp;S</b> first: covers both, has joint-bid history on TED, based near Lyon. Screenshot from dev, 22 Oct 13:05 UTC;
            demo company fictional, scores are heuristics.
          </p>
        </section>

        <section className="hk-pitch-tech" aria-label="How it works">
          <ol className="hk-pitch-stack">
            {STACK.map((s) => (
              <li key={s.k}>
                <b>{s.k}</b>
                <span>{s.d}</span>
              </li>
            ))}
          </ol>
          <div className="hk-pitch-metric" title="Backtest on 151 past tenders, scored on the same set as the baseline">
            <strong>2×</strong>
            <span>
              naive baseline at naming the eventual winner: <b>18/151</b> vs 9/151 past tenders
            </span>
          </div>
        </section>
      </main>
    </div>
  );
}
