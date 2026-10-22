import { FormEvent, ReactNode, useState } from 'react';
import { signIn, signOut, signUp, useSession } from './auth';

export function Login() {
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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
      <form className="auth-card" onSubmit={submit}>
        <h1>{isSignUp ? 'Create your account' : 'Sign in'}</h1>
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
            autoFocus
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

/** Shows the login page until there is a session, then renders children. */
export function AuthGate({ children }: { children: ReactNode }) {
  const { data, isPending } = useSession();
  if (isPending) return <p className="empty">Loading…</p>;
  if (!data) return <Login />;
  return <>{children}</>;
}

/** Small fixed control showing the signed-in email and a sign-out link. */
export function SignOutButton() {
  const { data } = useSession();
  if (!data) return null;
  return (
    <div className="signout">
      <span>{data.user.email}</span>
      <button type="button" className="link" onClick={() => signOut()}>
        Sign out
      </button>
    </div>
  );
}
