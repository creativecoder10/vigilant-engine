# Threat Model — Juice Shop (Phase 2)

Manual STRIDE analysis of selected Juice Shop flows, traced via DevTools
Network tab + source review against the pinned `demo-target` submodule
(`v20.2.0`). See `PLAN.md`/the threat-modeling plan PDF for the phased
approach this builds toward — this file is the running output of Phase 2,
to be consolidated into the final writeup in Phase 6.

Status legend: **confirmed** (verified by actually testing it) vs.
**candidate** (pattern spotted, not yet verified) — don't blur the two.

## Status as of 2026-09-07 — Phase 2 complete

**10 confirmed findings**, 0 open candidates. 3 OWASP API Top 10
categories (API4, API6, API7) deliberately time-boxed, not tested — see
`BURP_TESTING_STEPS.md` for the per-category reasoning. Full retrospective
on process (what was planned vs. what actually happened) lives in the
phase-plan PDF, not duplicated here — this file stays the findings log.

**Phase 2 steps 2/3/6 (DFD, trust boundaries, Threat Dragon) — done.**
`docs/juice-shop-threat-model.json` has all 10 findings attached to the
`Angular Frontend → Application Server` flow, plus 3 trust boundaries.
Juice Shop's own shipped DFD turned out to be in Threat Dragon's old file
format and wouldn't render in the current app — the diagram was rebuilt
via a validated script using that old file's element/flow list as the
ground-truth spec, rather than a risky hand-migration. Full story in
`INTERVIEW_PREP_APPSEC1.md`.

---

## Flow 1 — Login / Auth

### Finding 1.1 — Full user record disclosed inside the JWT (confirmed)

- **Where:** response body of `POST /rest/user/login` — the `authentication.token` field, decoded.
- **STRIDE category:** Information Disclosure
- **What:** the JWT payload isn't a minimal claims set — it's the entire `Users` row:
  ```json
  {
    "id": 25, "username": "", "email": "dd@gmail.com",
    "password": "5f4dcc3b5aa765d61d8327deb882cf99",
    "role": "customer", "deluxeToken": "", "lastLoginIp": "0.0.0.0",
    "profileImage": "...", "totpSecret": "", "isActive": true,
    "createdAt": "...", "updatedAt": "...", "deletedAt": null
  }
  ```
  Includes the password hash, role, and other fields no client needs.
- **Why it's exploitable:** JWT signing (`RS256` here) is tamper-evident, not
  confidential — the payload is only base64url-*encoded*, so anyone holding
  the token can decode it with zero keys, e.g. `base64.urlsafe_b64decode()`.
  The token is also stored in `localStorage`, which any JS on the page can
  read — so any XSS elsewhere in the app (Juice Shop has several by design)
  escalates this from "your own data is over-exposed" to "an attacker's
  injected script can exfiltrate your full record, including the password
  hash, via one read of `localStorage`."
- **Secondary issue, distinct from the disclosure:** the password hash is
  32 hex chars — MD5-length. MD5 is cryptographically broken for password
  hashing (fast, unsalted-looking, trivially reversible via rainbow
  tables) — a weakness even if the token weren't over-sharing it.
- **Security property violated:** Confidentiality.
- **Plausible impact:** session/localStorage compromise (via XSS or a
  shared/compromised device) discloses far more than a session identifier
  should — full PII plus a crackable password hash.
- **Known Juice Shop challenge match:** not yet checked against the
  official challenge list — revisit when cross-referencing findings later.

---

## Flow 2 — Basket / order access

### Finding 2.1 — Broken Object Level Authorization on `/rest/basket/{id}` (confirmed)

