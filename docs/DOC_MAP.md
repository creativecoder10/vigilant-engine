# Vigilant-Engine Doc Map

*Where every doc lives, and what points where*

Ten files, all inside this repo. Two of them — the Burp runbook and the
STRIDE process notes — used to live in an external notes folder split out
for interview prep; both are copied back into `docs/` now so every link
here actually resolves.

## One folder again, mostly

Commit `f560d08` pulled interview-prep and testing docs out of
`vigilant-engine/` into an external `../notes/` folder, on the reasoning
that project docs and rehearsal docs shouldn't ship in the same git
history — but the resulting links never actually resolved, even on the
machine that wrote them, since the real folder sits at a different
relative depth than the links assumed. `BURP_TESTING_STEPS.md` and
`STRIDE_METHODOLOGY.md` are project-relevant enough — a live testing
runbook, a STRIDE process reference — to be worth shipping with the repo,
so both are copied back in as `docs/` files. `INTERVIEW_PREP_APPSEC1.md`,
its companion Q&A doc, and the cross-project Python log stay out —
genuinely personal interview-prep content, not project documentation —
and every link to them has been removed rather than left broken.

## The reference graph

Solid = a live link that resolves. Dotted = a companion or data twin, not
a hub-and-spoke link.

```
vigilant-engine/
├── README.md ───────────────┬──────────────────────────────────┐
│                             │                                  │
├── ARCHITECTURE.md <─────────┘                                  │
│         ^                                                      │
├── Plan_vigilant_engine.md ──┘ (also -> docs/BURP_TESTING_STEPS,│
│         ^  |                          docs/STRIDE_METHODOLOGY) │
│         |__| (plan <-> findings)                                │
│                                                                  v
docs/THREAT_MODEL.md <──────────────────────── docs/BURP_TESTING_STEPS.md
   |        ^        <──────────────────────── docs/STRIDE_METHODOLOGY.md
   v        |__________________________________________|  (illustrated by)
docs/vigilant-engine-threat-modeling-plan.{pdf,html}  (bidirectional w/ THREAT_MODEL.md)

docs/architecture-diagram.html -> ARCHITECTURE.md
docs/juice-shop-threat-model.json -> THREAT_MODEL.md
ingestion/README.md -> ARCHITECTURE.md
```

## Housekeeping, resolved

Two loose ends turned up while building this map. Both are fixed now.

| Issue | Status | Resolution |
|---|---|---|
| `../notes/` links never actually resolved | Fixed | The `../notes/` paths added after commit `f560d08` assumed the external notes folder sat one level above the repo — it actually sits two levels up, under a differently-named directory, so every one of those links 404'd even on the machine that wrote them. `BURP_TESTING_STEPS.md` and `STRIDE_METHODOLOGY.md` are copied back into `docs/` so README.md, Plan_vigilant_engine.md, and this map all resolve again. The three interview-prep-only docs stay external — their links have been removed rather than fixed. |
| Duplicate JSON merged | Fixed | The repo-root `juice-shop-threat-model.json` and the `docs/` copy held the same 10 findings under different Threat Dragon export versions. Kept the newer one at `docs/juice-shop-threat-model.json` — the path the rest of the docs reference — and removed the root copy. |

## Every document, in full

### `vigilant-engine/` — repo, ships in git history

| Document | Role | Points to |
|---|---|---|
| `README.md` | Entry point — links out to every doc below | ARCHITECTURE, Plan, THREAT_MODEL, ingestion/README, docs/BURP_TESTING_STEPS |
| `ARCHITECTURE.md` | Solution design: scanners → ingestion → dashboard, with the flow diagram | — (referenced by Plan, ingestion/README) |
| `Plan_vigilant_engine.md` | Phased build checklist, what's done vs. still open | ARCHITECTURE.md, docs/BURP_TESTING_STEPS, docs/STRIDE_METHODOLOGY |
| `docs/THREAT_MODEL.md` | STRIDE findings log for Juice Shop — 10 confirmed, 0 open candidates as of Phase 2 | threat-modeling-plan.pdf, juice-shop-threat-model.json |
| `docs/…-plan.pdf` / `.html` | The phased threat-modeling plan itself (STRIDE + Threat Dragon + ATT&CK) and its retrospective | THREAT_MODEL.md (bidirectional) |
| `docs/architecture-diagram.html` | Rendered export of ARCHITECTURE.md's flow diagram | ARCHITECTURE.md |
| `docs/juice-shop-threat-model.json` | Structured/machine-readable twin of the threat model | THREAT_MODEL.md |
| `ingestion/README.md` | The FastAPI service itself: file layout, request flow, how to run it | ARCHITECTURE.md |
| `docs/BURP_TESTING_STEPS.md` | Live runbook — the step list for the current hands-on Burp session | THREAT_MODEL.md (findings) |
| `docs/STRIDE_METHODOLOGY.md` | STRIDE process notes — what to test per category, not just definitions | THREAT_MODEL.md (illustrated by its confirmed findings) |

---
*10 files, one folder · updated 2026-09-15 — BURP_TESTING_STEPS.md and STRIDE_METHODOLOGY.md moved back into docs/, interview-prep-only doc links removed · repo is on `main`*
