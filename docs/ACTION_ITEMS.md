# Optional action items — parking lot, not yet decided

Suggested 2026-09-11, reconciled 2026-09-15 against what had actually
shipped by then (Phase 5 packaging done, Phase 7's AWS/Terraform plan
already written in [PRD_PHASE7_AWS_DEPLOYMENT.md](PRD_PHASE7_AWS_DEPLOYMENT.md)).
That reconciliation already dropped two items from the original
suggestion list: "pick a lightweight host" and "SQLite vs. Postgres" are
both superseded by Phase 7's existing AWS plan (which already answers
the database question — `rds.tf` — and the hosting question), so they're
not repeated here. Nothing below is scheduled into a phase; it's
recorded so it isn't lost, not so it gets done automatically.

## 1. Real Snyk integration — optional, directly relevant to interview framing

Right now `security-scans.yml`'s Snyk step only runs `if: env.SNYK_TOKEN
!= ''` — no account exists yet, so it silently no-ops every run. Creating
a free Snyk account and adding `SNYK_TOKEN` as a GitHub Actions secret
would let a real `snyk test` run against Juice Shop in CI.

**Why this one specifically matters for interview framing**, not just as
a checklist item: it upgrades "I've seen Snyk used at a former employer"
(adjacent exposure) to "I integrated Snyk into a CI pipeline myself,
handled its CLI output, normalized it into the same schema as the other
five scanners" — a materially stronger, more defensible claim. The
precise, honest scope of that claim: hands-on with **Snyk's CLI /
dependency (SCA) scanning in CI**, specifically. Not the same as
experience with Snyk's broader enterprise platform (org-level policy
management, container/IaC scanning modules, its web triage UI at scale)
— worth stating that boundary precisely rather than rounding up, same
discipline used elsewhere in this project's interview-prep notes.

## 2. Dashboard screenshot for the README / portfolio writeup

Still open on the Phase 6 checklist. A real screenshot now exists to use
(seeded with real CI findings, verified in both light and dark mode) —
this is just capturing and placing it, not new build work.

## 3. Cross-check the two threat-model files

`demo-target/threat-model.json` (Juice Shop's own official OWASP Threat
Dragon model, shipped by the real maintainers as part of the pinned
`v20.2.0` release) vs. `docs/juice-shop-threat-model.json` (this
project's own rebuild — the original is an old Threat Dragon v1.x format
the current app can't open, so this project's version was rebuilt from
its element/flow list as ground truth, with this project's own trust
boundaries and 10 confirmed findings attached). Optional: read through
the official one for any data flow or trust boundary this project's
rebuild missed.

## 4. Personal review items — not code changes

These aren't things anyone can do except you, which is exactly why they
belong on this list rather than a code checklist:

- Walk through what's been written into the interview-prep doc (Phase 4
  build/blockers, the Phase 5 hosting reasoning, the severity-filter
  Server/Client Component split) and check it can be explained **without
  the notes open** — that's the actual test of whether it's internalized.
- Click through a real CI run and the live dashboard yourself in a
  browser. Most of the verification work so far has driven both through
  the GitHub API/CLI on your behalf — worth seeing the Actions log and
  the severity filter working firsthand before it comes up in
  conversation.
