# Issue → PR → main → dev

Read this before issue implementation, merging or publishing. This runbook
implements standing user authorization; it is not an extra approval process.
Product and security rules live in [AGENTS.md](../AGENTS.md).

## 1. Establish scope and ownership

For `build-it` automation, resolve the exact issue/repository from SAM's triggering
context. Confirm the issue is open and still labeled `build-it`; ignore PR events
and unrelated label additions. Read all comments, acceptance criteria, existing
branches/PRs and related tasks. Resume existing work rather than opening duplicate
PRs. Never guess the issue from a matching title alone.

Post an initial issue comment describing the intended result and short plan.
Post meaningful implementation/validation milestones and blockers in the issue;
link the PR when opened. Research-only issue augmentation is not implementation
authorization, and must not loop on the agent's own comments/events.

Use current main and an isolated branch/worktree. Preserve concurrent teammates'
changes and use SAM's output branch/coordination instructions. Verify external
API/library assumptions against current primary documentation when necessary.

## 2. Validate the PR

- Run `npm ci` when dependencies change or the checkout is fresh, then
  `npm run check` from the root. There is no root automated test command today.
  Add/run focused regression tests for substantive logic; avoid ceremonial tests
  for simple prose edits. Markdown-only changes need link/path and diff checks.
- Test affected integration behavior against disposable/local services. For
  user-data/auth changes, include anonymous access and a second user's access.
  For data changes, verify a bounded real TED import, rerun/idempotency, source
  links, open vs expired deadlines and stored results. Do not imply fixtures are
  a live import. For jobs, verify progress, retry and failure behavior.
- For UI changes, use a browser for the changed flow and check narrow/wide
  layouts, keyboard access and error/empty/loading states. For agent changes,
  check tool use, saved profile, sourced answers and model-unavailable behavior.
- Build the actual PR head. `npm run build` only builds the web bundle; TypeScript
  server code is run with `tsx`. Runtime changes need Compose/runtime validation,
  including migrations and startup. In SAM, use its deployment tooling for image
  builds; do not seek registry credentials or manually push images.
- PR description: concrete behavior, `Closes #N` where appropriate, commands and
  observed results, and material unverified behavior. Do not call skipped checks
  passed. An empty CI check list is not a successful build.

## 3. Merge gate

Reconcile GitHub's current PR head (full SHA), latest main, checks, reviews and
unresolved blocking feedback immediately before merging. Resolve conflicts
without dropping others' functionality and rerun affected validation. Required
checks must pass on the exact current PR head; do not bypass protections, dismiss
blocking feedback without resolution, or force merge. Prefer squash merge with
an expected-head SHA guard. Verify GitHub reports the PR merged and save its
resulting main commit SHA. Direct pushes are allowed when explicitly requested;
use a normal fast-forward push and reconcile main if it moved.

Before merging, discover dev deployment access/config where practical so failures
are visible early. If already merged but publishing fails, keep ownership of the
release and report **merged; dev deployment blocked**, with the exact cause.

### Waiting for CI/reviews in SAM

Follow the current `get_instructions` eventing rules. Reconcile before waiting,
after subscribing and after every resume. CI subscriptions use source `github`,
subjectType `commit`, the full current head SHA, and exact event types
`check_run.completed`, `check_suite.completed`, `workflow_run.completed`. Reviews
use subjectType `pull_request` and the PR number. Save PR URL, head SHA, pending
check/run URLs, subscription ID/expiry and a bounded fallback deadline. Arrange
and confirm one `create_project_schedule` message-session fallback to this same
session; expiry is not a wake. If scheduling fails, report that blocker visibly.
On resume inspect subscriptions with state `any`, reconcile GitHub, and cancel
only your obsolete subscriptions/schedules. After one fallback with no progress,
report the pending checks and delivery status instead of waiting forever.

## 4. Deploy the merged main version to dev (required)

The user requires this after every ready PR merge; explicitly requested direct
pushes to main follow the same rule. It includes docs-only releases: do not invent
an exception. This does not authorize production deployment.

1. Read SAM `get_deployment_guide`, then `list_deployment_environments`. Select the
   user-confirmed dev environment by its actual name. Older project history says
   `staging`; **that does not establish it is today's dev target**. If the target
   is missing, ambiguous, or agent deployment is disabled, report the exact
   blocker through SAM and the issue/user. Ask for target clarification/access,
   not repeated permission to perform an already-authorized dev deploy. Do not
   create a substitute environment or silently deploy to another target.
2. Use a clean checkout/worktree of the merged main commit, not the old PR head
   or uncommitted workspace. Fetch main and check for newer releases before
   publishing; coordinate with other releasing agents so an older release does
   not replace a newer one. If main advanced, validate and deploy the newer main
   revision containing the merge, and report both SHAs. Verify the chosen SHA is
   on current main; record it as the release reference. Preserve unrelated work.
3. Review `docker-compose.yml` and `list_deployment_environment_config`. Inspect
   required config keys without exposing secrets. Use SAM Secrets for API keys,
   database credentials and `BETTER_AUTH_SECRET`; never use Secrets as image tags,
   build args or frontend config. Do not overwrite existing secrets with local
   defaults. `SEED_DEMO` and known demo credentials belong only in a deliberately
   configured demo/dev environment. Migrations run on startup: inspect DB changes
   before deploying and preserve named volumes; destructive changes need specific
   user authorization and a recovery plan.
4. Call `preview_deployment_routes` with the exact Compose YAML. Confirm only the
   app is public and Postgres/Redis stay private. Use returned URLs for
   `BETTER_AUTH_URL`/trusted origins; never guess hostnames or loosen auth to make
   a smoke test pass.
5. Call `build_and_publish({ environment, reference: <full-source-SHA>,
   workingDir: <absolute-clean-checkout-path> })`. SAM builds and publishes
   Compose services; no manual registry login/push or CI deployment job. Save
   `publishJobId`. Poll `get_publish_status` every 10–20 seconds, using `sinceSeq`
   for new events, until terminal. `failed`, `canceled` or `unknown` is a blocker;
   inspect the failure before retrying. Job acceptance is not success.
6. After `succeeded`, call `list_deployment_routes` and `read_deployment_logs`.
   Confirm the expected release was applied and containers/migrations are healthy.
   Verify the URL belongs to that release; a recorded release may not be serving
   yet. A workspace DNS check does not prove the deployed app is reachable.
7. Smoke-test the real dev URL: page loads, sign-in works, `/api/health` responds
   and reports Redis available, protected routes reject anonymous requests, and
   the changed flow works. Health's `ok: true` alone does not check Postgres/model
   health; use an authenticated DB-backed request and check `model` when needed.
   For core-flow releases, verify profile → tenders → competitor sources → chat/
   job completion. Use bounded imports/research to avoid burning API credits.
8. Report PR/issue URL, merge SHA, deployed source SHA, publish job/release ID,
   dev URL and observed checks. On failure, report diagnostics and next action;
   do not erase shared data or blindly redeploy an old image. Keep a successful
   deployment distinct from successful publishing and never silently drop the
   post-merge release step.
