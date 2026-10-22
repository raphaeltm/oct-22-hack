import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useSearchParams } from 'react-router';
import { authClient, signOut, useSession } from './auth';

const SCOPE_LABELS: Record<string, string> = {
  openid: 'Confirm your identity',
  profile: 'See your name',
  email: 'See your email address',
  offline_access: 'Stay connected without asking again',
};

/**
 * /oauth/consent: an MCP client (Claude, ChatGPT, ...) asks for access to the
 * user's Radar account. The server signs the query; we only accept or deny.
 */
export function ConsentPage() {
  const { data, isPending } = useSession();
  const [params] = useSearchParams();
  const { pathname, search } = useLocation();
  const clientId = params.get('client_id') ?? '';
  const scopes = (params.get('scope') ?? '').split(' ').filter(Boolean);
  const [clientName, setClientName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!data || !clientId) return;
    authClient.oauth2
      .publicClient({ query: { client_id: clientId } })
      .then(({ data: client }) => setClientName(client?.client_name ?? null))
      .catch(() => {});
  }, [data, clientId]);

  if (isPending) return <p className="empty">Loading…</p>;
  if (!data) return <Navigate to={`/login?next=${encodeURIComponent(pathname + search)}`} replace />;
  if (!params.has('sig')) {
    return (
      <div className="auth">
        <div className="auth-card">
          <h1>Nothing to approve</h1>
          <p className="auth-switch">This page is opened by an app asking to connect to Radar.</p>
          <Link to="/tenders">Go to your workspace</Link>
        </div>
      </div>
    );
  }

  async function decide(accept: boolean) {
    setBusy(true);
    setError(null);
    // On success the client follows the returned redirect back to the app.
    const { error } = await authClient.oauth2.consent({ accept });
    if (error) {
      setBusy(false);
      setError(error.message ?? 'Something went wrong');
    }
  }

  const name = clientName || 'An application';
  return (
    <div className="auth">
      <Link to="/" className="auth-brand" aria-label="Radar home">
        <span className="brand-icon">◈</span>
        <span className="brand-name">radar<span className="brand-dot">.</span></span>
      </Link>
      <div className="auth-card">
        <h1>Connect {name}?</h1>
        <p className="consent-lead">
          <strong>{name}</strong> wants to use Radar as <strong>{data.user.email}</strong>. It will get full access to
          your Radar account: your company profile, tender matches, competitor research and copilot chats.
        </p>
        {scopes.length > 0 && (
          <ul className="consent-scopes">
            {scopes.map((s) => (
              <li key={s}>{SCOPE_LABELS[s] ?? s}</li>
            ))}
          </ul>
        )}
        <p className="consent-note">Only approve apps you started connecting yourself (e.g. Claude or ChatGPT).</p>
        {error && <p className="auth-error">{error}</p>}
        <div className="consent-actions">
          <button type="button" className="consent-deny" disabled={busy} onClick={() => decide(false)}>
            Deny
          </button>
          <button type="button" className="consent-allow" disabled={busy} onClick={() => decide(true)} autoFocus>
            {busy ? '…' : 'Allow'}
          </button>
        </div>
        <p className="auth-switch">
          Not {data.user.email}?{' '}
          <button
            type="button"
            className="link"
            onClick={() =>
              signOut().then(() => {
                window.location.href = `/login${search}`;
              })
            }
          >
            Use another account
          </button>
        </p>
      </div>
    </div>
  );
}
