import { useCallback, useEffect, useRef, useState } from 'react';
import { Analyst } from './Analyst';
import { ago, api, money, shortDate, useEventStream, VERDICT_LABEL, type Match, type Stats } from './api';
import { CompanyPage, Onboarding } from './Company';
import { SignOutButton } from './Login';
import { Radar } from './Radar';

type View = 'radar' | 'analyst' | 'company' | 'new';
type LogLine = { id: number; at: Date; text: string; tone?: 'go' | 'maybe' | 'no' | 'error' | 'learn' };

const VIEWS: { key: Exclude<View, 'new'>; label: string }[] = [
  { key: 'radar', label: 'Radar' },
  { key: 'analyst', label: 'Analyst' },
  { key: 'company', label: 'Your firm' },
];

function readView(): View {
  const v = location.hash.replace('#', '');
  return v === 'analyst' || v === 'company' || v === 'new' ? v : 'radar';
}

export function App() {
  const [view, setView] = useState<View>(readView);
  // One company per signed-in user (null until loaded, undefined = none yet).
  const [company, setCompany] = useState<{ id: string; name: string } | null | undefined>(undefined);
  const companyId = company?.id ?? null;
  const [matches, setMatches] = useState<Match[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [sweeping, setSweeping] = useState(false);
  const [landed, setLanded] = useState<Set<string>>(new Set());
  const [log, setLog] = useState<LogLine[]>([]);
  const [modelReady, setModelReady] = useState(true);
  const logId = useRef(0);

  useEffect(() => {
    const onHash = () => setView(readView());
    addEventListener('hashchange', onHash);
    return () => removeEventListener('hashchange', onHash);
  }, []);
  const go = (v: View) => {
    location.hash = v;
    setView(v);
  };

  const loadCompany = useCallback(async () => {
    const { company } = await api.me();
    setCompany(company ? { id: company.id, name: company.name } : null);
  }, []);

  useEffect(() => {
    void loadCompany();
    api.health().then((h) => setModelReady(Boolean(h.model))).catch(() => {});
  }, [loadCompany]);

  const refresh = useCallback(async () => {
    if (!companyId) return;
    const [m, s] = await Promise.all([api.matches(companyId), api.stats(companyId)]);
    setMatches(m.matches);
    setStats(s);
    setSweeping(Boolean(s.lastScan && !s.lastScan.finished_at));
  }, [companyId]);

  useEffect(() => {
    setMatches([]);
    setStats(null);
    setLog([]);
    void refresh();
  }, [refresh]);

  // Debounce list refreshes while a sweep streams in scores.
  const pending = useRef<number | undefined>(undefined);
  const soon = () => {
    clearTimeout(pending.current);
    pending.current = window.setTimeout(() => void refresh(), 600);
  };

  const push = (text: string, tone?: LogLine['tone']) =>
    setLog((l) => [{ id: ++logId.current, at: new Date(), text, tone }, ...l].slice(0, 40));

  useEventStream(companyId ? `/api/companies/${companyId}/feed` : null, {
    'scan.started': () => {
      setSweeping(true);
      push('Sweep started');
    },
    'scan.progress': (e) => push(e.message),
    'tender.scored': (e) => {
      setLanded((s) => new Set(s).add(e.tenderId));
      push(`${VERDICT_LABEL[e.verdict as 'go']} · ${e.score} · ${e.title}`, e.verdict);
      soon();
    },
    'scan.finished': (e) => {
      setSweeping(false);
      push(`Sweep done: ${e.fetched} open notices, ${e.fresh} new`);
      void refresh();
    },
    'scan.error': (e) => {
      setSweeping(false);
      push(`Couldn't reach TED: ${e.error}`, 'error');
      void refresh();
    },
    'rules.updated': () => {
      push('Learned from your decision; re-reading the shortlist', 'learn');
      soon();
    },
  });

  async function sweep() {
    if (!companyId) return;
    setSweeping(true);
    await api.scan(companyId);
  }

  if (company === undefined) return <p className="auth-loading">Loading…</p>;
  if (company === null) {
    return (
      <div className="solo">
        <Onboarding onCreated={() => void loadCompany().then(() => go('radar'))} />
      </div>
    );
  }

  const name = company.name;
  const lastScan = stats?.lastScan;
  const emptyHint = sweeping ? (
    <p>Reading TED for {name}…</p>
  ) : lastScan?.error ? (
    <>
      <p>
        <strong>Couldn't reach TED.</strong> {lastScan.error}
      </p>
      <p className="muted">The radar retries on its own every 30 minutes.</p>
      <button className="btn btn-ink" onClick={sweep}>
        Try again now
      </button>
    </>
  ) : (
    <>
      <p>No matching open tenders yet.</p>
      <button className="btn btn-ink" onClick={sweep}>
        Sweep TED now
      </button>
    </>
  );

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">
          <span className="brand-mark" aria-hidden />
          <span>
            <span className="brand-name">Procurement Radar</span>
            <span className="brand-sub">EU tenders, read for you</span>
          </span>
        </div>

        <div className="firm">
          <span className="firm-label">Watching for</span>
          <span className="firm-name">{name}</span>
          <SignOutButton />
        </div>

        <nav className="nav">
          {VIEWS.map((v) => (
            <button key={v.key} className={view === v.key ? 'nav-on' : ''} aria-current={view === v.key ? 'page' : undefined} onClick={() => go(v.key)}>
              {v.label}
              {v.key === 'radar' && stats ? <span className="nav-count">{stats.go}</span> : null}
            </button>
          ))}
        </nav>

        <section className="activity" aria-label="Live activity" aria-live="polite">
          <h2>
            <span className={`pulse${sweeping ? ' pulse-on' : ''}`} aria-hidden /> {sweeping ? 'Sweeping TED' : 'Watching TED'}
          </h2>
          <p className="activity-sub">Last sweep {ago(lastScan?.started_at)}</p>
          <ol>
            {log.map((l) => (
              <li key={l.id} className={l.tone ? `log-${l.tone}` : undefined}>
                <time>{l.at.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time>
                <span>{l.text}</span>
              </li>
            ))}
          </ol>
        </section>
      </aside>

      <main className="main">
        {!modelReady && <p className="banner">No model key is configured, so tenders get a quick keyword score only and the analyst is offline.</p>}
        {view === 'new' ? (
          <Onboarding onCreated={() => void loadCompany().then(() => go('radar'))} onCancel={() => go('radar')} />
        ) : !companyId ? null : (
          <>
            <header className="top">
              <div>
                <p className="eyebrow">{view === 'radar' ? 'Open EU tenders' : view === 'analyst' ? 'Bid analyst' : 'Profile and track record'}</p>
                <h1>{name}</h1>
              </div>
              {view === 'radar' && (
                <button className="btn btn-ink" onClick={sweep} disabled={sweeping}>
                  {sweeping ? 'Sweeping…' : 'Sweep now'}
                </button>
              )}
            </header>

            {view === 'radar' && stats && (
              <dl className="ledger">
                <div>
                  <dt>Notices read</dt>
                  <dd>{stats.scanned}</dd>
                </div>
                <div>
                  <dt>To bid</dt>
                  <dd className="ledger-go">{stats.go}</dd>
                </div>
                <div>
                  <dt>In play</dt>
                  <dd>{money(stats.pipeline)}</dd>
                </div>
                <div>
                  <dt>Next bid deadline</dt>
                  <dd>{shortDate(stats.next_deadline)}</dd>
                </div>
                <div>
                  <dt>Decisions taught</dt>
                  <dd>{stats.decided}</dd>
                </div>
              </dl>
            )}

            {view === 'radar' && <Radar companyId={companyId} matches={matches} landed={landed} onChanged={refresh} emptyHint={emptyHint} />}
            {view === 'analyst' && <Analyst companyId={companyId} />}
            {view === 'company' && <CompanyPage companyId={companyId} onSaved={refresh} />}
          </>
        )}
      </main>
    </div>
  );
}
