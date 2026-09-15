# Burp Testing Steps — live runbook

Working checklist for the current hands-on session. This file gets updated
as we refine things in chat — always follow *this* file for "what do I do
next," and use chat for troubleshooting/questions. Findings themselves go
in `THREAT_MODEL.md`; concepts/interview material go in
`INTERVIEW_PREP_APPSEC1.md`. This file is just the step list.

## Framing — where Burp fits, and where STRIDE does

**Burp doesn't identify threats by itself.** Community edition has no
automated scanner (that's Pro-only "Active Scan") — it's an instrument for
capturing and manipulating traffic, nothing more. The *identification*
step is still STRIDE/OWASP reasoning, done by reading what a request or
response actually contains; Burp's job is to make *testing* that
suspicion fast and repeatable (mainly via Repeater), not to generate the
suspicion in the first place.

Concretely, every step below is an instance of this split:
- **Identification (STRIDE / OWASP API Top 10)** — "this basket URL has a
  sequential ID" is Information Disclosure reasoning under API1:2023 BOLA;
  "this response has fields the UI never shows" is API3; etc. — see the
  full category table in `INTERVIEW_PREP_APPSEC1.md`.
- **Confirmation (Burp)** — Repeater is how that suspicion gets tested
  against the real server, repeatably, without retyping curl commands.

So yes — this runbook is STRIDE-driven underneath; Burp is just the hands
doing the testing that STRIDE/OWASP reasoning pointed at.

---

## ✅ Setup (done)

- [x] Burp Suite installed (`brew install --cask burp-suite`)
- [x] Temporary project → Use Burp defaults → Start Burp
- [x] Proxy → Intercept → **Open Browser** (Burp's own Chromium)
- [x] Logged in via that browser window (account: `dd@g.com`, id `26`)
- [x] Target → Scope → added `http://localhost:3000`
- [x] Proxy → HTTP History → filter set to **Show only in-scope items**
- [x] Confirmed `GET /rest/basket/7` (own) and other basket IDs show up in
      HTTP History

## ✅ Basket ID swap test (done — confirmed)

- [x] Sent `/rest/basket/7` to Repeater
- [x] Removed `If-None-Match` header (was causing `304 Not Modified` with
      no body — see `INTERVIEW_PREP_APPSEC1.md` for why)
- [x] Confirmed: a basket number other than your own returned `userId: 8`,
      which is not your account (`26`) → **BOLA confirmed**, second
      independent account (first was via curl, account `25`/basket `6`)

## 🔶 YOU ARE HERE — capturing the write request

**Goal:** find the `POST /api/BasketItems` request generated when you
added items to your own basket, so it can be tampered with (Repeater) to
test whether writing to *someone else's* basket is also unprotected.

You already added 2 items to your basket via the UI (Apple Juice, Apple
Pomace) — that should have generated the requests. If they're not showing
in HTTP History, work through this checklist in order:

- [ ] **Did the list grow at all** right when you clicked "+" to add an
      item? If nothing new appeared, the add-to-cart click didn't go
      through Burp's proxy — likely done in a different browser
      tab/window than the one Burp opened via "Open Browser." Redo the
      add-to-cart action *in that specific window*.
- [ ] **Check sort order / scroll position** on HTTP History — new entries
      land at one end of the list (top or bottom depending on how the
      **Time** column is sorted). Sort by Time, then check both ends.
- [ ] **Sort by the Method column** (click the column header) to group all
      `POST` requests together, separate from the much larger pile of
      `GET`s.
- [ ] Remember it's `POST /api/BasketItems` — capital B, not `/basket` —
      easy to scan past if eyes are tuned to lowercase "basket."
- [ ] If still not found: add one more item to the cart *right now*, watch
      HTTP History live as you click, and note exactly what appears.

## ✅ Write-verb test (done — confirmed, richer than expected)

- [x] Found `POST /api/BasketItems/`, body:
      `{"ProductId":52,"BasketId":"7","quantity":1}`
- [x] Tried a single swapped `BasketId` → got `401 Invalid BasketId` (the
      write path *does* check ownership, unlike the `GET`)
- [x] Bypassed it via duplicate keys — own basket first, target second:
      `{"ProductId":52,"BasketId":"7","BasketId":"5","quantity":1}`
- [x] Result: `HTTP 200`, item written into basket `5` (not the caller's
      own `7`) → **confirmed Tampering via a parser differential /
      JSON parameter pollution bug** — see `THREAT_MODEL.md` Finding 2.2

## ✅ Remaining quick items (done)

- [x] `whoami`'s `fields` param — confirmed via curl: no field allowlist,
      leaks the password hash (Finding 3.1)
- [x] `token` cookie `HttpOnly` check — confirmed **not** `HttpOnly` via
      `document.cookie`

## ⬜ Time-boxed as future work, not pursued further

- [ ] API4 (resource consumption), API6 (business-flow throttling), API7
      (SSRF candidate params) — see `INTERVIEW_PREP_APPSEC1.md` for why
      each was deprioritized rather than tested.

## ⬜ Next up — formalize Phase 2's remaining steps

**The shipped skeleton (already parsed from `demo-target/threat-model.json`):**

Elements — Actors: `B2C Customer (Browser)`, `B2B Customer (Browser)`,
`Admin (Browser)`, `Accounting (Browser)`, `Google` (out of scope). Processes:
`Angular Frontend`, `Application Server`, `B2B API`. Stores: `SQLite
Database`, `MarsDB NoSQL DB`, `Local File System`.

Flows:
```
B2C Customer (Browser) → Angular Frontend → Google
Angular Frontend ⇄ Application Server → B2C Customer (Browser)
B2B Customer (Browser) → B2B API → Application Server
Admin (Browser) → Angular Frontend
Accounting (Browser) → Angular Frontend
Application Server → SQLite Database
Application Server ⇄ MarsDB NoSQL DB
Application Server ⇄ Local File System
```

5 trust boundary rectangles are already drawn on the canvas but unlabeled in
the JSON (only pixel coordinates stored).

All 10 confirmed findings sit on the same edge: `Angular Frontend ⇄
Application Server` — every test in this project went through the REST API
directly (curl/Burp), not through Angular's rendering layer.

## ⚠️ Blocker found, root-caused, and worked around — old-format file

Opening `threat-model.json` in Threat Dragon v2.6.2 renders the metadata
page (title/owner/description) correctly, but the actual diagram canvas
comes up **completely blank** — no boxes, no arrows, despite the JSON
clearly containing 31 cells.

**Root cause, confirmed by diffing schemas directly** (pulled a real demo
file from Threat Dragon's own current GitHub repo to compare):

| | Juice Shop's file (written 2021) | v2.6.2's expected format |
|---|---|---|
| Cells location | nested: `diagrams[0].diagramJson.cells` | flat: `diagrams[0].cells` |
| `version` field | absent | present, e.g. `"2.4.0"` |
| Element field | `"type": "tm.Process"` | `"shape": "process"` |
| Flow endpoints | reference element `id` | reference `{cell: id, port: id}` — needs ports old elements don't have |

Juice Shop's file is in Threat Dragon's **old v1.x (JointJS) schema**; the
installed v2.6.2 app is the newer AntV X6-based rewrite. It reads
format-agnostic top-level fields fine, fails silently (no error shown) on
the parts of the file the new renderer doesn't recognize.

**Decision, revised mid-task:** first planned to rebuild by hand in the
GUI (reasoning: the new format's flow objects need per-element port IDs
that are normally only generated correctly by the GUI). After a long,
slow manual click-through, revised this — the actual fix was to **write a
generator script and validate its output structurally** (every flow's
`source`/`target` cell+port reference checked to resolve to a real port
on a real node) before treating it as done. That's a stronger correctness
guarantee than a manually-clicked diagram, and much faster. Full
reasoning and the honest reflection on the reversed decision are in
`INTERVIEW_PREP_APPSEC1.md`.

## ✅ Done — diagram rebuilt, all 10 findings attached

`docs/juice-shop-threat-model.json` — generated via script using the
element/flow list above as the spec, cross-validated against the current
schema (confirmed via OWASP's GitHub repo demo files *and* a real file
the installed app itself produced), then opened and confirmed rendering
correctly in Threat Dragon v2.6.2:

- [x] All 10 elements placed (4 actors, 3 processes, 3 stores)
- [x] All flows drawn per the list above
- [x] 3 trust boundaries: Browser/Client-side (all 4 actors + `Angular
      Frontend`, since that code runs client-side), a nested Privileged
      users boundary (`Admin`/`Accounting`), and Trusted backend
      (`Application Server`, `B2B API`, the 3 stores)
- [x] All 10 confirmed findings attached as threat entries (title, STRIDE
      category, description, mitigation — sourced from `THREAT_MODEL.md`)
      on the `Angular Frontend → Application Server` flow
- [x] Confirmed visually: clicking that flow opens the Threats panel
      showing all 10 as cards, each with its STRIDE badge and `Open`
      status indicator

This is the Phase 2 deliverable.
