# Semgrep Manual Testing Steps — live runbook

Working checklist for running Semgrep **by hand**, outside the CI pipeline
and outside `ingestion/app/parsers/semgrep.py` — the goal is hands-on
familiarity with the tool itself (install it, run it raw, read its actual
JSON output) so it can be spoken to in an interview, not just referenced as
"a step in my pipeline." This file gets updated as we go, one verified step
at a time — always follow *this* file for "what do I do next." General
Semgrep/SAST concepts go in the cross-project interview-prep doc, not here;
this file is just the step list and what actually happened at each step.

## Related general concepts (not duplicated here — see master doc)

General Semgrep/SAST theory lives in `job prep notes/APPSEC_INTERVIEW_QA_MASTER.md`
§20, not here (per this file's own rule above). Covered there so far:

- Engine (binary) vs. rules — how `--config auto`/`p/`/`r/`/local files resolve
- Is the registry a CDN? Is it versioned like npm? (no to both)
- Who writes rules — company/license split, Opengrep fork, why it's not CVE-based (SAST vs. SCA)
- Why it's not "just grep, optimized" — AST/structural matching vs. text/regex, with examples
- Do you need to upgrade the Semgrep version before every scan? (no — engine vs. rule freshness are independent)
- AST vs. Virtual DOM/tree-shaking — what's actually analogous (ESLint's visitor pattern) vs. what isn't

## Framing — why do this manually at all

The pipeline (`.github/workflows/security-scans.yml`, Phase 3) already runs
Semgrep automatically on every push, and `ingestion/app/parsers/semgrep.py`
already knows how to turn its output into a `Finding` row. None of that
replaces actually having typed the command yourself and looked at a real
result — an interviewer asking "have you used Semgrep" is asking about
*this*, not about the parser code.

## ✅ Setup

- [x] Checked whether Semgrep was already installed: `semgrep --version` →
      `command not found` — not installed yet, starting from scratch.

- [x] Installed via Homebrew: `brew install semgrep`

## Concept — what's a "CLI orchestration language"?

The language your terminal command is written in, whose job is to parse
flags, load config, and **hand the real work off** to something else —
rather than doing the heavy lifting itself. Semgrep's `python` layer is
this: it never parses your source code itself, it just sets everything up
and calls the compiled OCaml engine to actually do that.

Same shape you already know from the frontend — webpack's own CLI is
JavaScript, but it shells out to a precompiled Rust binary (SWC/esbuild)
for the actual fast parsing/minifying, because plain JS is too slow for
that part.

```
 you type:  $ semgrep scan --config auto demo-target/
                    │
                    ▼
        ┌───────────────────────────┐
        │   Python  (orchestration) │   parses flags, loads rules,
        │   the "semgrep" CLI       │   talks to the rule registry
        └─────────────┬─────────────┘
                       │ hands off the actual work
                       ▼
        ┌───────────────────────────┐
        │   OCaml   (the engine)    │   parses your source,
        │   pre-compiled binary     │   matches patterns — fast
        └─────────────┬─────────────┘
                       │ returns results as JSON
                       ▼
        ┌───────────────────────────┐
        │   Python prints/formats   │   → findings on your screen
        └───────────────────────────┘

 same shape, frontend side:
 $ webpack build → JS CLI (orchestration) → SWC/esbuild binary, Rust (engine) → JS prints the result
```

- [x] Confirmed the CLI works: `semgrep --version` → `1.176.0`

## Concept — flags, config, and the handoff, concretely

Using the exact command about to run: `semgrep --config auto demo-target/`
— run from the **repo root** (`vigilant-engine/`), not from inside
`demo-target/`, since the path is relative.

**Parsing flags** — turning the raw text typed into a structured object the
program can act on:

| typed | parsed into |
| --- | --- |
| `--config auto` | `config: "auto"` |
| `demo-target/` | `target: ["demo-target/"]` |
| *(nothing)* | `json: false`, `severity: None`, `metrics: "on"` (defaults) |

Same job any Node CLI does — `webpack --mode production` becomes
`{ mode: "production" }` before webpack touches a file.

**Loading config** — resolving "which rules do I check for?" `auto` = look
at the languages actually in `demo-target/` (JS/TS/Node) and pull a curated
default ruleset for them from Semgrep's registry. A rule is just a data
record — closest existing thing: one entry in an `.eslintrc` rules block,
just far more expressive (matches the parsed code structure, not a fixed
lint checklist):

