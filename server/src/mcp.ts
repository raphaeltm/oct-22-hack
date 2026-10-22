// Remote MCP server (Streamable HTTP) so Claude, ChatGPT and other MCP clients
// can use the copilot. Auth is OAuth 2.1 via BetterAuth's oauth-provider plugin
// (dynamic client registration + PKCE); /mcp only accepts its JWT access
// tokens, and every tool runs as the token's user.
import { oauthProviderAuthServerMetadata, oauthProviderOpenIdConfigMetadata } from '@better-auth/oauth-provider';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { Hono } from 'hono';
import { createLocalJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { z } from 'zod';
import { auth, baseURL, mcpResource } from './auth';
import { mastra, memory } from './mastra';
import { userRequestContext } from './mastra/context';
import { tools } from './mastra/tools';

const hasModelKey = Boolean(process.env.ANTHROPIC_API_KEY);
const issuer = `${baseURL}/api/auth`;
const resourceMetadataUrl = `${baseURL}/.well-known/oauth-protected-resource/mcp`;

const protectedResourceMetadata = {
  resource: mcpResource,
  authorization_servers: [issuer],
  scopes_supported: ['openid', 'profile', 'email', 'offline_access'],
  bearer_methods_supported: ['header'],
  resource_name: 'Procurement Radar',
  resource_documentation: baseURL,
};

/** Verifies a Bearer JWT against our own JWKS; returns null if invalid. */
async function verifyToken(header: string | undefined): Promise<JWTPayload | null> {
  const token = header?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) return null;
  try {
    const jwks = createLocalJWKSet(await auth.api.getJwks());
    const { payload } = await jwtVerify(token, jwks, { issuer, audience: [mcpResource, baseURL] });
    return typeof payload.sub === 'string' && payload.sub ? payload : null;
  } catch {
    return null;
  }
}

function unauthorized(error?: string) {
  const params = [`resource_metadata="${resourceMetadataUrl}"`];
  if (error) params.push(`error="${error}"`, 'error_description="Invalid or expired access token"');
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: { 'Content-Type': 'application/json', 'WWW-Authenticate': `Bearer ${params.join(', ')}` },
  });
}

function asResult(value: unknown) {
  const isError = !!value && typeof value === 'object' && 'error' in value;
  return { content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }], isError };
}

/** A fresh MCP server per request (stateless), with the user's tools bound. */
function buildServer(userId: string) {
  const server = new McpServer(
    { name: 'procurement-radar', title: 'Procurement Radar', version: '1.0.0' },
    {
      instructions:
        'RFP research copilot for French public IT tenders (TED, CPV 72*). Tender text is French. ' +
        'Use matchTenders for what to bid on, findCompetitors for past winners, and ask for a sourced brief. ' +
        'Past winners are evidence, not proof of future bidders; fit scores are heuristics. Cite TED URLs.',
    },
  );

  // Every agent tool, executed as the authenticated user.
  for (const tool of Object.values(tools)) {
    const t = tool as unknown as {
      id: string;
      description: string;
      inputSchema?: z.ZodObject;
      execute: (input: unknown, ctx: unknown) => Promise<unknown>;
    };
    server.registerTool(
      t.id,
      { description: t.description, inputSchema: t.inputSchema ?? z.object({}) },
      async (input: unknown) => {
        try {
          return asResult(await t.execute(input ?? {}, { requestContext: userRequestContext(userId) }));
        } catch (err) {
          console.error(`mcp tool ${t.id} failed`, err);
          return asResult({ error: (err as Error).message });
        }
      },
    );
  }

  // The full copilot (same agent, memory and profile as the web chat).
  server.registerTool(
    'askCopilot',
    {
      description:
        "Ask the Procurement Radar copilot agent (the same one as the web app's chat) a question. It knows the user's company " +
        'profile and uses all the tools above to answer: tender matches, competitor briefs, onboarding. Pass threadId from a ' +
        'previous answer to continue that conversation; omit it to start a new one (it appears in the web app too).',
      inputSchema: z.object({ message: z.string().min(1), threadId: z.string().optional() }),
    },
    async ({ message, threadId }) => {
      if (!hasModelKey) return asResult({ error: 'No ANTHROPIC_API_KEY configured on the server.' });
      const id = threadId || crypto.randomUUID();
      const thread = await memory.getThreadById({ threadId: id });
      if (thread && thread.resourceId !== userId) return asResult({ error: 'Forbidden: thread belongs to another user.' });
      if (!thread) await memory.createThread({ threadId: id, resourceId: userId, title: message.slice(0, 80) });
      try {
        const result = await mastra.getAgent('assistant').generate(message, {
          memory: { thread: id, resource: userId },
          requestContext: userRequestContext(userId),
        });
        return { content: [{ type: 'text' as const, text: `${result.text}\n\n(threadId: ${id})` }] };
      } catch (err) {
        console.error('mcp askCopilot failed', err);
        return asResult({ error: (err as Error).message, threadId: id });
      }
    },
  );

  return server;
}

export const mcpRoutes = new Hono();

// OAuth discovery. The issuer is <base>/api/auth, so serve RFC 8414 path-insertion
// variants as well as root and issuer-relative paths that clients probe.
const authServerMetadata = oauthProviderAuthServerMetadata(auth);
const openIdMetadata = oauthProviderOpenIdConfigMetadata(auth);
for (const path of ['/.well-known/oauth-authorization-server', '/.well-known/oauth-authorization-server/api/auth']) {
  mcpRoutes.get(path, (c) => authServerMetadata(c.req.raw));
}
for (const path of [
  '/.well-known/openid-configuration',
  '/.well-known/openid-configuration/api/auth',
  '/api/auth/.well-known/openid-configuration',
]) {
  mcpRoutes.get(path, (c) => openIdMetadata(c.req.raw));
}
for (const path of ['/.well-known/oauth-protected-resource', '/.well-known/oauth-protected-resource/mcp']) {
  mcpRoutes.get(path, (c) => c.json(protectedResourceMetadata, 200, { 'Access-Control-Allow-Origin': '*' }));
}

mcpRoutes.all('/mcp', async (c) => {
  if (c.req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID',
        'Access-Control-Expose-Headers': 'WWW-Authenticate, Mcp-Session-Id',
      },
    });
  }
  const header = c.req.header('Authorization');
  const payload = await verifyToken(header);
  if (!payload) return unauthorized(header ? 'invalid_token' : undefined);

  // Stateless: no sessions, so no standalone GET stream or DELETE.
  if (c.req.method !== 'POST') {
    return c.json({ jsonrpc: '2.0', error: { code: -32000, message: 'Method not allowed' }, id: null }, 405, {
      Allow: 'POST',
    });
  }
  const server = buildServer(payload.sub!);
  // Responses stream as SSE (with keep-alives) so long askCopilot runs survive proxies.
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);
  return transport.handleRequest(c.req.raw);
});
