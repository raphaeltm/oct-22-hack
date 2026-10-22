import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { api, Match, Tender } from '../api';
import {
  AskButton,
  DeadlineChip,
  daysUntil,
  Empty,
  ErrorState,
  formatDate,
  formatEur,
  Icon,
  Loading,
  PageHeader,
  ReadTimeChip,
  ScoreRing,
  Stat,
  tenderTextLength,
  useApi,
  useDebounced,
} from './ui';

type Sort = 'score' | 'deadline' | 'deadline_asc' | 'value';

export function TendersPage() {
  const [params, setParams] = useSearchParams();
  const view = params.get('view') === 'all' ? 'all' : 'matches';
  const setView = (v: string) => setParams(v === 'all' ? { view: 'all' } : {}, { replace: true });

  return (
    <>
      <PageHeader
        eyebrow="Tenders"
        title={view === 'all' ? 'All tenders' : 'Matched tenders'}
        subtitle={
          view === 'all'
            ? 'Search every French IT notice imported from TED, open calls and past awards.'
            : 'Open French public tenders from TED, ranked against your company profile.'
        }
        actions={<AskButton variant="secondary" label="Which should we bid on?" prompt="Of our matched open tenders, which 2 or 3 should we bid on first, and why? Consider fit, deadline and likely competition." />}
      />
      <div className="tabs" role="tablist">
        <button role="tab" aria-selected={view === 'matches'} className={view === 'matches' ? 'active' : ''} onClick={() => setView('matches')}>
          Matches for you
        </button>
        <button role="tab" aria-selected={view === 'all'} className={view === 'all' ? 'active' : ''} onClick={() => setView('all')}>
          Browse all
        </button>
      </div>
      {view === 'all' ? <AllTenders /> : <Matches />}
    </>
  );
}

function Matches() {
  const { data, mock, loading, error, reload } = useApi(() => api.matches(), []);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshNote, setRefreshNote] = useState<string | null>(null);
  const refresh = async () => {
    setRefreshing(true);
    setRefreshNote(null);
    try {
      const r = await api.refreshMatches();
      setRefreshNote(r.notes.find((n) => n.includes('recent')) ?? r.notes[0] ?? null);
      reload();
    } catch (e) {
      setRefreshNote(`Refresh failed: ${(e as Error).message}`);
    } finally {
      setRefreshing(false);
    }
  };
  const [q, setQ] = useState('');
  const [sort, setSort] = useState<Sort>('score');

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = (data ?? []).filter(
      (m) => !needle || `${m.tender.title} ${m.tender.buyerName ?? ''} ${m.tender.publicationNumber}`.toLowerCase().includes(needle),
    );
    const key: Record<Sort, (m: Match) => number> = {
      score: (m) => -m.score,
      deadline: (m) => (m.tender.deadline ? -new Date(m.tender.deadline).getTime() : -Infinity),
      deadline_asc: (m) => (m.tender.deadline ? new Date(m.tender.deadline).getTime() : Infinity),
      value: (m) => -(m.tender.estimatedValue ?? 0),
    };
    return [...list].sort((a, b) => key[sort](a) - key[sort](b));
  }, [data, q, sort]);

  const strong = data?.filter((m) => m.score >= 60).length ?? 0;
  const pipeline = data?.reduce((s, m) => s + (m.tender.estimatedValue ?? 0), 0) ?? 0;
  const closingSoon = data?.filter((m) => {
    const d = daysUntil(m.tender.deadline);
    return d != null && d >= 0 && d <= 14;
  }).length ?? 0;

  return (
    <>
      {mock && (
        <div className="notice info">
          These matches are sample data. Use <strong>Browse all</strong> for the real TED notices.
        </div>
      )}
      {refreshNote && <div className="notice info">{refreshNote}</div>}
      {data && (
        <div className="stats">
          <Stat label="Matched tenders" value={data.length} />
          <Stat label="Strong fit" value={strong} hint="score ≥ 60" />
          <Stat label="Pipeline value" value={formatEur(pipeline, true)} hint="estimated" />
          <Stat label="Closing in 14 days" value={closingSoon} />
        </div>
      )}

      <div className="toolbar">
        <label className="search">
          <Icon name="search" size={16} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title, buyer or notice number" />
        </label>
        <div className="segmented" role="group" aria-label="Sort by">
          <button className={sort === 'score' ? 'active' : ''} onClick={() => setSort('score')}>Best match</button>
          <button
            className={sort === 'deadline' || sort === 'deadline_asc' ? 'active' : ''}
            onClick={() => setSort(sort === 'deadline' ? 'deadline_asc' : 'deadline')}
          >
            Deadline {sort === 'deadline' ? '↓' : sort === 'deadline_asc' ? '↑' : ''}
          </button>
          <button className={sort === 'value' ? 'active' : ''} onClick={() => setSort('value')}>Value</button>
        </div>
        <button className="btn secondary small" onClick={refresh} disabled={refreshing}>
          {refreshing ? 'Refreshing…' : 'Refresh matches'}
        </button>
      </div>

      {loading && !data && <Loading label="Loading matches…" />}
      {error && <ErrorState message={error} />}
      {data && rows.length === 0 && <Empty>No tenders match “{q}”.</Empty>}

      <ul className="tender-list">
        {rows.map((m) => (
          <TenderCard key={m.tender.id} match={m} />
        ))}
      </ul>
    </>
  );
}