```yaml
rules:
  - id: hardcoded-secret
    languages: [javascript]
    severity: ERROR
    message: "Hardcoded secret literal"
    pattern: const $VAR = "..."
```

`--config` could instead point at a rules file written by hand, or a named
registry ruleset (`p/owasp-top-ten`) — `auto` just picks one automatically.

**The "something else" it hands off to** — the compiled OCaml binary. Once
Python has (1) the parsed flags and (2) the rules loaded as data, it has
everything the engine needs: which files, which patterns. It calls that
binary with those two things, and *that's* where the expensive work
happens — parsing every file into an AST (the code's real structure, not
text) and matching every rule against every AST. Python's job ends the
moment it hands off; it only wakes back up to print whatever JSON comes
back.

### Correction — are "flags and config" the input to the binary?

Not quite as stated — it's not the raw flags themselves, it's what they
**resolve into** that crosses the boundary into the binary. Most flags are
consumed by Python and never reach the binary at all:

| What | Becomes input to the OCaml binary? |
| --- | --- |
| `--config auto` | Not the string `"auto"` — Python resolves it into actual rule definitions first; **those** get passed in |
| `demo-target/` | Yes — the resolved list of target files to scan |
| `--json` | No — controls how *Python* formats the binary's output afterward |
| `--metrics=on/off` | No — Python's own telemetry call to Semgrep's servers, engine never sees it |
| `--verbose` | Mostly no — Python-side logging |

The binary's real inputs, precisely: **which files** and **which
rules-as-data**. Flags are just one path to deciding those two things —
plenty of flags configure Python's own behavior and stop there.

- [x] Ran `semgrep --config auto demo-target/` from the repo root. Real
      result: **68 findings (68 blocking)**, 408 rules run, 1,027 targets
      scanned, ~99.9% parsed, 2 files skipped (>1.0 MB), 156 files skipped
      via `.semgrepignore`, scan limited to git-tracked files.

## Concept — where do results actually go: text, file, or GUI?

Default is plain stdout (what just printed) — not a file, just printed
live. Real output options:

| Option | What you get |
| --- | --- |
| `--json --output results.json` | raw JSON written to a file — the exact shape `ingestion/app/parsers/semgrep.py`'s `parse()` expects |
| `--sarif` | SARIF format — the standard GitHub's own "Security" tab reads (upload it, findings sit next to Dependabot/CodeQL) |
| VS Code / IntelliJ extension | inline squiggly-underline findings while typing — same idea as ESLint's editor integration |
| `semgrep login` + Semgrep AppSec Platform | Semgrep's own hosted dashboard (the "Pro rules" upsell message is about this) |

Worth saying in an interview: Semgrep has its own SaaS dashboard, but this
project deliberately built a custom one instead — one dashboard normalizing
six scanners, not six separate GUIs.

**SARIF → GitHub Security tab, concretely.** Uploading a SARIF file (via
the `github/codeql-action/upload-sarif` Action step) makes findings show up
in the repo's own **Security → Code scanning** tab — one row per finding:
severity, rule name, file/line, and an open/dismiss workflow. Same shape as
this project's own dashboard, just GitHub's built-in UI instead of a custom
one. **Not wired up yet** in `security-scans.yml` — a real, separate CI
change, not part of this manual walkthrough.

**VS Code / IntelliJ extension, concretely.** A different front door to the
*same* engine — it runs `semgrep` automatically in the background every
time a file is saved, instead of typing the command by hand. Findings show
as squiggly underlines directly under the flagged code, with a hover
tooltip explaining the rule — exactly like ESLint's VS Code extension does
for lint errors today. Same binary, same JSON underneath; different UI
wrapping it. Not installed as part of this walkthrough (terminal-only so
far) — optional to try later.

## Concept — rulesets an AppSec engineer should know

