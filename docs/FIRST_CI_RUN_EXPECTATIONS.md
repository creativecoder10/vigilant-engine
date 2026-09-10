# First real CI run — what to expect

Notes captured right before pushing Phase 3 (`security-scans.yml`) to
GitHub for the first time, so the reasoning behind what did or didn't
work on that first run isn't lost afterward.

## What "unverified" actually meant at this point

Before this push, `security-scans.yml` had never executed on GitHub's
infrastructure at all. Editing the workflow file locally, or even
committing it, does nothing by itself — GitHub Actions only runs when
GitHub's own servers receive a `push` or `pull_request` event against the
real, hosted repository. Local file changes and local commits are
invisible to it until they're actually pushed.

## The real state of the repo at this point (checked, not assumed)

- A real GitHub remote exists: `origin` →
  `github.com/creativecoder10/vigilant-engine`.
- Local `main` was **3 commits ahead of `origin/main`** — including the
  commit that originally added `security-scans.yml`
  (`90801af Add CI workflow for security scans and ingestion`). None of
  those 3 commits had ever been pushed.
- This meant the push described here would be the **first real execution
  of the entire Phase 3 pipeline** — not just the newest additions (the
  `pytest` gate, artifact uploads, run summary), but Semgrep, npm audit,
  Snyk, gitleaks, and the ingestion API starting up for the first time
  too.
- The Phase 3 note in `Plan_vigilant_engine.md` claiming "nothing pushed
  yet, repo has no commits" was already stale by this point — worth
  recording that it was caught and corrected against `git status`/`git
  log` rather than repeated at face value.
- The reporting changes themselves (`security-scans.yml` edits,
  `.github/scripts/write_run_summary.py`) were, at this point, still
  uncommitted working-tree changes — a plain `git push` would not have
  included them without `git add`/`git commit` first.

## What was actually checked before pushing, vs. what was still open

**Verified (static checks, before any real run):**
- The workflow YAML parses correctly and lists steps in the intended
  order.
- `write_run_summary.py` compiles cleanly.
- Its logic was checked directly against `/stats`'s real response shape
  by reading `ingestion/app/main.py`, not assumed.
- The `pytest` suite passes locally.
- `.venv/` and `node_modules/` are correctly gitignored, not accidentally
  tracked.

**Genuinely open until a real run happened:**
- Whether `pytest` passes under the CI runner's exact Python 3.11 setup,
  as opposed to whatever environment it had been run under locally.
- Whether `npm install` against the real Juice Shop submodule behaves
  cleanly on a fresh Ubuntu runner.
- Whether `write_run_summary.py` behaves exactly as designed against a
  *live* ingestion API process, rather than just read-verified logic —
  it had never actually been executed end-to-end before this push.

## The judgment call

Reasonably confident based on the static checks above, but not certain —
this was a genuine first run of the whole pipeline, and first CI runs
commonly surface one small surprise (a path, a version mismatch, a timing
issue) that only shows up once real infrastructure is involved. The plan
was: commit everything, push, then watch the run live in the repository's
**Actions** tab rather than assuming a clean pass, and debug directly
from whatever the log showed if something failed.
