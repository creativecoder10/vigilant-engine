# PRD — vigilant-engine: AppSec Findings Pipeline & Dashboard

**Status:** Phases 1–6 shipped. Phases 7–8 not started.
**Owner:** Deepesh Dang
**Last updated:** 2026-09-15

## 1. Problem

Security scanners (SAST, SCA, DAST, secret, container) each produce
findings in their own JSON shape, with no shared severity scale, no
cross-tool identity for "the same issue," and no persistent record once a
CI job ends. An AppSec team using several scanners has no single place to
answer "what's actually open right now, across every tool, at what
severity" — that requires normalizing and storing what today lives only in
disconnected job logs.

## 2. Goal

Build a pipeline that runs real scanners against a real vulnerable app,
normalizes every tool's output into one schema, deduplicates repeat
findings across runs, and surfaces the result on a dashboard — as a
portfolio-grade demonstration of AppSec engineering judgment (tool
selection, schema design, CI integration, secure-by-default choices), not
a production security product.

### Non-goals

- Not a general-purpose vulnerability management platform (no ticketing,
  no SLA tracking, no remediation workflow).
- Not built to scan arbitrary user-supplied repos — one fixed demo target.
- Not optimized for scanner performance/scale — a single small app,
  correctness and clarity favored over throughput.

## 3. Users

Primary audience is the project's author and the people evaluating this
work (interviewers, reviewers) — the "user" of the dashboard is whoever
needs a normalized, queryable view of a scan run's findings instead of
reading raw tool output.

## 4. Requirements by area

Each area below is a phase in [Plan_vigilant_engine.md](../Plan_vigilant_engine.md);
that file is the source of truth for granular task status. This section
states the *requirement* each phase satisfies and whether it shipped.

### 4.1 Demo target — **shipped**