function TenderCard({ match: { tender, score, rationale, status } }: { match: Match }) {
  return (
    <li className="card tender-card">
      <ScoreRing score={score} />
      <div className="tender-body">
        <div className="tender-meta">
          <span className="buyer"><Icon name="building" size={14} /> {tender.buyerName ?? 'Unknown buyer'}</span>
          <span className="dot">·</span>
          <span className="mono">{tender.publicationNumber}</span>
        </div>
        <Link to={`/tenders/${tender.id}`} className="tender-title" lang="fr">
          {tender.title}
        </Link>
        {rationale && <p className="rationale">{rationale}</p>}
        <div className="tender-foot">
          <DeadlineChip deadline={tender.deadline} />
          {status === 'recent' && <span className="chip muted" title="Recently published; deadline passed or not stated">Recent</span>}
          <ReadTimeChip chars={tenderTextLength(tender.title, tender.description)} />
          <span className="chip value">{formatEur(tender.estimatedValue)}</span>
          <span className="muted small">Due {formatDate(tender.deadline)}</span>
          <span className="spacer" />
          {tender.url && (
            <a className="link-ext" href={tender.url} target="_blank" rel="noreferrer">
              TED <Icon name="external" size={13} />
            </a>
          )}
          <Link to={`/tenders/${tender.id}`} className="btn ghost small">
            Competitor brief →
          </Link>
        </div>
      </div>
    </li>
  );
}

type DeadlineSort = 'deadline_desc' | 'deadline_asc';

function AllTenders() {
  const [q, setQ] = useState('');
  const [openOnly, setOpenOnly] = useState(true);
  const [itOnly, setItOnly] = useState(true);
  const [deadlineSort, setDeadlineSort] = useState<DeadlineSort>('deadline_desc');
  const query = useDebounced(q.trim(), 300);
  const { data, loading, error } = useApi(
    () => api.tenders({ q: query, open: openOnly, cpv: itOnly ? '72,48' : undefined, sort: openOnly ? deadlineSort : undefined, limit: 50 }),
    [query, openOnly, itOnly, deadlineSort],
  );

  return (
    <>
      <div className="toolbar">
        <label className="search">
          <Icon name="search" size={16} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search in French, e.g. « site internet accessibilité »" />
        </label>
        <div className="toggles">
          <label className="toggle">
            <input type="checkbox" checked={openOnly} onChange={(e) => setOpenOnly(e.target.checked)} /> Open only
          </label>
          <label className="toggle">
            <input type="checkbox" checked={itOnly} onChange={(e) => setItOnly(e.target.checked)} /> IT services (CPV 72/48)
          </label>
        </div>
        {openOnly && (
          <div className="segmented" role="group" aria-label="Deadline sort">
            <button className={deadlineSort === 'deadline_desc' ? 'active' : ''} onClick={() => setDeadlineSort('deadline_desc')}>
              Most time left
            </button>
            <button className={deadlineSort === 'deadline_asc' ? 'active' : ''} onClick={() => setDeadlineSort('deadline_asc')}>
              Closing soon
            </button>
          </div>
        )}
      </div>

      {data && (
        <p className="muted small">
          {data.total.toLocaleString('en-GB')} notice{data.total === 1 ? '' : 's'}
          {data.total > data.tenders.length && `, showing the first ${data.tenders.length}`}
          {loading && ' · updating…'}
        </p>
      )}
      {loading && !data && <Loading label="Searching TED notices…" />}
      {error && <ErrorState message={error} />}
      {data && data.tenders.length === 0 && <Empty>No tenders found. Try fewer words or turn off a filter.</Empty>}

      <ul className="tender-list">
        {data?.tenders.map((t) => <TenderRow key={t.id} tender={t} />)}
      </ul>
    </>
  );
}

function TenderRow({ tender }: { tender: Tender }) {
  const isAward = tender.noticeType.startsWith('can');
  return (
    <li className="card tender-card compact">
      <div className="tender-body">
        <div className="tender-meta">
          <span className="buyer"><Icon name="building" size={14} /> {tender.buyerName ?? 'Unknown buyer'}</span>
          <span className="dot">·</span>
          <span className="mono">{tender.publicationNumber}</span>
          <span className="dot">·</span>
          <span>Published {formatDate(tender.publicationDate)}</span>
        </div>
        <Link to={`/tenders/${tender.id}`} className="tender-title" lang="fr">
          {tender.title}
        </Link>
        <div className="tender-foot">
          {isAward ? (
            <span className="chip award">
              <Icon name="trophy" size={13} /> Awarded{tender.awardCount ? ` · ${tender.awardCount} winner${tender.awardCount > 1 ? 's' : ''}` : ''}
            </span>
          ) : (
            <DeadlineChip deadline={tender.deadline} />
          )}
          <ReadTimeChip chars={tenderTextLength(tender.title, tender.description)} />
          {tender.estimatedValue != null && <span className="chip value">{formatEur(tender.estimatedValue)}</span>}
          <span className="spacer" />
          {tender.url && (
            <a className="link-ext" href={tender.url} target="_blank" rel="noreferrer">
              TED <Icon name="external" size={13} />
            </a>
          )}
          <Link to={`/tenders/${tender.id}`} className="btn ghost small">
            {isAward ? 'Details →' : 'Competitor brief →'}
          </Link>
        </div>
      </div>
    </li>
  );
}
