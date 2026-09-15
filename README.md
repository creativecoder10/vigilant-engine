# vigilant-engine

A small AppSec findings pipeline: it takes output from several security
scanners (SAST, SCA, DAST, secret, and container scanning), normalizes all
of it into one shared schema, deduplicates repeat findings across scans,
and shows it all on a dashboard.

Built as a hands-on way to learn how tools like this actually work under
the hood.

## Start here

- [ARCHITECTURE.md](ARCHITECTURE.md) — the overall design: what talks to what, and why
- [Plan_vigilant_engine.md](Plan_vigilant_engine.md) — phased build checklist, what's done vs. still open
- [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md) — manual STRIDE analysis of Juice Shop, with confirmed findings (BOLA, JWT over-exposure, and more)
- [docs/BURP_TESTING_STEPS.md](docs/BURP_TESTING_STEPS.md) — live runbook for hands-on Burp Suite testing
- [docs/vigilant-engine-threat-modeling-plan.pdf](docs/vigilant-engine-threat-modeling-plan.pdf) — the phased threat-modeling plan (STRIDE + Threat Dragon + ATT&CK)
- [ingestion/README.md](ingestion/README.md) — the backend service itself: code layout, request flow diagrams, how to run it
- [docs/dashboard-anatomy.html](docs/dashboard-anatomy.html) — the frontend: annotated `dashboard/src/` file tree (Server vs. Client Components) and a request-flow diagram from browser to SQLite

## What's built so far

| Piece | Status |
| --- | --- |
| `demo-target/` — [OWASP Juice Shop](https://github.com/juice-shop/juice-shop), pinned as a git submodule at `v20.2.0` | done |
| `ingestion/` — FastAPI + SQLModel service: 6 scanner parsers, `/ingest`, `/findings`, `/stats`, `/scan-runs`, full test suite | done |
| `.github/workflows/` — CI running Semgrep, npm audit, Snyk, gitleaks, and OWASP ZAP against `demo-target/` and posting to `/ingest` | done (Trivy still open) |
| `dashboard/` — Next.js frontend reading the ingestion API, with a severity/source filter | done |
| `ingestion/Dockerfile`, `dashboard/Dockerfile`, `docker-compose.yml` | done |

## Quick start (Docker — one command)

Requires [Docker Desktop](https://www.docker.com/products/docker-desktop/)
running.

```bash
git submodule update --init   # demo-target is a submodule - empty without this
docker compose up --build
```

Then open:

- `http://localhost:3000` — Juice Shop (the scanned app)
- `http://localhost:8000/docs` — the ingestion API's interactive Swagger UI
- `http://localhost:3001` — the dashboard

Findings start empty until something feeds `/ingest` (a real scan, or a
manual seed). To try it with a real fixture right away:

```bash
curl -X POST http://localhost:8000/ingest -H "Content-Type: application/json" \
  -d "{\"source\": \"npm_audit\", \"repo\": \"juice-shop\", \"raw_output\": $(cat ingestion/tests/fixtures/npm_audit.json)}"
```

`findings.db` lives on a named volume, so it survives `docker compose down`
+ `up` — only `docker compose down -v` actually wipes it.

## Local dev (without Docker)

For iterating on one service at a time without a rebuild per change, see
[ingestion/README.md](ingestion/README.md) (native `venv`/`uvicorn` setup,
plus `curl` examples for every route) and
[dashboard/README.md](dashboard/README.md) (`npm run dev`).
