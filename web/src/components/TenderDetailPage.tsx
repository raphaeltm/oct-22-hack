import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { api } from '../api';
import { DossierPanel } from './Autopilot';
import { PartnerFinderPanel } from './Partners';
import {
  AskButton,
  DeadlineChip,
  Empty,
  ErrorState,
  formatDate,
  formatEur,
  Icon,
  Initials,
  Loading,
  PageHeader,
  readTimeLabel,
  ScoreRing,
  Stat,
  tenderTextLength,
  useApi,
} from './ui';

export function TenderDetailPage() {
  const { id = '' } = useParams();
  const detail = useApi(() => api.tender(id), [id]);
  const brief = useApi(() => api.tenderCompetitors(id), [id]);
  const matches = useApi(() => api.matches(), []);
  const [expanded, setExpanded] = useState(false);

  if (detail.loading && !detail.data) return <Loading />;
  if (detail.error || !detail.data) return <ErrorState message={detail.error ?? 'Tender not found'} />;

  const { tender, awards } = detail.data;
  const match = matches.data?.find((m) => m.tender.id === tender.id);
  const isAward = tender.noticeType.startsWith('can');
  const description = tender.description ?? '';
  const long = description.length > 420;

  return (
    <>
      <Link to="/tenders" className="back"><Icon name="back" size={16} /> All tenders</Link>
      <PageHeader
        eyebrow={
          <>
            <span className="mono">{tender.publicationNumber}</span>
            {isAward && <span className="chip muted">Award notice</span>}
          </>
        }
        title={<span lang="fr">{tender.title}</span>}
        subtitle={<span className="buyer-lg"><Icon name="building" size={16} /> {tender.buyerName ?? 'Unknown buyer'}</span>}
        mock={detail.mock || brief.mock}
        stacked
        actions={
          <>
            {tender.url && (
              <a className="btn secondary" href={tender.url} target="_blank" rel="noreferrer">
                View on TED <Icon name="external" size={14} />
              </a>
            )}
            <AskButton
              prompt={`Give me a competitor brief for tender ${tender.publicationNumber}: ${tender.title}. Who is likely to bid, what have they won with ${tender.buyerName ?? 'this buyer'}, and how should we position against them?`}
            />
          </>
        }
      />

      <div className="stats">
        <Stat label="Estimated value" value={formatEur(tender.estimatedValue)} />
        <Stat label="Deadline" value={formatDate(tender.deadline)} hint={!isAward && <DeadlineChip deadline={tender.deadline} />} />
        <Stat label="Published" value={formatDate(tender.publicationDate)} />
        <Stat
          label="CPV codes"
          value={<span className="cpvs" title={tender.cpvCodes.join(', ')}>{tender.cpvCodes[0] ?? '—'}</span>}
          hint={tender.cpvCodes.length > 1 ? `+${tender.cpvCodes.length - 1} more` : undefined}
        />
        <Stat
          label="Read time"
          value={readTimeLabel(tenderTextLength(tender.title, tender.description))}
          hint={`${tenderTextLength(tender.title, tender.description).toLocaleString('en-GB')} chars`}
        />
      </div>

      {match && (
        <section className="card match-card">
          <ScoreRing score={match.score} size={56} />
          <div>
            <h3>Why it matches</h3>
            <p>{match.rationale ?? 'No rationale recorded.'}</p>
          </div>
        </section>
      )}

      {description && (
        <section className="card">
          <h2 className="section-title">Description</h2>
          <p className={`prose ${long && !expanded ? 'clamp' : ''}`} lang="fr">{description}</p>
          {long && (
            <button className="btn ghost small" onClick={() => setExpanded(!expanded)}>
              {expanded ? 'Show less' : 'Show more'}
            </button>
          )}
        </section>
      )}

      {awards.length > 0 && (
        <section className="card">
          <h2 className="section-title">Awarded to</h2>
          <AwardTable awards={awards} showTender={false} />
        </section>
      )}

      {!isAward && <DossierPanel tenderId={tender.id} onFeedback={matches.reload} />}

      {!isAward && <PartnerFinderPanel tenderId={tender.id} />}

      <section className="brief">
        <div className="section-head">
          <div>
            <h2 className="section-title"><Icon name="trophy" /> Competitor brief</h2>
            <p className="muted">Firms that have won similar contracts, and what {tender.buyerName ?? 'this buyer'} has awarded before.</p>
          </div>
          <AskButton
            variant="secondary"
            label="Draft positioning"
            prompt={`For tender ${tender.publicationNumber} (${tender.title}), draft a short positioning note: how can we differentiate against the likely competitors?`}
          />
        </div>

        {brief.loading && !brief.data && <Loading label="Building brief…" />}
        {brief.error && <ErrorState message={brief.error} />}
        {brief.data && (
          <>
            <h3 className="sub-title">Likely competitors</h3>
            {brief.data.competitors.length > 0 && brief.data.competitors.every((c) => c.winsWithBuyer === 0) && (
              <p className="muted small brief-note">
                No past awards from {tender.buyerName ?? 'this buyer'} in our data yet, so these are the firms that won the most similar contracts elsewhere.
              </p>
            )}
            {brief.data.competitors.length === 0 ? (
              <Empty>No likely competitors identified yet.</Empty>
            ) : (
              <div className="competitor-grid">
                {brief.data.competitors.map((c) => (
                  <Link key={c.id} to={`/competitors/${c.id}`} className="card competitor-card">
                    <div className="competitor-card-head">
                      <Initials name={c.name} />
                      <div>
                        <div className="strong">{c.name}</div>
                        <div className="muted small">Last win {formatDate(c.lastWin)}</div>
                      </div>
                    </div>
                    {(c.incumbent || c.frameworkWins > 0) && (
                      <div className="tender-foot">
                        {c.incumbent && <span className="chip award">Likely incumbent</span>}
                        {c.frameworkWins > 0 && <span className="chip muted">{c.frameworkWins} framework win{c.frameworkWins > 1 ? 's' : ''}</span>}
                      </div>
                    )}
                    <div className="competitor-card-stats">
                      <div><strong>{c.winsWithBuyer}</strong><span>with buyer</span></div>
                      <div><strong>{c.wins}</strong><span>similar wins</span></div>
                      <div><strong>{c.buyers ?? '—'}</strong><span>buyers</span></div>
                      <div><strong>{formatEur(c.totalValue, true)}</strong><span>won</span></div>
                    </div>
                    {c.examples.length > 0 && (
                      <ul className="small examples">
                        {c.examples.slice(0, 2).map((e) => (
                          <li key={e.tenderId}>
                            <span lang="fr">{e.title}</span>
                            <span className="muted"> · {e.buyer} · {formatDate(e.date)}{e.value != null ? ` · ${formatEur(e.value, true)}` : ''}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                    {c.summary && <p className="small muted clamp-3">{c.summary}</p>}
                  </Link>
                ))}
              </div>
            )}

            {brief.data.notes.length > 0 && <p className="muted small brief-note">{brief.data.notes[0]}</p>}

            <h3 className="sub-title">Past awards with {tender.buyerName ?? 'this buyer'}</h3>
            {brief.data.buyerAwards.length === 0 ? (
              <Empty>No previous awards found for this buyer.</Empty>
            ) : (
              <div className="card flush">
                <AwardTable awards={brief.data.buyerAwards} />
              </div>
            )}
          </>
        )}
      </section>
    </>
  );
}

export function AwardTable({ awards, showTender = true, showWinner = true }: {
  awards: import('../api').Award[];
  showTender?: boolean;
  showWinner?: boolean;
}) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Date</th>
            {showTender && <th>Contract</th>}
            {showWinner && <th>Winner</th>}
            <th className="num">Value</th>
          </tr>
        </thead>
        <tbody>
          {awards.map((a) => (
            <tr key={a.id}>
              <td className="nowrap">{formatDate(a.awardDate)}</td>
              {showTender && (
                <td>
                  <div className="cell-title" lang="fr">{a.tender?.title ?? '—'}</div>
                  <div className="muted small">
                    {a.tender?.buyerName}
                    {a.tender?.url && (
                      <> · <a href={a.tender.url} target="_blank" rel="noreferrer" className="mono">{a.tender.publicationNumber}</a></>
                    )}
                  </div>
                </td>
              )}
              {showWinner && (
                <td className="nowrap">
                  {a.organisationId ? <Link to={`/competitors/${a.organisationId}`}>{a.winnerName}</Link> : a.winnerName}
                </td>
              )}
              <td className="num nowrap">
                {formatEur(a.value)}
                {a.coWinners != null && a.coWinners > 1 && (
                  <div className="muted small" title="Multi-winner framework agreement">framework · {a.coWinners} winners</div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
