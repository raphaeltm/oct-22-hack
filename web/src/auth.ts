import { oauthProviderClient } from '@better-auth/oauth-provider/client';
import { createAuthClient } from 'better-auth/react';

// Same-origin: Vite proxies /api to the server in dev; the server serves the
// built app in production. oauthProviderClient forwards the signed OAuth query
// on sign-in so MCP clients (Claude, ChatGPT) resume their authorization flow.
export const authClient = createAuthClient({ baseURL: window.location.origin, plugins: [oauthProviderClient()] });

export const { useSession, signIn, signUp, signOut } = authClient;
