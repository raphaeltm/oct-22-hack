import { useEffect, useState } from 'react';
import { api, countryName, daysLeft, money, shortDate, type Match } from './api';
import { Markdown, ScoreBar, Stamp, Trace, useThread } from './ui';

type Filter = 'go' | 'maybe' | 'all' | 'decided';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'go', label: 'To bid' },
  { key: 'maybe', label: 'To read' },
  { key: 'all', label: 'Everything' },
  { key: 'decided', label: 'Decided' },
];

export function Radar({
  companyId,
  matches,
  landed,
  onChanged,
  emptyHint,
}: {
  companyId: string;
  matches: Match[];
  landed: Set<string>;
  onChanged: () => void;
  emptyHint: React.ReactNode;
}) {
  const [filter, setFilter] = useState<Filter>('go');
  const [selected, setSelected] = useState<string | null>(null);

  const visible = matches.filter((m) =>
    filter === 'all' ? true : filter === 'decided' ? m.decision != null : m.decision == null && m.verdict === filter && m.scored_by !== 'quick',
  );
  const count = (f: Filter) =>
    matches.filter((m) => (f === 'all' ? true : f === 'decided' ? m.decision != null : m.decision == null && m.verdict === f && m.scored_by !== 'quick')).length;

  // Keep a sensible selection as the list changes.
  useEffect(() => {
    if (!visible.length) return;
    if (!selected || !matches.some((m) => m.id === selected)) setSelected(visible[0].id);
  }, [visible.length, matches, selected]);

  const current = matches.find((m) => m.id === selected) ?? null;

  return (
    <div className="radar">
      <section className="list" aria-label="Tenders">
        <div className="tabs" role="tablist">
          {FILTERS.map((f) => (
            <button key={f.key} role="tab" aria-selected={filter === f.key} className={filter === f.key ? 'tab tab-on' : 'tab'} onClick={() => setFilter(f.key)}>
              {f.label} <span className="tab-count">{count(f.key)}</span>
            </button>
          ))}
        </div>
        {!matches.length ? (
          <div className="list-empty">{emptyHint}</div>
        ) : !visible.length ? (
          <div className="list-empty">
            <p>Nothing here yet.</p>
            <button className="link" onClick={() => setFilter('all')}>Show every notice the radar found</button>
          </div>
        ) : (
          <ul className="rows">
            {visible.map((m) => {
              const d = daysLeft(m.deadline);
              return (
                <li key={m.id}>
                  <button className={`row${selected === m.id ? ' row-on' : ''}`} onClick={() => setSelected(m.id)}>
                    <ScoreBar score={m.score} quick={m.scored_by === 'quick'} />
                    <span className="row-main">
                      <span className="row-title">{m.title}</span>
                      <span className="row-meta">
                        {m.buyer || 'Unnamed buyer'} · {countryName(m.country)}
                      </span>
                      {m.headline && <span className="row-headline">{m.headline}</span>}
                    </span>
                    <span className="row-side">
                      <span className="row-value">{money(m.value, m.currency ?? 'EUR')}</span>
                      <span className={`row-days${d != null && d <= 10 ? ' row-days-soon' : ''}`}>{d == null ? 'no deadline' : `${d} days left`}</span>
                      {m.decision ? (
                        <span className={`chip chip-${m.decision}`}>{m.decision === 'go' ? 'Bidding' : 'Passed'}</span>
                      ) : m.scored_by !== 'quick' ? (
                        <Stamp verdict={m.verdict} size="sm" landed={landed.has(m.id)} />
                      ) : (
                        <span className="chip chip-quick">Not read yet</span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <section className="dossier-wrap" aria-label="Tender dossier">
        {current ? (
          <Dossier key={current.id} companyId={companyId} match={current} landed={landed.has(current.id)} onChanged={onChanged} />
        ) : (
          <div className="dossier-empty">Pick a tender to open its dossier.</div>
        )}
      </section>
    </div>
  );
}

function Dossier({ companyId, match, landed, onChanged }: { companyId: string; match: Match; landed: boolean; onChanged: () => void }) {
  const [detail, setDetail] = useState<Match | null>(null);
  const [briefThread, setBriefThread] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [deciding, setDeciding] = useState<'go' | 'no-go' | null>(null);
  const [saving, setSaving] = useState(false);
  const { runs } = useThread(briefThread, undefined, true);
  const run = runs.at(-1);

  useEffect(() => {
    api.tender(companyId, match.id).then((r) => setDetail(r.tender)).catch(() => setDetail(null));
  }, [companyId, match.id, match.scored_by, match.score]);

  useEffect(() => {
    if (run && !run.running) api.tender(companyId, match.id).then((r) => setDetail(r.tender)).catch(() => {});
  }, [run?.running]);

  const m = { ...match, ...detail };
  const d = daysLeft(m.deadline);
  const brief = run?.running || (run && !detail?.brief) ? run.text : detail?.brief;
  const quick = m.scored_by === 'quick';

  async function writeBrief() {
    setBriefThread(`brief-${companyId}-${match.id}`);
    await api.brief(companyId, match.id);
  }

  async function decide(decision: 'go' | 'no-go' | null) {
    setSaving(true);
    try {
      await api.decide(companyId, match.id, decision, reason.trim() || undefined);
      setDeciding(null);
      setReason('');
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  return (
    <article className="dossier">
      <header className="dossier-head">
        <a className="notice-no" href={m.url} target="_blank" rel="noreferrer" title="Open the notice on TED">
          TED {m.id} ↗
        </a>
        <h2>{m.title}</h2>
        <p className="dossier-buyer">
          {m.buyer || 'Unnamed buyer'} · {countryName(m.country)}
        </p>
        {!quick && (
          <div className="dossier-stamp">
            <Stamp verdict={m.verdict} size="lg" landed={landed} />
          </div>
        )}
      </header>

      <dl className="facts">
        <div>
          <dt>Fit</dt>
          <dd>
            <span className="facts-big">{m.score}</span>
            <span className="facts-unit">/100{quick ? ' quick' : ''}</span>
          </dd>
        </div>
        <div>
          <dt>Estimated value</dt>
          <dd>{money(m.value, m.currency ?? 'EUR')}</dd>
        </div>
        <div>
          <dt>Deadline</dt>
          <dd>
            {shortDate(m.deadline)}
            {d != null && <span className={`facts-sub${d <= 10 ? ' soon' : ''}`}>{d} days left</span>}
          </dd>
        </div>
        <div>
          <dt>Effort</dt>
          <dd>{m.effort ? m.effort[0].toUpperCase() + m.effort.slice(1) : '—'}</dd>
        </div>
      </dl>

      {m.cpv?.length > 0 && (
        <p className="cpv">
          {m.cpv.slice(0, 6).map((c) => (
            <code key={c}>{c}</code>
          ))}
        </p>
      )}

      {quick ? (
        <p className="note">The agent hasn't read this notice yet. It only matched on keywords and CPV codes.</p>
      ) : (
        <>
          {m.headline && <p className="headline">{m.headline}</p>}
          <div className="why">
            <div>
              <h3>Why it fits</h3>
              <ul>{(m.reasons ?? []).map((r, i) => <li key={i}>{r}</li>)}</ul>
            </div>
            <div>
              <h3>Watch out</h3>
              {(m.risks ?? []).length ? <ul className="risks">{m.risks.map((r, i) => <li key={i}>{r}</li>)}</ul> : <p className="muted">No blockers found.</p>}
            </div>
          </div>
        </>
      )}

      <section className="gate" aria-label="Your decision">
        <h3>Your call</h3>
        {m.decision ? (
          <div className="gate-done">
            <span className={`chip chip-${m.decision}`}>{m.decision === 'go' ? 'Bidding' : 'Passed'}</span>
            {m.decision_reason && <span className="gate-reason">“{m.decision_reason}”</span>}
            <button className="link" onClick={() => decide(null)} disabled={saving}>
              Undo
            </button>
          </div>
        ) : deciding ? (
          <div className="gate-form">
            <label htmlFor="reason">{deciding === 'go' ? 'What makes it worth it?' : 'Why pass?'} The radar learns your rules from this.</label>
            <textarea
              id="reason"
              rows={2}
              value={reason}
              autoFocus
              placeholder={deciding === 'go' ? 'e.g. Same stack as our hospital data platform' : 'e.g. We do not do on-site work outside Île-de-France'}
              onChange={(e) => setReason(e.target.value)}
            />
            <div className="gate-actions">
              <button className={deciding === 'go' ? 'btn btn-go' : 'btn btn-no'} onClick={() => decide(deciding)} disabled={saving}>
                {saving ? 'Saving…' : deciding === 'go' ? 'Mark as bidding' : 'Pass on it'}
              </button>
              <button className="link" onClick={() => setDeciding(null)}>
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="gate-actions">
            <button className="btn btn-go" onClick={() => setDeciding('go')}>
              We're bidding
            </button>
            <button className="btn btn-no" onClick={() => setDeciding('no-go')}>
              Pass
            </button>
          </div>
        )}
      </section>

      <section className="brief" aria-label="Bid brief">
        <div className="brief-head">
          <h3>Bid brief</h3>
          <button className="btn btn-ink" onClick={writeBrief} disabled={run?.running}>
            {run?.running ? 'Writing…' : brief ? 'Rewrite brief' : 'Write bid brief'}
          </button>
        </div>
        {run && <Trace steps={run.steps} running={run.running} />}
        {run?.error && <p className="error">The brief stopped: {run.error}</p>}
        {brief ? (
          <Markdown text={brief} />
        ) : (
          !run && (
            <p className="muted">
              The analyst reads the notice, your past bids and who won similar contracts on TED, then writes a go/no-go memo, pricing guidance and a response outline.
            </p>
          )
        )}
      </section>
    </article>
  );
}
