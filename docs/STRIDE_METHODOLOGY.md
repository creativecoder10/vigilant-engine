# STRIDE — Assessment Process by Category

This isn't "what STRIDE stands for" (you know that). It's the *process* for
each category: what to ask, what to actually go test, and where categories
get confused with each other in practice. Written against this project's
findings in [THREAT_MODEL.md](THREAT_MODEL.md) — several categories below
are illustrated with a confirmed finding rather than a hypothetical.

General method, same for every category: find every place the system makes
a **trust decision** (accepts an identity, accepts data as unmodified,
promises an action happened, keeps something private, promises to keep
responding, or grants a privilege level) — then ask "what has to be true
for that decision to be correct, and can I make it false?"

---

## Spoofing — identity claims

**Violates:** Authentication.

**Who/what can be spoofed** — not just "end user with no creds":
1. End users (classic: log in as / act as someone else)
2. Clients/devices (spoofed IP, User-Agent, an impersonated mobile app)
3. Services/processes (server-to-server trust — does "inside the VPC" == trusted?)
4. Message/data origin (forged JWT, spoofed webhook sender, spoofed DNS)

**Process** — for every place identity is claimed, ask:
- **(a)** How is the identity established? (login form, API key, JWT, mTLS cert, IP allowlist, or an implicit "trust the header" pattern)
- **(b)** How is it verified on *every* subsequent request — real validation, or just "a token is present"?
- **(c)** Can that verification be defeated?

**What to actually test:**
| Mechanism | Try |
|---|---|
| Password login | Rate limiting/lockout, credential stuffing, user enumeration via error-message differences |
| Token/session | `alg:none`, RS256→HS256 key confusion, expiry not enforced despite `expiresIn` in source |
| Password reset | Predictable/reusable reset tokens, no rate limit |
| Client-supplied identity | Does the backend ever trust `X-User-Id`-style headers instead of deriving identity from the verified session? |
| Service-to-service | Is internal traffic authenticated at all? |
| OAuth/SSO | `redirect_uri` validation, `state` param checked |

**Confirmed here:** Finding 4.3 (no rate limiting on login), Finding 4.4
(JWT never expires despite `expiresIn: '6h'` in source) — a leaked token
spoofs that identity indefinitely instead of for 6h.

**Don't confuse with:** using a *correctly-authenticated* session to reach
data you shouldn't (that's Information Disclosure/Tampering via broken
authorization — see Finding 2.1's note below) — or escalating from that
identity to a *higher* privilege level (that's Elevation of Privilege).
Spoofing is specifically about the identity claim itself being fake or
stolen.

---

## Tampering — unauthorized modification

**Violates:** Integrity.

**Where tampering happens** — three layers, check each independently:
1. **Data in transit** — can a request/response body be modified between client and server or between services (missing TLS, missing integrity check on a webhook payload)?
2. **Data at rest** — can stored data be altered outside the app's own write path (DB access, cache poisoning, file uploads overwriting other users' files)?
3. **Business logic / write endpoints** — does *every* write path enforce the same ownership/authorization check, or only some of them?

**Process:**
- List every `POST`/`PUT`/`PATCH`/`DELETE` endpoint. For each: does it verify the caller *owns* the resource being modified, not just that they're *authenticated*?
- For endpoints that pass an ID both in a validation check and in the actual write, check whether they read the **same value** for both — parser differentials (duplicate keys, array vs. scalar coercion, JSON vs. form-encoded mismatches) let validation see one value and the write use another.
- Check client-side-trusted fields: price, role, quantity, discount — anything the client sends that the server should be deriving/re-validating server-side instead of trusting as given.
- Check for missing authorization on routes that *look* administrative but only check "is this a valid token," not "does this token have the right role."

