# vigilant-engine

A small AppSec findings pipeline: it takes output from several security
scanners (SAST, SCA, DAST, secret, and container scanning), normalizes all
of it into one shared schema, deduplicates repeat findings across scans,
and (eventually) shows it all on a dashboard.

Built as a hands-on way to learn how tools like this actually work under
the hood - see [docs/INTERVIEW_PREP_APPSEC1.md](docs/INTERVIEW_PREP_APPSEC1.md) for
what it's meant to demonstrate, and why.

## Start here

- [ARCHITECTURE.md](ARCHITECTURE.md) — the overall design: what talks to what, and why
- [PLAN.md](PLAN.md) — phased build checklist, what's done vs. still open
- [docs/INTERVIEW_PREP_APPSEC1.md](docs/INTERVIEW_PREP_APPSEC1.md) — how this maps to the AppSec engineer role
- [docs/THREAT_MODEL.md](docs/THREAT_MODEL.md) — manual STRIDE analysis of Juice Shop, with confirmed findings (BOLA, JWT over-exposure, and more)
- [docs/BURP_TESTING_STEPS.md](docs/BURP_TESTING_STEPS.md) — live runbook for hands-on Burp Suite testing
- [docs/vigilant-engine-threat-modeling-plan.pdf](docs/vigilant-engine-threat-modeling-plan.pdf) — the phased threat-modeling plan (STRIDE + Threat Dragon + ATT&CK)
- [ingestion/README.md](ingestion/README.md) — the backend service itself: code layout, request flow diagrams, how to run it

## What's built so far

| Piece | Status |
| --- | --- |
| `demo-target/` — [OWASP Juice Shop](https://github.com/juice-shop/juice-shop), pinned as a git submodule at `v20.2.0` | done |
| `ingestion/` — FastAPI + SQLModel service: 6 scanner parsers, `/ingest`, `/findings`, `/stats`, full test suite | done |
| `.github/workflows/` — CI running the scanners against `demo-target/` and posting to `/ingest` | not started |
| `dashboard/` — Next.js frontend reading the ingestion API | not started |

## Quick start

```bash
# the target app the scanners run against
cd demo-target && npm install && npm start   # http://localhost:3000

# the ingestion service, in another terminal
cd ingestion
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000    # http://localhost:8000/docs
```

Then feed it a real scan (see [ingestion/README.md](ingestion/README.md)
for the full walkthrough, including `curl` examples):

```bash
cd demo-target && npm audit --json > /tmp/audit.json
```
