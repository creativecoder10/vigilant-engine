# Trivy Manual Testing Steps — live runbook + interview prep

> **One-liner:** Trivy is more like a container X-ray — it scans a *built
> Docker image's* OS packages and language deps, not a manifest file. Snyk
> and npm audit read `package.json`; Trivy reads what actually ended up
> inside the image, OS packages included.

Hands-on notes for setting up and running Trivy **by hand**, so "have you
used Trivy?" gets a real answer. Same rules as
`SNYK_MANUAL_TESTING_STEPS.md` / `GITLEAKS_MANUAL_TESTING_STEPS.md`: one
verified step at a time, this file is the source of truth for "what's
next."

## 📍 Progress at a glance

| # | Step | Status |
| --- | --- | --- |
| 1 | Understand what Trivy is / how it differs from Snyk, npm audit | ✅ Done (background, this session) |
| 2 | Confirm local `trivy` CLI works | ✅ Done — v0.74.0 |
| 3 | Scan the real target image (same one ZAP already uses in CI) | ✅ Done — `bkimminich/juice-shop:v20.2.0`, 163 findings |
| 4 | Post the real JSON to the ingestion API, confirm it lands in the dashboard | ✅ Done — **616 findings** confirmed in DB + dashboard (after fixing a `--repo` mistake, see below) |
| 5 | Wire a `Run Trivy` step into `security-scans.yml` | ✅ Done — mirrors the gitleaks pattern (pinned-version install script), reuses the image ZAP already pulls |
| 6 | Push/re-run CI, confirm `by_source.trivy` goes non-zero | ⬜ To do |

---

# ① Concepts

## What is Trivy?

**One sentence:** a container-image vulnerability scanner — it unpacks a
*built* Docker image and checks every OS package and language dependency
layer inside it against CVE databases, which is a different surface than
source-level SCA.

| | npm audit / Snyk | Trivy |
| --- | --- | --- |
| Category | SCA (source) | Container scanning |
| Reads | `package.json` / lockfile (declared deps) | A built image's actual filesystem layers (OS packages + language deps as *installed*) |
| Catches | A vulnerable library version your code declares | That, **plus** vulnerable OS packages (e.g. an old `openssl` baked into the base image) that no manifest file would ever show |
| Needs | A repo checkout | A built or pulled Docker image |

## Why this matters for the FE → DevSecOps pivot

A frontend engineer ships containers constantly (a Next.js app's Docker
image, a Vercel build, a CI runner image) without ever auditing what's
*inside* the base image. `npm audit`/Snyk only ever see what your app
declares — they're blind to the OS layer underneath. Trivy is the gate
that answers "is the `node:24` (or whatever) base image itself carrying
known CVEs" before that image ships. **FE analogy:** it's `npm audit`, one
layer deeper — auditing the OS the Node process runs on top of, not just
the packages Node imports.

## A wrinkle specific to this project: the target image is distroless

`demo-target/Dockerfile` builds OWASP Juice Shop on top of
`gcr.io/distroless/nodejs24-debian13` — a "distroless" base image, meaning
no shell, no package manager, and a deliberately minimal set of OS
packages (that's a hardening decision in its own right: smaller attack
surface, less for a scanner — or an attacker — to find). Practical effect:
Trivy's OS-package findings on this specific image may come back sparse;
most of what it finds will be in the Node/npm dependency layer instead.
Worth naming that up front rather than being surprised by a short OS
findings list.

## Trivy vs. Docker Scout

Both do the same job (container image CVE scanning); the choice is vendor,
not capability:

| | Trivy | Docker Scout |
| --- | --- | --- |
| Vendor | Aqua Security, open-source | Docker, Inc. — built into Docker Desktop/Hub |
| Where it runs | Standalone CLI, no Docker Desktop dependency | Tied to Docker tooling (`docker scout cves`, Desktop GUI) |
| Scope | Images, filesystems, git repos, k8s manifests, Terraform/IaC, SBOM generation | Primarily image scanning + policy/scorecard features |

Not wired into this project (yet) — parked as a legitimate future 7th
scanner (same "different DBs can disagree" logic as Snyk + npm audit) if
ever picked up, rather than pulled in mid-Trivy-setup.

## Which image to scan

CI's ZAP job already pulls `bkimminich/juice-shop:v20.2.0` straight from
Docker Hub (not a local build) to stand up the live app for the DAST scan.
Scanning that **same tag** for the manual Trivy walkthrough keeps it
realistic — it's the literal image this pipeline already runs elsewhere —
and skips a slower local multi-stage build.

## Tags vs. digests (seen in `docker pull` output)

