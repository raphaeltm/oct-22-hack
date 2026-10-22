# Steering design and evidence

Reviewed 2026-10-22. This is background for maintaining the instructions, not an
additional rules file to load for every task.

## Decisions recovered from conversations

- Original skeleton conversation (`07384b22-f343-4188-a94a-6a05ccc8d5b9`):
  Mastra/Postgres agent memory, Hono API, Vite/React chat, Docker Compose and SAM
  deployment. Redis was added for event streams/realtime.
- Product planning (`56a0da5c-365e-49b9-9418-25e37198ca26`): import RFP data,
  profile the company through chat, research past winners with Keenable + Claude;
  Postgres for everything, no ClickHouse/Kafka/Aiven migration for this build;
  BetterAuth login, Redis job queues. The later correction to **France** overrides
  the earlier Irish scope. The user also asked for actual browser user testing.
- Active SAM policy "Postgres only for data storage and analytics, never
  ClickHouse" also excludes OpenSearch, including when a proposed issue asks
  for it. Resolve such conflicts with the owner rather than adding infrastructure.
- Current conversation (`259b453d-7175-4491-ab62-8cc00e499b32`): `build-it` means
  implement → issue updates → PR → build → merge when ready; SAM child agents
  request exactly 0.3 vCPU / 1.5 GB; every ready PR merged to main must then be
  deployed to dev. The dev requirement supersedes the former "no deployment"
  wording in the build-it trigger/policy. No production authorization is implied.

## What the repository actually implements

At review, current main has BetterAuth-protected API routes, one company per user,
Mastra user-scoped memory/tools, a real TED importer, Postgres matching and award
history, Keenable research, BullMQ workers, Redis Streams, and React views for
company/tenders/competitors alongside chat. Read the source for current details;
this paragraph is not proof a deployed release works.

Important distinctions reflected in the steering:

- `npm run check` typechecks both workspaces and builds Vite. It does not launch
  the server or exercise a model, DB, job worker or browser.
- Drizzle migrates app tables; BetterAuth migrates its own tables on startup.
- `web/src/api.ts` still has legacy mock-ID detail fallbacks. Do not describe that
  as universal live data or let sample results mask a broken real integration.
- Matching/ranking use heuristics and award-history evidence. Framework ceilings,
  multiple winners, alias grouping, absent deadlines and unknown values need
  caveats; they are not observed future bids, guaranteed revenue or win odds.
- `/api/health` reports `ok: true` with separate Redis/model flags; it is not a
  complete readiness check. Validate a DB-backed authenticated request too.

## Why these instruction files

[OpenAI's AGENTS.md guidance](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
describes repository instructions and directory-specific overrides. We keep
standing project guidance in root `AGENTS.md`, and link the release runbook for
work that needs it instead of loading a long operational manual everywhere.

[Claude Code's memory documentation](https://code.claude.com/docs/en/memory)
recommends concise, specific instructions and supports importing `AGENTS.md` from
`CLAUDE.md`. Our one-line `@AGENTS.md` keeps one source of truth and supports
sessions that only load Claude's instruction file. Keep the canonical guide short
rather than copying it into separate tool-specific files.

Both files steer an agent; they are **not enforcement mechanisms**. Required
checks/branch protection, session/ownership checks, input validation, SAM access
policies and secret handling must enforce boundaries in the actual system. Do
not claim those controls are configured just because this guide requests them.
SAM's `minVcpu`/`minMemoryGb` are workload reservations, not OS-enforced resource
caps; explicit dispatch values implement the user's sizing rule.

## SAM release evidence and unresolved target

The SAM `get_deployment_guide` requires agent-driven Compose publishing, terminal
publish-job polling, then release/apply/log and route verification; publishing is
not deployment health. CI may validate a PR but must not replace SAM publishing.

During this review `list_deployment_environments` returned no environments visible
to this session's profile. Earlier history/README names `staging`; the user now
says dev. Until the owner confirms the name and the profile can discover it, do
not equate these names or claim deployment access. The runbook makes missing
access/target information an explicit release blocker rather than bypassing it.
