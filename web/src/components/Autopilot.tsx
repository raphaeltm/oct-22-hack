// Autopilot (issue #19): dossiers the agent built on its own, what it learned
// from bid/skip feedback, and how its predictions scored against award notices.
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import {
  api,
  type Decision,
  type Dossier,
  type DossierState,
  type InboxItem,
  type Learned,
  type Scorecard,
  SKIP_REASONS,
  type SkipReason,
  type Verdict,
} from '../api';
import { useJobs } from './Jobs';
import { AskButton, DeadlineChip, Empty, ErrorState, formatDate, formatEur, Icon, Loading, PageHeader, Stat, useApi } from './ui';

const VERDICT: Record<Verdict, { label: string; tone: string }> = {
  go: { label: 'Go', tone: 'go' },
  consider: { label: 'Consider', tone: 'consider' },
  'no-go': { label: 'No-go', tone: 'nogo' },
};

export function VerdictChip({ verdict }: { verdict: Verdict | null | undefined }) {
  if (!verdict) return null;
  const v = VERDICT[verdict];
  return <span className={`chip verdict ${v.tone}`}>{v.label}</span>;
}

const DECISION_LABEL: Record<Decision, string> = { bid: 'Bidding', skip: 'Skipped', won: 'Won', lost: 'Lost' };

const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : '—');

// ---------------------------------------------------------------- page

