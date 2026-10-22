import { FormEvent, ReactNode, useState } from 'react';
import { Link, Navigate, useLocation, useSearchParams } from 'react-router';
import { signIn, signUp, useSession } from './auth';

// Public credentials for the seeded, fictional Rivage Numérique demo account
// (see README "Demo data"). Only works where SEED_DEMO=1 created the account.
const DEMO = { email: 'demo@rivage-numerique.fr', password: 'rivage-demo-2026' };

/** Only allow same-app redirects after login. */
function safeNext(next: string | null) {
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/partners';
}

export function Login({ demo = false, signUpFirst = false }: { demo?: boolean; signUpFirst?: boolean }) {
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>(signUpFirst ? 'sign-up' : 'sign-in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState(demo ? DEMO.email : '');
  const [password, setPassword] = useState(demo ? DEMO.password : '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isSignUp = mode === 'sign-up';

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = isSignUp
      ? await signUp.email({ name: name.trim() || email, email, password })
      : await signIn.email({ email, password });
    setBusy(false);
    if (error) setError(error.message ?? 'Something went wrong');
  }

  return (
    <div className="auth">
      <Link to="/" className="auth-brand" aria-label="Radar home">
        <span className="brand-icon">◈</span>
        <span className="brand-name">radar<span className="brand-dot">.</span></span>
      </Link>
      <form className="auth-card" onSubmit={submit}>
        <h1>{isSignUp ? 'Create your account' : 'Sign in'}</h1>
        {!isSignUp && (
          <button
            type="button"
            className="auth-demo"
            onClick={() => {
              setEmail(DEMO.email);
              setPassword(DEMO.password);
              setError(null);
            }}
          >
            <strong>Use the demo account</strong>
            <span>Rivage Numérique, a fictional Lyon digital agency</span>
          </button>
        )}
        {isSignUp && (
          <label>
            Name
            <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </label>
        )}
        <label>
          Email
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
            autoFocus={!demo}
          />
        </label>
        <label>
          Password
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={isSignUp ? 'new-password' : 'current-password'}
            minLength={8}
            required
          />
        </label>
        {error && <p className="auth-error">{error}</p>}
        <button type="submit" disabled={busy}>
          {busy ? '…' : isSignUp ? 'Sign up' : 'Sign in'}
        </button>
        <p className="auth-switch">
          {isSignUp ? 'Already have an account?' : 'New here?'}{' '}
          <button
            type="button"
            className="link"
            onClick={() => {
              setMode(isSignUp ? 'sign-in' : 'sign-up');
              setError(null);
            }}
          >
            {isSignUp ? 'Sign in' : 'Create an account'}
          </button>
        </p>
      </form>
    </div>
  );
}

/** /login: shows the form until there is a session, then goes to `?next=` (or the workspace). */
export function LoginPage() {
  const { data, isPending } = useSession();
  const [params] = useSearchParams();
  // An OAuth authorization (MCP client sign-in): the server redirects onwards
  // after sign-in, so always show the form instead of entering the workspace.
  if (params.has('sig')) return <Login />;
  if (isPending) return <p className="empty">Loading…</p>;
  if (data) return <Navigate to={safeNext(params.get('next'))} replace />;
  return <Login demo={params.get('demo') === '1'} signUpFirst={params.get('mode') === 'signup'} />;
}

/** Redirects to /login (remembering the current path) until there is a session. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { data, isPending } = useSession();
  const { pathname, search } = useLocation();
  if (isPending) return <p className="empty">Loading…</p>;
  if (!data) return <Navigate to={`/login?next=${encodeURIComponent(pathname + search)}`} replace />;
  return <>{children}</>;
}
