import { DependencyList, ReactNode, useCallback, useEffect, useState } from 'react';
import type { Result } from '../api';
import { useChat } from './ChatContext';

// ---------- formatting ----------

const eur0 = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });

export function formatEur(value: number | null | undefined, compact = false) {
  if (value == null || (compact && value === 0)) return '—';
  if (compact) {
    if (value >= 1_000_000) return `€${(value / 1_000_000).toFixed(value >= 10_000_000 ? 0 : 1)}M`;
    if (value >= 1_000) return `€${Math.round(value / 1_000)}k`;
  }
  return eur0.format(value);
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** Parses ISO strings and Postgres timestamps like "2026-10-22 10:00:00+00". */
export function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  let d = new Date(value);
  if (Number.isNaN(d.getTime())) {
    d = new Date(value.replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00'));
  }
  return Number.isNaN(d.getTime()) ? null : d;
}

export function formatDate(iso: string | null | undefined) {
  const d = parseDate(iso);
  return !d ? '—' : `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function daysUntil(iso: string | null | undefined) {
  const d = parseDate(iso);
  return d ? Math.ceil((d.getTime() - Date.now()) / 86_400_000) : null;
}

// ---------- data loading ----------

export function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function useApi<T>(load: () => Promise<Result<T>>, deps: DependencyList) {
  const [state, setState] = useState<{ data?: T; mock: boolean; error?: string; loading: boolean }>({
    mock: false,
    loading: true,
  });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const run = useCallback(load, deps);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: undefined }));
    run()
      .then((r) => alive && setState({ data: r.data, mock: r.mock, loading: false }))
      .catch((e) => alive && setState({ mock: false, loading: false, error: (e as Error).message }));
    return () => {
      alive = false;
    };
  }, [run, nonce]);

  return { ...state, reload: () => setNonce((n) => n + 1) };
}

// ---------- components ----------

export function PageHeader({ eyebrow, title, subtitle, actions, mock, stacked }: {
  eyebrow?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  actions?: ReactNode;
  mock?: boolean;
  /** Put actions under the title (for long titles on detail pages). */
  stacked?: boolean;
}) {
  return (
    <header className={`page-head ${stacked ? 'stacked' : ''}`}>
      <div className="page-head-text">
        {eyebrow && <div className="eyebrow">{eyebrow}</div>}
        <h1>{title}</h1>
        {subtitle && <p className="subtitle">{subtitle}</p>}
      </div>
      <div className="page-head-actions">
        {mock && <MockBadge />}
        {actions}
      </div>
    </header>
  );
}

export function MockBadge() {
  return (
    <span className="mock-badge" title="The API isn't available yet, so this page shows sample data.">
      Sample data
    </span>
  );
}

export function ScoreRing({ score, size = 44 }: { score: number; size?: number }) {
  const r = (size - 6) / 2;
  const c = 2 * Math.PI * r;
  const tone = score >= 80 ? 'high' : score >= 65 ? 'mid' : 'low';
  return (
    <div className={`score-ring ${tone}`} style={{ width: size, height: size }} title={`Match score ${score}/100`}>
      <svg width={size} height={size}>
        <circle cx={size / 2} cy={size / 2} r={r} className="track" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          className="value"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.min(score, 100) / 100)}
        />
      </svg>
      <span>{score}</span>
    </div>
  );
}

export function DeadlineChip({ deadline }: { deadline: string | null }) {
  const days = daysUntil(deadline);
  if (days == null) return <span className="chip">No deadline</span>;
  if (days < 0) return <span className="chip muted">Closed</span>;
  const tone = days <= 10 ? 'urgent' : days <= 21 ? 'soon' : '';
  return (
    <span className={`chip ${tone}`} title={formatDate(deadline)}>
      <Icon name="clock" size={13} /> {days === 0 ? 'Due today' : `${days} day${days === 1 ? '' : 's'} left`}
    </span>
  );
}

export function AskButton({ prompt, label = 'Ask the agent', variant = 'primary' }: {
  prompt: string;
  label?: string;
  variant?: 'primary' | 'secondary';
}) {
  const { send, busy } = useChat();
  return (
    <button className={`btn ${variant}`} onClick={() => send(prompt)} disabled={busy}>
      <Icon name="spark" size={15} /> {label}
    </button>
  );
}

export function Loading({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="state">
      <div className="spinner" /> {label}
    </div>
  );
}

export function ErrorState({ message }: { message: string }) {
  return <div className="state error">{message}</div>;
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="state">{children}</div>;
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}

export function Initials({ name, size = 36 }: { name: string; size?: number }) {
  const letters = name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('');
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) % 360;
  return (
    <span
      className="initials"
      style={{ width: size, height: size, fontSize: size * 0.38, background: `hsl(${hash} 45% 92%)`, color: `hsl(${hash} 45% 30%)` }}
    >
      {letters}
    </span>
  );
}

const paths: Record<string, ReactNode> = {
  tenders: <><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" /><path d="M14 3v5h5M9 13h6M9 17h4" /></>,
  competitors: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5" /></>,
  company: <><path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16" /><path d="M16 9h2a2 2 0 0 1 2 2v10M2 21h20M8 7h4M8 11h4M8 15h4" /></>,
  spark: <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" />,
  send: <path d="M4 12l16-8-6 16-2.5-6.5z" />,
  plus: <path d="M12 5v14M5 12h14" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  external: <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />,
  back: <path d="M15 18l-6-6 6-6" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></>,
  chat: <path d="M4 5h16v11H9l-5 4z" />,
  building: <><path d="M3 21h18M5 21V8l7-5 7 5v13" /><path d="M9 21v-6h6v6" /></>,
  refresh: <path d="M20 11a8 8 0 0 0-14.9-3M4 4v4h4M4 13a8 8 0 0 0 14.9 3M20 20v-4h-4" />,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>,
  trophy: <path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H4a3 3 0 0 0 4 4M16 6h4a3 3 0 0 1-4 4M12 13v4M8 20h8M10 17h4" />,
};

export function Icon({ name, size = 18 }: { name: keyof typeof paths | string; size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {paths[name]}
    </svg>
  );
}