export function AutopilotPage() {
  const inbox = useApi(() => api.autopilot(), []);
  const jobs = useJobs();
  // Reload when an autopilot job finishes (new dossier, sweep or backtest).
  const finished = Object.values(jobs).filter((j) => j.queue === 'autopilot' && j.status !== 'queued' && j.status !== 'active').length;
  useEffect(() => {
    if (finished) inbox.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [finished]);
  const running = Object.values(jobs).some((j) => j.queue === 'autopilot' && (j.status === 'queued' || j.status === 'active'));

  if (inbox.loading && !inbox.data) return <Loading />;
  if (inbox.error || !inbox.data) {
    return inbox.error?.includes('404') ? (
      <Empty>Set up your company profile first: the autopilot works from it.</Empty>
    ) : (
      <ErrorState message={inbox.error ?? 'Could not load the autopilot'} />
    );
  }
  const { dossiers, learned, scorecard } = inbox.data;
  const ready = dossiers.filter((d) => d.status === 'ready');
  const bt = scorecard.backtest;

  return (
    <>
      <PageHeader
        eyebrow={<>Autopilot {running && <span className="chip muted"><span className="spinner sm" /> working</span>}</>}
        title="Your bid desk, working in the background"
        subtitle="When a new tender matches your profile, the agent assembles the pre-bid homework on its own, logs its predictions, and grades them when the award notice is published."
        actions={<AskButton variant="secondary" label="What did it find?" prompt="What has the autopilot found for us? Summarise the ready dossiers and tell me which one to look at first." />}
      />

      <div className="stats">
        <Stat label="Dossiers ready" value={ready.length} hint={`${dossiers.filter((d) => d.trigger === 'autopilot').length} built without being asked`} />
        <Stat label="Decisions learned from" value={learned.decisions} hint={learned.rules.length ? `${learned.rules.length} ranking rule${learned.rules.length > 1 ? 's' : ''}` : 'Mark tenders bid / skip'} />
        <Stat
          label="Backtest: winner in top 5"
          value={pct(bt.top5Hits, bt.graded)}
          hint={bt.graded ? `${bt.top5Hits}/${bt.graded} past tenders` : 'Runs after the TED import'}
        />
        <Stat
          label="Naive baseline"
          value={pct(scorecard.baseline.top5Hits, scorecard.baseline.graded)}
          hint={scorecard.baseline.graded ? `${scorecard.baseline.top5Hits}/${scorecard.baseline.graded}: most frequent winners` : '—'}
        />
      </div>

      <section>
        <div className="section-head">
          <div>
            <h2 className="section-title"><Icon name="spark" /> Dossiers</h2>
            <p className="muted">Built automatically for strong new matches with at least a week left, or on demand from any tender.</p>
          </div>
        </div>
        {dossiers.length === 0 ? (
          <div className="card empty-card">
            <p>No dossiers yet. The autopilot runs after each TED import and whenever matches are refreshed.</p>
            <Link className="btn secondary" to="/tenders">See matched tenders</Link>
          </div>
        ) : (
          <ul className="tender-list">
            {dossiers.map((d) => <InboxRow key={d.tenderId} d={d} />)}
          </ul>
        )}
      </section>

      <div className="two-col">
        <LearnedCard learned={learned} />
        <ScorecardCard card={scorecard} />
      </div>
    </>
  );
}

function InboxRow({ d }: { d: InboxItem }) {
  const busy = d.status === 'queued' || d.status === 'running';
  return (
    <li>
      <Link to={`/tenders/${d.tenderId}`} className={`card tender-card compact inbox-row ${!d.seenAt && d.status === 'ready' ? 'unseen' : ''}`}>
        <div className="inbox-verdict">
          {busy ? <span className="spinner sm" /> : d.status === 'failed' ? <span className="chip urgent">Failed</span> : <VerdictChip verdict={d.verdict} />}
        </div>
        <div className="tender-body">
          <div className="tender-title" lang="fr">{d.title}</div>
          <div className="tender-meta">
            <span><Icon name="building" size={14} /> {d.buyerName ?? 'Unknown buyer'}</span>
            {d.estimatedValue ? <span>{formatEur(d.estimatedValue, true)}</span> : null}
            {d.lastSimilarWinner && <span>Last similar award: {d.lastSimilarWinner}</span>}
            {d.criteria > 0 && <span>{d.criteria} award criteria</span>}
          </div>
          <div className="tender-foot">
            <DeadlineChip deadline={d.deadline} />
            <span className="chip muted">{d.trigger === 'autopilot' ? 'Autopilot' : 'On demand'} · {formatDate(d.createdAt)}</span>
            {busy && <span className="chip muted">Building…</span>}
            {d.decision && <span className="chip award">{DECISION_LABEL[d.decision]}{d.reason ? `: ${SKIP_REASONS[d.reason].toLowerCase()}` : ''}</span>}
            {!d.seenAt && d.status === 'ready' && <span className="chip new">New</span>}
          </div>
        </div>
      </Link>
    </li>
  );
}

function LearnedCard({ learned }: { learned: Learned }) {
  return (
    <section className="card">
      <h2 className="section-title">What it learned from you</h2>
      {learned.decisions === 0 ? (
        <p className="muted">
          Nothing yet. Mark tenders as bid, skip, won or lost: skipped tenders disappear, similar ones rank lower, and buyers you win with rank higher.
        </p>
      ) : (
        <>
          <p className="muted small">
            From {learned.decisions} decision{learned.decisions > 1 ? 's' : ''}
            {learned.skippedHidden ? `; ${learned.skippedHidden} skipped tender${learned.skippedHidden > 1 ? 's' : ''} hidden from matches` : ''}.
          </p>
          <ul className="learned">
            {learned.rules.map((r, i) => (
              <li key={i}>
                <span className={`delta ${r.delta > 0 ? 'up' : 'down'}`}>{r.delta > 0 ? '+' : ''}{r.delta}</span>
                <span>{r.label}</span>
              </li>
            ))}
          </ul>
          {learned.weightNote && <p className="small muted">{learned.weightNote}.</p>}
        </>
      )}
    </section>
  );
}

function ScorecardCard({ card }: { card: Scorecard }) {
  const bt = card.backtest;
  const live = card.live;
  const rows = [
    { label: 'Agent (backtest)', n: bt.top5Hits, d: bt.graded },
    { label: 'Baseline', n: card.baseline.top5Hits, d: card.baseline.graded },
  ];
  const max = Math.max(...rows.map((r) => (r.d ? r.n / r.d : 0)), 0.01);
  return (
    <section className="card">
      <h2 className="section-title">Prediction scorecard</h2>
      <p className="muted small">
        Does past award data point to the eventual winner? A hit means an actual winner is among the 5 firms it named, graded against
        TED award notices. It says nothing about who else bid, or whether you should.
      </p>
      {bt.graded === 0 ? (
        <p className="muted">The backtest runs after the TED import.</p>
      ) : (
        <div className="bars" role="img" aria-label={rows.map((r) => `${r.label} ${pct(r.n, r.d)}`).join(', ')}>
          {rows.map((r) => (
            <div key={r.label} className="bar-row">
              <span className="bar-label">{r.label}</span>
              <span className="bar-track"><span style={{ width: `${((r.d ? r.n / r.d : 0) / max) * 100}%` }} /></span>
              <span className="bar-num">{pct(r.n, r.d)} <span className="muted">({r.n}/{r.d})</span></span>
            </div>
          ))}
        </div>
      )}
      {bt.graded > 0 && (
        <p className="small muted">
          Same {bt.graded} past tenders for both; the agent named firms for {bt.predicted}, the baseline for {card.baseline.predicted} (no prediction counts as a miss).
        </p>
      )}
      <p className="small">
        <strong>Live:</strong> {live.predicted} tender{live.predicted === 1 ? '' : 's'} predicted, {live.graded} graded
        {live.graded ? `, ${live.top5Hits} hit${live.top5Hits === 1 ? '' : 's'}` : ''}, {live.pending} waiting for the award notice.
      </p>
      {bt.incumbentGraded > 0 && (
        <p className="small muted">
          The supplier of the buyer’s last similar contract won again in {bt.incumbentHits}/{bt.incumbentGraded} backtested tenders.
        </p>
      )}
      {card.examples.length > 0 && (
        <details className="examples-details">
          <summary className="small">Graded examples</summary>
          <ul className="small examples">
            {card.examples.map((e) => (
              <li key={`${e.source}-${e.tenderId}`}>
                <a href={e.url ?? '#'} target="_blank" rel="noreferrer" lang="fr">{e.title.slice(0, 80)}</a>
                <span className="muted"> · predicted </span>
                {e.predicted.map((p, i) => (
                  <span key={i} className={p.hit ? 'hit' : 'muted'}>{i ? ', ' : ''}{p.name}</span>
                ))}
                <span className="muted"> · won by {e.winners.slice(0, 3).join(', ')}</span>
                {e.awardUrl && <> · <a href={e.awardUrl} target="_blank" rel="noreferrer">award</a></>}
              </li>
            ))}
          </ul>
        </details>
      )}
      <ul className="small muted notes">{card.notes.map((n) => <li key={n}>{n}</li>)}</ul>
    </section>
  );
}

// ---------------------------------------------------------------- tender detail panel

export function DossierPanel({ tenderId, onFeedback }: { tenderId: string; onFeedback?: () => void }) {
  const state = useApi(() => api.dossier(tenderId), [tenderId]);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const status = state.data?.status;
  const busy = starting || status === 'queued' || status === 'running';

  // Poll while the job runs (job events are shared; the row is the source of truth).
  useEffect(() => {
    if (!busy) return;
    const t = window.setInterval(() => state.reload(), 3000);
    return () => window.clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy]);
  useEffect(() => {
    if (status && status !== 'none') setStarting(false);
  }, [status]);

  const build = async () => {
    setStarting(true);
    setError(null);
    try {
      await api.buildDossier(tenderId);
      state.reload();
    } catch (e) {
      setStarting(false);
      setError((e as Error).message);
    }
  };

  if (state.loading && !state.data) return <section className="card dossier"><Loading label="Loading dossier…" /></section>;
  if (state.error) return <section className="card dossier"><ErrorState message={state.error} /></section>;
  const d = state.data!;

  return (
    <section className="card dossier" aria-busy={busy}>
      <div className="section-head">
        <div>
          <h2 className="section-title"><Icon name="spark" /> Pre-bid dossier</h2>
          <p className="muted small">
            {d.status === 'ready' && d.content
              ? `${d.trigger === 'autopilot' ? 'Built by the autopilot' : 'Built on demand'} · ${formatDate(d.content.generatedAt)} · facts from TED, award history and your profile${d.content.memoBy === 'model' ? '; memo written by Claude' : ''}`
              : 'Deadlines, award criteria, buyer history, likely bidders, admin checklist and questions for the buyer.'}
          </p>
        </div>
        {d.status === 'ready' && (
          <button className="btn ghost small" onClick={build} disabled={busy}><Icon name="refresh" size={14} /> Rebuild</button>
        )}
      </div>
      {error && <div className="notice warn">{error}</div>}
      {busy ? (
        <div className="state"><span className="spinner" /> The agent is reading the notice, the buyer’s award history and likely bidders… (10–40 s)</div>
      ) : d.status === 'none' ? (
        <div className="dossier-empty">
          <p>No dossier yet. The autopilot builds them for strong new matches; you can also ask for one now.</p>
          <button className="btn primary" onClick={build}><Icon name="spark" size={15} /> Build pre-bid dossier</button>
        </div>
      ) : d.status === 'failed' ? (
        <div className="dossier-empty">
          <div className="notice warn">The dossier could not be built: {d.error ?? 'unknown error'}</div>
          <button className="btn secondary" onClick={build}>Try again</button>
        </div>
      ) : d.content ? (
        <DossierBody d={d.content} />
      ) : null}
      <FeedbackBar tenderId={tenderId} state={d} onDone={() => { state.reload(); onFeedback?.(); }} />
    </section>
  );
}

function DossierBody({ d }: { d: Dossier }) {
  const now = Date.now();
  return (
    <div className="dossier-body">
      <div className={`verdict-banner ${VERDICT[d.recommendation.verdict].tone}`}>
        <VerdictChip verdict={d.recommendation.verdict} />
        <ul>
          {d.recommendation.reasons.map((r) => (
            <li key={r} className={r.startsWith('+') ? 'pro' : 'con'}>{r.slice(2)}</li>
          ))}
        </ul>
      </div>
      {d.memo && <div className="memo md">{renderMemo(d.memo)}</div>}

      <div className="dossier-grid">
        <div>
          <h3 className="sub-title">Calendar</h3>
          <ol className="timeline">
            {d.calendar.map((c) => {
              const past = c.label !== 'Published on TED' && new Date(c.date).getTime() < now;
              return (
                <li key={c.label} className={`${c.kind} ${past ? 'past' : ''}`}>
                  <span className="when">{formatDate(c.date)}</span>
                  <span>
                    {c.label}
                    {c.kind !== 'official' && <span className="chip muted tiny">{c.kind}</span>}
                    {past && <span className="chip muted tiny">passed</span>}
                    {c.note && <span className="muted small block">{c.note}</span>}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
        <div>
          <h3 className="sub-title">Award criteria</h3>
          {d.criteria.items.length ? (
            <div className="criteria">
              {d.criteria.items.map((c, i) => (
                <div key={i} className="criterion">
                  <span lang="fr">{c.name ?? (c.type === 'price' ? 'Prix' : c.type)}</span>
                  <span className="crit-bar"><span className={c.type} style={{ width: `${c.weight ?? 0}%` }} /></span>
                  <span className="num">{c.weight != null ? `${c.weight}%` : '—'}</span>
                </div>
              ))}
            </div>
          ) : null}
          <p className="muted small">{d.criteria.note}</p>
          <h3 className="sub-title">Contract</h3>
          <dl className="facts">
            {d.tender.procedureType && <><dt>Procedure</dt><dd>{d.tender.procedureType}</dd></>}
            <dt>Duration</dt><dd>{d.contract.duration ?? 'Not stated'}{d.contract.renewals ? `, up to ${d.contract.renewals} renewal${d.contract.renewals > 1 ? 's' : ''}` : ''}</dd>
            {d.contract.framework && <><dt>Type</dt><dd>{d.contract.framework}</dd></>}
            {d.tender.lots > 1 && <><dt>Lots</dt><dd>{d.tender.lots}</dd></>}
            <dt>Value</dt><dd>{d.tender.estimatedValue ? formatEur(d.tender.estimatedValue) : 'Not published'}</dd>
          </dl>
          {(d.documents.dceUrl || d.documents.submissionUrl) && (
            <p className="small links">
              {d.documents.dceUrl && <a href={d.documents.dceUrl} target="_blank" rel="noreferrer">Tender documents (DCE) <Icon name="external" size={12} /></a>}
              {d.documents.submissionUrl && d.documents.submissionUrl !== d.documents.dceUrl && (
                <a href={d.documents.submissionUrl} target="_blank" rel="noreferrer">Submission portal <Icon name="external" size={12} /></a>
              )}
            </p>
          )}
        </div>
      </div>

      {d.requirements.length > 0 && (
        <>
          <h3 className="sub-title">Requirements spotted in the notice</h3>
          <ul className="reqs">
            {d.requirements.map((r) => (
              <li key={r.key}>
                <span className={`chip ${r.covered ? 'covered' : 'soon'}`}>{r.covered ? 'In your profile' : 'Check'}</span>
                <strong>{r.label}</strong>
                <span className="muted small block" lang="fr">“{r.evidence}”</span>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="dossier-grid">
        <div>
          <h3 className="sub-title">Buyer history</h3>
          {d.incumbent && (
            <div className="notice info small">
              <strong>Last similar award: {d.incumbent.name}.</strong> {d.incumbent.basis}.{' '}
              {d.incumbent.url && <a href={d.incumbent.url} target="_blank" rel="noreferrer">TED notice</a>}
              <span className="block muted">Our award data starts in 2025, so this may not be the outgoing supplier.</span>
            </div>
          )}
          {d.buyerHistory.recent.length ? (
            <ul className="small examples">
              {d.buyerHistory.recent.map((r) => (
                <li key={r.tenderId}>
                  {r.url ? <a href={r.url} target="_blank" rel="noreferrer" lang="fr">{r.title.slice(0, 90)}</a> : <span lang="fr">{r.title}</span>}
                  <span className="muted"> · {formatDate(r.date)} · {r.winners.slice(0, 2).join(', ')}{r.winners.length > 2 ? ` +${r.winners.length - 2}` : ''}{r.bidsReceived ? ` · ${r.bidsReceived} bids` : ''}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted small">No earlier award notices from this buyer in our data.</p>
          )}
        </div>
        <div>
          <h3 className="sub-title">Market for similar contracts</h3>
          <dl className="facts">
            <dt>Comparable awards</dt><dd>{d.market.similarAwards}</dd>
            <dt>Typical value</dt>
            <dd>
              {d.market.valueMedian
                ? `${formatEur(d.market.valueMedian, true)} median (${formatEur(d.market.valueP25, true)}–${formatEur(d.market.valueP75, true)}, n=${d.market.valueN} sole awards)`
                : 'Not enough data'}
            </dd>
            <dt>Bids received</dt><dd>{d.market.bidsMedian != null ? `${d.market.bidsMedian} median (n=${d.market.bidsN})` : 'Not published'}</dd>
          </dl>
          <h3 className="sub-title">Likely bidders</h3>
          <ul className="small examples">
            {d.competitors.map((c) => (
              <li key={c.name}>
                {c.organisationId ? <Link to={`/competitors/${c.organisationId}`}>{c.name}</Link> : c.name}
                <span className="muted"> · {c.why}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="dossier-grid">
        <div>
          <h3 className="sub-title">Questions for the buyer <span className="muted small">(draft; not sent)</span></h3>
          <ol className="questions">
            {d.questions.map((q, i) => (
              <li key={i}>
                <span lang="fr">{q.fr}</span>
                <span className="muted small block">{q.en}</span>
              </li>
            ))}
          </ol>
        </div>
        <div>
          <h3 className="sub-title">Response checklist</h3>
          <ul className="checklist">
            {d.checklist.map((c) => (
              <li key={c.item}>
                {c.item}
                {c.note && <span className="muted small block">{c.note}</span>}
              </li>
            ))}
          </ul>
          <p className="muted small">Standard French public-tender file; confirm against the RC.</p>
        </div>
      </div>
    </div>
  );
}

/** Minimal markdown for the memo: bullets and **bold**. */
function renderMemo(text: string) {
  const bold = (s: string) => s.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? <strong key={i}>{part}</strong> : part));
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const bullets = lines.filter((l) => /^[-*•]\s/.test(l));
  if (!bullets.length) return lines.map((l, i) => <p key={i}>{bold(l)}</p>);
  return (
    <>
      {lines.filter((l) => !/^[-*•]\s/.test(l)).map((l, i) => <p key={`p${i}`}>{bold(l)}</p>)}
      <ul>{bullets.map((l, i) => <li key={i}>{bold(l.replace(/^[-*•]\s/, ''))}</li>)}</ul>
    </>
  );
}

function FeedbackBar({ tenderId, state, onDone }: { tenderId: string; state: DossierState; onDone: () => void }) {
  const [skipping, setSkipping] = useState(false);
  const [reason, setReason] = useState<SkipReason>('scope');
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const submit = async (decision: Decision, why?: SkipReason) => {
    setSaving(true);
    setError(null);
    try {
      const res = await api.feedback(tenderId, decision, why);
      const rule = res.learned.rules.find((r) => r.label.includes(state.content?.tender.title.slice(0, 20) ?? '\u0000'));
      setResult(
        decision === 'skip'
          ? `Skipped. It's hidden from your matches${rule ? `, and similar tenders now rank ${rule.delta} points lower` : ''}.`
          : `Saved as ${DECISION_LABEL[decision].toLowerCase()}.${rule ? ` Similar tenders from this buyer now rank +${rule.delta}.` : ''}`,
      );
      setSkipping(false);
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  const undo = async () => {
    setSaving(true);
    try {
      await api.undoFeedback(tenderId);
      setResult('Decision removed.');
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="feedback">
      <div className="feedback-row">
        <span className="small strong">Your decision</span>
        {state.decision && (
          <span className="chip award">
            {DECISION_LABEL[state.decision]}{state.reason ? `: ${SKIP_REASONS[state.reason].toLowerCase()}` : ''}
          </span>
        )}
        <div className="segmented" role="group" aria-label="Record your decision">
          <button disabled={saving} className={state.decision === 'bid' ? 'active' : ''} onClick={() => submit('bid')}>Bid</button>
          <button disabled={saving} className={skipping || state.decision === 'skip' ? 'active' : ''} onClick={() => setSkipping((s) => !s)} aria-expanded={skipping}>Skip…</button>
          <button disabled={saving} className={state.decision === 'won' ? 'active' : ''} onClick={() => submit('won')}>Won</button>
          <button disabled={saving} className={state.decision === 'lost' ? 'active' : ''} onClick={() => submit('lost')}>Lost</button>
        </div>
        {state.decision && <button className="btn ghost small" onClick={undo} disabled={saving}>Undo</button>}
        {saving && <span className="spinner sm" aria-label="Saving" />}
      </div>
      {skipping && (
        <div className="feedback-row">
          <label className="small" htmlFor={`reason-${tenderId}`}>Why skip?</label>
          <select id={`reason-${tenderId}`} value={reason} onChange={(e) => setReason(e.target.value as SkipReason)}>
            {Object.entries(SKIP_REASONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <button className="btn secondary small" disabled={saving} onClick={() => submit('skip', reason)}>Skip tender</button>
        </div>
      )}
      {result && <div className="notice success small" role="status">{result} <Link to="/autopilot">See what it learned</Link></div>}
      {error && <div className="notice warn small" role="alert">{error}</div>}
      <p className="muted small">The agent learns from these: skipped tenders disappear, similar ones rank lower, and buyers you bid on or win with rank higher.</p>
    </div>
  );
}
