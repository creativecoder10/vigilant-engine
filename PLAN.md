# Build Plan

Phased checklist for `vigilant-engine`. See [ARCHITECTURE.md](ARCHITECTURE.md)
for the target shape.

## Phase 0 — Docs

- [x] `ARCHITECTURE.md` — solution architecture, scanner coverage, bill of materials
- [x] `ingestion/app/schema.py` — shared `Finding` / `IngestRequest` models
- [x] `PLAN.md` (this file)
- [x] `docs/INTERVIEW_PREP_APPSEC1.md` — how this project maps to the AppSec engineer role
- [x] `docs/THREAT_MODEL.md` — manual STRIDE analysis of Juice Shop (confirmed findings, in progress)
- [x] `docs/BURP_TESTING_STEPS.md` — live runbook for hands-on Burp Suite testing
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

- [ ] Workflow: run Semgrep, npm audit, Snyk, gitleaks against `demo-target/` source
- [ ] Workflow: boot Juice Shop in a container, run ZAP baseline scan against it
- [ ] Workflow: build `ingestion/` and `dashboard/` images, run Trivy against them
- [ ] Each job POSTs its raw output to the ingestion API's `/ingest`

## Phase 4 — dashboard (`dashboard/`)

- [ ] Next.js app scaffold (App Router + TypeScript)
- [ ] `src/lib/` — typed client for the ingestion API
- [ ] `src/types/` — TS types mirroring `Finding`
- [ ] `src/components/` — findings table, severity chart, open-vs-fixed trend
- [ ] Landing page pulling real data from `/findings` and `/stats`

## Phase 5 — packaging

- [ ] `ingestion/Dockerfile`, `dashboard/Dockerfile`
- [ ] Root `docker-compose.yml` wiring demo-target + ingestion + dashboard together
- [ ] `README.md` — one-command local run instructions

## Phase 6 — polish

- [ ] Run the full pipeline once end-to-end, seed real findings
- [ ] Screenshot the dashboard for the README / portfolio writeup
- [ ] Review `INTERVIEW_PREP.md` against what actually got built
