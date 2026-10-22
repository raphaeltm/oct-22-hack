# oct-22-hack

**An RFP research copilot.** It imports public tender (RFP) data and lets a company tell its agent about itself through chat. The agent then uses that profile to enrich the tenders and research the competitors the company is up against.

Built for the 2026-10-22 hackathon. The challenge is to build a product where agents depend on data to deliver value for a specific user. The research behind the idea is in [ideas.md](ideas.md).

## Working with agents

[AGENTS.md](AGENTS.md) is the canonical steering guide; [CLAUDE.md](CLAUDE.md) imports it.
Read the [issue-to-dev release workflow](docs/agent-workflow.md) before merging.
Agents must deploy merged main changes to the confirmed dev environment and verify
the release. See [steering evidence](docs/steering-notes.md) for decisions and sources.

## The product

**Who it's for:** small French/EU IT and AI consultancies (5–50 people) selling to the public sector. They miss relevant notices, spend days reading specifications, and struggle to judge which bids they could win. Starting with CPV division 72 (IT services) keeps the demo focused.

**First 10 users:** reach public-sector IT vendors through LinkedIn, France Digitale and local tech communities; offer a free weekly “tenders you're missing” digest.

**What it does:**

1. **Imports RFP data.** It loads tender notices, plus award data where available, from a public source into Postgres.
2. **Builds a company profile through chat.** The user tells the agent about the company: services, sectors, regions, size, past wins and differentiators. The agent stores this as long-term memory and refines it over time.
3. **Augments tenders.** The agent enriches the imported tenders with tags, summaries and a fit score against the company profile.
4. **Researches competitors.** For a tender or sector, the agent combines Keenable web search with award data to find likely competitors. It summarises their strengths, recent wins and positioning compared with the user's company, and saves the findings for reuse.

