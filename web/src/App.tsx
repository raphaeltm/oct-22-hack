import { useCallback, useEffect, useRef, useState } from 'react';
import { Analyst } from './Analyst';
import { ago, api, money, shortDate, useEventStream, VERDICT_LABEL, type Match, type Stats } from './api';
import { CompanyPage, Onboarding } from './Company';
import { Radar } from './Radar';

type View = 'radar' | 'analyst' | 'company' | 'new';
type Health = Awaited<ReturnType<typeof api.health>>;

/** What Cachet runs on, live: judges and users can see the data layer working. */
function SystemStatus({ health }: { health: Health | null }) {
  const rows: [string, boolean | null, string?][] = [
    ['TED (EU tenders)', health?.ted ? health.ted.ok : null, health?.ted?.error ?? undefined],
    ['Aiven PostgreSQL', health ? health.db : null],
    ['Aiven Valkey', health ? health.redis : null],
    [health?.model?.startsWith('openai') ? 'Model' : 'Claude', health ? Boolean(health.model) : null, health?.model ?? 'no model key'],
  ];
  return (
    <ul className="status" aria-label="System status">
      {rows.map(([label, ok, why]) => (
        <li key={label} title={why}>
          <span className={`status-dot${ok == null ? '' : ok ? ' status-ok' : ' status-bad'}`} aria-hidden />
          {label}
          <span className="sr-only">{ok == null ? 'unknown' : ok ? 'working' : 'down'}</span>
        </li>
      ))}
    </ul>
  );
}
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

function storedCompany() {
  try {
    return localStorage.getItem('companyId');
  } catch {
    return null;
  }
}

export function App() {
  const [view, setView] = useState<View>(readView);
  const [companies, setCompanies] = useState<{ id: string; name: string }[] | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(storedCompany);
  const [matches, setMatches] = useState<Match[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [sweeping, setSweeping] = useState(false);
  const [landed, setLanded] = useState<Set<string>>(new Set());
  const [log, setLog] = useState<LogLine[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const modelReady = health ? Boolean(health.model) : true;
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

  const loadCompanies = useCallback(async () => {
    const { companies } = await api.companies();
    setCompanies(companies);
    setCompanyId((cur) => (cur && companies.some((c) => c.id === cur) ? cur : companies[0]?.id ?? null));
  }, []);

  useEffect(() => {
    void loadCompanies();
    const poll = () => api.health().then(setHealth).catch(() => setHealth(null));
    void poll();
    const t = setInterval(poll, 30_000);
    return () => clearInterval(t);
  }, [loadCompanies]);

  useEffect(() => {
    if (!companyId) return;
    try {
      localStorage.setItem('companyId', companyId);
    } catch {}
  }, [companyId]);

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

  if (companies && !companies.length && view !== 'new') {
    return (
      <div className="solo">
        <Onboarding onCreated={(id) => void loadCompanies().then(() => (setCompanyId(id), go('radar')))} />
      </div>
    );
  }

  const name = companies?.find((c) => c.id === companyId)?.name ?? '';
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
            <span className="brand-name">Cachet</span>
            <span className="brand-sub">EU tenders, stamped for you</span>
          </span>
        </div>

        <label className="firm">
          <span className="firm-label">Watching for</span>
          <select
            value={companyId ?? ''}
            onChange={(e) => (e.target.value === '__new' ? go('new') : setCompanyId(e.target.value))}
            aria-label="Firm"
          >
            {companies?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
            <option value="__new">+ Add a firm…</option>
          </select>
        </label>

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

        <SystemStatus health={health} />
      </aside>

      <main className="main">
        {!modelReady && <p className="banner">No model key is configured, so tenders get a quick keyword score only and the analyst is offline.</p>}
        {view === 'new' ? (
          <Onboarding
            onCreated={(id) => void loadCompanies().then(() => (setCompanyId(id), go('radar')))}
            onCancel={() => go('radar')}
          />
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
                  <dt>Your calls</dt>
                  <dd>
                    {stats.decided}
                    {stats.rescored > 0 && <span className="ledger-sub">{stats.rescored} re-scored by them</span>}
                  </dd>
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
