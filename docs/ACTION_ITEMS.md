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

Split out into its own doc, since it's the one item here with actual
steps and a verification target rather than a one-off: see
[SNYK_PHASE3_APPLICATION.md](SNYK_PHASE3_APPLICATION.md). Short version:
wiring in a real Snyk account upgrades "adjacent exposure to Snyk at a
former employer" into genuine hands-on CLI/SCA-scanning experience —
worth doing for the interview-framing upgrade alone, scope stated
precisely in that doc rather than rounded up.

## 2. Cross-check the two threat-model files

`demo-target/threat-model.json` (Juice Shop's own official OWASP Threat
Dragon model, shipped by the real maintainers as part of the pinned
`v20.2.0` release) vs. `docs/juice-shop-threat-model.json` (this
project's own rebuild — the original is an old Threat Dragon v1.x format
the current app can't open, so this project's version was rebuilt from
its element/flow list as ground truth, with this project's own trust
boundaries and 10 confirmed findings attached). Optional: read through
the official one for any data flow or trust boundary this project's
rebuild missed.

## 3. Personal review items — not code changes

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
- Install the **Semgrep** VS Code extension (marketplace listing:
  "Semgrep" by Semgrep Inc.) and try it on `demo-target/`. Same engine,
  same JSON underneath as the terminal walkthrough — it just runs
  `semgrep` automatically in the background on every save instead of you
  typing the command, showing red/yellow squiggly underlines directly
  under flagged code with a hover tooltip, exactly like ESLint's VS Code
  extension does for lint errors today (security rules instead of style
  rules). Everything so far (`docs/SEMGREP_MANUAL_TESTING_STEPS.md`) has
  been terminal-only — worth seeing the other front door firsthand,
  optional breadth rather than required.
