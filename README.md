# oct-22-hack

Idea 1:
Agents watch EU public tender feeds (TED) and national portals, match them against a company’s past bids and capabilities, and draft the first-pass response. Data: OpenSearch for tender search, PostgreSQL for company profiles, Valkey for dedupe/alerts. Customer: small consultancies and construction firms that lose out because they can’t monitor hundreds of notices. First users: easy to find; they’re all listed publicly.

## App skeleton

Skeleton agent app: **Mastra** agent with **Postgres**-backed memory, a **Hono** API, **Redis** Streams for realtime events, and a **Vite/React** chat UI.

```
server/   Hono API + Mastra agent (src/mastra)
web/      Vite + React chat UI
```

### Local dev

```sh
npm install
npm run db:up            # local Postgres + Redis via docker-compose.dev.yml
cp .env.example .env     # set ANTHROPIC_API_KEY
export $(cat .env | xargs) && npm run dev
```

Web runs on http://localhost:5173 and proxies `/api` to the server on :3000.
Without `ANTHROPIC_API_KEY` the chat endpoint returns a stub reply.

### API

- `GET  /api/health`
- `POST /api/chat` `{ threadId, message, messageId? }` → `202 { runId }`; output arrives on the event stream
- `GET  /api/threads/:threadId/messages` — persisted history (Postgres via Mastra memory)
- `GET  /api/threads/:threadId/events` — SSE of the thread's Redis Stream (`thread:<id>:events`).
  Events: `user.message`, `run.started`, `text.delta`, `run.finished`, `run.error`.
  Resumes via `Last-Event-ID` or `?since=<stream id>` (`0` replays everything retained).

### Deploy

`docker-compose.yml` is the production stack (app + Postgres + Redis), deployed with SAM `build_and_publish` to the `staging` environment.
Config: `ANTHROPIC_API_KEY`, `POSTGRES_PASSWORD` (secrets), `MODEL` (variable).
