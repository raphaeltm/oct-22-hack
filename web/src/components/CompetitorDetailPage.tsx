import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router';
import { api } from '../api';
import { AwardTable } from './TenderDetailPage';
import { useJobs } from './Jobs';
import { AskButton, Empty, ErrorState, formatDate, formatEur, Icon, Initials, Loading, PageHeader, Stat, useApi } from './ui';

type ResearchState =
  | { kind: 'idle' }
  | { kind: 'starting' }
  | { kind: 'queued'; jobId: string }
  | { kind: 'done'; text: string }
  | { kind: 'error'; text: string };

export function CompetitorDetailPage() {
  const { id = '' } = useParams();
  const { data, mock, loading, error, reload } = useApi(() => api.competitor(id), [id]);
  const [research, setResearch] = useState<ResearchState>({ kind: 'idle' });
  const jobs = useJobs();
  const job = research.kind === 'queued' ? jobs[research.jobId] : undefined;
  const fallbackTimer = useRef<number>(undefined);

  useEffect(() => {
    setResearch({ kind: 'idle' });
  }, [id]);
  useEffect(() => () => clearTimeout(fallbackTimer.current), []);

  // Refetch the competitor once its research job finishes.
  useEffect(() => {
    if (job?.status === 'completed') {
      reload();
      setResearch({ kind: 'done', text: 'Research complete. Summary and notes are updated.' });
    } else if (job?.status === 'failed') {
      setResearch({ kind: 'error', text: `Research failed: ${job.error ?? 'unknown error'}` });
    }
  }, [job?.status]);

  async function runResearch() {
    setResearch({ kind: 'starting' });
    try {
      const { jobId } = await api.research(id);
      if (jobId) {
        setResearch({ kind: 'queued', jobId: String(jobId) });
        // Safety net in case the job event stream drops: refetch after a while.
        clearTimeout(fallbackTimer.current);
        fallbackTimer.current = window.setTimeout(reload, 45_000);
      } else {
        reload();
        setResearch({ kind: 'done', text: 'Research complete.' });
      }
    } catch (e) {
      setResearch({
        kind: 'error',
        text: `Research isn't available right now (${(e as Error).message}). Try asking the agent in the chat instead.`,
      });
    }
  }

  const running = research.kind === 'starting' || research.kind === 'queued';
  const progressText =
    research.kind === 'starting'
      ? 'Starting…'
      : job?.progress?.message ?? (job?.status === 'active' ? 'Researching…' : 'Queued…');

  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorState message={error ?? 'Competitor not found'} />;

  const avg = data.wins && data.totalValue ? data.totalValue / data.wins : null;
  const buyers = data.buyers ?? new Set(data.awards.map((a) => a.tender?.buyerName).filter(Boolean)).size;

  return (
    <>
      <Link to="/competitors" className="back"><Icon name="back" size={16} /> All competitors</Link>
      <PageHeader
        eyebrow="Competitor"
        title={
          <span className="title-with-avatar">
            <Initials name={data.name} size={44} /> {data.name}
          </span>
        }
        subtitle={
          data.website && (
            <a href={data.website} target="_blank" rel="noreferrer" className="link-ext">
              <Icon name="globe" size={14} /> {data.website.replace(/^https?:\/\//, '')}
            </a>
          )
        }
        mock={mock}
        stacked
        actions={
          <>
            <button className="btn secondary" onClick={runResearch} disabled={running || mock}>
              {running ? <span className="spinner sm" /> : <Icon name="refresh" size={15} />}
              {running ? progressText : data.lastResearchedAt ? 'Refresh research' : 'Research this competitor'}
            </button>
            <AskButton
              prompt={`Tell me about competitor ${data.name}: which public contracts have they won, who are their main buyers, and how could Rivage Numérique compete against them?`}
            />
          </>
        }
      />

      {research.kind === 'done' && <div className="notice success">{research.text}</div>}
      {research.kind === 'error' && <div className="notice warn">{research.text}</div>}

      <div className="stats">
        <Stat label="Contracts won" value={data.wins} hint={`with ${buyers} distinct buyer${buyers === 1 ? '' : 's'}`} />
        <Stat label="Total value" value={formatEur(data.totalValue, true)} />
        <Stat label="Average award" value={formatEur(avg, true)} />
        <Stat label="Last win" value={formatDate(data.lastWin)} />
      </div>

      <div className="stack">
        <section className="card">
          <h2 className="section-title">Research summary</h2>
          {data.summary ? <p className="prose">{data.summary}</p> : <Empty>No summary yet. Run research to build one.</Empty>}
          {data.lastResearchedAt && <p className="muted small">Last researched {formatDate(data.lastResearchedAt)}</p>}
        </section>

        <section className="card">
          <h2 className="section-title">Research notes</h2>
          {data.notes.length === 0 ? (
            <Empty>No notes yet.</Empty>
          ) : (
            <ul className="notes">
              {data.notes.map((n) => (
                <li key={n.id}>
                  <span className={`source-tag ${n.source}`}>{n.source}</span>
                  <div>
                    <p className="clamp-3" title={n.content}>{n.content}</p>
                    {n.url && (
                      <a href={n.url} target="_blank" rel="noreferrer" className="link-ext small">
                        {hostname(n.url)} <Icon name="external" size={12} />
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section>
        <h2 className="section-title">Award history</h2>
        {data.awards.length === 0 ? (
          <Empty>No awards recorded.</Empty>
        ) : (
          <div className="card flush">
            <AwardTable awards={data.awards} showWinner={false} />
          </div>
        )}
      </section>
    </>
  );
}

function hostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
