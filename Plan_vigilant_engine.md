# Build Plan

Phased checklist for `vigilant-engine`. See [ARCHITECTURE.md](ARCHITECTURE.md)
for the target shape.

## Phase 0 — Docs

- [x] `ARCHITECTURE.md` — solution architecture, scanner coverage, bill of materials
- [x] `ingestion/app/schema.py` — shared `Finding` / `IngestRequest` models
- [x] `Plan_vigilant_engine.md` (this file)
- [x] `../notes/INTERVIEW_PREP_APPSEC1.md` — how this project maps to the AppSec engineer role
- [x] `docs/THREAT_MODEL.md` — manual STRIDE analysis of Juice Shop (confirmed findings, in progress)
- [x] `../notes/BURP_TESTING_STEPS.md` — live runbook for hands-on Burp Suite testing
- [x] `docs/vigilant-engine-threat-modeling-plan.pdf` — phased threat-modeling plan (STRIDE + Threat Dragon + ATT&CK)

## Phase 1 — demo-target

- [x] `demo-target/` — OWASP Juice Shop brought in as a git submodule, pinned
      to release `v20.2.0` (not `main`, so scan results are reproducible)
- [x] Confirm it boots and is reachable on a known port — `npm install && npm
      start` in `demo-target/`, verified `200` on `localhost:3000`. Ran
      natively rather than via Docker since Docker isn't installed locally
      yet; GitHub Actions provides Docker for CI, so this doesn't block CI
      work later.

## Phase 2 — ingestion service (`ingestion/`) — done