| `--config` value | What it runs | Concretely |
| --- | --- | --- |
| `auto` (used above) | auto-detected language + curated defaults | Semgrep scans the target dir's file extensions/imports to guess what's present (e.g. `.tsx` + `import react` → React detected), then requests the registry's *default recommended* rules for exactly those languages/frameworks. You pick nothing — it decides for you. |
| `p/ci` | curated, lower-noise baseline meant for CI gates | A hand-picked *subset* of registry rules Semgrep's team has judged low-false-positive — **not** the same axis as a rule's `severity` field. `severity` (`ERROR`/`WARNING`/`INFO`) decides if one finding blocks the build once it fires; pack membership (is a rule ID even *in* `p/ci`) is a separate curation call — a rule can be `ERROR`-severity and still be excluded from `p/ci` if the team judged it too noisy for an unattended gate. Same shape as `eslint:recommended` being a hand-picked subset of a plugin's rules, not "every rule marked error." |
| `p/owasp-top-ten` | rules mapped to OWASP Top 10 categories | Every rule in the registry carries metadata tags, e.g. `owasp: A03:2021 - Injection`. This config is just a saved *filter* — pull every rule, from any language/pack, whose tag matches one of the 10 OWASP categories. Same underlying rules as elsewhere, regrouped by that taxonomy. |
| `p/security-audit` | broad general security ruleset | A large, multi-vulnerability-class collection (SQLi, XSS, SSRF, weak crypto, path traversal, etc.) spanning many languages — not filtered to one framework or one standard like OWASP. The "run everything relevant" option — higher rule count, so expect more findings/noise than `p/ci`. |
| `p/secrets` | hardcoded secrets — overlaps with `gitleaks` elsewhere in this pipeline | Pattern-matches likely credential shapes in code (`AWS_SECRET = "..."`, API key literals) — same *goal* as `gitleaks`, but `gitleaks` regex-scans git history/blobs while this is AST-based and only sees the current checkout. |
| `p/<language>` (`p/javascript`, `p/python`, ...) | language-specific curated sets | Every rule tagged for that one language specifically — e.g. `p/javascript` includes prototype-pollution and Node-specific idioms. Narrower than `security-audit` (one language), not filtered by standard like `owasp-top-ten`. |
| a `.yml` file written by hand | custom org-specific rules — the actual skill an interviewer probes for, not just which registry set was picked | See example below — a rule nobody in the public registry would write because it only makes sense for *this* codebase's own conventions. |

**Example custom rule** — flagging raw SQL string-building (the kind of
org-specific check no public ruleset would include, because it depends on
knowing *this* codebase uses a `cursor.execute(...)` pattern):

```yaml
rules:
  - id: raw-sql-fstring
    languages: [python]
    severity: ERROR
    message: >-
      Possible SQL injection: query built with an f-string/%-format instead
      of a parameterized query. Use cursor.execute(query, params) instead.
    patterns:
      - pattern-either:
          - pattern: $CURSOR.execute(f"...")
          - pattern: $CURSOR.execute("..." % ...)
    metadata:
      owasp: "A03:2021 - Injection"
      cwe: "CWE-89"
```

Run it standalone with `semgrep --config path/to/raw-sql-fstring.yml .` —
same invocation shape as `--config auto`, just pointing at a local file
instead of the registry.

Two things from the real output above, worth being able to explain:

- **"68 blocking"** — a rule's severity determines whether it's meant to
  fail a CI gate/PR ("blocking") or just get logged. Same shape as the
  `|| true` already understood on the ZAP step in Phase 3 — some findings
  are informational, some are meant to stop the pipeline.
- **"Missed out on 1856 pro rules"** — an upsell for logging in. The free
  OSS engine does single-file pattern matching; Pro adds a larger curated
  library plus cross-file/cross-function analysis. Either way, the real
  engine ran — just against the smaller free ruleset.

## ✅ Raw JSON output

**Goal:** see the exact JSON shape `ingestion/app/parsers/semgrep.py`'s
`parse()` expects, straight from the tool, before touching that file.

- [x] Ran, from the repo root:

  ```bash
  semgrep --config auto --json --output semgrep-results.json demo-target/
  ```

  Verified: `semgrep-results.json` written (347 KB), valid JSON, top-level
  keys `version, results, errors, paths, time, engine_requested,
  skipped_rules, profiling_results`, `len(results) == 68` — matches the 68
  findings the terminal reported earlier.

