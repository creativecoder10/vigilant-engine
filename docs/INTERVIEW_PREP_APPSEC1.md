# Interview Prep Notes

What this project is meant to demonstrate, and how to talk about it.

## What an AppSec engineer actually does

Not just "runs scanners." The role, roughly:

- **Tooling & pipeline ownership** — wire SAST/SCA/DAST/secrets/container scanning
  into CI/CD so security signal shows up automatically, not on request.
- **Normalization & triage** — every scanner speaks a different format; someone
  has to collapse them into one shape, dedupe repeat findings across scans, and
  cut through false positives so developers trust the signal.
- **Prioritization** — not all findings are equal. Severity, exploitability,
  exposure (is this internet-facing?), and blast radius all factor into what
  gets fixed first.
- **Driving remediation** — the job isn't done at "found it." Tracking a
  finding from `open` → `triaged` → `fixed` (or `false_positive` /
  `ignored`, with a reason) across dev teams is most of the actual work.
- **Secure design & threat modeling** — reviewing designs before code exists,
  not just scanning after.
- **Build vs. buy** — deciding when to hand-roll tooling vs. adopt a platform
  (DefectDojo, ArmorCode, Wiz, Snyk's own platform, etc.) — see below.

## What this project demonstrates

| Skill | Where it shows up |
| --- | --- |
| Understands the SAST/SCA/DAST/secrets/container taxonomy | `ARCHITECTURE.md` scanner coverage table — six tools, five categories, deliberate choice of what to include and what to defer (IaC) |
| Can normalize heterogeneous data into one schema | `ingestion/app/schema.py` — the `Finding` model every scanner's output gets mapped into, explicitly modeled on the CIM (common information model) idea from log normalization |
| Understands dedup at scale | `dedupe_hash` + upsert-by-hash logic — the same finding reported on every scan doesn't become N rows, it updates `last_seen` |
| Can design a findings lifecycle | `FindingStatus` enum (`open` → `triaged` → `fixed` / `ignored` / `false_positive`) |
| Can build the full loop, not just the scan step | CI → ingestion API → DB → dashboard — the part most take-home projects skip |
| Practical judgment on tool choice | Chose Juice Shop over hand-writing vulnerabilities (recognizable, realistic, someone else's code so findings aren't "planted"); scoped out IaC scanning because there's no real IaC to scan yet, rather than adding fake infra just to have something to point a tool at |

## Build vs. buy — the Wiz angle

Commercial CNAPP/ASPM platforms (Wiz, Snyk's platform, ArmorCode, DefectDojo)
do a more polished, often cloud-native version of exactly this pipeline:
ingest many scanners' output → normalize → dedupe → prioritize by
exploitability/exposure → assign to owners → track to remediation.

**Calibrate the claim to what actually happened.** At a former employer, I
used Wiz's findings/dashboard to triage vulnerabilities — a consumer of its
output, not the person who configured, administered, or tuned it. Don't
upgrade that to "administered Wiz" or "day-to-day Wiz ownership" on a CV or
in an interview — operational questions about connector setup or rule tuning
would expose the gap fast. The accurate, still-strong framing: real
(if limited) production exposure as a user, *plus* hands-on build experience
on an analogous pipeline. Talking points:

- "I used Wiz in a previous role to triage findings — I wasn't the admin,
  but I worked with its output day to day. To understand what's happening
  underneath that dashboard, I built a small version of the aggregation
  layer myself: mapping several scanners' formats into one schema, dedup by
  a stable hash, tracking lifecycle state."
- If asked to compare to Wiz directly: this project solves normalization and
  dedup; Wiz's actual differentiator is the **Security Graph** — correlating
  findings *across* modules (a vulnerable workload + internet exposure + an
  over-privileged identity = a "toxic combination"/attack path), which is a
  materially harder, graph-based correlation problem this project doesn't
  attempt. Naming that distinction accurately is worth more than a vague
  "I've used it before."
- If asked "why not just use an existing platform for this project" — the
  point isn't to replace Wiz, it's a learning/demonstration exercise; a real
  org would evaluate build vs. buy on cost, coverage, integration surface,
  and whether their scanners are already supported out of the box.

## How this maps to Wiz's actual modules

For grounding the conversation accurately, not for claiming hands-on use:

| Wiz module | What it does | Equivalent here |
| --- | --- | --- |
| Vulnerability Management (agentless) | Scans cloud workloads for known CVEs in OS packages/libraries | npm audit + Snyk (SCA) |
| Code Security | Shift-left: IaC misconfig, secrets detection, SAST, pre-merge | Semgrep + gitleaks |
| Container & Kubernetes Security | Image vulnerabilities, K8s misconfig, runtime posture | Trivy |
| CSPM | Cloud resource misconfiguration | out of scope — no cloud infra yet |
| CIEM | Identity & entitlement risk | not modeled in our schema |
| **Security Graph** | Correlates findings across all modules into attack paths/toxic combinations | **not attempted** — our dashboard is a flat, deduped list by severity, not a correlated graph |

## Build log — decisions made along the way

Real engineering judgment calls worth being able to narrate, not just the
finished architecture:

- **Git submodule, not a vendored copy, for `demo-target/`.** Juice Shop is
  ~1,300 dependencies and its own multi-year commit history — pulling that
  into our own repo's history would bury our actual work. A submodule pins
  us to one exact commit while keeping it a separate, referenced repo. This
  is the same reasoning a real org applies to any third-party code brought
  in for testing: track it, don't absorb it.
- **Pinned to an exact tag (`v20.2.0`), not `main`.** Tracking a moving
  branch means scan results drift under you — a finding that was there
  yesterday might be gone today because upstream shipped a fix, with no
  change on our side. Pinning makes scans reproducible and any given
  finding traceable to a specific, citable version.
- **Caught my own mistake mid-task**: first pass picked `v9.3.1` as
  "latest" from a `git ls-remote --tags` list that turned out to be
  truncated/unsorted, not chronological. Re-ran it sorted by actual semver
  and found the real latest (`v20.2.0`) before anything downstream depended
  on the wrong version. Worth mentioning in an interview as an example of
  verifying an assumption instead of trusting the first plausible answer —
  a very AppSec-relevant habit (don't trust unverified input, including
  your own tooling's output).
- **Ran Juice Shop natively via `npm start`, not Docker, for local dev.**
  No Docker/Colima installed on this machine yet, and GitHub Actions
  already ships Docker for CI — so local Docker setup isn't a blocker for
  making progress, only for later phases (packaging `ingestion/`/`dashboard/`
  as images) that actually need it. A pragmatic sequencing call: don't let
  environment setup block a step that doesn't require it.
- **First real data point, before the pipeline even exists**: `npm install`
  inside `demo-target/` surfaced npm audit's own findings for Juice Shop's
  dependencies — **46 vulnerabilities (7 critical, 19 high, 17 moderate,
  3 low)**. That's a concrete answer ready for "tell me about a real finding
  this caught" once one of them is picked out and mapped to an OWASP Top 10
  category (still open, below).

## Build log, continued — Phase 2 (the ingestion service)

- **Normalization is a per-tool judgment call, not a mechanical mapping.**
  Every parser has to decide how a tool's own vocabulary maps onto
  `critical/high/medium/low/info`: Semgrep's ERROR/WARNING/INFO doesn't
  correspond to CVSS-style severity at all (it's about rule confidence, not
  impact), ZAP buries severity inside a string like `"High (Medium)"`
  (risk + confidence combined), and gitleaks emits no severity at all - it
  either matched a secret pattern or it didn't, so every hit was assigned a
  fixed CRITICAL. Being able to explain *why* each mapping was chosen, not
  just that it exists, is the actual skill being demonstrated.
- **Dedup key differs by finding type, and that's intentional.** SAST/secret
  findings are identified by rule + file + line; SCA/container findings by
  rule + package name (since two different packages can share one CVE);
  DAST findings by rule + URL (there's no file at all - it's a running app,
  not source code). One hash function, six different choices of what to
  feed it.
- **Real validation, not just fixture data**: ran `npm audit` against Juice
  Shop itself and posted the actual raw output through the live `/ingest`
  endpoint - not a canned test fixture. All 46 real vulnerabilities came
  out normalized correctly, with severity counts matching npm's own report
  (7 critical, 19 high, 17 medium, 3 low). Re-posting the same payload
  updated the existing rows' `last_seen` rather than duplicating them,
  confirming the dedupe design works against real-world data, not just
  hand-crafted test cases.
- **A genuine debugging moment**: the first version of the end-to-end tests
  failed with `no such table: finding`, even though the tables were created
  right before the request ran. Root cause: SQLAlchemy's default
  connection pool hands out a *new, empty* in-memory SQLite database on
  every connection checkout unless you pin it to one connection
  (`poolclass=StaticPool`). This is a well-known but non-obvious gotcha -
  a good example to have in your back pocket for "tell me about a bug you
  had to actually debug," since the fix required understanding what the
  ORM was doing underneath the test, not just retrying something.
- **SQLModel as one class for two jobs**: `Finding` is simultaneously the
  SQL table definition and the API's request/response schema. The
  trade-off is worth being able to state plainly: it's less code to
  maintain, at the cost of exposing every database column directly through
  the API - fine for an internal tool, not something you'd do for a
  public-facing one without a narrower response model in front of it.

## Likely interview questions this project prepares you for

- "Walk me through how you'd take output from three different scanners and
  turn it into one dashboard." → walk the architecture diagram.
- "How do you avoid the same finding showing up as a new ticket every scan?"
  → `dedupe_hash`, upsert, `first_seen`/`last_seen`.
- "What's the difference between SAST, DAST, and SCA, and why do you need
  more than one?" → scanner coverage table; each tests a different surface
  (your code / the running app / your dependencies) and none subsumes the
  others.
- "How would you prioritize a backlog of hundreds of findings?" → severity +
  exploitability + exposure, not just raw scanner severity.
- "Would you build this or buy a platform?" → see build vs. buy above.

## Open — fill in once built

- [x] Raw evidence that the target has real, non-trivial findings: `npm
      install` in `demo-target/` reported 46 vulnerabilities (7 critical, 19
      high, 17 moderate, 3 low) via npm audit, before any of our own tooling
      ran — see build log above
- [ ] A specific finding this pipeline caught in Juice Shop, and how it maps
      to a real-world OWASP Top 10 category
- [ ] One false positive you had to handle, and how the schema represents that
      decision (`status: false_positive`)
- [ ] A screenshot-worthy dashboard view for the portfolio writeup