- [x] `app/db.py` — SQLModel engine + session, SQLite for now
- [x] `app/models.py` — `Finding` as a SQLModel table (reuses `schema.py`'s shape)
- [x] `app/dedupe.py` — `compute_dedupe_hash()`, shared by every parser
- [x] `app/parsers/` — one module per tool, each mapping raw scanner JSON to `Finding`:
  - [x] `semgrep.py`
  - [x] `npm_audit.py`
  - [x] `snyk.py`
  - [x] `zap.py`
  - [x] `gitleaks.py`
  - [x] `trivy.py`
- [x] `app/main.py` — FastAPI app:
  - [x] `POST /ingest` — dispatch to the right parser by `source`, upsert by `dedupe_hash`
  - [x] `GET /findings` — filter by severity/source/status/repo
  - [x] `GET /stats` — counts by severity/source, for the dashboard
- [x] `tests/fixtures/` — one sample raw-output file per tool
- [x] `tests/test_parsers.py` — each parser against its fixture (7 tests)
- [x] `tests/test_api.py` — end-to-end `/ingest` → `/findings`/`/stats`, including
      the dedupe-on-rescan behavior (6 tests)
- [x] Validated against a **real** scan: ran `npm audit` against Juice Shop
      itself and posted the actual output through `/ingest` — all 46 real
      vulnerabilities (7 critical / 20 high / 17 medium / 3 low) came out
      the other end correctly normalized. Not just fixture data.
- [x] `ingestion/README.md` — code layout, request-flow sequence diagrams, how to run/test it

## Phase 3 — CI (`.github/workflows/`)

**Approach.** Wire real scanners into CI and prove the full scan → normalize
→ store → query loop end-to-end, using the cheapest possible backing
infrastructure — before spending any effort on hosting something
persistent. Phase 2 already proved the ingestion API's *logic* is correct
in isolation (unit/integration tests against fixtures, plus one manual
validation against Juice Shop's real `npm audit` output). What Phase 3
proves is different: that six independently-built tools, each with its own
JSON shape, can be driven inside a real CI pipeline and land correctly in
that same API — the integration risk, not the parsing risk.

Set up and run the scanners:
1. Semgrep, npm audit, Snyk, gitleaks against the source, in CI.
2. OWASP ZAP baseline scan against the running instance.
3. Trivy against the built `ingestion/` and `dashboard/` images.
4. Feed every tool's raw output into the already-built ingestion API.

**Job flow, step by step (`security-scans.yml`, `scan-and-ingest` job).**
One job, one runner VM, every step below executing on it in order:

1. Checkout `vigilant-engine` (with the `demo-target` submodule).
2. Install Python and Node.js.
3. Install ingestion service dependencies (`pip install -r
   ingestion/requirements.txt`).
4. Run the ingestion service's own test suite (`pytest`) — fails fast here,
   before anything downstream runs, if the parsing/dedupe logic is broken.
5. Start the ingestion API in the background (`nohup uvicorn ... &`),
   poll `/docs` until it's ready.
6. Install `demo-target` dependencies (`npm install`).
7. Run Semgrep against `demo-target/` source → ingest the results.
8. Run `npm audit` against `demo-target/` → ingest the results.
9. Run Snyk against `demo-target/`, only if `SNYK_TOKEN` is configured →
   ingest the results.
10. Run gitleaks against `demo-target/` → ingest the results.
11. Print `/stats` (aggregated counts by severity/source) as a smoke test.

- [x] Workflow: run Semgrep, npm audit, Snyk, gitleaks against `demo-target/` source
      — `.github/workflows/security-scans.yml` + `.github/scripts/post_to_ingestion.py`.
      Snyk step is gated behind `env.SNYK_TOKEN` (see fix below) so it
      no-ops until that account exists. **Verified against a real run:**
      [run 34469209245](https://github.com/creativecoder10/vigilant-engine/actions/runs/34469209245) —
      every step succeeded (Snyk correctly skipped, no token configured
      yet). 180 real open findings ingested: 67 from Semgrep, 45 from
      npm audit, 68 from gitleaks (75 critical / 37 high / 61 medium / 5
      low / 2 info). Took two real fixes to get here, both only visible
      once actually run on GitHub's infrastructure — see
      `docs/FIRST_CI_RUN_EXPECTATIONS.md` and the interview-prep doc's
      "Blockers" section for the full diagnosis of each:
      1. `if: ${{ secrets.SNYK_TOKEN != '' }}` is invalid — `secrets` isn't
         available inside `if:` expressions. Fixed by promoting it to a
         job-level `env:` var and checking `env.SNYK_TOKEN` instead.
      2. `demo-target`'s nested frontend `npm install` crashed under the
         npm 10.9.8 bundled with Node 22 on the runner (a known Arborist
         bug) — didn't reproduce locally under npm 11.x. Fixed with an
         explicit `npm install -g npm@latest` step after Node setup.
- [ ] Workflow: boot Juice Shop in a container, run ZAP baseline scan against it
- [ ] Workflow: build `ingestion/` and `dashboard/` images, run Trivy against them
- [ ] Each job POSTs its raw output to the ingestion API's `/ingest`

**Why the ingestion API is ephemeral in this phase, and why that's a
decision, not an oversight.** `security-scans.yml` starts the FastAPI
ingestion service as a background process (`nohup uvicorn app.main:app &`)
*inside the CI job itself*, backed by a fresh, file-based SQLite database
that exists only on that job's runner disk. When the job ends, the runner
VM — and everything on its disk, database included — is destroyed. So
every run starts from zero findings; nothing accumulates across runs yet.
That gap is deliberate, and closing it is explicitly scoped to two later
phases rather than pulled forward into this one:

- **Phase 5** packages the same ingestion code into a `docker-compose`
  stack with a volume-backed database, so it survives container restarts.
- **Phase 7** replaces SQLite with a real, always-on AWS RDS Postgres
  instance. This isn't a rewrite: `ingestion/app/db.py` already reads its
  connection string from an environment variable
  (`DATABASE_URL = os.environ.get("DATABASE_URL", "sqlite:///./findings.db")`),
  so pointing the exact same application code at Postgres is a
  configuration change made at deploy time, not new application code.

The reasoning for sequencing it this way: standing up a real, always-on
database introduces problems that have nothing to do with whether the
scan → normalize → store pipeline actually works correctly — hosting cost,
issuing CI a write credential securely, backups, migrations. Bundling that
into "does Semgrep's output get parsed and stored correctly" would turn a
fast, cheap-to-debug step into a slower, harder-to-isolate one, and would
mean paying for infrastructure before knowing the schema and dedupe logic
underneath it are right. This is a walking-skeleton approach: build the
thinnest possible slice that exercises the *entire* path end-to-end with
the cheapest components available, validate that, and only then add the
operational weight of a real deployment. The planned dashboard (Phase 4)
is designed around this too — it's scoped to query the future
persistently-hosted API, never one of these short-lived per-CI-run
instances, so a CI job finishing was never meant to be the thing that
makes a dashboard go blank.

**Outcome — CI now enforces the test suite as a gate, before any scanner
runs.** `ingestion/tests/` (`test_parsers.py`, `test_api.py`) previously
passed only when run locally — `pytest` had no connection to CI at all.
`security-scans.yml` now runs `pytest` (`working-directory: ingestion`)
immediately after installing dependencies, *before* the ingestion API is
even started. No `|| true` on this step, unlike the scanner steps — a
failing test fails the job outright, and every step after it (starting
the ingestion API, running Semgrep/npm audit/Snyk/gitleaks, ingesting
their output) is skipped by GitHub Actions' default behavior. Concretely:
a broken parser now fails fast, in seconds, instead of the job spending
several minutes running every real scanner first and only then never
having checked whether the ingestion logic underneath them was sound.
This is the standard shape of "CI enforces the test suite" — a fast,
narrow gate placed first, before the more expensive integration work.

**Scope clarifications — Q&A.**

*Q: Why install Node.js if two of the four scanners are static analysis
against source code — isn't that language-agnostic?*
A: Semgrep and gitleaks are, yes — both are standalone binaries that read
source files as plain text and never need a Node.js runtime. But `npm
audit` and Snyk are dependency scanners (SCA), and they are themselves
npm-ecosystem tools: `npm audit` is a subcommand of `npm` (shipped with
Node.js), and Snyk is installed via `npm install -g snyk`. Neither can run
at all without Node.js present, regardless of what they're scanning. The
separate `npm install` step in `demo-target/` exists so `node_modules/`
is fully populated — both tools need to resolve the complete dependency
tree (including transitive dependencies), not just read `package.json`.
None of this is for dynamic/runtime scanning — Juice Shop is never
started as a live app anywhere in this workflow; ZAP (which does need a
running instance) is a separate, not-yet-built workflow.

*Q: What does the final `/stats` step actually do — is that a folder of
results?*
A: Not a folder — `/stats` is a real endpoint on the ingestion API (`GET
/stats`, built in Phase 2) that queries the SQLite database and returns
aggregated counts of findings by severity and source. The last step just
runs `curl -s http://localhost:8000/stats | python3 -m json.tool` to
pretty-print that live query result into the CI log as a human-readable
smoke test. Nothing is written to disk by this step; the JSON only ever
exists in the job's log output.

*Q: Does "ingest" mean take the scanner's raw output, normalize it, and
write it into the SQLite database?*
A: Yes. Each "Ingest X results" step runs
[post_to_ingestion.py](.github/scripts/post_to_ingestion.py), which reads
the scanner's raw JSON file and POSTs it, along with `repo`/`branch`/
`commit_sha`, to the running ingestion API's `POST /ingest`. The script
itself does no normalization — that happens inside the API, which looks
up the matching parser for that `source` (`app/parsers/semgrep.py`,
`app/parsers/npm_audit.py`, etc.), maps the tool's raw shape into the
common `Finding` schema, computes a `dedupe_hash`, and upserts the row
into `findings.db`. The script's only job is delivering the raw file to
the API; the API is what normalizes and persists it.

**Outcome reporting for each run.** Three artifacts making each run's
result inspectable without opening the raw job log, each building on
something already in place rather than new infrastructure:

- [x] **Test report.** `pytest --junitxml=pytest-report.xml` replaces the
      bare `pytest` call; a new `Upload test report` step
      (`actions/upload-artifact@v4`, `if: always()` so it runs whether
      tests passed or failed) attaches `ingestion/pytest-report.xml` to
      the run. This matters specifically *because* the runner disk is
      destroyed at job end (the ephemeral-disk problem covered above) —
      without this explicit upload, the report would vanish with
      everything else on that disk.
- [x] **Raw scanner output.** A new `Upload raw scanner output` step
      (also `if: always()`) attaches `semgrep-results.json`,
      `npm-audit-results.json`, `snyk-results.json`, and
      `gitleaks-results.json` to the run (`if-no-files-found: ignore`,
      since `snyk-results.json` legitimately won't exist when
      `SNYK_TOKEN` isn't configured). Lets a specific run's raw tool
      output be inspected later without re-running anything.
- [x] **Ingestion count + per-scanner summary.** New script
      [.github/scripts/write_run_summary.py](.github/scripts/write_run_summary.py)
      replaces the old `curl /stats | json.tool` step. It fetches `/stats`
      (already grouping by both severity and source, built in Phase 2)
      and writes a formatted markdown summary — total open findings, a
      per-source table, a per-severity table — to `$GITHUB_STEP_SUMMARY`,
      the file GitHub Actions renders on the run's summary page, instead
      of leaving it buried in log text. Runs with `if: always()` too;
      since that means it can fire even when the ingestion API was never
      started (e.g. `pytest` failed upstream), it catches
      `urllib.error.URLError` and writes a plain "API was not reachable"
      note instead of crashing on a raw connection-error traceback.

No new dependency or third-party GitHub Action needed for any of these —
consistent with `post_to_ingestion.py`'s deliberate standard-library-only
approach. Not yet verified against a real run, same caveat as the rest of
this workflow: nothing has been pushed to a GitHub remote yet.

## Phase 4 — dashboard (`dashboard/`)

- [x] Next.js app scaffold (App Router + TypeScript, Tailwind) —
      `create-next-app`, npm.
- [x] `src/lib/api.ts` — typed server-side client (`getFindings`,
      `getStats`) against the ingestion API. Reads `INGESTION_API_URL`
      from the environment (defaults to `http://localhost:8000`); no
      `NEXT_PUBLIC_` prefix since it only ever runs in Server Components,
      never shipped to the browser.
- [x] `src/types/finding.ts` — TS types mirroring `Finding`/`Severity`/
      `Source`/`FindingStatus`/`Stats` from `ingestion/app/schema.py` and
      `models.py`. Hand-kept in sync, not codegen'd — same tradeoff noted
      in `Finding`'s own docstring.
- [x] `src/components/` — `SeverityStats` (stat tiles), `SourceBreakdown`
      (per-scanner bar chart), `FindingsTable`. Colors follow the dataviz
      skill's method rather than eyeballed choices: severity uses the
      fixed status ramp (critical/serious/warning/good; `info` falls back
      to muted ink since it isn't a status level in the same sense), and
      scanner source uses the fixed 6-slot categorical ramp — both run
      through `validate_palette.js` (CVD separation, contrast) before
      use, in both light and dark mode. Identity is never color-alone: a
      swatch sits *beside* a text label, never colors the text itself.
  - [ ] Open-vs-fixed trend — deferred, not just unbuilt: it needs
        history across multiple scans, which needs the `scan_runs` table
        gap already flagged in Phase 3 (per-finding `first_seen`/
        `last_seen` isn't the same as a queryable run history). Building
        this now would mean faking the data it's supposed to show.
- [x] Landing page (`src/app/page.tsx`) pulling real data from
      `getFindings({status: "open"})` and `getStats()`.
- [x] **Verified, not just built:** local ingestion API seeded with the
      actual raw scanner output artifact from the successful Phase 3 CI
      run (180 real findings, same numbers as the live run) — `npm run
      build`/`lint` clean, then screenshotted with Playwright in both
      light and dark mode, zero console/page errors.
- [x] Severity/criticality filter — `SeverityStats`' tiles double as the
      filter control (pattern checked against a reference app,
      `threat-pulse-kappa.vercel.app`'s alert feed): clicking a tile sets
      `?severity=<x>`, read server-side via the page's `searchParams`
      prop and passed straight into the existing typed `getFindings()`
      call — the real `/findings?severity=` query runs, not a
      client-side filter over an already-fetched array. Verified
      end-to-end: clicking "Critical" produces exactly 75 rows, all
      `severity=critical`, confirmed by reading the rendered table's
      actual cell values, not just the URL changing.

## Phase 5 — packaging

- [ ] `ingestion/Dockerfile`, `dashboard/Dockerfile`
- [ ] Root `docker-compose.yml` wiring demo-target + ingestion + dashboard together
- [ ] `README.md` — one-command local run instructions

## Phase 6 — polish

- [ ] Run the full pipeline once end-to-end, seed real findings
- [ ] Screenshot the dashboard for the README / portfolio writeup
- [ ] Review `INTERVIEW_PREP.md` against what actually got built

## Phase 7 — AWS deployment + IaC (stretch)

Moves the Phase-5 `docker-compose` stack onto AWS, provisioned entirely
through Terraform instead of clicking through the console. Also doubles as
IaC/cloud-security portfolio material (Terraform + AWS misconfig scanning is
a common AppSec-engineer ask).

- [ ] `infra/` — new top-level Terraform root module
  - [ ] `backend.tf` — remote state in an S3 bucket + DynamoDB lock table
        (bootstrapped once by hand or a tiny separate bootstrap module,
        since state can't store itself)
  - [ ] `providers.tf` — AWS provider, pinned version
  - [ ] `network.tf` — VPC, public/private subnets, IGW/NAT, security groups
  - [ ] `ecr.tf` — one ECR repo per image (`ingestion`, `dashboard`)
  - [ ] `rds.tf` — Postgres (replaces SQLite; `ingestion/app/db.py` already
        anticipates this swap), private subnet only, no public endpoint
  - [ ] `ecs.tf` — ECS cluster + Fargate task defs/services for `ingestion`
        and `dashboard`, sized minimal (portfolio project, not prod scale)
  - [ ] `alb.tf` — Application Load Balancer in front of both services,
        path- or host-based routing
  - [ ] `secrets.tf` — AWS Secrets Manager entries for `SNYK_TOKEN`, DB
        credentials; tasks read via `secrets` block, never baked into images
  - [ ] `iam.tf` — least-privilege task execution role + task role per
        service, no wildcard `*` policies
  - [ ] `logs.tf` — CloudWatch log groups for each ECS service
  - [ ] `variables.tf` / `outputs.tf` — ALB DNS name, ECR repo URLs, etc.
- [ ] `infra/README.md` — how to `terraform init/plan/apply`, what a
      teardown (`terraform destroy`) costs to avoid, state-locking caveats
- [ ] Extend `.github/workflows/` with a deploy job: build → push to ECR →
      `terraform apply` (or `ecs update-service` for a faster image-only
      path) — gated behind manual approval / a protected branch, not
      auto-deploy on every push
- [ ] Auth to AWS from CI via GitHub OIDC + an assumable IAM role — no
      long-lived AWS access keys stored as repo secrets
- [ ] IaC security scanning: run `tfsec` or `checkov` against `infra/` in CI,
      same pattern as the app scanners in Phase 3 — findings normalized and
      posted through the ingestion API if time allows, otherwise just a CI
      gate
- [ ] Decide before building: is this actually deployed and left running
      (real AWS cost, real portfolio demo link) or built-and-torn-down
      (`terraform apply` in a recorded walkthrough, then `destroy`) —
      changes whether always-on RDS/Fargate costs are worth it