A Docker **tag** (`v20.2.0`) is just a mutable label — it can, in theory,
be re-pushed later to point at different content. A **digest**
(`sha256:...`) is a hash of the image's actual content, so it can't drift.
`docker pull` prints the digest it resolved so you can see exactly what
you got, and this is also why Trivy's own report names the digest it
scanned, not just the tag — proof of exactly what was assessed, not just
what was asked for. Production pipelines sometimes pin deploys by digest
instead of tag for the same reason.

## Trivy also does secret scanning (overlap with gitleaks)

A plain `trivy image` scan runs **two scanners by default**: `vuln`
(CVEs) and `secret` (hardcoded credentials in the image layers) — same
category as gitleaks, different tool, same "two tools can disagree so run
both" defense-in-depth logic already used to justify Snyk + npm audit.

## Severity isn't always from one source

Trivy's own log: *"Using severities from other vendors for some
vulnerabilities."* When the OS vendor's own advisory feed (e.g. Debian's)
doesn't publish a severity rating for a given CVE, Trivy falls back to
another source (commonly NVD) for that rating — a useful nuance if asked
"where does severity come from" in an interview: it's not always one
single authoritative source.

---

# ② Real run

**Image scanned:** `bkimminich/juice-shop:v20.2.0` (digest
`sha256:8739101a...`, confirmed via `docker pull` in step 2)

**`trivy image -f json -o trivy-results.json bkimminich/juice-shop:v20.2.0`**
— real, observed confirmation of the distroless prediction made in ①:

```
Detected OS family="debian" version="13.6"
[debian] Detecting vulnerabilities...   pkg_num=13
Number of language-specific files       num=1
```

Only 13 OS packages found (a normal Debian image easily has 100+) — the
distroless base image is doing its job. One language-manifest file found
inside the image layers, scanned separately by Trivy's `node-pkg`
detector.

**Severity breakdown (163 total findings):**

| Severity | Count |
| --- | --- |
| CRITICAL | 9 |
| HIGH | 51 |
| MEDIUM | 79 |
| LOW | 24 |

Despite only 13 OS packages (distroless), 163 findings still came back —
almost all of these are the single Node/npm language-manifest layer
(`node-pkg`), not the OS layer. Confirms the earlier prediction: the
*OS* surface is minimal here, but the *language dependency* surface
inside the image is where Trivy actually earns its keep on this image.

## `post_to_ingestion.py` is shared, not CI-only

```
python3 .github/scripts/post_to_ingestion.py --source trivy --file trivy-results.json
```

| Part | Meaning |
| --- | --- |
| `python3 .github/scripts/post_to_ingestion.py` | Same script CI's `Ingest Snyk results` / `Ingest ZAP results` steps call — it lives under `.github/scripts/` but isn't CI-exclusive; running it by hand here rehearses exactly what the future CI step will do |
| `--source trivy` | Selects `app/parsers/trivy.py`'s `parse()` and tags every resulting row `source=trivy`, so the dashboard can filter/group by tool |
| `--file trivy-results.json` | The raw scanner output to normalize into the shared `Finding` schema |

**Result:** `Ingested 163 finding(s) from trivy` — matches the local
severity-breakdown count (163) exactly, the same cross-check used on the
Snyk run (192 ingested = 192 "vulnerable paths" the CLI itself reported).

## Real mistake, caught and fixed: `--repo` defaults to `unknown-repo` locally

`post_to_ingestion.py --repo` defaults to the `GITHUB_REPOSITORY` env var,
which only exists inside GitHub Actions. Run it locally without `--repo`
and findings get tagged `repo="unknown-repo"` instead of
`creativecoder10/vigilant-engine` — silently invisible-by-convention next
to the rest of this project's data, not an error.

Caught by querying the SQLite DB directly inside the ingestion container
rather than trusting the dashboard UI:

```bash
docker exec vigilant-engine-ingestion-1 python3 -c "
import sqlite3
conn = sqlite3.connect('/app/data/findings.db')
cur = conn.cursor()
cur.execute(\"SELECT repo, COUNT(*) FROM finding WHERE source='TRIVY' GROUP BY repo\")
print(cur.fetchall())
"
```

Fixed by re-running with the repo explicit:

```bash
python3 .github/scripts/post_to_ingestion.py --source trivy --file trivy-results.json --repo creativecoder10/vigilant-engine
```

...then deleting the 155 stray `unknown-repo` rows once the correctly-tagged
copy existed. **Final, clean total: 616 Trivy findings**, all under the
right repo. A separate, unrelated bug was discovered along the way: the
running dashboard container was a stale build (from 2026-09-15, two weeks
before a source-filter feature committed 2026-09-30) — rebuilt via
`docker compose build dashboard && docker compose up -d dashboard`. See
`APPSEC_INTERVIEW_QA_MASTER.md` for the Docker layers/image-vs-container
concepts that came out of debugging this.

**For CI, this isn't a risk** — `GITHUB_REPOSITORY` is always set inside
Actions, so the workflow step will tag findings correctly automatically.
This mistake was purely a local-run artifact.