- [x] Opened one real entry under `"results"` — a
      `github-actions-mutable-action-tag` finding on
      `demo-target/.github/workflows/ci.yml:188`. Confirmed it matches what
      `parse()` expects: `check_id`, `path`, `start.line`, `extra.message`,
      `extra.severity` are all present and shaped as the parser assumes.
      The larger `extra.metadata` block (`owasp`, `cwe`, `likelihood`,
      `confidence`, ...) is real but currently unused by `parse()` — kept
      only via `raw=result`, not lifted into named `Finding` fields.

General concept from this step (raw JSON schema is Semgrep-specific, not a
shared SAST standard; SARIF as the one real cross-tool format) → logged in
`job prep notes/APPSEC_INTERVIEW_QA_MASTER.md` §21, per this file's own
rule above.

## Parked — decide later

- [ ] Try a narrower `--config` (`p/ci` or `p/owasp-top-ten`) and compare
      finding counts against the 68 from `auto`
- [ ] Wire this real output into `ingestion/app/parsers/semgrep.py`
      (already validated against fixtures — this would be against a real
      scan instead)

## 🔶 YOU ARE HERE — VS Code extension

**Goal:** see the same engine run automatically inside the editor, instead
of by hand in the terminal — the GUI front door from the earlier concept
section, for real this time.

- [x] Installed the **Semgrep** extension (publisher: Semgrep Inc.) via the
      Extensions panel

## Concept — where does Semgrep's config actually live?

Three different things, easy to conflate:

| Location | What lives there | Exists in this repo? |
| --- | --- | --- |
| `demo-target/.semgrepignore` (same folder + syntax as `.gitignore`) | project-specific scan exclusions written by hand | **No** — checked via `find`, doesn't exist |
| Semgrep's built-in default ignores (baked into the tool, no file) | `node_modules/`, `.git/`, `dist/`, `build/`, lockfiles, minified files | N/A — this is what actually caused **"156 files skipped via .semgrepignore patterns"** in the earlier scan output. No file involved — Semgrep applies these automatically and reports them under that label, which reads as if a file exists when it doesn't |
| `~/.semgrep/` (global, home directory) | `settings.yml` (login/telemetry state) + `semgrep.log` — confirmed present on this machine | Yes, but it's CLI account/log state, not an ignore file |

To add real project-specific exclusions later: create `demo-target/.semgrepignore` by hand, next to `demo-target/.gitignore` — same convention, just doesn't exist yet since nothing's needed to override the defaults.

## Concept — what is `demo-target/.github/workflows/ci.yml`?

Juice Shop's **own** GitHub Actions workflow, shipped as part of the
upstream app — not vigilant-engine's `.github/workflows/security-scans.yml`.
Semgrep has a `yaml.github-actions.*` rule category specifically for
scanning workflow YAML for supply-chain issues; the rule that fired,
`github-actions-mutable-action-tag`, flags an action pinned to a mutable
ref (e.g. `actions/checkout@main`) instead of a fixed version/SHA — a
mutable tag can be repointed to malicious code later without anyone
noticing.

## Troubleshooting — extension errors on first open

Hit on first real use: "Semgrep client: couldn't create connection to
server", "Server initialization failed", "Cannot read properties of
undefined (reading 'positionEncoding')".