**Confirmed here:**
- Finding 2.2 — `POST /api/BasketItems` checks the *first* `BasketId` in a duplicate-key body but writes using the *last* one (parser differential via `clarinet`'s streaming parser). A textbook example of layer 3 above: the check and the write logic disagreed about which value was authoritative.
- Finding 4.2 — `PUT /api/Products/:id` has its authorization check literally commented out in source; any authenticated customer can rewrite product price/description.

**Don't confuse with:** reading data you shouldn't (Information Disclosure)
or being unable to prove you didn't do it (Repudiation, below) — Tampering
is specifically "the data changed and shouldn't have been changeable by
this actor."

---

## Repudiation — denying an action happened

**Violates:** Non-repudiation (accountability).

This is the category easiest to skip in a black-box test, because it's not
about breaking a request — it's about whether the system can later **prove**
who did what. Ask, for every sensitive action (login, password change,
purchase, admin action, data deletion):

- Is it logged at all?
- Does the log entry capture *who* (authenticated identity, not just an IP), *what*, *when*, and *from where*?
- Can the actor who performed the action **also modify or delete** the log of it? (If the app and the audit log share a DB/write path with no separation, a compromised app account can erase its own tracks.)
- Are logs tamper-evident (append-only, hash-chained, shipped to a separate system) or just rows in the same mutable table?
- For financial/state-changing actions specifically: is there a secondary record (email receipt, immutable order record) independent of the primary DB row, so a DB-level tamper doesn't also erase the evidence?

**Process to test practically:**
1. Perform a sensitive action (place an order, change a password, delete an item).
2. Look for where it's logged — server logs, audit table, notification/email.
3. Ask: with the access level *this actor* has, could they suppress or alter that record?
4. Check clock/timestamp trust — if timestamps are client-supplied rather than server-generated, a forged timestamp weakens the "when" part of accountability.

**Not yet checked in this project** — worth adding to `THREAT_MODEL.md`'s
open items: does Juice Shop log order placement / admin product edits
anywhere durable, and could the `PUT /api/Products/:id` abuse from Finding
4.2 be traced back to the acting user after the fact?

**Don't confuse with:** Information Disclosure (leaking *that* a log exists
or its contents to an unauthorized party is a different, IO-flavored
threat) — Repudiation is about the *absence or unreliability* of the
record, not who can read it.

---

## Information Disclosure — exposure to unauthorized parties

**Violates:** Confidentiality.

**Process** — for every response the app sends, ask "does the *recipient*
need every field in this payload, or does the API just return the whole
underlying object because that was easier to implement?" Two distinct
failure shapes to check separately:

1. **Object-level** — can I access *someone else's* data by changing an ID/reference? (BOLA — same privilege level, different owner.)
2. **Property-level** — for data I *am* allowed to see the existence of, does the response include fields I shouldn't see (password hashes, internal flags, other users' tokens) because there's no field-level allowlist? (BOPLA)

**Also check statically, not just via requests:**
- Are secrets embedded in tokens/cookies readable client-side (JWT payload is base64, *not* encrypted — decode it and read every field)?
- Are error messages, stack traces, or debug endpoints leaking internals in a non-prod-looking way?
- Is there a schema/docs endpoint (`/swagger.yml`, GraphQL introspection) exposed with no auth, handing an attacker the full API surface for free?
- Storage/transport: is anything sensitive logged in plaintext, cached by a CDN, or sent in a URL (query string → browser history, server logs, `Referer` header)?

