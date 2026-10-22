import { createAuthClient } from 'better-auth/react';

// Same-origin: Vite proxies /api to the server in dev; the server serves the
// built app in production.
export const authClient = createAuthClient({ baseURL: window.location.origin });

export const { useSession, signIn, signUp, signOut } = authClient;