- **Where:** `GET /rest/basket/6` (own basket, seen after login).
- **Why this call happens, and why `6` specifically:** the Angular basket/cart
  view fires this on load to fetch the user's own basket contents. `6`
  isn't guessed — it's the `bid` claim already sitting in the user's own
  JWT payload (`"bid": 6`, see Finding 1.1's decode). The frontend just
  reads its own basket id out of the token and builds the URL from it. This
  doesn't make the ID secret-but-safe — it makes it obviously sequential
  and enumerable, since knowing your own is `6` implies `1`–`5` and `7`+
  plausibly belong to other accounts.
- **Header mechanics observed on this request:** the same JWT is sent
  *twice* — once as `Authorization: Bearer <token>`, and again inside the
  `Cookie` header as `token=<same JWT>` (alongside unrelated cookies:
  `language`, `welcomebanner_status`, `cookieconsent_status`,
  `continueCode`).
- **`HttpOnly` check — confirmed:** `document.cookie` in the browser
  console returns the `token` cookie in plain text. **Not `HttpOnly`** —
  the cookie channel is exactly as exposed to XSS as the `localStorage`
  copy already noted in Finding 1.1; carrying the token over two channels
  instead of one adds no real defense-in-depth here, since both are
  equally JS-readable.
- **Confirmed via curl** (own token, `UserId: 25`, own basket is `6`):
  ```
  curl -H "Authorization: Bearer <token>" http://localhost:3000/rest/basket/5
  → HTTP 200 — full basket returned, "UserId": 16 (not the caller's account)
  curl -H "Authorization: Bearer <token>" http://localhost:3000/rest/basket/7
  → HTTP 200 — {"status":"success","data":null} (basket 7 likely empty/nonexistent)
  ```
  Basket `5`'s response is the proof: a different `UserId` than the caller's
  own (16 vs. 25), full product contents (Eggfruit Juice, price, etc.)
  returned with no authorization check blocking cross-user access. This is
  **API1:2023 Broken Object Level Authorization**, confirmed, not a
  candidate — any authenticated user can read any other user's basket
  contents by incrementing an integer.
- **STRIDE category, finalized:** Information Disclosure (this was a `GET`;
  untested whether the same lack of check applies to a write verb against
  someone else's basket, which would additionally be Tampering).
- **Security property violated:** Confidentiality (and possibly Integrity,
  pending a write-verb test).
- **Plausible impact:** any registered user can enumerate low integers and
  read every other customer's basket contents — a horizontal privacy
  breach across the entire user base, trivial to automate.
- **Note — not Elevation of Privilege:** worth being precise here. STRIDE's
  Elevation of Privilege means gaining a *higher* privilege level (customer
  → admin). Reading or modifying another user's data *at the same privilege
  level* (a peer's basket, not an admin action) is a horizontal access
  control failure — in the OWASP API Security Top 10 this is **API1:2023
  Broken Object Level Authorization (BOLA)**, and it maps onto STRIDE as
  Information Disclosure/Tampering, not EoP. Easy mix-up worth not
  repeating in the writeup.
- **What would confirm this:** while authenticated as one user, request
  `/rest/basket/<someone else's id>` (e.g. 5 or 7) and check whether the
  server returns that basket's contents instead of rejecting the request.
  Not yet tested — currently a pattern spotted, not a confirmed threat.

### Finding 2.2 — `POST /api/BasketItems` BOLA bypass via duplicate JSON keys (confirmed)

- **Where:** `routes/basketItems.ts`. The write path, unlike the `GET` in
  Finding 2.1, *does* have an ownership check:
  ```js
  // line 37 — checks the FIRST "BasketId" seen
  if (user && basketIds[0] && Number(user.bid) != Number(basketIds[0])) { reject }
  // line 42 — writes using the LAST "BasketId" seen
  BasketId: basketIds[basketIds.length - 1]
  ```
- **Root cause:** the body is parsed by `parseJsonCustom()`
  (`lib/utils.ts:180-192`), which uses `clarinet` — a streaming parser
  that fires a callback for *every* key it encounters, including
  duplicates. Standard `JSON.parse` would silently collapse a duplicate
  key to just the last occurrence (JS objects can't have two properties
  with the same name); `clarinet` instead lets both survive as separate
  entries in an array, in order. That reopens the possibility of the
  check inspecting one occurrence while the write logic uses another.
- **Confirmed via Burp Repeater** — sent a body with `BasketId` repeated,
  own basket first, target second:
  ```
  {"ProductId":52,"BasketId":"7","BasketId":"5","quantity":1}
  ```
  → `HTTP 200`, `{"status":"success","data":{"id":15,"ProductId":52,"BasketId":"5",...}}`
  — a product was written into basket `5` (belongs to `UserId: 16`) while
  authenticated as the owner of basket `7` (`UserId: 26`). The check saw
  `"7"` (passed); the write used `"5"` (succeeded anyway).
- **Bug class, precisely:** a **parser differential** / **JSON parameter
  pollution** — the validation and the business logic disagree about which
  value is authoritative when a key repeats. This is a materially
  different, more interesting root cause than a simply-missing check, and
  worth naming that way rather than folding it into Finding 2.1.
- **Juice Shop's own confirmation this is the intended solution:** line 45
  ties this exact condition (`user.bid != basketItem.BasketId`) to
  `challenges.basketManipulateChallenge` — its existence in source
  confirms this bypass is a deliberately seeded, known-solvable challenge,
  not an incidental side effect.
- **STRIDE category:** Tampering.
- **Security property violated:** Integrity.
- **Plausible impact:** any authenticated user can add items to (and by the
  same mechanism, potentially modify/remove items from — untested) any
  other user's basket, silently altering their order before checkout.

---

## Flow 3 — `whoami` endpoint

### Finding 3.1 — `whoami`'s `fields` param has no allowlist, leaks password hash (confirmed)

- **Where:** `GET /rest/user/whoami?fields=...`, handler in
  `routes/currentUser.ts`.
- **Corrected framing (checked against source, not assumed):** identity
  here always resolves from the caller's own `token` cookie
  (`security.authenticatedUsers.get(req.cookies.token)`) — there's no ID
  parameter to substitute, so this is **not** an IDOR/BOLA the way the
  basket findings are. The real bug is different: `fields` is
  comma-separated and the handler applies **no allowlist** — it just
  checks `user.data[field] !== undefined` and returns it. Since
  `user.data` is the same full record seen in the JWT (password hash,
  role, `totpSecret`, `deluxeToken`...), any of those can be requested.
- **Confirmed via curl:**
  ```
  curl --cookie "token=<token>" \
    "http://localhost:3000/rest/user/whoami?fields=email,password,role,totpSecret,deluxeToken"
  → {"user":{"email":"...","password":"5f4dcc3b...","role":"customer","totpSecret":"","deluxeToken":""}}
  ```
- **Deliberately seeded, not incidental:** `routes/currentUser.ts:52`
  ties this exact condition to a named challenge —
  `challengeUtils.solveIf(challenges.passwordHashLeakChallenge, () => response?.user?.password)`.
- **STRIDE category:** Information Disclosure — **API3:2023 Broken Object
  Property Level Authorization**, same category as Finding 1.1, but a
  fully independent, separately-exploitable mechanism (a "sparse
  fieldset" API feature with no field-level restriction, vs. Finding
  1.1's over-broad JWT payload).
- **Security property violated:** Confidentiality.
- **Plausible impact:** same password-hash exposure as Finding 1.1,
  reachable without ever decoding a JWT — just a GET request with a query
  string.
- **Superseded note:** the original write-up's minor "PII in a URL"
  concern still stands, but it's no longer the interesting part of this
  finding — the field-allowlist gap is.

---

## Flow 4 — Functional authorization sweep (found via source review + testing, not a pre-planned flow)

Not one of the three originally scoped flows — these came from reading
`server.ts`'s route registrations after noticing `isAuthorized()` only
checks for a *validly signed token*, never a role, then testing what that
implies. Worth being honest about this in the writeup: not every finding
comes from the planned flow list — testing a hypothesis raised while
reading source is itself a legitimate, common way real findings surface.

### Finding 4.1 — `GET /api/Users` dumps the entire user table to any authenticated customer (confirmed, severe)

- **Where:** `GET /api/Users`, registered in `server.ts` with only
  `security.isAuthorized()` — no role check.
- **Confirmed via curl**, using the plain `customer`-role token from Finding
  1.1: `HTTP 200`, full JSON array of every user — id, username, email,
  role, `deluxeToken`, timestamps — for the entire table, not just the
  caller's own record. Notably reveals which accounts are `admin`
  (`testing@juice-sh.op`, `cloud-admin@juice-sh.op`) and other users'
  `deluxeToken` values.
- **STRIDE category:** Information Disclosure. Also **API5:2023 Broken
  Function Level Authorization** — this is an endpoint that should require
  an elevated role and doesn't check for one at all.
- **Security property violated:** Confidentiality, at the scale of the
  entire user base, not one record.
- **Plausible impact:** full user enumeration in one unauthenticated-beyond-signup
  request — every email address, and a map of exactly which accounts are
  admin, handed to any newly self-registered customer. Directly enables
  Finding 4.3 below (targeted brute-forcing of named accounts).

### Finding 4.2 — `PUT /api/Products/:id` accepts changes from any customer token (confirmed, severe)

- **Where:** `PUT /api/Products/:id`. Source shows the authorization check
  for this exact route commented out —
  `// app.put('/api/Products/:id', security.isAuthorized()) // vuln-code-snippet vuln-line changeProductChallenge`
  — a deliberately seeded vulnerability, tagged by Juice Shop's own
  maintainers as the `changeProductChallenge`.
- **Confirmed via curl**, plain customer token: `PUT /api/Products/1` with
  `{"price": 0.01}` returned `HTTP 200` with the price actually changed —
  verified, then reverted back to `1.99` immediately after confirming.
- **STRIDE category:** Tampering. Also **API5:2023 Broken Function Level
  Authorization** — a write action on shared business data, reachable by
  any authenticated user regardless of role.
- **Security property violated:** Integrity.
- **Plausible impact:** any registered customer can rewrite product prices,
  descriptions, or images store-wide — direct, unambiguous business impact,
  not just a data-exposure concern.

### Finding 4.3 — No rate limiting on login attempts (confirmed)

- **Where:** `POST /rest/user/login`.
- **Confirmed:** 8 rapid failed login attempts, all returned `HTTP 401`
  with no `429`/lockout/delay at any point.
- **STRIDE category:** Spoofing (via credential brute-forcing) — this is
  **API2:2023 Broken Authentication**.
- **Compounds with Finding 4.1:** an attacker doesn't need to guess emails
  — `/api/Users` hands over the full list, including which ones are admin
  — then this finding means every one of those accounts can be
  brute-forced with no throttling at all. Worth presenting these two
  together as a chain, not as isolated findings — it's a stronger, more
  realistic story than either alone.

### Finding 4.4 — Issued JWTs carry no `exp` claim despite `expiresIn: '6h'` in source (confirmed)

- **Where:** `lib/insecurity.ts`'s `authorize()` calls
  `jwt.sign(user, privateKey, { expiresIn: '6h', ... })`, which should
  inject an `exp` claim — but the actual decoded token from Finding 1.1 has
  no `exp` field, only `iat`.
- **STRIDE category:** Spoofing/Broken Authentication (API2:2023) — a
  token that never cryptographically expires (as far as `isAuthorized()`'s
  pure signature check is concerned) extends the window a stolen token
  stays useful indefinitely, rather than capping it at 6 hours as intended.
- **Not yet explained:** why `expiresIn` isn't taking effect — worth a
  closer read of `insecurity.ts`/the `jsonwebtoken` version in use before
  calling this fully understood, not just observed.

### Finding 4.5 — CORS wildcard, but not exploitable via cookies (confirmed, low severity — don't oversell)

- **Where:** every response carries `Access-Control-Allow-Origin: *`.
- **Confirmed:** tested with a spoofed `Origin` header — the wildcard is
  unconditional. However, no `Access-Control-Allow-Credentials: true` is
  present, which means browsers will **not** send cookies cross-origin to
  this API despite the wildcard — so the dual-channel token (Finding 2.1's
  cookie observation) can't be silently exploited by a third-party site
  this way. Real misconfiguration (violates least-privilege on CORS), but
  meaningfully lower severity than "wildcard CORS + credentials" would be.
- **STRIDE category:** Security Misconfiguration (API8:2023).
- **Also confirmed via headers:** no `Content-Security-Policy` at all
  (matches the original observation). `X-Content-Type-Options: nosniff`
  and `X-Frame-Options: SAMEORIGIN` **are** present — don't claim these as
  findings, they're correctly configured.

### Finding 4.6 — API schema (`/swagger.yml`) publicly exposed, no auth (confirmed)

- **Where:** `GET /swagger.yml` → `HTTP 200`, unauthenticated.
- **STRIDE category:** Information Disclosure — **API9:2023 Improper
  Inventory Management**. Hands an attacker the full documented API
  surface without needing to guess or crawl for it.
- **Plausible impact:** moderate — mostly a recon/reconnaissance-speed
  accelerant rather than a direct exploit on its own.

### Checked, and correctly NOT a finding — `/rest/admin/application-configuration`

Returns `HTTP 200` unauthenticated, and the URL *looks* alarming ("admin"
in the path) — but the actual response body is just public app/theme/branding
config (app name, logo, chatbot display config, social links), nothing
sensitive. Worth recording explicitly: not every URL with "admin" in it is
a finding — the content has to actually be checked, not just the path name.
Good instinct to verify rather than assume either way.

---

## Open / next

- [x] Verify Finding 2.1 by actually swapping the basket ID — confirmed via curl.
- [x] Sweep the unchecked OWASP API Top 10 table rows — see Flow 4 above.
      Confirmed: API2 (no rate limiting, no real token expiry), API5 (both
      `/api/Users` and `PUT /api/Products/:id`), API8 (CORS wildcard, no
      CSP — but not credentialed), API9 (`/swagger.yml` exposed).
- [x] Test whether a write verb against another user's basket ID also lacks
      an authorization check — confirmed via Burp Repeater, see Finding 2.2
      (a check existed but was bypassable via duplicate JSON keys).
- [x] Check `whoami`'s `fields` param — confirmed via curl, see Finding 3.1
      (no field allowlist, leaks password hash; not an IDOR as originally
      framed, since identity always resolves from the caller's own cookie).
- [x] Check whether the `token` cookie is `HttpOnly` — confirmed **not**
      `HttpOnly` via `document.cookie`, see Finding 2.1.
- [ ] Explain why `expiresIn: '6h'` isn't producing an `exp` claim (Finding 4.4).
- [ ] API4 (resource consumption), API6 (business-flow throttling), and
      API7 (SSRF candidate params) — **time-boxed as future work**, not
      chased further for now. API6 needs scripting/Intruder (throttled in
      Burp Community); API7 needs a URL-accepting field not yet found
      anywhere in the app; API4's payoff (an accepted large number) is a
      weaker demo than the findings already confirmed.
- [ ] Cross-reference confirmed findings against the official Juice Shop
      challenge list once available.
