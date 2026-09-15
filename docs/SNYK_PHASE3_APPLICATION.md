# Applying real Snyk in Phase 3 — optional, not yet decided

Split out from [ACTION_ITEMS.md](ACTION_ITEMS.md) into its own doc since
this is the one item on that list worth tracking on its own — the others
(screenshot, threat-model cross-check, personal review) are small or
one-off; this one is an actual small project with its own steps and a
concrete verification target.

## Why this one specifically

`security-scans.yml`'s Snyk step only runs `if: env.SNYK_TOKEN != ''` —
no account exists yet, so every CI run so far has silently skipped it
(confirmed in the successful Phase 3 run: `by_source.snyk` was `0`, and
both `Run Snyk` / `Ingest Snyk results` steps showed `skipped`).

Getting a real account wired in upgrades "I've seen Snyk used at a
former employer" (adjacent exposure, per the job-search framing this
project's interview-prep notes already track) into "I integrated Snyk
into a CI pipeline myself, handled its CLI output, normalized it into
the same schema as the other five scanners" — a materially stronger,
more defensible interview claim.

**The honest scope of that claim, stated precisely rather than rounded
up:** this gives hands-on experience with Snyk's **CLI / dependency
(SCA) scanning in CI**, specifically. It is *not* the same as experience
with Snyk's broader enterprise platform — org-level policy management,
container/IaC scanning modules, its web triage UI at scale. Worth
naming that boundary out loud before it comes up as a follow-up
question, not after.

## Current state (as of this writing)

- [x] `snyk test --json` step already written in `security-scans.yml`,
      gated behind `env.SNYK_TOKEN`.
- [x] `Ingest Snyk results` step already written, same gate.
- [x] `app/parsers/` already has a Snyk parser and a fixture-based test
      for it (`tests/test_parsers.py`) — the ingestion side of this is
      already built and already verified against fixture data. What's
      missing is purely "does a real account exist to generate real
      output."
- [ ] No Snyk account exists yet.
- [ ] `SNYK_TOKEN` isn't set as a GitHub Actions secret on the repo.

## Steps to actually do it

1. Create a free Snyk account at snyk.io (free tier covers open-source
   dependency scanning, which is what `snyk test` against
   `demo-target`'s `package.json` needs).
2. Generate an API token from the Snyk account settings.
3. Add it as a repository secret: GitHub repo → Settings → Secrets and
   variables → Actions → New repository secret → name it `SNYK_TOKEN`.
4. Push any commit (or re-run the existing workflow) to trigger
   `security-scans.yml` again.
5. **Verify, don't assume** — same habit as every other change in this
   project:
   - In the Actions log, confirm `Run Snyk` and `Ingest Snyk results`
     actually ran (`success`, not `skipped`).
   - Confirm `snyk-results.json` is real Snyk output, not empty — check
     the `raw-scanner-output` artifact.
   - Confirm the run summary's `by_source.snyk` count is non-zero (or
     legitimately zero if Juice Shop's dependencies happen to be clean
     against Snyk's specific database — worth reading the raw JSON to
     tell the difference between "zero findings" and "the step silently
     failed").

## Not in scope here

Snyk also offers container scanning and IaC scanning as separate
products/CLI subcommands — out of scope for this item, which is
specifically the dependency (SCA) scan already wired into the pipeline
alongside npm audit. Container scanning is already covered by Trivy in
this project's design (see `ARCHITECTURE.md`'s scanner coverage table),
so there's no gap this would be filling.