| Requirement | Decision |
| --- | --- |
| Scanned app must be recognizable, not custom-built | [OWASP Juice Shop](https://github.com/juice-shop/juice-shop), pinned as a git submodule at `v20.2.0` — a known-name intentionally-vulnerable app, not a narrower custom-app story |
| Must not vendor a third party's source | Wired in as a git submodule, never copied into the repo |

### 4.2 Ingestion service (`ingestion/`) — **shipped**

| Requirement | Decision |
| --- | --- |
| One shared schema across all scanners | `Finding`/`IngestRequest` Pydantic models (`ingestion/app/schema.py`); every parser maps its tool's raw shape onto this before storage |
| No duplicate rows across repeat scans | `compute_dedupe_hash` (`ingestion/app/dedupe.py`) — SHA-256 over scanner-specific fields (see field table in [ARCHITECTURE.md](../ARCHITECTURE.md#deduplication)); repeat scans upsert `last_seen` on the existing row instead of inserting a new one |
| Storage must be swappable without a rewrite | `DATABASE_URL` env var, defaults to SQLite; `ingestion/app/db.py` already reads Postgres connection strings the same way |
| API surface | `POST /ingest`, `GET /findings` (filterable), `GET /stats` (aggregate counts by severity/source) — all built and tested |
| Correctness must be provable before wiring into CI | Full test suite (`ingestion/tests/`: `test_parsers.py`, `test_api.py`), plus one manual validation against Juice Shop's real `npm audit` output |

### 4.3 CI pipeline (`.github/workflows/`) — **shipped for 5 of 6 scanners**

| Requirement | Decision |
| --- | --- |
| Run real scanners against real source, in CI, not just locally | Semgrep (SAST), npm audit (SCA), Snyk (SCA, gated behind `SNYK_TOKEN`), gitleaks (secrets) — `security-scans.yml` |
| Run a scanner against the *running* app, not just its source | OWASP ZAP (DAST) — boots a real `bkimminich/juice-shop:v20.2.0` container in the CI job, runs `zap-baseline.py` against it over a Docker network (container name, not `localhost` — same pattern `docker-compose.yml` uses in Phase 5), ingests the results. **Verified locally before trusting the CI run:** 11 real alerts (missing CSP header, cross-domain misconfiguration, timestamp disclosure, etc.), correct severity/rule_id/description on every row via `GET /findings?source=zap` |
| Test suite must gate the pipeline | `pytest` (with `--junitxml` report) runs first, no `|| true`; a broken parser fails the job before any scanner runs |
| Every run's evidence must survive the runner's ephemeral disk | Test report, raw per-scanner JSON, and an ingestion count/summary are all uploaded as run artifacts (`if: always()`) |
| Verified against a real run, not just "should work" | [Run 34469209245](https://github.com/creativecoder10/vigilant-engine/actions/runs/34469209245) — 180 real findings ingested (75 critical / 37 high / 61 medium / 5 low / 2 info), before ZAP was added |
| Not yet built | Trivy (container scanning of `ingestion`/`dashboard` images) — was deferred until Phase 5's Docker images existed; they now do (§4.5), so this is next |

### 4.4 Dashboard (`dashboard/`) — **shipped**

| Requirement | Decision |
| --- | --- |
| Read real ingestion data, not fixtures | `getFindings()`/`getStats()` (`src/lib/api.ts`) call the live ingestion API server-side; landing page seeded with the actual Phase 3 CI run's 180 findings |
| Findings must be triageable by severity | `SeverityStats` tiles double as a filter: clicking one sets `?severity=<x>`, read via `searchParams`, passed into a real `getFindings({severity})` query — not a client-side filter over an already-fetched array. Verified: clicking "Critical" returns exactly 75 rows, all `severity=critical` |
| Visual identity must be accessible, not eyeballed | Colors run through the dataviz skill's `validate_palette.js` (CVD separation, contrast) in both light and dark mode; severity/source are never color-only — a swatch always sits beside a text label |
| Verified, not just built | `npm run build`/`lint` clean; Playwright screenshots in both light and dark mode, zero console/page errors |
| Deferred, not built | Open-vs-fixed trend — needs a queryable run history. `scan_runs` (one row per scan run, snapshotting open-finding counts by severity at that moment) now exists (§4.5) and unblocks this; the chart itself is still unbuilt |

### 4.5 Packaging (`ingestion/Dockerfile`, `dashboard/Dockerfile`, `docker-compose.yml`) — **shipped**

`demo-target/` (Juice Shop) already ships its own `Dockerfile` upstream —
reused as-is, not rewritten. `ingestion/Dockerfile` built first, since it's
the simpler of the two remaining images — `docker build` succeeds and
`docker run -p 8001:8000` responds correctly on `/docs`, `/findings`, and
`/stats` through the host port mapping:

| Requirement | Decision |
| --- | --- |
| Base image must support Python without unnecessary bloat | `python:3.12-slim` — Debian-based, so dependencies with compiled C extensions (`cryptography`, parts of `pydantic`/`sqlmodel`) install from prebuilt wheels like they do locally; `alpine`'s musl libc breaks or slow-compiles those same packages, and the full `python:3.12` image carries build tools/docs the runtime never uses |
| Dependency install must not repeat on every rebuild | `COPY requirements.txt` + `RUN pip install` happens as its own layer *before* `COPY app/` — Docker's layer cache keys each instruction on its inputs, so a code-only change (the common case) reuses the cached install layer instead of reinstalling every dependency on every build |
| Service must be reachable from other containers on the compose network, not just from inside its own container | `CMD` runs `uvicorn app.main:app --host 0.0.0.0 --port 8000` — binding `0.0.0.0` instead of the loopback-only default is what makes the service answer connections from the `dashboard` container and from Docker's host port mapping; **verified**, not just designed — a container run with `-p 8001:8000` answered `/docs`/`/findings`/`/stats` from the host |
| SQLite data must survive a container restart/rebuild | `findings.db` (now `./data/findings.db`) lives on a Docker-managed named volume (`findings_data`, mounted at `/app/data`), not the container's own writable filesystem layer. **Verified with a real teardown, not just designed:** seeded a finding via `/ingest`, ran `docker compose down` (containers *and* network fully removed) then `docker compose up -d` (brand new containers), and `/stats` still showed the same finding |
| `dashboard/Dockerfile` build must ship a minimal runtime, not the full build toolchain | Multi-stage (`deps`/`builder`/`runner`), `node:20-slim` (consistent glibc reasoning as `ingestion`'s base image — `package-lock.json` pulls in `sharp`, a compiled dependency), `next.config.ts` updated with `output: "standalone"` per Next.js's own documented Docker guidance |
| Both images must actually talk to each other, not just build individually | **Verified together**, first manually on a real Docker network, then for real through `docker-compose.yml` itself: `dashboard` fetches live data from `http://ingestion:8000` — a container name, not `localhost` — and renders with no error boundary |
| Root `docker-compose.yml` | Built and verified — wires `demo-target` (host `:3000`), `ingestion` (host `:8000`), and `dashboard` (host `:3001`, offset from `3000` since Juice Shop and the dashboard's standalone server both default to port 3000 internally) together on one Compose-managed network, with the named volume and `INGESTION_API_URL` set for real, not passed manually via `-e` |
| Run history must be queryable, now that persistence is real (§5 gap) | `scan_runs` (`ScanRun` in `ingestion/app/models.py`) — one row per scan run, snapshotting open-finding counts by severity at that moment. Verified against the live compose stack, not just unit-tested: `total_open` moved 1 → 3 and `critical` moved 0 → 1 across two recorded snapshots |

**Why decide the design before writing the file:** each of these is a
plausible-looking default that fails silently if picked wrong (wrong host
binding refuses connections with no error; no volume quietly resets data on
every redeploy) — worth reasoning through explicitly rather than discovering
via a broken container. Full narrative version of each decision, plus Docker
fundamentals (images, base images, layers): `PHASE5_DOCKER_PACKAGING_NOTES.md`
(in the external `job prep notes` folder, kept separate from interview-prep
material since it's build/learning notes, not interview rehearsal).

## 5. Known gap: run history — **resolved**

`Finding` carries per-row `first_seen`/`last_seen`, which answers "is this
finding still open" but not "how did the finding count change from run to
run." Closing that needed a `scan_runs` table — **now built**:
`ingestion/app/models.py`'s `ScanRun`, one row per scan run (timestamp,
repo/branch/commit, per-severity snapshot counts), populated via
`POST /scan-runs` (computes the snapshot from current open findings itself,
so a row can never disagree with `/findings`) and read via `GET /scan-runs`
(oldest first). It was scoped to Phase 5, gated on the volume-backed
database landing there first (no point tracking run history a container
restart would wipe) — the volume shipped, then this did. Verified against
the real compose stack, not just unit-tested: seeded findings, recorded
two snapshots, confirmed `total_open` moved 1 → 3 and `critical` moved
0 → 1 across them. The dashboard's open-vs-fixed trend chart itself is
still unbuilt — this closes the gap in the *data*, not the UI.

### 5.1 How this gap was caught

Worth recording as process, not just outcome: this requirement was
initially *cited*, not tracked. Phase 4's own checklist deferred the
open-vs-fixed trend with this justification — "it needs history across
multiple scans, which needs the `scan_runs` table gap already flagged in
Phase 3." Read at face value, that sentence claims the requirement was
already written down elsewhere — "don't worry, this is covered."

It wasn't. Phase 3's actual text flags a different, narrower gap: the CI
job's ingestion API runs against a fresh SQLite file that's destroyed with
the runner VM at job end, so findings don't *persist* past one run. Fixing
that is explicitly scoped to Phase 5 (volume-backed `docker-compose` DB)
and Phase 7 (RDS Postgres) — but neither of those two phases, nor anywhere
else in the plan, ever mentions a `scan_runs` table. Persistence (the data
survives a restart) and run history (the data is *shaped* so you can query
"how did the count change between runs") are separate problems — a
volume-backed `findings` table alone still only gives per-finding
`first_seen`/`last_seen`, never a queryable list of runs.

So the citation in Phase 4 was pointing at a requirement that, on
inspection, existed nowhere as a tracked task — just an assumption stated
once, in passing, inside the very bullet that was deferring work because
of it. Left unchecked, it would likely have stayed unbuilt indefinitely:
no phase's checklist ever asked for it, so nothing would have surfaced it
again. It's now tracked explicitly as its own item under Phase 5 (§4.5) —
not because the underlying need changed, but because it had never
actually been written down as a requirement until this pass caught the
gap between what was claimed and what was true.

## 6. Out of scope for now

- IaC scanning (Checkov/tfsec) — no Terraform/CloudFormation/K8s manifests
  exist yet; revisit in Phase 8, once Phase 7's Terraform exists to scan.
- Multi-repo / multi-target scanning — one fixed demo target by design.
- Auth/RBAC on the dashboard — single-user portfolio project, not a
  multi-tenant product.
- On-demand scanning (a dashboard "run scan now" button) — the pipeline
  stays push/PR-triggered only until authorization exists; once the
  dashboard is public (Phase 7), an unauthenticated trigger would let
  anyone on the internet repeatedly kick off scans and rack up GitHub
  Actions minutes / AWS cost.

## 7. Roadmap (not started)

| Phase | Scope |
| --- | --- |
| 5 — packaging | **Shipped.** Dockerfiles for `ingestion`/`dashboard`, root `docker-compose.yml`, `scan_runs` (one row per scan run, snapshotting open-finding counts by severity), and the root README's one-command run instructions — see [4.5](#45-packaging-ingestiondockerfile-dashboarddockerfile-docker-composeyml--shipped) |
| 6 — polish | Full end-to-end run, dashboard screenshots, interview-prep doc reconciled against what shipped |
| 7 — AWS deployment via Terraform (basic IaC) | Terraform-provisioned VPC/ECR/RDS/ECS/ALB stack, private DB + no hardcoded secrets + scoped security groups as non-negotiable defaults, first deploy run by hand — gets a real public URL — see [docs/PRD_PHASE7_AWS_DEPLOYMENT.md](PRD_PHASE7_AWS_DEPLOYMENT.md) |
| 8 — cloud-security automation (stretch) | CI-driven deploy job, GitHub OIDC auth for CI, `tfsec`/`checkov` scanning of the Terraform, a deeper least-privilege IAM audit pass |
| 9 — AI-generated fix review pipeline | LLM-proposed fixes for a handful of real findings, validated and documented against a reusable review checklist — see [docs/PRD_FIX_REVIEW.md](PRD_FIX_REVIEW.md) |

## 8. Success criteria

- A single CI run produces normalized, deduplicated findings queryable by
  severity and source within seconds of the run finishing — **met**
  (verified run above).
- The dashboard shows the same numbers the CI run's `/stats` smoke test
  printed, with no manual data entry — **met**.
- Every non-trivial design decision (target app choice, scanner set,
  dedupe strategy, defer-vs-build calls) is traceable to a written reason,
  not just code — **met**, tracked in [Plan_vigilant_engine.md](../Plan_vigilant_engine.md).

## References

- [ARCHITECTURE.md](../ARCHITECTURE.md) — system diagram, scanner
  coverage table, dedupe field table
- [Plan_vigilant_engine.md](../Plan_vigilant_engine.md) — phased task
  checklist with status
- [docs/THREAT_MODEL.md](THREAT_MODEL.md) — STRIDE analysis of the demo
  target