5. **Autopilot (issue #19).** When a new tender matches well (score ≥ 40, at least 7 days left), a BullMQ job builds a **pre-bid dossier** without being asked. It contains:
   - a verdict;
   - the calendar;
   - award criteria and weights from the eForms notice;
   - contract duration and framework;
   - requirements in the notice compared with the profile;
   - buyer history and bids received;
   - the last similar award;
   - likely bidders and the market value range;
   - an admin checklist;
   - draft questions for the buyer.

   The agent logs its predicted bidders. They are graded when the award notice with the same eForms `procedure-identifier` is imported. A **backtest** replays past tenders using only earlier awards and compares the result with a naive baseline. **Bid/skip/won/lost** feedback with a reason changes the ranking right away.

6. **Partner finder (groupements).** For an open tender, the agent lists the capabilities the notice asks for that the profile lacks (quoting the French passage). It then ranks firms to co-bid with, using:
   - TED awards that show those capabilities;
   - real **joint bids** read from the eForms tendering parties (lead + members, SIRET, city);
   - wins with the buyer, same region, and how much of their work overlaps the company's own (rivals rank lower).

   The user drafts a French invite with a private link and **sends it from their own mail client** (Radar never emails anyone). The partner answers on a public, token-scoped page (`/p/:token`). The answer is scored 0–100: interest, coverage of the need, references matched against the firm's TED awards, SIRET checksum/match, speed and completeness. A partner who answers can open their own Radar with a pre-filled profile (`/join/:token`). Each invite is an acquisition channel, and response rates feed back into the ranking.

**Target demo flow:** onboard a company in chat → see matching tenders → pick one → get a competitor brief.

## Data and demo scope

Start with TED notices for **France (`buyer-country=FRA`), CPV 72*, published from 2025 onward**. Tender text is in French. Past award winners provide the starting set of competitors; Keenable search + Claude enrich their profiles. A past win is evidence of relevant experience, not proof that a company will bid on a new tender.

| Source | Role | Scope |
| --- | --- | --- |
| TED Search API v3 | Import tender notices and contract awards | Primary source for the MVP |
| TED bulk XML | Backfill history or prepare a reproducible demo dataset | Fallback if live imports are unreliable |
| TED Open Data Service (SPARQL) | Cross-notice analysis of winners and prices | Future exploration |
| BOAMP / DECP | Add French national notices and awarded contracts | Future expansion; integration still needs verification |

**Demo company:** *Rivage Numérique*, a fictional Lyon digital consultancy specialising in RGAA accessibility, DSFR, sovereign cloud and collectivités.

**Demo story:** describe Rivage Numérique in chat → inspect matching French IT tenders and the reasons for each match → select one → review past award winners and a sourced competitor brief. Compare the time needed to qualify a tender manually with the assisted workflow. Any counts, fit scores or time savings shown must come from the actual demo run.

**Later radar features:** scheduled monitoring, document qualification, first-pass response drafting, and bid / skip / won / lost feedback. The hackathon focuses on one research workflow end to end.

## Stack

The scope is deliberately small so it can ship in about 5 hours.

| Layer | Choice |
| --- | --- |
| Agent | [Mastra](https://mastra.ai) + Claude (Anthropic API) |
| Web search | Keenable API |
| Data | **Postgres for everything**: tenders, company profiles, agent memory, competitor research, and pgvector if we need embeddings |
| Realtime / cache | Redis Streams for chat and job events over SSE; BullMQ for TED import and competitor research jobs |
| API | Hono (`server/`) |
| UI | Vite + React chat (`web/`) |
| Infra | Docker Compose, both locally and for deploys |

**Current deployment:** Docker Compose with Postgres and Redis. OpenSearch, ClickHouse, Kafka and managed Aiven services are outside the current implementation; moving services to Aiven remains a deployment option. Postgres provides tender search and stores the research data for this build.

```
server/   Hono API + Mastra agent (src/mastra)
web/      Vite + React chat UI
```

## Local dev

```sh
npm install
npm run db:up            # local Postgres + Redis via docker-compose.dev.yml
cp .env.example .env     # set ANTHROPIC_API_KEY
export $(cat .env | xargs) && npm run dev
```

The web app runs on http://localhost:5173 and proxies `/api` to the server on :3000.
Without `ANTHROPIC_API_KEY`, the chat endpoint returns a stub reply.

## Auth

Email/password login via **BetterAuth** (`server/src/auth.ts`), mounted at `/api/auth/*`. Its tables
(`user`, `session`, `account`, `verification`) live in the same Postgres and are migrated on server start.
Env: `BETTER_AUTH_SECRET` (set a long random value in prod) and `BETTER_AUTH_URL` (public base URL, default `http://localhost:3000`).
Every `/api/*` route except `/api/health` and `/api/auth/*` requires a session cookie (401 otherwise);
handlers read the user with `c.get('user')`. Mastra memory uses the user id as `resourceId`.

## MCP server (Claude, ChatGPT)

`POST /mcp` is a remote MCP server (Streamable HTTP, stateless; `server/src/mcp.ts`). Add `<BETTER_AUTH_URL>/mcp`
as a custom connector in Claude or ChatGPT (developer mode). It exposes every agent tool (`searchTenders`, `matchTenders`,
`findCompetitors`, `updateCompanyProfile`, ...) plus `askCopilot`, which runs the full copilot agent on a thread that also
shows up in the web app. Access is full (read and write) for the signed-in user.

Auth is OAuth 2.1 from BetterAuth's `@better-auth/oauth-provider` plugin: clients discover it via
`/.well-known/oauth-protected-resource/mcp` → `/.well-known/oauth-authorization-server/api/auth`, register themselves
(dynamic client registration at `/api/auth/oauth2/register`), and send the user through `/login` and `/oauth/consent`
with PKCE (S256). `/mcp` accepts only JWT access tokens issued for the `<BETTER_AUTH_URL>/mcp` resource (verified against
the local JWKS); tools run as the token's `sub`. `BETTER_AUTH_URL` must be the public URL, because it is the issuer and the
resource identifier. Extra tables (`jwks`, `oauthClient`, `oauthAccessToken`, `oauthConsent`, ...) are created by the
BetterAuth migrator on startup.

## Demo data

`npm run seed:demo` runs migrations, creates the demo user and seeds the fictional **Rivage Numérique** company profile (idempotent, so it's safe to rerun).
Log in with **`demo@rivage-numerique.fr` / `rivage-demo-2026`** (override with `DEMO_EMAIL` / `DEMO_PASSWORD`).
The demo script and pitch notes are in [docs/demo.md](docs/demo.md).

## Agent tools

The agent's tools live in `server/src/mastra/tools/*.ts`. Each file exports a group (e.g. `companyTools`), and `tools/index.ts` spreads every group into the agent.
Tools get the current user with `getUserId(requestContext)` from `server/src/mastra/context.ts`. `runAgent` passes `requestContext: userRequestContext(userId)` to `agent.stream`.

## API

What exists today:

- `GET  /api/health` (public)
- `POST /api/auth/sign-up/email` `{ name, email, password }`, `POST /api/auth/sign-in/email`, `POST /api/auth/sign-out`
- `GET /api/me` → `{ user, company }` (company from `companies.user_id`, or `null`)
- `POST /api/chat` `{ threadId, message, messageId? }` → `202 { runId }`. The output arrives on the event stream.
- `GET  /api/threads/:threadId/messages` returns the persisted history (Postgres via Mastra memory).
- `GET  /api/threads/:threadId/events` is an SSE feed of the thread's Redis Stream (`thread:<id>:events`).
  Events: `user.message`, `run.started`, `text.delta`, `run.finished`, `run.error`.
  It resumes via `Last-Event-ID` or `?since=<stream id>`; `0` replays everything still retained.

- `GET  /api/tenders/:id/partners` → gaps, covered capabilities and ranked partners (with TED evidence and joint bids)
- `GET  /api/partners/invites?tenderId=`, `POST /api/partners/invites` `{ tenderId, organisationId?, partnerName?, contactEmail?, role, need }`,
  `POST /api/partners/invites/:id/sent`, `DELETE /api/partners/invites/:id` (unanswered only), `POST /api/partners/claim` `{ token }`
- `GET  /api/public/invites/:token`, `POST /api/public/invites/:token/response` (no session: token-scoped, write-once, size- and per-IP rate-limited)

- `POST /api/jobs/ted-import` `{ since?, limit? }` → `202 { jobId }`; queues a TED import (also runs every 6h)
- `POST /api/competitors/:id/research` `{ force? }` → `202 { jobId }`; queues Keenable web research on an organisation
  (searches FR + EN, Claude summary into `organisations.summary`, sources in `research_notes`; skipped if researched < 7 days ago)
- `GET  /api/jobs/events` — SSE of the `jobs:events` Redis Stream. Events `job.queued | job.active | job.progress | job.completed | job.failed`,
  each `{ type, queue, jobId, name, at, ... }`; `job.progress` carries `progress: { current, total, message }`. Same resume semantics as thread events.

## Background jobs

After each TED import, the `ted-import` job also reads the XML of new award notices that report a joint bid (`npm run import:ted-parties -w server -- --limit 50` does it by hand); TED's search API flattens tendering parties, so their structure comes from the notice XML.
BullMQ queues `ted-import` and `research` on `REDIS_URL` (keys prefixed `rfp:`, override with `QUEUE_PREFIX`), processed by in-process workers
(`server/src/jobs/`). Set `WORKER=0` to run an API-only process, `TED_IMPORT_SCHEDULE=0` to disable the 6-hourly import.
Web research uses [Keenable](https://docs.keenable.ai/api-reference/search): with `KEENABLE_API_KEY` it calls `/v1/search`,
otherwise the rate-limited keyless `/v1/search/public` (set `KEENABLE_KEYLESS=0` to disable). Without `ANTHROPIC_API_KEY`
raw snippets are stored as notes with no summary.

## Roadmap (hackathon)

The product flow above is the target; unchecked items below are still planned.

- [x] Skeleton: Mastra agent + Postgres memory, Hono API, React chat UI
- [x] BetterAuth email/password login and session-protected API
- [x] Redis Streams event log with SSE realtime updates
- [x] Drizzle schema and migrations: tenders, companies, organisations, awards, research notes and tender matches
- [x] RFP importer: load a sample dataset from one public source into `tenders`
- [x] Agent tool: save and update the company profile from chat
- [x] Agent tool: search and filter imported tenders, and match them to the profile
- [x] Background jobs: Keenable competitor research, with results saved to Postgres
- [x] UI: tender list and competitor brief view alongside the chat
- [x] Demo script and a seeded demo company

## Demo checklist

- Show a specific customer and a complete profile → tender → competitor brief workflow.
- Show source evidence for matches and competitor claims.
- Measure a before/after result from the demo, such as qualification time or relevant tenders found.
- Explain the role of Postgres and Redis and the path to managed services.
- Explain how the weekly digest reaches the first 10 users.

## Deploy

`docker-compose.yml` defines the deployable stack (app + Postgres + Redis). Agents
deploy through SAM `build_and_publish` after merging to main, following the
[release runbook](docs/agent-workflow.md). Discover the user-confirmed dev target
with `list_deployment_environments`; historical deployments used `staging`, which
must not be assumed to mean dev. Missing access is a release blocker.
Config: `ANTHROPIC_API_KEY`, `POSTGRES_PASSWORD`, `BETTER_AUTH_SECRET` and `KEENABLE_API_KEY` are secrets; `MODEL` and `BETTER_AUTH_URL` are variables.

## Validation

Run `npm run check` to typecheck both workspaces and build the production frontend. `npm test` runs the server's logic tests (eForms party parsing, SIRET checks, tender gaps; no database needed). Docker strips development dependencies from its runtime image.