**Confirmed here:** Finding 1.1 (JWT payload = full `Users` row including
password hash — property-level), Finding 2.1 (`/rest/basket/{id}` returns
any user's basket by incrementing an ID — object-level/BOLA), Finding 3.1
(`whoami?fields=` has no allowlist — property-level/BOPLA), Finding 4.1
(`/api/Users` dumps the entire table to any authenticated customer — both
object- and property-level, at scale), Finding 4.6 (`/swagger.yml` exposed
unauthenticated).

**Don't confuse with:** Elevation of Privilege. Reading another user's data
at your *same* privilege level (a peer's basket) is Information Disclosure
(possibly + Tampering if writable) — see the explicit note on this in
Finding 2.1. EoP means gaining a genuinely *higher* role, not lateral
access to a peer's record.

---

## Denial of Service — availability

**Violates:** Availability.

**Process** — for each endpoint, especially unauthenticated ones, ask what
resource it consumes per request and whether that cost is bounded:

- **Compute/DB cost per request** — does any endpoint do unbounded work per call (expensive search/regex, N+1 queries, unpaginated large-result endpoints)? Can it be triggered by a cheap request?
- **Rate limiting** — is there any cap on request volume per identity/IP, on *any* endpoint, not just login? (Finding 4.3 already shows login has none — worth checking whether *no* endpoint in this app has rate limiting, which would make this a systemic finding rather than an auth-specific one.)
- **Resource exhaustion via input size** — large file uploads, deeply nested JSON, huge array bodies (relevant given Finding 2.2 already shows the JSON parser has non-standard behavior on crafted input — worth checking if it also chokes/slows on pathological input, separate from the duplicate-key issue).
- **Asymmetric cost** — is there a cheap client action that causes expensive server-side work (e.g., triggering an email/PDF/export per request)?
- **Account lockout as a DoS vector** — if failed-login lockout *were* implemented, could an attacker lock out a victim's account by deliberately failing their login repeatedly? (Worth keeping in mind for when 4.3 gets remediated — fixing Spoofing can introduce a DoS if not designed carefully.)

**Not yet checked in this project** — flagged in `THREAT_MODEL.md`'s open
items as "API4 (resource consumption) not yet tested."

**Don't confuse with:** a functional bug that happens to crash one request
— DoS as a STRIDE category is about an *attacker-triggerable, repeatable*
resource-exhaustion path, not an incidental crash found once.

---

## Elevation of Privilege — gaining a higher privilege level

**Violates:** Authorization (specifically, the privilege *boundary*, not just object ownership).

**Process** — first enumerate the actual privilege levels the app defines
(anonymous / customer / admin / service-account, etc.), then for every
sensitive action, ask "what's the *minimum* role required, and does the
server actually enforce that, or only check that *a* valid session
exists?"

- **Vertical check (the core EoP test):** take a low-privilege token and call every endpoint that should require a higher role. Does the server check the role claim, or just `isAuthorized()`-style "is this signature valid"?
- **Role claimed vs. role enforced:** if role is a field inside a client-modifiable token or a client-editable profile field, can a user set their own role to `admin` and have the server trust it?
- **Missing checks on a subset of routes:** a common real-world pattern — most admin routes correctly check role, but one or two were added later and only got the auth-presence check copy-pasted, not the role check. Enumerate *every* route, don't sample.
- **Indirect escalation paths:** can a lower-privilege action (e.g., a profile update) be used to set a field that a higher-privilege check later trusts (e.g., editing your own `role` field via an endpoint that wasn't meant to allow it)?

**Confirmed here:** Finding 4.1 (`GET /api/Users`) and Finding 4.2
(`PUT /api/Products/:id`) both stem from the same root cause — routes
registered with only `security.isAuthorized()` (valid signature) and no
role check at all. That root cause is itself worth stating once in the
writeup rather than treating each route as an unrelated finding: **this
app's authorization model checks "is this request signed by someone,"
not "is this request signed by someone with the right role," on an
unknown number of routes** — which reframes Open Item "sweep the API
Top 10" into "audit every route registration in `server.ts` for which
ones call `isAuthorized()` alone vs. a role-checking middleware."

**Don't confuse with:** BOLA (Finding 2.1) — reading/writing a peer's data
at the *same* role is not EoP even though it "feels" like unauthorized
access. EoP specifically means the *role itself* changed or was never
checked.

---

## Cross-category triage — how to tell them apart fast

When a finding could plausibly be filed under two categories, ask these in
order:

1. **Did an identity get faked/stolen?** → Spoofing.
2. **Did data change that shouldn't have?** → Tampering.
3. **Can the actor deny doing it, or is there no record?** → Repudiation.
4. **Did the wrong party see data?** → Information Disclosure.
   - Same role, different owner → BOLA/BOPLA, still Info Disclosure (+Tampering if writable).
5. **Did the service stop responding / get resource-starved?** → DoS.
6. **Did the actor's *role* increase?** → EoP. If the role didn't change and it's just "wrong owner, same role" — it's actually #4, not this one (see Finding 2.1's explicit correction on this exact mix-up).

A single root cause can produce findings in multiple categories (e.g., a
missing ownership check on a `GET` is Info Disclosure; the *same* missing
check on the matching `PUT` would additionally be Tampering) — file them
as related findings sharing a root cause, not as one blended finding.

---

## Threats by DFD element type — actors, processes, and stores carry threats too

All 10 confirmed findings in this project sit on one flow (`Angular
Frontend → Application Server`) — an accurate reflection of how testing
was scoped, not a rule that threats only live on arrows. Every DFD
element type can carry its own threats, and which STRIDE categories are
even *possible* depends on the element type, from the Phase 0 mapping:

| Element type | Valid STRIDE categories | Why |
|---|---|---|
| Actor (external entity) | Spoofing, Repudiation only | An actor doesn't hold data or run logic *inside* the system's control — the only meaningful questions are "is this really who they claim" and "can they deny acting" |
| Process | All six | A process makes decisions, so every trust question applies |
| Data store | Tampering, Info Disclosure, DoS (+Repudiation if it's specifically a log) | A store doesn't act or claim an identity, so Spoofing/EoP don't apply to the store itself |
| Data flow | Tampering, Info Disclosure, DoS | Same reasoning as a store — data in motion doesn't act or claim identity |

Below: concrete examples per element type, illustrative and drawn from
this project's own architecture/source where possible — **not** confirmed
findings, don't file these in `THREAT_MODEL.md` without actually testing
them first.

### Actor — Spoofing / Repudiation examples

- **Spoofing, real example already in this project's source:** the SQL
  injection in `routes/login.ts` (`' OR 1=1--` in the email field) isn't
  "stealing a password" — it defeats the entire mechanism that
  establishes "this actor is who they claim to be." That makes it an
  **actor-spoofing** threat on the `B2C Customer (Browser)` actor, distinct
  from any of the confirmed BOLA/BOPLA findings (which all assume a
  *real*, correctly-authenticated actor reaching data they shouldn't).
- **Spoofing, hypothetical:** if `B2B API` trusted the `B2B Customer
  (Browser)` actor based on nothing but a static API key embedded
  client-side or an IP allowlist, an attacker could impersonate a B2B
  partner entirely — again the actor's *identity* is faked, not just data
  accessed at the right identity.
- **Repudiation:** Finding 4.2's price-tampering abuse (`PUT
  /api/Products/:id`) isn't currently tied to a durable, identity-stamped
  audit log — so the `Admin (Browser)` actor (or whoever's token was used)
  could later deny having made that specific change. Nothing proves *who*
  did it after the fact.

### Process — all six, examples beyond what's already confirmed

- **Spoofing:** `B2B API` itself could be impersonated if there's no
  mutual-TLS or signed-request check between it and `Application Server`
  — a rogue service posing as `B2B API` and injecting requests
  `Application Server` trusts as legitimate.
- **Tampering:** not data tampering — tampering with the *process's own
  logic*. E.g. a path-traversal bug in a file-upload feature overwriting
  a file `Application Server` itself loads/executes at runtime.
- **Repudiation:** `Application Server` performs privileged actions
  (approving orders, changing prices) with no internal log distinguishing
  which code path or service identity performed them.
- **Information Disclosure:** verbose stack traces or debug output from
  `Application Server` leaking internal file paths, library versions, or
  environment details in an error response — untested in this project,
  worth a quick check (trigger a 500 and read the body).
- **Denial of Service:** `Application Server` itself falling over under
  unbounded per-request work — this is exactly the untested API4
  category from `THREAT_MODEL.md`'s time-boxed list.
- **Elevation of Privilege — this is genuinely what Findings 4.1/4.2 are,
  reframed at the process level:** `Application Server`'s own
  request-handling logic fails to enforce a privilege boundary it's
  supposed to enforce internally (`isAuthorized()` checks a valid
  signature, never a role). Worth noticing: the same underlying finding
  can be described as "Information Disclosure on this route" *and* "an
  Elevation of Privilege weakness in the process as a whole" — different
  altitude, same root cause.

### Store — Tampering / Info Disclosure / DoS / (Repudiation if it's a log)

- **Tampering:** the same login SQL injection above *also* lands here
  from a different angle — filed against the `B2C Customer` actor it's
  Spoofing (the identity check is defeated); filed against `SQLite
  Database` it's Tampering (arbitrary rows can be read/matched outside
  the app's intended query shape). One root cause, two valid STRIDE
  entries at two different elements — exactly the "cross-category
  triage" pattern above, just spanning element types instead of just
  categories.
- **Information Disclosure:** `MarsDB NoSQL DB` misconfigured for open
  network access (a common real-world MongoDB-style misconfig), or a
  `SQLite Database` backup file accidentally left inside the served
  webroot and directly downloadable — neither tested in this project.
- **Denial of Service:** `Local File System` filled to capacity via
  unrestricted file uploads with no size/quota limit — Juice Shop has a
  file-upload feature; whether it enforces a size cap is untested.
- **Repudiation (only when the store is specifically a log):** if
  `Local File System` holds application logs and the same
  process/account that would be compromised in an attack can also write
  to or delete those logs, an attacker can erase evidence of their own
  actions after the fact.

**Why this matters for the interview framing:** a diagram where every
threat sits on one flow can look like tunnel vision unless you can name,
specifically, what *other* threats the same DFD invites at other element
types — even ones not yet tested. Being able to produce the table above
on the spot is a stronger signal than the diagram alone.
