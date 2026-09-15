# PRD — AI-Generated Fix Review Pipeline

**Status:** Not started (Phase 9 of `Plan_vigilant_engine.md`).
**Owner:** Deepesh Dang
**Last updated:** 2026-09-11
**Relationship to main project:** an extension of `vigilant-engine`
(see [docs/PRD.md](PRD.md)), reusing its ingestion DB and schema rather
than a new repo or a new pipeline.

## 1. Problem

vigilant-engine's Phases 1-4 prove the *finding* half of AppSec tooling:
run scanners, normalize output, dedupe, display. They prove nothing about
what happens next — someone has to fix each finding, and increasingly
that "someone" is an LLM proposing a patch rather than a human writing
one by hand. A Product/AppSec Engineer posting found during this
project's job search names exactly that gap: half the role is reviewing
AI-generated/automated code fixes for regressions and correctness
("agentic security remediation"), not just triaging scanner output.
Nothing in the current portfolio demonstrates the skill of validating
whether an AI-proposed fix actually closes a vulnerability without
introducing a new problem — as distinct from the (already-covered) skill
of finding the vulnerability in the first place.

## 2. Goal

Take a small number of real findings already sitting in vigilant-engine's
ingestion DB — from the actual CI run, not synthetic examples — have an
LLM (Claude Code) propose a concrete fix for each, and then run and
document the validation a human reviewer would actually perform: does it
apply cleanly, do tests confirm the vulnerability is closed, does it
regress anything else, does it actually address the reported CWE rather
than superficially papering over it. The **validation checklist itself**
is the primary artifact — reusable on any future AI-proposed fix, not
just these examples — because that is what the posting calls out by
name, more specifically than "fixed a few bugs with AI."

### Non-goals

- Not an auto-remediation pipeline. No step here writes code to a branch
  and merges it unsupervised; a human reviewer (this project) stays the
  gate between "AI proposed" and "shipped."
- Not fixing every finding, or even most of them. A small, deliberately
  varied sample (3-5 findings) chosen to cover different vulnerability
  *shapes* (code-level SAST, dependency SCA, a secret), not volume.
- Not a general-purpose AI code-review tool. Scoped strictly to
  security fixes for findings already in vigilant-engine's `Finding`
  schema.
- Not a model comparison. One LLM (Claude Code / Claude) is sufficient
  to demonstrate the review skill; this isn't a benchmark of which LLM
  writes better patches.
- Not fine-tuning or prompt-engineering research — uses Claude Code as
  it's normally used elsewhere in this project.

## 3. Users

Same audience as the main PRD: the project's author and the people
evaluating this work. The specific reader this project is aimed at is an
interviewer probing "can you tell me a fix an AI proposed was wrong, and
how you knew" — a question the main dashboard project doesn't answer.

## 4. Requirements

### 4.1 Finding selection

| Requirement | Detail |
| --- | --- |
| Must use real findings, not fixtures | Pulled via `GET /findings` against the actual CI run's 180 ingested findings — `ingestion/tests/fixtures/*.json` are synthetic (e.g. the Semgrep fixture is a Python `eval()` example; Juice Shop is a Node/TypeScript app, so real Semgrep findings look different and must be sourced from the real DB, not the test fixtures). |
| Sample must span different remediation shapes | At minimum: one SAST/code-level finding (Semgrep — a source-file patch), one SCA/dependency finding (npm audit or Snyk — a version bump, not a code patch), and one secret finding (gitleaks — remediation is "rotate + remove from history," not "edit code") if one exists in the real run; substitute a second SAST finding of a different CWE if not. The point is that "propose a fix" means something different per category, and the checklist has to hold up across all of them. |
| Sample size | 3-5 findings — enough to demonstrate the checklist generalizes, small enough to review each one with real depth rather than rubber-stamping. |

### 4.2 Fix generation

| Requirement | Detail |
| --- | --- |
| Fixes must be proposed against real code | For each selected finding, pull the actual vulnerable snippet from the `demo-target` submodule at the finding's `file_path`/`line_number` — not a paraphrase. |
| The AI's proposal must be recorded verbatim | Save the exact prompt (finding's `rule_id`, CWE/OWASP tags, description, file/line, real code context) and Claude's raw response, unedited, per finding — this is the "AI proposed X" half of the artifact, and it has to survive even when the verdict below is "reject," or the review has nothing to review. |
| Fix format | A diff/patch against the real file, applicable with `git apply` or by hand — not prose describing a fix. |

