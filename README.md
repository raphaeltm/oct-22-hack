# oct-22-hack

# oct-22-hack

## Idea: Procurement Radar for SMEs

Agents watch EU public tender feeds (TED) and national portals, match each notice against a company's capabilities and past bids, and draft a go/no-go brief plus a first-pass response.

See [ideas.md](ideas.md) for the wider RFP-space research and YC landscape.

### Target customer

**Small French/EU IT and AI consultancies (5-50 people) that sell to the public sector.**

- Filterable with one CPV division (72, IT services), so the scope stays tight for a one-day build.
- Their pain: they miss relevant notices, lose days reading long specs, and can't tell which bids they could win.
- Reachable: public-sector IT vendors are easy to find (LinkedIn, France Digitale, local tech communities), and our hackathon peers are the same profile.
- First 10 users: offer a free weekly "tenders you're missing" digest.
- Alternatives considered: small construction firms (CPV 45; high volume, less tech-savvy) and CSRD/environmental consultancies (hot market, thinner data).

### Datasets

| Source | Use | Notes |
| --- | --- | --- |
| **TED Search API v3** (`https://api.ted.europa.eu/v3/notices/search`) | Live and recent notices, EU-wide | Public, no API key or login. Filter by country, CPV, date. Returns buyer, deadline, estimated value, notice URL. Check TED's fair usage policy and rate limits. |
| **TED bulk XML download** | Backfill history into OpenSearch/ClickHouse | Lets the demo run without depending on live API calls. |
| **TED Open Data Service** (SPARQL, data.ted.europa.eu) | Cross-notice queries, e.g. who won what at what price | More powerful, steeper learning curve. Stretch goal. |
| **BOAMP / DECP** (France, via data.gouv.fr) | French national notices and awarded contracts | Adds Paris/France depth. API formats not yet verified, so check before relying on them. |

Fallback: Apify actors wrap the TED API with normalized fields, but a direct call is simple enough and gives us control.

### Agent pipeline

1. **Ingest agent**: polls TED for new CPV 72 notices. Valkey/Redis dedupes.
2. **Matching agent**: scores each tender against the company profile and past bids, and explains why.
3. **Qualification agent**: reads tender documents and flags deal-breakers (turnover thresholds, certifications, deadlines).
4. **Drafting agent**: produces a first-pass response outline grounded in past bids.
5. **Learning loop**: the user marks bid / skip / won / lost, and the matcher reweights. Past awards show who wins and at what price.

### Data layer (Aiven)

| Service | Role |
| --- | --- |
| PostgreSQL (+ pgvector) | Company profiles, bid history, feedback, embeddings, agent memory |
| OpenSearch | Full-text and semantic tender search |
| Valkey | Dedupe, alert queue, hot cache, event streams |
| ClickHouse | Analytics: win rates by buyer, price benchmarks, trends |

### Demo story

"Meet *Atelier Nova*, a 12-person Paris AI consultancy. Last month they found 3 relevant tenders by hand. The radar found 41, ranked them, and explained why 6 are a strong fit. After the user rated 10, match precision rose from X% to Y%." The before/after number shown live is the key moment.

### Judging checklist

- A customer we can name, not a vague sector.
- A visible before/after metric (time saved, tenders found, precision over runs).
- An architecture slide showing what each Aiven service does.
- One workflow end to end rather than five half-built ones.
- One sentence on where we find the first 10 users tomorrow.

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

### Auth

Email/password login via **BetterAuth** (`server/src/auth.ts`), mounted at `/api/auth/*`. Its tables
(`user`, `session`, `account`, `verification`) live in the same Postgres and are migrated on server start.
Env: `BETTER_AUTH_SECRET` (set a long random value in prod) and `BETTER_AUTH_URL` (public base URL, default `http://localhost:3000`).
Every `/api/*` route except `/api/health` and `/api/auth/*` requires a session cookie (401 otherwise);
handlers read the user with `c.get('user')`. Mastra memory uses the user id as `resourceId`.

### API

- `GET  /api/health` (public)
- `POST /api/auth/sign-up/email` `{ name, email, password }`, `POST /api/auth/sign-in/email`, `POST /api/auth/sign-out`
- `GET  /api/me` → `{ user, company }` (company from `companies.user_id`, or `null`)
- `POST /api/chat` `{ threadId, message, messageId? }` → `202 { runId }`; output arrives on the event stream
- `GET  /api/threads/:threadId/messages` — persisted history (Postgres via Mastra memory)
- `GET  /api/threads/:threadId/events` — SSE of the thread's Redis Stream (`thread:<id>:events`).
  Events: `user.message`, `run.started`, `text.delta`, `run.finished`, `run.error`.
  Resumes via `Last-Event-ID` or `?since=<stream id>` (`0` replays everything retained).

### Deploy

`docker-compose.yml` is the production stack (app + Postgres + Redis), deployed with SAM `build_and_publish` to the `staging` environment.
Config: `ANTHROPIC_API_KEY`, `POSTGRES_PASSWORD`, `BETTER_AUTH_SECRET` (secrets), `MODEL`, `BETTER_AUTH_URL` (variables).

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

### Auth

Email/password login via **BetterAuth** (`server/src/auth.ts`), mounted at `/api/auth/*`. Its tables
(`user`, `session`, `account`, `verification`) live in the same Postgres and are migrated on server start.
Env: `BETTER_AUTH_SECRET` (set a long random value in prod) and `BETTER_AUTH_URL` (public base URL, default `http://localhost:3000`).
Every `/api/*` route except `/api/health` and `/api/auth/*` requires a session cookie (401 otherwise);
handlers read the user with `c.get('user')`. Mastra memory uses the user id as `resourceId`.

### API

- `GET  /api/health` (public)
- `POST /api/auth/sign-up/email` `{ name, email, password }`, `POST /api/auth/sign-in/email`, `POST /api/auth/sign-out`
- `GET  /api/me` → `{ user, company }` (company from `companies.user_id`, or `null`)
- `POST /api/chat` `{ threadId, message, messageId? }` → `202 { runId }`; output arrives on the event stream
- `GET  /api/threads/:threadId/messages` — persisted history (Postgres via Mastra memory)
- `GET  /api/threads/:threadId/events` — SSE of the thread's Redis Stream (`thread:<id>:events`).
  Events: `user.message`, `run.started`, `text.delta`, `run.finished`, `run.error`.
  Resumes via `Last-Event-ID` or `?since=<stream id>` (`0` replays everything retained).

### Deploy

`docker-compose.yml` is the production stack (app + Postgres + Redis), deployed with SAM `build_and_publish` to the `staging` environment.
Config: `ANTHROPIC_API_KEY`, `POSTGRES_PASSWORD`, `BETTER_AUTH_SECRET` (secrets), `MODEL`, `BETTER_AUTH_URL` (variables).
