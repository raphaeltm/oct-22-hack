import { countryName, daysLeft, money, shortDate, type Match, type Stats } from './api';
import { Stamp } from './ui';

/**
 * The weekly "tenders you missed" email: how Cachet reaches its first users.
 * Built from the firm's live shortlist, so the preview is exactly what would be sent.
 */
export function Digest({ name, matches, stats, onOpen }: { name: string; matches: Match[]; stats: Stats | null; onOpen: (id: string) => void }) {
  const picks = matches
    .filter((m) => m.scored_by !== 'quick' && m.verdict !== 'no' && m.decision !== 'no-go')
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
  const inPlay = picks.reduce((sum, m) => sum + (m.value ?? 0), 0);
  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="page digest-page">
      <p className="muted digest-note">
        Every Monday, Cachet emails this to firms that won a public contract in the last two years, with a link to claim their radar. TED award notices name every
        winner, so the list of first users is public data.
      </p>
      <article className="mail" aria-label="Digest email preview">
        <header className="mail-head">
          <div className="mail-meta">
            <span>From: Cachet</span>
            <span>To: {name}</span>
            <span>{today}</span>
          </div>
          <h2>
            {picks.length === 0
              ? 'No new tenders worth your time this week'
              : picks.length === 1
                ? 'One public tender worth your time this week'
                : `${picks.length} public tenders worth your time this week`}
          </h2>
          <p className="mail-lede">
            We read {stats?.scanned ?? 0} new notices on TED for {name}.
            {picks.length > 0 && <> {picks.length === 1 ? 'This is the one that fits' : 'These are the ones that fit'}, worth {money(inPlay)} in total.</>}
          </p>
        </header>
        <ol className="mail-list">
          {picks.map((m) => {
            const d = daysLeft(m.deadline);
            return (
              <li key={m.id}>
                <div className="mail-stamp">
                  <Stamp verdict={m.verdict} size="sm" />
                  <span className="mail-score">{m.score}</span>
                </div>
                <div>
                  <button className="mail-title" onClick={() => onOpen(m.id)}>
                    {m.title}
                  </button>
                  <p className="mail-sub">
                    {m.buyer || 'Unnamed buyer'} · {countryName(m.country)} · {money(m.value, m.currency ?? 'EUR')} · due {shortDate(m.deadline)}
                    {d != null && d <= 10 ? ` (${d} days)` : ''}
                  </p>
                  {m.headline && <p className="mail-why">{m.headline}</p>}
                </div>
              </li>
            );
          })}
        </ol>
        <footer className="mail-foot">
          <span className="btn btn-ink" aria-hidden>
            Claim your radar
          </span>
          <p className="muted">Free for one firm: the full shortlist, competitor history from TED award notices, and bid briefs.</p>
        </footer>
      </article>
    </div>
  );
}