### 4.3 Review checklist (the core deliverable)

| Requirement | Detail |
| --- | --- |
| Checklist drafted before being run | Write the checklist's dimensions first, as a standalone template, before applying it to any specific finding — so it's demonstrably a reusable instrument, not a set of criteria reverse-engineered to fit whatever the AI happened to produce. |
| Checklist dimensions | (1) **Applies cleanly** — patch applies without conflict against the pinned Juice Shop commit; (2) **Vulnerability actually closed** — a test (existing, or a new minimal repro written for this exercise) demonstrates the original attack no longer works, e.g. the injection payload that used to execute now doesn't; (3) **CWE genuinely addressed, not superficially patched** — e.g. swapping `eval()` for `Function()` would fail this even though it "removes the flagged call"; (4) **No behavior regression** — the surrounding test suite (or a manual smoke check where no test exists) still passes / still behaves as intended for legitimate input; (5) **Maintainability** — is the fix idiomatic for the codebase, or a hack that happens to pass (4) and (2) but a human reviewer would still push back on. |
| Explicit verdict per finding | Accept / Accept with changes / Reject, with the reasoning written out — not just a checklist of ticks. |
| At least one non-trivial verdict | Don't cherry-pick only clean "Accept" outcomes. If the real 3-5 findings all happen to get clean AI fixes, deliberately dig for the case that doesn't (e.g. try a harder finding, or push on dimension (3) above) — the whole point of this project is demonstrating the *review* catches something, not that the AI is always right. |

### 4.4 Write-up

| Requirement | Detail |
| --- | --- |
| Per-finding doc | Original finding (linked to its `Finding.id`/`dedupe_hash`) → AI's proposed diff → checklist walkthrough → verdict, for each of the 3-5 findings. |
| Standalone checklist doc | The checklist itself extracted into its own document, written so it could be handed to someone reviewing a completely unrelated AI-proposed fix — this is the artifact the target posting names specifically. |

### 4.5 (Stretch) Schema integration

| Requirement | Detail |
| --- | --- |
| Optional dashboard visibility | A lightweight `fix_review` record (verdict, reviewer notes, link to the finding) so a reviewed finding's status is visible from the existing dashboard, using `FindingStatus.FIXED` as the terminal state on an "Accept." Explicitly stretch: risks turning a scoped review-skill demonstration into unscoped feature work on the dashboard, so it only happens after 4.1-4.4 are done and documented. |

## 5. Out of scope

- Automatic PR creation or merge of the AI's proposed fix.
- Re-running the scanners in CI against a patched fork of Juice Shop to
  confirm the finding disappears — Juice Shop is a pinned submodule, not
  a fork meant to carry permanent local patches; verification happens via
  targeted tests instead (4.3, dimension 2), not a full rescan.
- Comparing multiple LLMs or prompting strategies against each other.
- Building this as a repeatable *pipeline* (e.g. a script that runs this
  process automatically on new findings) — the deliverable is the
  worked examples plus a checklist a human runs, not automation of the
  human step this project exists to demonstrate.

## 6. Success criteria

- 3-5 real findings (sourced from the actual ingestion DB) reviewed
  end-to-end, each with a written verdict and reasoning.
- A standalone review checklist document that reads as reusable —
  someone unfamiliar with vigilant-engine could apply it to a different
  AI-proposed fix without modification.
- At least one finding's review surfaces something the checklist catches
  that a shallower "does it compile" check would have missed (a rejected
  fix, an "accept with changes," or a documented near-miss).
- Every proposed fix that gets rejected or modified is documented with
  the *reason*, not just the verdict — this is what turns the write-up
  into evidence of review judgment rather than a changelog.

## References

- [docs/PRD.md](PRD.md) — main vigilant-engine PRD (findings pipeline
  and dashboard this project extends)
- [Plan_vigilant_engine.md](../Plan_vigilant_engine.md) — Phase 9 tracks
  this project's task checklist
- `ingestion/app/schema.py` / `ingestion/app/models.py` — the `Finding`
  shape each reviewed record is sourced from