**Root cause (per a known issue in semgrep-vscode's own repo, #12):**
almost always the extension not finding the right `semgrep` binary — common
right after a fresh `brew install`, since a GUI app only reads PATH at
launch, not while already running.

- [ ] Fix attempt 1 (used — quitting VS Code would've closed unrelated
      open windows/sessions, skipped): Settings (`Cmd+,`) → search
      `semgrep.path` → set to `/opt/homebrew/bin/semgrep` (confirmed via
      `which semgrep` on this machine) — sidesteps PATH detection
      entirely, no relaunch needed
- [ ] Fix attempt 2 (only if the above doesn't clear it): fully quit VS
      Code (`Cmd+Q`) and reopen — forces a fresh process that re-reads
      PATH at launch

- [x] Fix attempt 1 (setting `semgrep.path`) alone did **not** finish the
      fix — confirmed via a real command error: running "Semgrep: Scan
      changed files in workspace" from the Command Palette returned
      `command 'semgrep.scanWorkspace' not found`, and the extension's own
      Runtime Status panel showed "Not yet activated" / "Uncaught Errors
      (1)" — the language client never finished starting, the setting
      change alone didn't restart it.

## Concept — real Semgrep finding vs. an unrelated link underline

Line 188 (`uses: coverallsapp/github-action@v2`) showed a **blue
underline** — that's VS Code/YAML recognizing the string as a clickable
link to the GitHub Action, unrelated to Semgrep entirely. A real Semgrep
finding renders as a **wavy underline** (orange/yellow), with a hover
tooltip showing the rule message and ID — nothing to do with plain
hyperlink styling. Don't mistake one for the other when checking if a scan
actually ran.

- [x] **Real root cause found (from the Output panel, not guessing):**
      `Error initializing server: Failure: Cannot determine physical path
      for ".../Security /notes": No such file or directory`. The VS Code
      window still had a stale workspace folder (`Security /notes`,
      since renamed to `job prep notes`). The Semgrep language server
      indexes **every** workspace folder on startup, fails on the missing
      one, and never answers the handshake — the `positionEncoding`
      TypeError is only the client crashing on that missing reply. Not a
      login, PATH, or `semgrep.path` problem; no account needed (login only
      unlocks Pro rules).
- **Why a workspace folder matters to Semgrep at all:** the terminal
  command scans only the path typed (`demo-target/`). The extension has no
  typed path — it scans every root folder open in the VS Code workspace,
  and lists their files on startup (the `Caching workspace targets` log
  line). A dead root folder breaks that step. Same shape as the
  TypeScript/ESLint extension failing on a `tsconfig` that points at a
  deleted folder.
- Workspace is an "Untitled (Workspace)" with three roots: `vigilant-engine`,
  `notes` (dead, stale), `job prep notes` (real). Collapse the first root
  in Explorer to see all three.
- [ ] Fix, step 1: Explorer (`Cmd+Shift+E`) → right-click the dead `notes`
      root folder → **Remove Folder from Workspace**
- [ ] Fix, step 2: also remove `job prep notes` from this workspace and
      open it in its own VS Code window (File → Open Folder, new window) —
      keeps the Semgrep extension scanning only `vigilant-engine`
- [ ] Then: Command Palette → Developer: Reload Window
- [x] (superseded — did not fix it, wrong cause) Fix attempt 3: Command Palette (`Cmd+Shift+P`) → **"Developer: Reload
      Window"** — reloads only the current window's extensions/UI, does
      **not** quit the app or close other open windows/sessions (unlike
      `Cmd+Q`)
- [ ] Click "Uncaught Errors (1)" in the extension's Runtime Status panel
      and capture the actual error text, in case fix attempt 3 doesn't
      clear it — better to fix the real cause than keep guessing

- [x] **Fixed.** After removing the dead `notes` folder (and moving `job
      prep notes` to its own window) and a Reload Window, the Output panel
      (`Cmd+Shift+U` → "Semgrep") shows `Server initialized`, `Rules
      refreshed`, `Scanning open documents`. Extension is connected.

## Concept — connected, but 0 matches on `ci.yml`?

Same log then said `Found 0 matches` / `No targets to scan!` for
`ci.yml`. Checked with `git ls-files`: `demo-target` is a **git
submodule**, so the outer `vigilant-engine` repo does **not** track
`demo-target/.github/workflows/ci.yml` (empty output); only the inner
submodule repo does. The extension scans only "files tracked by git" as
seen from the folder opened, so it skips submodule contents. The terminal
scan worked because the path `demo-target/` was given explicitly. (Best
explanation from the evidence, still to be confirmed by the test below.)

- [ ] Test: File → New Window → Open Folder → `vigilant-engine/demo-target`,
      open `.github/workflows/ci.yml`, look at line 188 for a wavy underline

## 🔶 YOU ARE HERE — confirming the extension is actually connected

Cheapest signal first, real proof last:

- [ ] No repeat of the "couldn't create connection" error toasts after the
      `semgrep.path` settings change
- [ ] `View → Output` → pick **"Semgrep"** from the panel's dropdown —
      look for init/scan logs, not the earlier "Server initialization
      failed" error
- [ ] Status bar (bottom of the window) shows a Semgrep icon/status item
- [ ] **Real proof:** open `demo-target/.github/workflows/ci.yml`, line
      188 — squiggly underline under the mutable action tag, hover shows
      the same `github-actions-mutable-action-tag` message/rule ID already
      seen in the terminal JSON
- [ ] Bonus: `View → Problems` (`Cmd+Shift+M`) also lists Semgrep findings,
      same as ESLint errors do
