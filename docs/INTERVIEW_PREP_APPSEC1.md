# Interview Prep Notes

What this project is meant to demonstrate, and how to talk about it.

## What an AppSec engineer actually does

Not just "runs scanners." The role, roughly:

- **Tooling & pipeline ownership** — wire SAST/SCA/DAST/secrets/container scanning
  into CI/CD so security signal shows up automatically, not on request.
- **Normalization & triage** — every scanner speaks a different format; someone
  has to collapse them into one shape, dedupe repeat findings across scans, and
  cut through false positives so developers trust the signal.
- **Prioritization** — not all findings are equal. Severity, exploitability,
  exposure (is this internet-facing?), and blast radius all factor into what
  gets fixed first.
- **Driving remediation** — the job isn't done at "found it." Tracking a
  finding from `open` → `triaged` → `fixed` (or `false_positive` /
  `ignored`, with a reason) across dev teams is most of the actual work.
- **Secure design & threat modeling** — reviewing designs before code exists,
  not just scanning after.
- **Build vs. buy** — deciding when to hand-roll tooling vs. adopt a platform
  (DefectDojo, ArmorCode, Wiz, Snyk's own platform, etc.) — see below.

**Q: If tools do all the scanning/normalization/dedup work, what's actually
left for the AppSec engineer once the pipeline is integrated?**
A: Automation handles *detection at scale*; the engineer handles *judgment,
context, and getting the fix to actually happen*. Concretely, what a tool
can't do on its own:
- **Triage against noise.** SAST/DAST/SCA tools routinely produce 30-70%
  false positives, or true-but-irrelevant findings (a "vulnerable"
  dependency whose vulnerable code path is never actually called). Someone
  has to read the code/architecture and decide if a finding is real and
  reachable.
- **Contextual risk framing.** A tool can't know a SQLi in an internal
  admin tool used by 3 trusted employees is lower risk than an XSS on the
  public signup page — that needs knowledge of what the app does, what
  data it touches, and who can reach it.
- **Findings tools structurally can't produce.** Authorization logic flaws
  (BOLA/IDOR — this project's own confirmed findings are a direct example),
  business logic abuse, multi-step attack chains combining several
  low-severity findings into one critical one. These need a human
  reasoning like an attacker, not a signature match.
- **Driving remediation.** Getting a dev team to actually ship the fix —
  reviewing the patch, explaining why it matters, negotiating timelines —
  is most of the actual day-to-day work, and it's exactly the step a
  scanner has no visibility into.
- **Threat modeling / design review**, upstream of any scan — reviewing a
  feature before it's built so the vulnerability never enters the code.
- **Tool/pipeline ownership** — choosing tools, tuning rulesets to cut
  noise, deciding what gates a build vs. just warns.
- **Program-level work** — severity thresholds, SLAs, security champions,
  reporting risk posture to leadership.
For this project specifically: the pipeline (CI → scanners → ingestion →
dashboard) is the detection plumbing. The interesting follow-up an
interviewer would ask is what happened *after* a finding landed — the
manual IDOR/BOLA confirmation work and the Threat Dragon modeling (see the
DFD Q&A section below) are the actual "what's left for the human" answer,
not just an abstract list.

## What this project demonstrates

| Skill | Where it shows up |
| --- | --- |
| Understands the SAST/SCA/DAST/secrets/container taxonomy | `ARCHITECTURE.md` scanner coverage table — six tools, five categories, deliberate choice of what to include and what to defer (IaC) |
| Can normalize heterogeneous data into one schema | `ingestion/app/models.py` — the `Finding` model every scanner's output gets mapped into, explicitly modeled on the CIM (common information model) idea from log normalization; built from the enums in `schema.py` |
| Understands dedup at scale | `dedupe_hash` + upsert-by-hash logic — the same finding reported on every scan doesn't become N rows, it updates `last_seen` |
| Can design a findings lifecycle | `FindingStatus` enum (`open` → `triaged` → `fixed` / `ignored` / `false_positive`) |
| Can build the full loop, not just the scan step | CI → ingestion API → DB → dashboard — the part most take-home projects skip |
| Practical judgment on tool choice | Chose Juice Shop over hand-writing vulnerabilities (recognizable, realistic, someone else's code so findings aren't "planted"); scoped out IaC scanning because there's no real IaC to scan yet, rather than adding fake infra just to have something to point a tool at |

**Calibrating the normalization claim.** Claude wrote the `Finding` model and
the six parsers (`ingestion/app/parsers/`) — the typing wasn't mine. The
claimable skill sits upstream of the code: reading each scanner's actual
output shape (most emit a JSON object; gitleaks emits a bare array) and its
own severity vocabulary (Semgrep: `ERROR/WARNING/INFO`; Trivy:
`CRITICAL/HIGH/...`; ZAP: risk + confidence), then deciding what the common
target schema needed to be and how each tool's scale maps onto one 5-value
`Severity` enum. Be able to open `models.py` next to `parsers/semgrep.py` and
`parsers/trivy.py` cold and explain *why* the mapping looks the way it does —
that's what makes "I can normalize heterogeneous data into one schema" true,
not the fact that the Python exists.

**Normalization, mechanically — six shapes, one schema.** Six scanners
produce six different raw JSON shapes: different field names, different
nesting, different severity words (Semgrep: `ERROR/WARNING/INFO`; Trivy:
`CRITICAL/HIGH/...`; ZAP: risk + confidence, not one word). Each one's
parser converts its shape into the *same* `Finding` row, every time. It's
one schema, not "common fields plus a separate uncommon set" — the fields
just split into two kinds:

- **Always populated, regardless of source** — `source`, `rule_id`, `title`,
  `severity`, `dedupe_hash`. Every finding needs these to be sortable,
  dedupable, and displayable.
- **Optional, only meaningful for some scanner types** — `package_name` /
  `package_version` are only filled by SCA/container scanners (npm audit,
  Snyk, Trivy); a SAST tool like Semgrep or a secrets scanner like gitleaks
  has no package to report, so those columns are just left empty on those
  rows. `file_path` is filled for every source but means something
  different per scanner: a source file for SAST/secrets, the affected URL
  for ZAP's DAST findings (no file exists in a web scan).

Empty (`null`) is not the same as discarded. A `null` `package_name` on a
Semgrep row means that finding never had a package to begin with — nothing
was thrown away, the concept just doesn't apply to that scanner's output.
And even data that isn't promoted to a named column isn't lost either: the
full original scanner record is kept as-is in a `raw` JSON column
(`models.py:58`) for audit/debugging. Normalization here means "give every
finding a shared set of queryable columns," not "keep some fields and
discard the rest."

**In the simplest terms:** nothing is deleted. The schema (the set of
columns) stays fixed for every finding, no matter which scanner it came
from. If a particular scanner never had a value for one of those columns
(e.g. `package_name` for a Semgrep finding), that column is just left
`null` for that row.

## Build vs. buy — the Wiz angle

**What CNAPP means, and what its "graph" actually is.** CNAPP =
Cloud-Native Application Protection Platform, a Gartner-coined umbrella
term for a platform that unifies cloud security across several
previously-separate categories: CSPM (cloud resource misconfiguration),
CWPP (workload/container runtime protection), CIEM (identity &
entitlement risk — who can assume what role), code security (SAST/secrets/
IaC scanning), and increasingly DSPM (where sensitive data lives). The
**Security Graph** is the correlation engine at the center of that: a
graph database where nodes are cloud resources, identities, and findings,
and edges are typed relationships between them — `runs-on`,
`assumes-role`, `has-network-path-to`, `is-vulnerable-to`,
`contains-secret`, `can-read`. That structure is what lets the platform
answer a multi-hop question like "what's the shortest path from an
internet-facing VM to my production database" (an attack path / blast
radius query) instead of just listing findings sorted by severity.

**Why normalizing scanner output (what this project does) isn't a step
toward that graph — it's a different problem.** Mapping Semgrep + npm
audit + Snyk output into one `Finding` schema is single-domain ETL: many
tools, one shape, one table, still just findings. The graph needs data
that isn't a "finding" at all — a full asset inventory (every resource as
a node, not just the ones with a problem), identity/entitlement data
(CIEM), network reachability, and data sensitivity — plus identity
resolution to recognize the *same* resource when it's seen from two
different sources, plus a graph engine that can do traversal queries
(shortest path, reachability), which a flat SQL table of rows structurally
can't do no matter how many columns get added to it. See the schema
comparison below for the mechanical version of this same point.

Commercial CNAPP/ASPM platforms (Wiz, Snyk's platform, ArmorCode, DefectDojo)
do a more polished, often cloud-native version of exactly this pipeline:
ingest many scanners' output → normalize → dedupe → prioritize by
exploitability/exposure → assign to owners → track to remediation.

**Calibrate the claim to what actually happened.** At a former employer, I
used Wiz's findings/dashboard to triage vulnerabilities — a consumer of its
output, not the person who configured, administered, or tuned it. Don't
upgrade that to "administered Wiz" or "day-to-day Wiz ownership" on a CV or
in an interview — operational questions about connector setup or rule tuning
would expose the gap fast. The accurate, still-strong framing: real
(if limited) production exposure as a user, *plus* hands-on build experience
on an analogous pipeline. Talking points:

- "I used Wiz in a previous role to triage findings — I wasn't the admin,
  but I worked with its output day to day. To understand what's happening
  underneath that dashboard, I built a small version of the aggregation
  layer myself: mapping several scanners' formats into one schema, dedup by
  a stable hash, tracking lifecycle state."
- If asked to compare to Wiz directly: this project solves normalization and
  dedup; Wiz's actual differentiator is the **Security Graph** — correlating
  findings *across* modules (a vulnerable workload + internet exposure + an
  over-privileged identity = a "toxic combination"/attack path), which is a
  materially harder, graph-based correlation problem this project doesn't
  attempt. Naming that distinction accurately is worth more than a vague
  "I've used it before."
- If asked "why not just use an existing platform for this project" — the
  point isn't to replace Wiz, it's a learning/demonstration exercise; a real
  org would evaluate build vs. buy on cost, coverage, integration surface,
  and whether their scanners are already supported out of the box.

## How this maps to Wiz's actual modules

For grounding the conversation accurately, not for claiming hands-on use:

| Wiz module | What it does | Equivalent here |
| --- | --- | --- |
| Vulnerability Management (agentless) | Scans cloud workloads for known CVEs in OS packages/libraries | npm audit + Snyk (SCA) |
| Code Security | Shift-left: IaC misconfig, secrets detection, SAST, pre-merge | Semgrep + gitleaks |
| Container & Kubernetes Security | Image vulnerabilities, K8s misconfig, runtime posture | Trivy |
| CSPM | Cloud resource misconfiguration | out of scope — no cloud infra yet |
| CIEM | Identity & entitlement risk | not modeled in our schema |
| **Security Graph** | Correlates findings across all modules into attack paths/toxic combinations | **not attempted** — our dashboard is a flat, deduped list by severity, not a correlated graph |

## Finding schema — ours vs. Wiz's

The tool-mapping table above says the Security Graph is "not attempted." The
more precise version, for a follow-up question about *why* a flat schema
can't just be extended into a Wiz-like one:

- **Grain of a "finding" is different.** `Finding`
  (`ingestion/app/models.py`) is code-shaped: `rule_id`, `file_path`,
  `line_number`, tied to `repo` + `branch` + `commit_sha` — every row
  traces to a commit that introduced it. Wiz's findings are largely
  resource-state-shaped (a misconfigured S3 bucket, an over-privileged IAM
  role, a running container with a known CVE) — there's no commit that
  "introduced" a misconfigured bucket, it exists in cloud account state.
  A Wiz-equivalent schema needs `cloud_provider`/`account_id`/
  `resource_type`/`resource_arn`/`region` instead of repo/branch/commit.
- **Static per-rule severity vs. contextual severity.** `SEVERITY_MAP` in
  `ingestion/app/parsers/semgrep.py` is a hardcoded lookup
  (`ERROR → HIGH`), same for every rule, every repo, forever. Wiz computes
  severity dynamically off the Security Graph — the same CVE is critical on
  an internet-facing VM with an admin role attached, low on an isolated box
  with no sensitive data nearby — because exposure and identity bindings are
  first-class relationships in its schema, not just a `severity` column.
- **Flat row vs. graph node.** `dedupe_hash` only collapses *repeats of the
  same finding* across scans; there are no foreign keys between different
  findings. Wiz's findings are graph nodes with edges to resources,
  identities, and other findings, which is what lets it express a "toxic
  combination" (vulnerable workload + public exposure + over-privileged
  identity = one compound attack-path finding) — a structurally different
  data model (graph, not table), not just more columns on `Finding`.
- **Licensing is a separate axis from schema.** "Semgrep is OSS, Wiz isn't"
  explains cost/support, not the schema gap — a fully proprietary SAST
  tool's output would still normalize into a flat table like this one. The
  schema difference comes from single-scanner/code-centric normalization
  vs. multi-domain/resource-centric graph correlation, not open-source-ness.

## Build log — decisions made along the way

Real engineering judgment calls worth being able to narrate, not just the
finished architecture:

- **Git submodule, not a vendored copy, for `demo-target/`.** Juice Shop is
  ~1,300 dependencies and its own multi-year commit history — pulling that
  into our own repo's history would bury our actual work. A submodule pins
  us to one exact commit while keeping it a separate, referenced repo. This
  is the same reasoning a real org applies to any third-party code brought
  in for testing: track it, don't absorb it.
- **Pinned to an exact tag (`v20.2.0`), not `main`.** Tracking a moving
  branch means scan results drift under you — a finding that was there
  yesterday might be gone today because upstream shipped a fix, with no
  change on our side. Pinning makes scans reproducible and any given
  finding traceable to a specific, citable version.
- **Caught my own mistake mid-task**: first pass picked `v9.3.1` as
  "latest" from a `git ls-remote --tags` list that turned out to be
  truncated/unsorted, not chronological. Re-ran it sorted by actual semver
  and found the real latest (`v20.2.0`) before anything downstream depended
  on the wrong version. Worth mentioning in an interview as an example of
  verifying an assumption instead of trusting the first plausible answer —
  a very AppSec-relevant habit (don't trust unverified input, including
  your own tooling's output).
- **Ran Juice Shop natively via `npm start`, not Docker, for local dev.**
  No Docker/Colima installed on this machine yet, and GitHub Actions
  already ships Docker for CI — so local Docker setup isn't a blocker for
  making progress, only for later phases (packaging `ingestion/`/`dashboard/`
  as images) that actually need it. A pragmatic sequencing call: don't let
  environment setup block a step that doesn't require it.
- **First real data point, before the pipeline even exists**: `npm install`
  inside `demo-target/` surfaced npm audit's own findings for Juice Shop's
  dependencies — **46 vulnerabilities (7 critical, 19 high, 17 moderate,
  3 low)**. That's a concrete answer ready for "tell me about a real finding
  this caught" once one of them is picked out and mapped to an OWASP Top 10
  category (still open, below).

## Docker vs. VM — Q&A

Guaranteed interview territory, appsec or not.

**Q: How does a container actually differ from a VM?**
A: A Docker image bundles the whole runtime (Node.js, `node_modules`, OS
libraries) into one filesystem — that part matches intuition. What's
different is *what provides the isolation*:
- **VM = virtualizes hardware.** A hypervisor boots an entire separate OS —
  its own kernel, drivers, init system — on virtualized hardware. Each VM is
  a fully independent OS instance: gigabytes in size, tens of seconds to
  minutes to boot, because you're starting a whole computer.
- **Container = does not run its own kernel.** It's an isolated process on
  the *host's* existing kernel. Linux **namespaces** give it a private view
  of the filesystem/network/process tree; **cgroups** cap what resources it
  can use. No OS boots — you're starting a process with a fenced-off view of
  the system. Megabytes, not gigabytes; milliseconds to start, not minutes.

**Q: Why does Docker Desktop need to actually launch before `docker`
commands work on a Mac?**
A: Namespaces/cgroups are Linux kernel features that macOS doesn't have, so
Docker Desktop runs one lightweight Linux VM in the background just to have
a Linux kernel to containerize on top of. Every "container" on a Mac is a
namespaced process inside that one VM. On a native Linux host (e.g. a
GitHub Actions runner), no VM layer exists at all — containers really are
just processes on the host kernel, nothing more.

**Q: Where does that VM's disk actually live, and why can't I see the
Juice Shop container's files in Finder?**
A: On this machine: `~/Library/Containers/com.docker.docker/Data/vms/0/data/Docker.raw`.
That one file *is* the entire virtual hard disk of the Linux VM, formatted
as a real Linux filesystem that only the Linux kernel running inside the VM
understands. From macOS's side it's one opaque binary blob, not a folder
tree — Finder has nothing to show. The only way in is the `docker` CLI
talking to the daemon inside that VM: `docker images`, `docker ps -a`,
or `docker exec -it <container> sh` for an actual shell inside a running
container.

**Q: `ls -lh` showed that file as 460G — is that real disk usage?**
A: No. `du -h` on the same file showed only 543M actually consumed — it's a
*sparse file*: macOS only allocates real disk space for the parts actually
written to, even though the file "claims" 460G of address space. Standard
practice for VM disks: reserve a huge ceiling, only consume what's used.
Side note on units: `-h` on macOS's BSD tools reports binary units (1024-based,
technically GiB), not the decimal GB (1000-based) used on storage-box
labels — why a "1TB" drive shows as ~931G in Finder.

**Q: Why is the VM disk stored under `~/Library` specifically?**
A: `~/Library` is macOS's per-user directory for app/system data not meant
for casual browsing — hidden in Finder by default. It holds things like:
- **Application Support** – app data, settings, plugins
- **Preferences** – `.plist` files for app/system settings
- **Caches** – temp files, generally safe to clear
- **Logs** – diagnostic logs from apps and the OS
- **Containers** / **Group Containers** – sandboxed app data (App Sandbox)
- **Mail**, **Messages**, **Safari** – built-in app data
- **Fonts** – user-installed fonts (vs. system-wide `/Library/Fonts`)
- **LaunchAgents** – per-user background jobs that auto-start

Distinct from `/Library` (system-wide, all users) and `/System/Library`
(macOS itself — don't touch). Access via Finder's Go → Go to Folder →
`~/Library`, or Option-click the Go menu.

**Q: The path has "Containers" in it — is that a Docker container?**
A: No, and this is a genuine, easy-to-conflate naming collision. Every
sandboxed Mac app gets a private data folder at
`~/Library/Containers/<bundle-id>/` — that's **macOS's own App Sandbox
mechanism**, unrelated to Docker. Docker Desktop is a sandboxed Mac app, so
its bundle id (`com.docker.docker`) gets one of these folders, and that's
where it happens to keep its Linux VM's disk. Two unrelated meanings of
"container" (macOS app sandboxing vs. Docker process isolation) sharing a
folder name by coincidence — worth being precise about if it comes up.

**Q: Can Docker run something like Kali Linux instead of a separate VM?**
A: Partially — and the limits are a direct consequence of "container = no
own kernel." Kali publishes an official image (`kalilinux/kali-rolling`);
`docker run -it kalilinux/kali-rolling bash` gets Kali's actual package
repos and most CLI tools (nmap, sqlmap, hydra, gobuster) running in
seconds. But it's Kali's *userland*, not a real independent OS — it shares
the host's kernel (on Mac, Docker Desktop's own generic Linux VM kernel,
not Kali's). So no full desktop GUI, no kernel module loading, no wireless
adapter monitor mode without punching holes in the isolation via
`--privileged`/`--net=host` — at which point most of the safety benefit is
gone anyway. Good for CLI tool access; a real VM (VirtualBox, UTM) is still
right for OSCP-style or wireless-focused work needing genuine hardware/
kernel access.

**Q: Why does a container escape matter more than a VM escape?**
A: Because every container on a host shares one kernel, a kernel
vulnerability or container escape can potentially reach every other
container on that host — a materially bigger blast radius than a VM
escape, which has to get through a full hypervisor boundary first. This is
why genuinely multi-tenant platforms (AWS Lambda, Fargate) use **microVMs**
(Firecracker) as a middle ground: container-like startup speed, but a
minimal per-workload VM instead of one shared kernel.

## Tracing a data flow in DevTools — Q&A

How Phase 2's manual threat model actually gets its ground truth, before any
threat gets written down.

**Q: What's the right way to explore Network tab traffic for one flow,
instead of browsing every asset type that loads?**
A: Scope to the flow, not the page. A first instinct is often to look
through everything a page loads — fonts, CSS, images, JS bundles — but
those are static assets with no business logic in them; there's no
meaningful Spoofing/Tampering/Information Disclosure threat specific to,
say, a font file beyond generic transport security, which isn't tied to
any one flow anyway. Concretely:
1. Switch the Network tab filter from **Doc**/**All** to **Fetch/XHR** —
   shows only the app's actual API calls, not static assets.
2. Check **Preserve log** — a login can trigger a redirect that otherwise
   wipes the log right when the interesting request appears.
3. Perform the real action (submit the login form) and find the resulting
   request — for Juice Shop, `POST /rest/user/login`.
4. Read its **Headers** tab (request body — email/password, anything else?)
   and **Response** tab (what comes back — a JWT? in the body, or a
   `Set-Cookie` header?).
This filtering-out-the-noise judgment — knowing what's actually part of the
flow vs. just traffic the page happens to generate — is itself a real
threat-modeling skill, not just a DevTools tip.

**Q: Is it worth comparing traffic before and after logging in, or is the
login request itself enough?**
A: Compare both — they answer different questions. The login request shows
how credentials go *in*. What changes on requests made *after* login (does
an `Authorization: Bearer ...` header appear? a cookie instead?) shows the
actual mechanism the trust boundary depends on for every subsequent
request. That mechanism is exactly what a later IDOR-style flow (viewing
another user's order/profile) tests whether the server actually
*enforces* — so this comparison is groundwork for a flow that hasn't
started yet, not just thoroughness for its own sake.

**Q: Is there a default/dummy login for Juice Shop?**
A: No documented one, deliberately — discovering valid admin credentials
is itself one of Juice Shop's built-in graded challenges (classically, an
SQL injection in the login form's email field, e.g. `' OR 1=1--`, bypasses
the password check — a textbook authentication-bypass Spoofing threat,
worth returning to once threats are actually being brainstormed, not just
during data-flow mapping). For mapping the flow's shape, real credentials
aren't needed: submit garbage credentials to see a **failed**-login
request/response, or self-register a throwaway account via the app's own
signup form to see a genuine **successful** one — self-registration is the
right choice specifically when the goal is seeing how the token gets
issued, since a failed login never shows that.

**Q: Do you need to exploit a vulnerability (e.g. the SQLi login bypass) to
map a flow's DFD?**
A: No. Mapping a DFD only needs *a* successful request/response pair for
that flow — the shape is identical whether you get there via normal
credentials or an exploit, because it's the same endpoint, same fields,
same token format either way. Confusing "how the boundary normally works"
(flow-mapping, an early step) with "what can go wrong at that boundary"
(threat-brainstorming, a later step) is scope creep — it's easy to get
pulled into an interesting vulnerability mid-mapping and lose track of
which step you're actually on. Use the normal/intended path (self-register
→ log in) to map the flow; set discovered vulnerabilities aside and come
back to them deliberately once actually brainstorming threats, where they
belong as evidence, not as the mapping method.

**Q: What's the actual objective when tracing the login boundary?**
A: Capture what crosses the trust boundary in both directions:
- **In** — what's actually in the request body (just email + password, or
  more?).
- **Out** — what's actually in the response (a JWT? in the response body,
  or set via a `Set-Cookie` header instead? does it include anything
  beyond the token itself, like the user's role or ID, that a client
  doesn't strictly need?).
That request/response pair is the one data-flow arrow this part of the DFD
is built from.

**Q: How is a JWT's payload readable without "cracking" it — what's
actually reversible vs. actually protected?**
A: A JWT touches three genuinely separate things, and blurring them is a
common, worth-correcting confusion:
1. **Encoding (Base64URL)** — what wraps the header and payload. This is
   reversible by design, no key required, and there's exactly one way to
   decode it (a fixed, public scheme, RFC 4648) — not a hash, not
   encryption, nothing to "crack" or guess an algorithm for. Split the
   token on `.`, take the piece you want, pad it, run a standard decoder
   (or paste the whole token into **jwt.io** — same result, no login).
2. **Signing (the header's `alg`, e.g. `RS256`)** — proves the payload
   wasn't tampered with, *if* you have the right key to check it. It does
   **not** hide the payload's content, and reading the payload never
   requires touching the signature at all — verifying authenticity and
   reading content are two independent operations. The algorithm itself is
   stated in plain text in the decoded header, not detected or guessed.
3. **A field that's actually hashed inside the payload** (e.g.
   `"password": "5f4dcc3b..."`) — that value genuinely is a one-way hash,
   and decoding the JWT does **not** reverse it; the hash string is just
   displayed as-is, still hashed. Reversing *that* would mean cracking it
   (rainbow tables, brute force) — a completely different, much harder
   problem than decoding the token that contains it.
Net: finding `"id": 26` sitting in a decoded JWT payload isn't a broken
hash or a cracked cipher — it's plain-text JSON that was never designed to
be hidden from anyone holding the token in the first place.

**Q: What's the difference between an "observation," a "candidate" finding,
and a "confirmed" one — why does it matter to keep them separate?**
A: Three distinct confidence levels, and blurring them undersells (or
oversells) your work:
- **Observation** — noticed something, haven't checked what it means yet
  (e.g. "the app doesn't seem to set a strict CSP" before actually reading
  the response headers).
- **Candidate** — a real pattern spotted with a plausible security
  implication, but not yet tested (e.g. "this basket URL has a sequential
  numeric ID" — suggestive, not proven).
- **Confirmed** — actually tested and reproduced (e.g. "I requested another
  user's basket ID and the server returned their data").
Saying "I found an IDOR" when you've only reached candidate stage is the
kind of claim that falls apart under one follow-up question in an
interview. Keep the label honest and the distinction visible in your notes.

**Q: How do you safely test a suspected IDOR/BOLA once you've spotted the
pattern (e.g. a sequential ID in a URL)?**
A: In DevTools, right-click the original request (e.g. `GET
/rest/basket/6`) → **Copy → Copy as fetch**, paste it into the Console, edit
just the ID in the URL (e.g. `6` → `5`), and run it. This replays the exact
same request — same headers, same auth — with only the one variable
changed, so you know precisely what you tested. If it returns another
user's data, that's now confirmed, not a candidate. (A simpler but less
controlled variant: paste the URL directly into the address bar in the same
browser session — but that only sends cookies automatically, not custom
headers, so it also happens to test *which* auth channel the server
actually honors.) Doing this against your own local instance of an
intentionally vulnerable app is unambiguously fine — this is not something
to casually try against a real system without authorization.

**Q: What are the alternatives to curl for this kind of test, and do they
all test the same thing?**
A: No — a couple of them test genuinely different things, worth choosing
deliberately rather than interchangeably:
- **DevTools Console, "Copy as fetch"** — reuses the exact browser session
  (same headers/cookies) with no new tool; response lands as a Promise, so
  read it via `.then(r=>r.json()).then(console.log)`.
- **Paste the URL straight into the address bar** — sends cookies
  automatically but *no custom headers*, since you can't attach one from
  the address bar. This tests something curl-with-`-H "Authorization:..."`
  doesn't: whether the server accepts cookie-only auth, independent of the
  header. Worth doing deliberately when a token is being sent both ways
  (see the dual-channel finding above), to learn which channel is actually
  load-bearing.
- **Burp Suite / OWASP ZAP's Repeater** — capture the real request, send to
  Repeater, edit one field, resend, compare — the standard professional
  workflow for exactly this "tamper one field, resend" test, especially
  once doing it repeatedly rather than once. Since ZAP is already in this
  project's scanner pipeline, this is the same tool wearing a manual-testing
  hat instead of its automated-baseline-scan hat.
- **Postman/Insomnia** — GUI alternative to curl; nice for building a
  reusable collection of test cases, unnecessary for a single one-off check.

**Q: How do you actually set up and use Burp Suite against a local
target — does it need a Chrome extension, or a Kali VM?**
A: Neither, and both are common misconceptions worth clearing up plainly:
- **No VM/Kali needed.** Burp Suite (and OWASP ZAP) are regular desktop
  apps — Kali just ships them pre-installed for convenience. Install
  directly: `brew install --cask burp-suite` (Community Edition, free).
- **No Chrome extension either.** Burp runs its *own* local proxy; your
  browser has to be pointed at it, not the other way round.

Setup, in order:
1. Launch Burp Suite → **Temporary project** (Community can't save
   projects anyway) → **Next** → **Use Burp defaults** → **Start Burp**.
2. **Proxy** tab → **Intercept** sub-tab → click **Open Browser**. This
   launches Burp's own bundled Chromium, pre-configured to route through
   its proxy with the certificate already trusted — zero manual config.
   Do all testing in *that* window, not your normal Chrome.
3. Browse the target app there (log in, view basket, etc.) — every request
   appears in **Proxy → HTTP History**.
4. Turn the **Intercept** toggle **off** for general browsing — it's
   separate from HTTP History logging; with it on, every request pauses
   until manually forwarded, useful later but tedious just to look around.

(To use your *normal* browser instead: point its proxy settings at
`127.0.0.1:8080` — Burp's default listener — via system network settings
or a switcher extension like FoxyProxy. Since Juice Shop is plain HTTP,
not HTTPS, Burp's CA certificate doesn't even need installing for this
specific target — that's only required to intercept HTTPS traffic.)

**Q: What do you actually use inside Burp, once traffic is flowing?**
A: Five features cover almost everything, each replacing a step that was
previously done manually:
- **Proxy → HTTP History** — a persistent, searchable version of the
  Network tab; survives navigation with no "Preserve log" checkbox needed.
- **Right-click a request → Send to Repeater** — the core manual-testing
  tool. Edit any part (an ID in the path, a header, a body field) and hit
  Send repeatedly; responses stack up for comparison. Replaces retyping
  curl commands or DevTools' Copy-as-fetch for each variant.
- **Comparer** — select two responses (e.g. basket 5's vs. basket 6's) and
  get a visual diff — would have shown the `UserId: 16` vs. `25` mismatch
  immediately, no manual JSON reading needed.
- **Decoder** — paste a JWT in, get an instant base64 decode — replaces a
  one-off Python script for exactly that task.
- **Target → Site map** — auto-builds a tree of every URL touched during
  the session. Directly useful for API9 (undocumented endpoints) and API5
  (spotting admin-looking paths) — recon gathered for free just by
  browsing normally, no separate enumeration step required.
- **Intruder** exists in Community but is heavily throttled — fine for a
  small manual sweep (e.g. basket IDs 1–10 by hand), not real-volume
  fuzzing; that needs the paid Professional edition.

**Q: What's the difference between a "bounded flow" (Phase 2 step 1) and a
"trust boundary" (Phase 0)? They sound alike but aren't the same thing.**
A: They're not — different questions, different owners:
- **Bounded flow** — a scoping decision the *analyst* makes: pick a slice
  of the app with a clear start and end (e.g. "the login flow") so the
  analysis is tractable, rather than modeling the whole app at once. About
  analysis scope, not authorization.
- **Trust boundary** — a property *of the system*, discovered while
  analyzing that flow: the specific point where the level of trust changes
  as data crosses it. Marking one is a prompt to ask "should a check be
  enforced here" — not itself a statement of what's authorized; the check
  (or its absence) is the actual finding.
You scope first (bounded flow), then find the boundaries within that scope
(trust boundary) — two separate steps for a reason.

**Q: Are trust boundaries only about role (anonymous vs. customer vs.
admin)?**
A: No — refined by the basket BOLA findings above. Your basket and a
stranger's basket are both reached with an identical `customer`-role
token — same privilege level — yet there's clearly a boundary between
them, because it's about **ownership/identity**, not role. Trust
boundaries include per-identity (or per-tenant) boundaries, not just
per-role ones — worth stating this precisely rather than assuming trust
boundaries only ever separate privilege *levels*.

**Q: Was the `clarinet` library itself the vulnerability in the basket
tampering finding?**
A: No — attribute this precisely. `clarinet` (a streaming JSON parser)
did exactly what it's designed to do: report every key it sees, duplicates
included, faithfully in order — correct behavior, not a defect. The bug
lives entirely in Juice Shop's *own* route code, which checked one array
index (`basketIds[0]`) but wrote using a different one
(`basketIds[basketIds.length-1]`). Had the route used plain `JSON.parse`
instead, a duplicate key would've silently collapsed to a single value
automatically, and this exact bug couldn't exist. Root cause: an
application logic bug enabled by a parser *choice* — never say "clarinet
has a vulnerability," that's simply inaccurate.

**Q: What is Threat Dragon, who makes it, and how does it fundamentally
work?**
A: Three things worth having straight, since this tool was new territory
here:
- **Who makes it:** it's an **OWASP project** — full name "OWASP Threat
  Dragon" — built and maintained under the OWASP Foundation, the same
  nonprofit behind the OWASP Top Ten, the API Security Top 10, and ZAP
  (already in this project's own scanner pipeline). Free and open-source,
  available as a desktop app or a web app (threatdragon.org).
- **What it gives you:** an actual DFD drawing canvas — proper notation
  (actors, processes, stores, flows, trust boundary lines), drag-and-drop
  — and once an element is placed, it auto-suggests which STRIDE
  categories are even valid for that element's *type*, enforcing the same
  systematic per-element-type walk from Phase 0 instead of free-form
  brainstorming.
- **How it fundamentally works, mechanically:** it's not a database or a
  cloud service — every diagram, boundary, and threat you create is just
  one JSON file on disk, and that file follows a **specific, fixed
  schema** (exact element/threat object shape — see the dedicated Q&A
  below). The app's job is reading that file into the visual canvas and
  writing it back out on Save; nothing more. That's also why Juice Shop's
  own `demo-target/threat-model.json` opens directly in it with zero
  conversion needed — it's already in that same native format.

**Q: Did we create `threat-model.json` ourselves — did a step get missed?**
A: No, and worth being precise about this for an interview. It's a file
Juice Shop's own maintainer (Björn Kimminich) added to *Juice Shop's own*
git history back in **2021** — confirmed via
`git log --follow -- threat-model.json` inside the `demo-target`
submodule, showing commit `894043c1e "Add threat model diagram"` authored
years before this project existed. It came along automatically the moment
Juice Shop was pulled in as a submodule (Phase 1) — nothing was built or
requested specifically to get it. It lives in `demo-target/`'s history,
not `vigilant-engine`'s own, because it's part of the target app's
codebase, not something this project authored. As of now the file on disk
is still exactly as shipped — diagram drawn, zero threats filled in;
populating it with the confirmed findings is the still-pending next step.
The honest interview framing: *"the target app shipped its own DFD; I
validated it against real traffic I captured, then extended it with the
vulnerabilities I found"* — not "I built this DFD from scratch."

**Q: What's the actual process for "doing the DFD" when a diagram already
exists, rather than starting from a blank canvas?**
A: A realistic professional workflow, and the one that applies directly
here since Juice Shop ships its own official DFD:
1. **Check whether one already exists** — design docs, an architecture
   wiki, or (here) a maintainer-authored file already in the repo.
2. **Validate it against what you actually observed** — does the shipped
   diagram's shape match the traffic seen in Burp/DevTools? Confirmed here:
   every test in this project went through `Angular Frontend →
   Application Server`, which is exactly one of the shipped flows.
3. **Extend it** — attach your own confirmed findings as threats on the
   relevant elements/flows, since the shipped file has zero threats filled
   in despite having the full diagram drawn.
Reading and correctly extending someone else's existing model is itself a
real, common skill — not a lesser substitute for drawing one from scratch.

**Q: What does Juice Shop's own shipped DFD actually contain?**
A: Parsed directly from `demo-target/threat-model.json`'s `diagramJson`:
- **Actors:** `B2C Customer (Browser)`, `B2B Customer (Browser)`, `Admin
  (Browser)`, `Accounting (Browser)`, and `Google` — marked **out of
  scope** in the file itself, since it's an external OAuth provider, not
  part of the system being modeled.
- **Processes:** `Angular Frontend`, `Application Server`, `B2B API`.
- **Stores:** `SQLite Database`, `MarsDB NoSQL DB`, `Local File System`.
- **Flows:** `B2C Customer → Angular Frontend → Google`; `Angular Frontend
  ⇄ Application Server → B2C Customer`; `B2B Customer → B2B API →
  Application Server`; `Admin`/`Accounting (Browser) → Angular Frontend`;
  `Application Server → SQLite Database`; `Application Server ⇄ MarsDB
  NoSQL DB`; `Application Server ⇄ Local File System`.
- **5 trust boundary rectangles** are drawn on the canvas, but the JSON
  only stores their pixel coordinates, not labels — the only way to know
  what each one encloses is to open the file in the tool and look.
Notably: every one of this project's 10 confirmed findings sits on the
same single edge, `Angular Frontend ⇄ Application Server` — a genuinely
useful observation for an interview ("nearly everything I found clustered
at one trust boundary crossing, because that's where the API actually
enforces, or fails to enforce, authorization").

**Q: Concretely, how do you use Threat Dragon once it's installed?**
A: 
1. **Open Existing Model** → the repo's `demo-target/threat-model.json` —
   renders immediately since it's already native Threat Dragon format.
2. Visually inspect the 5 trust boundary rectangles first — which elements
   does each enclose? This *is* the "mark trust boundaries" step; since
   they're already drawn, the skill being exercised is reading and
   understanding an existing boundary, not drawing a new one.
3. Click a flow (e.g. `Angular Frontend → Application Server`) → **Add
   Threat**. The tool restricts the STRIDE category dropdown to only the
   categories valid for that element *type* — a Flow can only ever be
   Tampering, Information Disclosure, or DoS, never Spoofing or Elevation
   of Privilege, matching the Phase 0 per-element-type table exactly.
4. Fill in: Title, STRIDE category, Description (the root cause), Severity,
   Mitigation (what would actually fix it).
5. Repeat once per confirmed finding, attaching each to whichever
   element/flow it actually crosses.
6. **File → Save** — writes the threats back into the JSON; that populated
   file is the tangible Phase 2 deliverable, distinct from the prose
   findings log in `THREAT_MODEL.md`.

**Q: Walk me through exactly what you clicked to create the Threat Dragon
DFD — not just the theory, the actual UI steps.**
A: Verified against the real v2.6.2 desktop app (not just the docs), since
its UI has changed across versions:
1. **Open Existing Model** → select `demo-target/threat-model.json`.
2. This lands on a **metadata/editing page first** — not the diagram
   canvas. It shows Title (`OWASP Juice Shop`), Owner (`Björn Kimminich` —
   confirms the maintainer authored this file, matching the git-log
   evidence found earlier), a High level system description, Contributors,
   and a **Diagrams** section listing one entry: `High Level Data Flow`,
   tagged with a `STRIDE` badge. Easy to mistake this for the whole tool —
   it's just the model's cover page.
3. **Click directly on the diagram row** (`High Level Data Flow` text, or
   its `STRIDE` badge) — this is what actually switches to the drawing
   canvas with the boxes and arrows (`B2C Customer`, `Angular Frontend`,
   `Application Server`, etc.).
4. On the canvas, **click the flow arrow** between `Angular Frontend` and
   `Application Server` specifically — the edge nearly every confirmed
   finding belongs to, per the flow-mapping done earlier.
5. Clicking it opens a threats panel with an **Add Threat** control. Each
   threat added here becomes one JSON object in that flow's `threats`
   array, matching the exact schema already confirmed (`title`, `type`,
   `severity`, `description`, `mitigation`, `status`, `modelType:
   "STRIDE"`).
6. **Populate each field by hand from `THREAT_MODEL.md`**, one finding at
   a time — no import feature exists, so this is manual transcription:
   Title (short label), Type (the STRIDE category already assigned per
   finding in the Markdown), Severity (judgment call — the severe ones
   like `PUT /api/Products/:id` price tampering as High), Description (the
   root-cause paragraph), Mitigation (the actual fix, e.g. "check
   `basket.UserId` against `req.user.id` before returning"), Status
   (`Open` — none of these are fixed).
7. The same **Save** button used on the metadata page (bottom-right) also
   commits the diagram/threats — it's all one file, `threat-model.json`,
   regardless of which page is showing.

**Q: The diagram canvas came up completely blank in Threat Dragon, despite
the JSON clearly having 31 cells. What happened, and how was it
diagnosed?**
A: A real format-incompatibility bug, root-caused by diffing schemas
directly rather than guessing. Symptom: opening
`demo-target/threat-model.json` in the installed v2.6.2 app rendered the
metadata page correctly (title, owner, description all showed up — these
are simple top-level fields) but the diagram canvas itself showed nothing
— no boxes, no arrows — with no error message.

**Diagnosis:** pulled a real, current demo file from Threat Dragon's own
GitHub repo (`OWASP/threat-dragon`, `td.vue/src/service/demo/*.json`) and
compared its structure to ours field by field:

| | Juice Shop's file (written 2021) | v2.6.2's expected format |
|---|---|---|
| Cells location | nested: `diagrams[0].diagramJson.cells` | flat: `diagrams[0].cells` |
| `version` field | absent | present, e.g. `"2.4.0"` |
| Element field | `"type": "tm.Process"` | `"shape": "process"` |
| Flow endpoints | reference element `id` directly | reference `{cell: id, port: id}` |

Juice Shop's file predates a breaking rewrite — it's in Threat Dragon's
old v1.x (JointJS-based) schema, while the installed v2.6.2 is the newer
AntV X6-based renderer. The app reads format-agnostic top-level fields
fine and silently fails to draw the parts of the file it doesn't
recognize, rather than erroring — the kind of "worked in the old version,
silently no-ops in the new one" bug that's genuinely common with any tool
that's had a breaking format migration.

**First decision (later revised): rebuild by hand in the GUI.** Initial
reasoning: the new format's flow objects need per-element **port IDs**
that are normally only generated correctly by the GUI when a shape is
placed — a hand-written migration seemed to risk producing a second file
that's *also* silently broken, with no easy way to confirm it worked. So
the first plan was manual reconstruction, element by element, in Threat
Dragon's canvas.

**Revised decision: generate the file with a script instead, but
*verify* it structurally before trusting it.** After a long stretch of
slow, error-prone manual GUI clicking, the actual blocker in the first
decision turned out to be avoidable: the "risk" was only real if the
generated file couldn't be checked. It can — a script can walk every
`flow` cell's `source.cell`/`source.port` and `target.cell`/`target.port`
and confirm each one resolves to a real port on a real node *before* the
file is ever opened in the app, which is a stronger guarantee than eyeballing
a GUI-built diagram. Once that check exists, hand-building it in the
GUI stops being safer, it's just slower. Worth being honest that this
was a judgment call made too late, not too early — the schema was already
fully understood before the manual rebuild started; the extra step (write
a validator, then generate) should have happened first.

**Where the schema came from, precisely — two sources, not one:**
1. **OWASP's own GitHub repo** (`github.com/OWASP/threat-dragon`,
   `td.vue/src/service/demo/*.json`) — bundled example files showing the
   general shape: `version` field placement, how `actor`/`process`/
   `store`/`flow`/`trust-boundary-box` are each structured, what fields
   live under `data`.
2. **The real file the installed app itself produced** — after creating
   a "New Blank Model" and saving it through the actual GUI, that saved
   file was read directly off disk and confirmed to have `"version":
   "2.6.2"` with cells flat under `diagrams[0].cells`, matching what the
   GitHub examples showed. This second check mattered more than the
   first: it's not a possibly-mismatched-version example, it's literally
   what *this specific installed copy* of the app writes.
The generator script was built against that confirmed-real structure, then
validated by checking every flow's cell/port reference resolves — only
then handed over as a finished file.

**Why this is a good interview story, including the miscalculation:**
it's a real, diagnosed-from-first-principles bug (not "the tool was
broken, I gave up"), it demonstrates comparing JSON schemas methodically
rather than guessing at a fix, and — worth being candid about rather than
polishing out — the first engineering call (avoid scripting, rebuild by
hand) was the more cautious-*sounding* option but not actually the
better one once verification was possible. Recognizing that and reversing
the decision, rather than sunk-costing through the slower manual path, is
itself worth being able to describe honestly.

The honest interview answer to "how did you create the DFD," updated for
what actually happened: *"Juice Shop's maintainer had already drawn one,
back in 2021 — but it turned out to be in Threat Dragon's old file
format, which the current version of the tool can't render; the canvas
came up blank with no error. I diagnosed that by comparing the old file's
JSON structure against current examples from Threat Dragon's own repo,
cross-checked against a file the installed app itself generated, and
found the exact schema differences. I initially planned to rebuild the
diagram by hand in the GUI to avoid the risk of a silently-broken
generated file — but once I had the schema confirmed precisely, I wrote a
script to generate the diagram directly instead, validating every
flow's connection reference programmatically before treating it as done.
That's actually a stronger correctness guarantee than a manually-clicked
diagram would have had. I then attached my 10 confirmed findings as
threat entries on the flow my testing actually exercised."*

**Q: How do threats actually show up on a Threat Dragon diagram — are
they drawn directly on the canvas?**
A: No — the canvas itself just shows the DFD shapes (boxes and arrows);
there's no threat icon or label drawn directly on the diagram by default.
Threats are **attached data on a specific element**, and you see them by
selecting that element:
1. Click directly on the element or arrow a threat belongs to (any of the
   four DFD element types — actor, process, store, or flow/arrow — can
   hold threats, not just arrows).
2. A **Threats panel** appears (bottom of the screen), listing every
   threat attached to that specific element as a card: number, title,
   STRIDE category badge, and a small warning icon/dot showing it's
   `Open`.
Confirmed hands-on: clicking the `Angular Frontend → Application Server`
flow (the one edge nearly every finding in this project actually crosses)
opened its Threats panel showing all 10 confirmed findings as cards —
matching exactly what was written into that flow's `threats` array when
the file was built. In this project's specific diagram all 10 happen to
sit on one flow, since that's the one edge where every finding was
actually found — but the general mechanism is "attached to whichever
element the threat applies to," not "always on an arrow."

**Q: Are all 10 threats really only on the `Angular Frontend →
Application Server` flow, with zero on every other element?**
A: Yes — checked directly against the file, not just visually. All 10
elements (4 actors, 3 processes, 3 stores) and all 9 of the *other* flows
(`uses` ×4, `calls`, `responses`, `reads/writes` ×3) have empty `threats`
arrays; every finding sits on the one flow named `REST API calls (10
confirmed findings)`.

This isn't a script artifact — it's an accurate reflection of how the
testing was actually scoped. Every confirmed finding came from exercising
the REST API directly (curl/Burp) against the `Application Server`,
which is reached through that one flow. Nothing in this project's testing
touched the `B2B API` path, the database/file-system layer directly, or
distinguished `Admin`/`Accounting` from plain customer actors in practice
(that distinction only exists as a trust boundary drawn from reasoning,
not from an actual tested finding).

**Worth stating as an honest limitation, not hiding it:** the diagram
currently shows a real testing gap, not full coverage — e.g. "is the
`SQLite Database` store encrypted at rest," "does the `B2B API` path
enforce the same checks as the customer-facing one," or "can `Admin`
capabilities be reached from a plain customer token" are all real STRIDE
questions the DFD *invites*, but none were actually tested in this
project. Good interview framing: *"the diagram doesn't just document what
I found, it also makes visible what I didn't test — which is arguably
more useful than a diagram that looks complete."*

**Q: Why is being able to name untested threats on the same diagram
actually a stronger signal than the diagram/findings themselves?**
A: Because a finished diagram with findings on it only proves *what got
found* — it doesn't prove *how* you'd find things on a system that
doesn't hand you an answer key. Being able to point at the same diagram
and generate new, untested hypotheses live ("this store could leak via X,
this process could be tampered with via Y") using only the STRIDE-per-
element-type table is what separates "I found some bugs" from "I have a
repeatable method."

This matters specifically for this project because **Juice Shop's
vulnerabilities are largely pre-seeded, named challenges** — visible
directly in source, tagged with things like `changeProductChallenge`,
`passwordHashLeakChallenge`, `basketManipulateChallenge`. A sharp
interviewer could reasonably push: *"Juice Shop is built to have obvious
vulnerabilities baked in for you to trip over — how do I know you'd find
anything in a real app that isn't a CTF target?"* "I found 10 real bugs"
doesn't fully answer that on its own — all 10 could, in principle, be
explained by "I happened to stumble into the ones the app was designed to
teach." Generating *new* hypotheses live, using nothing but the
element-type table (`STRIDE_METHODOLOGY.md`'s "Threats by DFD element
type" section), is the actual proof the skill is generative reasoning,
not pattern-recognition against a known challenge list.

**The professional parallel worth naming:** this isn't a portfolio-only
trick — every real pentest/assessment report has a "scope and
limitations" or "recommended further testing" section, precisely because
a finished report is never claimed as exhaustive coverage. Producing that
section *live*, on request, for your own work is the same discipline,
just conversational instead of written.

**Q: What actually is a "threat model" — why does Threat Dragon ship so
many different ones (Cryptocurrency Wallet, IoT Device, CMS...), and why
can't one just work for every system?**
A: "Model" here doesn't mean a statistical/ML model — a threat model is
just **a diagram of one specific system's design (the DFD), plus the list
of security threats found against it.** Same sense as "a model of a
building": a representation of one real thing, not a prediction engine.

The demo list (Husky AI, Cryptocurrency Wallet, Generic CMS, IoT Device,
Online Game, Payments Processing Platform, Renting Car Startup, Three Tier
Web Application) are Threat Dragon's **built-in worked examples** — each
one is a finished model for a *different* system, included so a new user
can see what a completed one looks like. They're not templates to reuse.

**Why one model can't work for every system:** a threat model's entire
value comes from reflecting *that specific system's* real architecture —
its own boxes, its own arrows, its own trust boundaries. A Cryptocurrency
Wallet's diagram has elements like "private key storage" or "blockchain
node" that don't exist in a CMS; a CMS has "content database" or "plugin
system" that don't exist in a wallet. Reusing someone else's model for
Juice Shop would mean documenting threats against boxes that don't exist
in Juice Shop, while missing the real ones (like the `Angular Frontend ⇄
Application Server` flow this project's testing actually exercised).
Analogy: using another building's floor plan to decide where to put
security cameras in your own — the rooms and doors don't match, so the
plan doesn't transfer.

**Q: Is a threat model basically just system design — boxes for
components, arrows for how they talk, then STRIDE applied to find
threats?**
A: Yes, that's the accurate one-sentence summary: a threat model = a
system design diagram (the DFD) + STRIDE applied systematically to every
box and arrow in it. One refinement worth stating precisely: it's not
*any* architecture view — it's specifically the **security-relevant
slice** of the design. A normal architecture diagram might show load
balancers, caching layers, deployment topology; a DFD strips that down to
only the four element types STRIDE has rules for (external entity,
process, data store, data flow) plus trust boundaries, because those are
the only things the STRIDE framework knows how to reason about. So:
threat modeling is system design, filtered down to exactly the parts
relevant to "what could go wrong here."

**Q: Where are the 10 confirmed findings stored, and do we "upload" them
to Threat Dragon?**
A: Right now they only exist as prose in `THREAT_MODEL.md` — a completely
separate, human-readable Markdown file that Threat Dragon can't read.
There's no upload step, because there's no server or account involved at
all: Threat Dragon desktop just opens and saves one local JSON file.
Mechanically it's **open file → GUI form (Add Threat) → Save file** — each
finding gets manually re-entered (or scripted, see below) as one `threats`
array entry on the specific element/flow it belongs to, then Save writes
that array back into `demo-target/threat-model.json` on disk. Nothing
leaves the machine.

**Q: Does Threat Dragon's JSON follow a specific schema for a threat
entry — does that matter?**
A: Yes, and it's worth knowing the exact shape rather than assuming
prose can just be pasted in. Verified directly by pulling real populated
examples from Threat Dragon's own GitHub repo (`OWASP/threat-dragon`,
`td.vue/src/service/demo/*.json` — real demo files the tool ships with,
116 threat entries surveyed across all of them), not guessed:
```json
{
  "id": "264eeb9a-f5b3-4224-93e7-ac0cb72f20de",
  "title": "Store Sensitive Data",
  "status": "Mitigated",
  "severity": "High",
  "type": "Information disclosure",
  "description": "Sensitive data is compromised if the host itself is compromised",
  "mitigation": "Risk transferred to the infrastructure team",
  "modelType": "STRIDE",
  "new": false,
  "number": 1,
  "score": "7.5"
}
```
This object appends into a specific cell's `threats` array (e.g. inside
the `Angular Frontend → Application Server` flow's cell), alongside that
cell's existing `id`/`source`/`target`. Field notes from the real data:
- **`type`** — STRIDE category name in sentence case: `Spoofing`,
  `Tampering`, `Information disclosure` (lowercase "d", not
  "Information Disclosure"), `Denial of service`, `Elevation of
  privilege`. Wrong casing is exactly the kind of thing that could make
  the tool fail to recognize it.
- **`modelType`** — Threat Dragon supports more than STRIDE (LINDDUN, CIA,
  others); this field says which framework the threat uses. Every entry
  here should be `"STRIDE"`, matching Phase 0.
- **`status`** — workflow state (`Open` for an unfixed finding,
  `Mitigated` if already fixed). All 10 of ours would be `Open`.
- **`id`** — a UUID, unique per threat, not reused across entries.
- **`number`** — looked like a per-cell sequential counter (1, 2, 3...) in
  the real files, not a global counter.
- **`score`** — free text, used loosely like a CVSS score in some demo
  files; not required by the schema.
Translating a finding from `THREAT_MODEL.md` into this shape is direct
since each finding already has a STRIDE category assigned in prose — e.g.
Finding 2.2 is already labeled "Tampering" there, which maps straight to
`"type": "Tampering"` here.

**Q: Where do you actually download Threat Dragon, and which build for a
Mac?**
A: No Homebrew cask exists for it — checked directly, `brew search` and
`brew info --cask owasp-threat-dragon` both come back empty. Confirmed via
GitHub's release API (`github.com/OWASP/threat-dragon/releases/latest`,
not guessed) that the current version is **v2.6.2**, shipping separate
`.dmg` builds for Apple Silicon (`Threat-Dragon-ng-2.6.2-arm64.dmg`) and
Intel (`Threat-Dragon-ng-2.6.2-mac.dmg`) Macs, plus `.exe`/`.AppImage`/
`.deb`/`.rpm` for Windows/Linux. Check your own chip with `uname -m` —
`arm64` means Apple Silicon, `x86_64` means Intel.

**Q: What's a "parser differential" / "JSON parameter pollution" bug, and
why is it a more interesting finding than a plain missing auth check?**
A: It's when validation logic and business logic *disagree about which
value is authoritative* when the same key appears more than once in a
request. Concretely, found in Juice Shop's `POST /api/BasketItems`:
- The body parser (`clarinet`, a streaming JSON parser) fires a callback
  for *every* key it sees, including duplicates — unlike `JSON.parse`,
  which builds a real JS object and silently collapses a repeated key to
  just the last occurrence (objects can't have two same-named properties).
- The route's authorization check inspected the **first** occurrence of
  `BasketId`; the code that actually performed the write used the
  **last** occurrence. Sending `{"BasketId":"7","BasketId":"5"}` (own
  basket first, target second) satisfied the check with `"7"` while the
  write executed against `"5"`.
Why this is worth distinguishing from a simply-missing check: the
developer's intent was correct and a control genuinely existed — the flaw
is a subtle inconsistency in *how two different pieces of code interpreted
the same ambiguous input*, not an oversight of "forgot to add a check."
This is the JSON-body sibling of the older, well-known **HTTP Parameter
Pollution** attack (same idea against duplicate query-string/form
parameters). Recognizing and naming this bug class specifically — rather
than filing everything as "another IDOR" — is the kind of precision that
reads as senior judgment in an interview.

**Q: Does Burp itself identify threats, or is STRIDE/OWASP still doing
that work?**
A: Burp doesn't identify anything by itself. Community edition has no
automated scanner — that's Pro-only "Active Scan." Burp is an instrument
for capturing and manipulating traffic, nothing more. The *identification*
step is still STRIDE/OWASP reasoning, done by actually reading what a
request or response contains; Burp's job is to make *testing* that
suspicion fast and repeatable (mainly via Repeater), not to generate the
suspicion in the first place. Concretely, every real test in this project
splits into two distinct steps:
- **Identification (STRIDE / OWASP API Top 10)** — "this basket URL has a
  sequential ID" is Information Disclosure reasoning under API1:2023 BOLA;
  "this response has fields the UI never shows" is API3. This is a human
  reading and pattern-matching step, not something a tool did.
- **Confirmation (Burp)** — Repeater is how that suspicion gets tested
  against the real server, repeatably, without retyping curl commands each
  time.
Worth stating explicitly in an interview: tools accelerate *testing* a
hypothesis, they don't replace having the hypothesis. Confusing "I ran
Burp on it" with "I found this using Burp" undersells the actual skill —
the finding came from reasoning about the traffic, Burp just made proving
it fast.

**Q: In the architecture diagram (scanners → ingestion API → DB →
dashboard), does every arrow represent a "trigger" — one component kicking
off the next?**
A: No — the diagram mixes two different meanings under one arrow style,
and it's worth being able to name the difference precisely:
- **Real triggers (push, arrow direction = caller → callee):** a scanner's
  `POST /ingest` genuinely invokes the FastAPI handler — that's
  [`post_to_ingestion.py`](../.github/scripts/post_to_ingestion.py) calling
  out after each CI job. Same for the API's own write/read calls into
  `findings.db` — a function call triggering a DB statement.
- **Data-flow only, not a trigger (arrow direction = data's destination,
  not the caller):** `demo-target code → scanner` just means "the scanner
  reads this" — the actual trigger is the GitHub Actions `on: push/PR`
  event, not the code itself. More subtly, `ingestion API → dashboard`
  points toward the dashboard because that's where the data ends up, but
  the **dashboard** is the one calling — it issues the `GET
  /findings`/`GET /stats` request on its own schedule (a pull), the
  opposite of who's "triggering" whom.
The general lesson: read a diagram's arrows as "which way could this
possibly be invoked," not just "which way the data eventually flows" —
those two questions have the same answer for a push (webhook, POST) and
the opposite answer for a pull (a client GETing an API). The updated
[architecture diagram](architecture-diagram.html) now draws pushes as
solid arrows and the one pull (API → dashboard) as a dashed arrow to make
this distinction visible instead of implicit.

**Q: If a diagram doesn't explicitly mark an arrow as push vs. pull, how
would you even know which it is?**
A: Strictly, you can't — not for certain. A plain data-flow diagram (DFD),
which is what this project's own diagram and Juice Shop's shipped
`threat-model.json` both are, is *defined* to only encode which way data
moves, not who calls whom. Conflating "data flow direction" with "control
flow direction" is a limitation of the notation itself, not a mistake in
any one drawing of it. Two ways this actually gets resolved:
- **Heuristics, when no convention is stated** — imperfect but how most
  people read an unlabeled diagram in practice:
  - The **verb** in the label: `POST`/`PUT` usually means the tail is
    calling the head (you push by calling). `GET` is ambiguous — it says a
    request/response pair exists, not which arrow-half represents which.
  - **What kind of component is at each end**: a database/queue/store
    never initiates a call, so the *other* end is always the caller,
    regardless of which way the arrow points. A browser/dashboard is a
    client by construction — in a normal client-server setup it's always
    the initiator even when data is drawn flowing server → client.
  - **Whether one end is even capable of being called**: a CI job has no
    listening endpoint of its own, so it can only ever be the caller, not
    the callee — that's how "scanner → API" reads as a push even without
    a label.
  These are pattern-matches on typical architectures, not guarantees —
  an unusual system (server push, webhooks) breaks them with zero visual
  warning.
- **The actual fix**: either state the convention explicitly (a legend —
  what this diagram now does with solid-vs-dashed arrows), or switch to a
  notation whose arrows are unambiguous by design. A **UML sequence
  diagram** is that notation for this exact problem: its arrows literally
  mean "A calls B," and a reply is drawn as its own separate (usually
  dashed) arrow going back — the two concepts DFDs collapse into one line
  are explicitly two different lines there. Worth naming this precisely in
  an interview: "DFDs intentionally don't show control flow; if that's the
  question, you want a sequence diagram instead" is a stronger answer than
  guessing harder at the same diagram.

**Q: Why did replaying a request through Repeater come back `304 Not
Modified` with no body — and how do you get the real response instead?**
A: `If-None-Match: W/"3f6-ETiJhlQ+tloa84PXSB2u/xbgHPY"` was present in the
request. That's an HTTP conditional-caching header, paired with the
server's `ETag` on the resource — the browser sends back the `ETag` it was
last given, and if the server's current `ETag` for that resource still
matches, it replies `304 Not Modified` with **no body at all**, telling the
client "nothing's changed, use what you already cached." This is correct
HTTP caching behavior, not a bug or an error — but it means there's no
`userId` (or any payload) to read in that particular response.

The practical gotcha this creates in Repeater: since `ETag` reflects the
*resource's* current state (not who's asking), resending the exact same
request will keep returning `304` every time, no matter how many times you
click Send — the underlying data hasn't changed, so the condition keeps
matching. **Fix: delete the `If-None-Match` header line entirely from the
Repeater request editor before sending.** With no conditional header to
check against, the server has no choice but to return a full `200 OK` with
the actual JSON body. Worth remembering any time a request unexpectedly
comes back empty with a `304` — check for `If-None-Match`/`If-Modified-Since`
before assuming something's broken.

**Q: The Juice Shop login response's JWT had a `bid` (basket id) claim —
why does that matter for the basket-URL finding?**
A: It shows the ID wasn't guessed by an attacker — the client reads its own
basket id straight out of its own token and builds the request URL from
it. That's normal, and having your *own* ID isn't itself a problem. What
turns it into a real concern is that IDs built this way are typically
sequential integers assigned in creation order — so seeing your own is `6`
is a strong hint that `1`–`5` and `7`+ exist and belong to other accounts,
which is exactly the enumerable-ID precondition BOLA/IDOR needs.

**Q: The same JWT showed up twice on one request — as `Authorization:
Bearer ...` and again inside the `Cookie` header. What does that mean?**
A: The token is being transported over two channels at once, which is
worth two follow-up checks rather than assuming either is safe: (1) which
channel does the server actually require — test by sending a request with
only the cookie present (e.g. a bare address-bar navigation, which sends
cookies automatically but not custom headers) and see if it still
succeeds; (2) is the cookie `HttpOnly` — check by running `document.cookie`
in the console; if the token appears there, the cookie is exactly as
readable by injected JavaScript as the `localStorage` copy already found,
meaning the second channel adds no real defense-in-depth, just a second
place the same secret lives.

**Q: Worth keeping an OWASP cheat sheet open while doing this kind of
analysis?**
A: Yes, as a coverage check *after* your own exploration, not as the thing
driving it — the curiosity-led pattern-spotting (why is my password hash in
this token, why is this ID sequential) is the actual skill being
demonstrated. Since the target here is a REST API, the relevant list is the
**OWASP API Security Top 10**, not the general OWASP Top 10:
https://owasp.org/API-Security/editions/2023/en/0x11-t10/ — confirmed
directly from the page: **API1:2023 Broken Object Level Authorization**
(BOLA) is #1 and explicitly covers IDOR-style findings, followed by Broken
Authentication (API2), Broken Object Property Level Authorization (API3),
Unrestricted Resource Consumption (API4), Broken Function Level
Authorization (API5), Unrestricted Access to Sensitive Business Flows
(API6), SSRF (API7), Security Misconfiguration (API8), Improper Inventory
Management (API9), and Unsafe Consumption of APIs (API10).

**Q: For each OWASP API Security Top 10 category, what do you actually
look for in the Network tab — not just the category name?**
A:

| # | Category | What to look for in Network tab | Already found here |
|---|---|---|---|
| API1 | Broken Object Level Authorization | Any URL/param holding an object ID — numeric, sequential, or guessable (`/rest/basket/6`). Swap it while authenticated as yourself. | **Confirmed** — `/rest/basket/5` returned `UserId: 16`'s full basket while authenticated as `UserId: 25` |
| API2 | Broken Authentication | Does the token expire (`exp` claim)? Any rate-limit on repeated failed logins (watch for `429`)? Is a password-reset token predictable? | **Confirmed, two findings** — no `exp` claim on issued JWTs despite `expiresIn: '6h'` in source; 8 rapid failed logins all returned `401` with zero rate-limiting |
| API3 | Broken Object Property Level Authorization | Response bodies with fields the UI never displays (over-exposure); on PUT/PATCH, try adding a field you didn't send (e.g. `"role":"admin"`) via Copy-as-fetch — does the server accept it (mass assignment)? | **Confirmed** — JWT payload contains the full `Users` row, including the password hash |
| API4 | Unrestricted Resource Consumption | Pagination/quantity params (`limit`, `page`, basket qty) — send an extreme value, see if the server just complies with no cap. | Not yet checked |
| API5 | Broken Function Level Authorization | Admin-only-looking endpoints (check the JS bundle for `/rest/admin/...`-style paths) called with a regular user's token — do they respond 200 instead of 401/403? | **Confirmed, severe** — `GET /api/Users` (customer token) returned every user's full record incl. which accounts are admin; `PUT /api/Products/:id` (customer token) successfully changed a live price — the route's auth check is commented out in source |
| API6 | Unrestricted Access to Sensitive Business Flows | Business actions with no throttle — repeat a "submit review"/"apply coupon" POST rapidly; does anything ever block it? | Not yet checked |
| API7 | Server-Side Request Forgery | Any request/field accepting a URL as input (image-via-URL, a webhook/import feature) — flag the parameter for later testing. | Not yet checked |
| API8 | Security Misconfiguration | Response headers: missing CSP/`X-Content-Type-Options`, exposed `Server`/`X-Powered-By`, permissive CORS (`*` + credentials), verbose error bodies. | **Confirmed, low severity** — no CSP header at all; `Access-Control-Allow-Origin: *` present but *without* `Access-Control-Allow-Credentials`, so not exploitable via the cookie channel. `X-Content-Type-Options`/`X-Frame-Options` are correctly set — not findings. |
| API9 | Improper Inventory Management | Undocumented/old API versions — check for an exposed Swagger/OpenAPI doc revealing endpoints the current UI never calls. | **Confirmed** — `GET /swagger.yml` returns `200` fully unauthenticated |
| API10 | Unsafe Consumption of APIs | About the *server's* trust in third-party APIs it calls — not visible in your own browser traffic at all; needs source review, not Network tab. | Not applicable to this method |

Pattern worth noticing: the two confirmed findings so far (JWT
over-exposure, basket BOLA) map to API3 and API1 — the categories that
reward careful reading over mechanical checking. API8-style findings
(missing headers) are exactly what an automated scanner like ZAP would
catch just as easily — useful to note, but not what demonstrates judgment
beyond tooling.

**Q: Why not use MITRE ATT&CK for this testing step instead of/alongside
OWASP?**
A: Wrong altitude — the same mismatch flagged earlier for STRIDE. ATT&CK
catalogs *post-compromise enterprise attacker behavior* (Initial Access,
Persistence, Privilege Escalation, Lateral Movement, Exfiltration...),
built from real observed campaigns against enterprise networks/endpoints.
It answers "once an adversary has a foothold, what do they do next" — it
does not contain application-layer testing techniques. There's no ATT&CK
entry for BOLA, because BOLA is an authorization *design flaw* in one API,
not an enterprise attack lifecycle stage. Confirmed directly from OWASP's
own API1:2023 page: the actual testing technique — "attackers probe by
manipulating object identifiers... in request paths, parameters, headers,
or payloads" — already lives in OWASP's own Top 10 entry and the OWASP Web
Security Testing Guide (WSTG), which are written for exactly this layer of
the stack. Those are the right references for "how do I test this now."

ATT&CK re-enters *after* a finding is confirmed, not while testing it — a
narrative/classification step, not a discovery method. If the basket
swap-test succeeds, or the SQLi admin bypass is revisited, *then* it's fair
to map what the access enables in attacker terms — e.g. a login bypass as
`T1190` (Exploit Public-Facing Application), or using another account's
session as `T1078` (Valid Accounts). Save ATT&CK for describing impact
after the fact; use OWASP (API Top 10 + WSTG) to actually find and test
the vulnerability.

## Build log, continued — Phase 2 (the ingestion service)

- **Normalization is a per-tool judgment call, not a mechanical mapping.**
  Every parser has to decide how a tool's own vocabulary maps onto
  `critical/high/medium/low/info`: Semgrep's ERROR/WARNING/INFO doesn't
  correspond to CVSS-style severity at all (it's about rule confidence, not
  impact), ZAP buries severity inside a string like `"High (Medium)"`
  (risk + confidence combined), and gitleaks emits no severity at all - it
  either matched a secret pattern or it didn't, so every hit was assigned a
  fixed CRITICAL. Being able to explain *why* each mapping was chosen, not
  just that it exists, is the actual skill being demonstrated.
- **Dedup key differs by finding type, and that's intentional.** SAST/secret
  findings are identified by rule + file + line; SCA/container findings by
  rule + package name (since two different packages can share one CVE);
  DAST findings by rule + URL (there's no file at all - it's a running app,
  not source code). One hash function, six different choices of what to
  feed it.
- **Real validation, not just fixture data**: ran `npm audit` against Juice
  Shop itself and posted the actual raw output through the live `/ingest`
  endpoint - not a canned test fixture. All 46 real vulnerabilities came
  out normalized correctly, with severity counts matching npm's own report
  (7 critical, 19 high, 17 medium, 3 low). Re-posting the same payload
  updated the existing rows' `last_seen` rather than duplicating them,
  confirming the dedupe design works against real-world data, not just
  hand-crafted test cases.
- **A genuine debugging moment**: the first version of the end-to-end tests
  failed with `no such table: finding`, even though the tables were created
  right before the request ran. Root cause: SQLAlchemy's default
  connection pool hands out a *new, empty* in-memory SQLite database on
  every connection checkout unless you pin it to one connection
  (`poolclass=StaticPool`). This is a well-known but non-obvious gotcha -
  a good example to have in your back pocket for "tell me about a bug you
  had to actually debug," since the fix required understanding what the
  ORM was doing underneath the test, not just retrying something.
- **SQLModel as one class for two jobs**: `Finding` is simultaneously the
  SQL table definition and the API's request/response schema. The
  trade-off is worth being able to state plainly: it's less code to
  maintain, at the cost of exposing every database column directly through
  the API - fine for an internal tool, not something you'd do for a
  public-facing one without a narrower response model in front of it.

## Confirmed findings — interview-ready summary

Full technical detail (source lines, curl/Burp evidence) lives in
`THREAT_MODEL.md`; this is the condensed version for "walk me through a
finding you found" style questions.

| # | Finding | STRIDE / OWASP | One-liner |
|---|---|---|---|
| 1.1 | JWT payload discloses the full `Users` row (incl. password hash) | Information Disclosure / API3 | Login response's token, once decoded, contains fields no client needs — including a crackable MD5-length password hash |
| 2.1 | `GET /rest/basket/:id` — no ownership check | Information Disclosure / API1 BOLA | Any authenticated user can read any other user's basket by changing an integer |
| 2.2 | `POST /api/BasketItems` — ownership check bypassed via duplicate JSON key | Tampering / API1 BOLA (parser differential) | Check inspects the first `BasketId` in the body, write uses the last — sending it twice bypasses the check entirely |
| 4.1 | `GET /api/Users` — dumps every user, no role check | Information Disclosure / API5 | A plain customer token lists the entire user table, including which accounts are `admin` |
| 4.2 | `PUT /api/Products/:id` — any customer can rewrite prices | Tampering / API5 | Authorization check on this exact route is commented out in source (a deliberately seeded challenge) |
| 4.3 | No rate limiting on login | Spoofing / API2 | 8 rapid failed attempts, all `401`, never throttled — compounds with 4.1's email enumeration |
| 4.4 | Issued JWTs carry no `exp` claim | Spoofing / API2 | Source calls `expiresIn: '6h'`, but the actual token has no expiry claim — cause not yet root-caused |
| 4.5 | CORS wildcard, but not exploitable via cookies | Security Misconfiguration / API8 | `Access-Control-Allow-Origin: *` present, but no `Access-Control-Allow-Credentials` — real misconfig, low actual severity, don't oversell |
| 4.6 | `/swagger.yml` exposed, unauthenticated | Information Disclosure / API9 | Full API schema handed to anyone, no login needed |
| 3.1 | `whoami?fields=` has no field allowlist, leaks password hash | Information Disclosure / API3 | Same category as 1.1, fully independent mechanism — a "sparse fieldset" feature with zero field-level restriction, confirmed by a named challenge (`passwordHashLeakChallenge`) in source |

**All candidates now resolved:** the `token` cookie is confirmed **not**
`HttpOnly` (`document.cookie` returns it in plain text) — it adds no
defense-in-depth beyond the already-exposed `localStorage` copy.

**Q: How do you check whether a cookie is `HttpOnly`, and why does it
matter here specifically?**
A: Open the browser console and run `document.cookie`. A `HttpOnly`
cookie is invisible to that call by design — it simply won't appear in
the returned string, while non-`HttpOnly` cookies will. Here, `token`
showed up in plain text, confirming it's readable by any JavaScript
running on the page — meaning it offers **no additional protection**
against XSS beyond what the `localStorage` copy of the same JWT (Finding
1.1) already lacked. Sending the same secret over two channels only helps
if at least one of them is actually harder to reach; here, neither is.

**Q: Why are API4, API6, and API7 explicitly time-boxed rather than tested
like the others?**
A: Each has a real, distinct reason, not just "ran out of time":
- **API4 (Unrestricted Resource Consumption)** — test is easy (send an
  extreme value: basket quantity `999999`, an oversized `limit=` param),
  but even a successful result is a weak demo on its own. "The server
  accepted a big number" isn't the same as proving actual resource
  exhaustion — that needs load/timing measurement, more effort for a less
  crisp story than "I read someone else's data."
- **API6 (Unrestricted Access to Sensitive Business Flows)** — needs
  repeating the same request many times and watching for a block that
  never comes. Doing this properly needs scripting or Burp's Intruder —
  deliberately throttled in Community edition — so results are slow to
  get and easy to misread ("no limit" vs. "didn't send enough requests").
- **API7 (SSRF)** — requires a feature that accepts a URL as input and has
  the *server* fetch it. No such feature has been spotted anywhere in
  Juice Shop yet in this project's testing — so pursuing this now would be
  speculative hunting for a parameter that may not exist in this app at
  all, not confirming or denying a known candidate.
Compare to API1/API3/API5, which produced clean, fast, high-impact
findings — the honest, defensible call is to note these three as
time-boxed future work in the writeup, not to claim exhaustive coverage
that wasn't actually done.

**The narrative arc worth having ready:** two findings (2.1, 4.1) are
*missing* checks — the simple version of BOLA/BFLA. One (2.2) is a check
that *existed* and was bypassed via a subtle parser/logic mismatch — a
meaningfully more sophisticated finding, and worth leading with when asked
for your best example. All nine came from manual reasoning about traffic
and source, not from a scanner — the exact "beyond automation" story this
project set out to prove.

## Reading the ingestion service's code — Q&A

Notes from walking through `ingestion/` file by file, for explaining the
code itself in an interview, not just the architecture around it.

**Q: What's a sensible order to read this codebase in, given the files
weren't written in "reading order"?**
A: Bottom-up by dependency, not top-to-bottom by file name: `schema.py`
(the enums everything else imports) → `models.py` (the `Finding` shape
those enums build) → `dedupe.py` (small, self-contained) → `db.py`
(persistence plumbing) → one parser in depth, e.g. `semgrep.py` (raw JSON
→ `Finding`) → `parsers/__init__.py` (how a parser gets selected) →
`main.py` (the HTTP layer that ties everything above into one request).
Reading `main.py` first would mean hitting `Finding`, `PARSERS`, and
`get_session` before knowing what any of them are — reading in dependency
order means every import is already-understood by the time it's used.

**Q: What is SAST, and what is Semgrep specifically — starting from zero?**
A: **SAST** (Static Application Security Testing) analyzes source code
*without running it* — it reads the code as text/syntax and flags known-
dangerous patterns, the way a very security-focused linter would (e.g.
calling `eval()` on untrusted input, building SQL by string-concatenating
user input, hardcoded secrets). This is distinct from **DAST**, which
attacks a *running* app from the outside over HTTP (ZAP, in this project's
own pipeline) — SAST needs source access and no running app; DAST needs a
running app and no source access.

**Semgrep** is the specific open-source SAST tool used here. Its rules read
close to the code itself rather than requiring a hand-written AST
traversal — conceptually `pattern: eval(...)` plus a message and severity.
Run against a repo, each rule match becomes one entry in Semgrep's
`--json` output's top-level `"results"` list, e.g.:
```json
{
  "check_id": "python.lang.security.audit.eval-detected",
  "path": "app/utils.py",
  "start": { "line": 42 },
  "extra": { "message": "Detected use of eval()...", "severity": "ERROR" }
}
```
Three pieces of information define a Semgrep finding, and each maps
directly onto a field this project's own parser
(`ingestion/app/parsers/semgrep.py`) reads:
- **`check_id`** — the rule that fired, dotted as
  `<language>.<category>.<subcategory>...<what>`. Read directly as
  `rule_id` at `semgrep.py:34`.
- **The code/location** — `path` + `start.line`, read as `file_path` /
  `line_number` at `semgrep.py:35-36`.
- **`extra.message`/`extra.severity`** — human-readable explanation and
  Semgrep's own three-level scale (`ERROR`/`WARNING`/`INFO`), mapped onto
  this project's five-level `Severity` enum via the explicit `SEVERITY_MAP`
  at `semgrep.py:19-23` (`ERROR`→`HIGH`, `WARNING`→`MEDIUM`, `INFO`→`LOW` —
  note `CRITICAL` is never produced by this mapping, a deliberate,
  documented simplification the module's own docstring flags as something
  a more mature pipeline would refine per-rule using CWE/OWASP metadata).

**Why this matters for the schema specifically**: Semgrep is *SAST* — it
flags a pattern in your own code, so it naturally fills `file_path`/
`line_number` and leaves `package_name`/`package_version` null. npm audit
and Snyk are *SCA* (Software Composition Analysis) — they flag a known-
vulnerable third-party dependency, so they fill `package_name`/
`package_version` instead and have no line number at all. That's why
`Finding` (`models.py:32-58`) carries both pairs as optional fields —
depending on `source`, only one pair is ever populated.

**Q: What's the `PARSERS` dict in `parsers/__init__.py` actually doing,
architecturally?**
A: It's a **dispatch table** — a dict mapping a `Source` enum value to the
function that handles it, used in `main.py`'s `POST /ingest` as
`PARSERS.get(request.source)` instead of an `if/elif` chain over six
tools. The payoff: adding a 7th scanner means writing one new parser
module and adding one line to this dict — `main.py` itself never changes.
Worth naming this pattern explicitly in an interview ("I used a dispatch
table so the route function stays generic") rather than just describing
what the code does.

**Q: In `POST /ingest` (`main.py`), what actually happens if the same
finding is scanned again after being marked `fixed`?**
A: It gets silently reopened. The upsert logic checks
`existing.status == FindingStatus.FIXED` and if so resets it to `OPEN`
before bumping `last_seen` — the reasoning being that if the scanner is
reporting the same `dedupe_hash` again, whatever fix closed it clearly
didn't hold (or was reverted), so leaving it marked `fixed` would be
actively misleading on the dashboard. This is a small piece of logic but
it's the difference between a findings table that's just a log of scans
and one that reflects current, trustworthy state.

**Q: Why does `Finding.file_path` (in `models.py`) hold a URL sometimes
and a filesystem path other times — isn't that confusing?**
A: It's a deliberate reuse of one field across finding types that don't
have a clean common concept: SAST/secrets findings have a real source
file, DAST findings (ZAP) have no file at all — only the URL of the
endpoint that was hit — and container findings (Trivy) have neither, just
an image target string. Rather than adding three near-identical nullable
columns (`file_path`, `endpoint_url`, `image_target`) for something that's
conceptually "where this finding lives," one field is reused with its
actual meaning documented in the field's own `description=` — a real
trade-off between schema purity and schema size, leaning toward the
latter since this is a small internal tool, not a public API contract.

**Q: What exactly goes into `dedupe_hash`, and does every scanner type
need its own dedup logic?**
A: `compute_dedupe_hash` itself (`dedupe.py`) is generic and dumb on
purpose — it just joins whatever positional args it's given with `"|"`
and SHA-256s the result. All the actual dedup *logic* lives in each
parser's choice of which fields to pass in, because "what makes two
findings the same issue" is different per scan-record type:

| Source | Parts hashed (always `source, repo, rule_id, ...`) | Why these and not others |
|---|---|---|
| Semgrep (SAST) | `+ file_path, line_number` | a SAST rule fires at a specific line — same rule, different line, is a different bug |
| gitleaks (secrets) | `+ file_path, line_number` | same reasoning as SAST — a leaked secret is identified by where it sits |
| npm audit (SCA) | `+ package_name` | no line number exists; two different packages can trip the *same* advisory rule, so package name is what disambiguates |
| Snyk (SCA) | `+ packageName` | same shape as npm audit — SCA findings key on package, not location |
| Trivy (container/SCA) | `+ PkgName, target` | package name alone isn't enough — the same vulnerable package can appear inside multiple scanned images/layers (`target`), and those should stay separate findings |
| ZAP (DAST) | `+ endpoint` | no file or package exists at all — a DAST finding is identified by which URL/endpoint the rule fired against |

Every one of these also always includes `source` and `repo` up front, so
the same rule ID from two different tools (or the same repo scanned
under two different names) can never collide into one row by accident.

The part that answers "why doesn't the table just explode across scans":
**no timestamp or scan-run ID is ever included.** That's the whole trick —
the hash is a fingerprint of *what the finding is*, not *when it was
seen*. So scanning the same repo on Monday and Tuesday produces the same
`dedupe_hash` both times, and `main.py`'s upsert-by-hash logic
(`main.py:56-68`) takes it from there: same hash → update the existing
row's `last_seen` (and reopen it if it had been marked fixed); new hash →
insert a new row. The dedup decision itself is really "does a row with
this hash already exist," which is generic across all six tools — the
per-tool judgment call is entirely upstream of that, in choosing which
fields belong in the hash.

## Phase 3 — the overall pipeline shape, before the tool-by-tool list

Worth having this straight before the scanner table below, since "what
triggers this and what actually happens" is the question a person new to
the architecture needs answered first — the list of six tools only makes
sense once the pipeline around them is clear.

**Q: What triggers `security-scans.yml`, and what happens end-to-end?**
A:

1. **Trigger.** It's a GitHub Actions workflow that lives in **vigilant-engine's own repo**, triggered by a `push` to vigilant-engine's `main` branch or a `pull_request` against it (`on: push: branches: [main]` / `on: pull_request`). It does **not** trigger on commits landing in the upstream `juice-shop/juice-shop` repo — `demo-target/` is wired in as a git submodule, i.e. a pinned pointer to one specific juice-shop commit, not a live copy. Juice Shop's own commit history can move forward with vigilant-engine never noticing, until someone deliberately bumps that pointer inside vigilant-engine (which is itself a commit to vigilant-engine, so it re-triggers the workflow like any other change).
2. **Checkout.** `actions/checkout` runs with `submodules: true`. Without that flag the checkout would only bring the submodule's *pointer*, leaving `demo-target/` empty and breaking every later step confusingly. See the dedicated Q&A on this further down.
3. **Environment setup.** Python 3.11 and Node 22 get installed on the runner — Python for the ingestion service (FastAPI) and the scanner scripts, Node because `demo-target/` (Juice Shop) is a Node app and several scanners (npm audit, Snyk) work off its `package-lock.json`.
4. **Ingestion API comes up *inside this same CI job*.** `uvicorn` is started as a background process (`nohup ... &`) against a **brand-new, empty SQLite file that exists only for this one run**. A short polling loop hits `/docs` a few times (1s apart) before continuing, since scanners could otherwise race server startup. This is a deliberate, named simplification: nothing persists once the job ends, so every run starts from zero findings — there's no trend data across runs yet. Pointing this at a *permanently hosted* ingestion API is later (packaging/deployment) work; this phase proves the mechanism works, not that it's durable.
5. **Target app deps installed.** `npm install` runs inside `demo-target/`, needed both so Semgrep/npm audit/Snyk have something real to analyze and so the lockfile scanners have the resolved dependency tree to check.
6. **Each scanner runs against `demo-target/` and writes its own raw JSON file** (`semgrep-results.json`, `npm-audit-results.json`, etc.) — Semgrep, npm audit, Snyk (conditional on a secret existing), gitleaks. Steps end in `|| true` because a scanner exiting non-zero here usually means "I found something to report," not "I crashed" — the goal of this job is *ingestion*, not *gating the build*. See the dedicated Q&A on the `|| true` trade-off further down.
7. **`post_to_ingestion.py` POSTs each raw JSON file to the ingestion API's `/ingest` endpoint** — one shared script, called once per tool with a different `--source`/`--file`, instead of hand-rolling a `curl`+JSON incantation per scanner in the YAML.
8. **The ingestion API normalizes before storing** — this is the step easy to miss. `/ingest` doesn't just dump the raw JSON into SQLite; each source has its own parser (`app/parsers/<tool>.py`) that maps that tool's particular shape (Semgrep's `results[]`, gitleaks' `RuleID`/`File`/`StartLine`, etc.) into one common `Finding` schema, and *that* normalized row is what lands in SQLite. Normalizing six different JSON shapes into one schema is the actual engineering content of this phase, not the scanning itself.
9. **Last step is a smoke test, not a dashboard.** The job finishes by hitting `/stats` and printing it, just to prove the full scan → normalize → store → query loop worked in that run. There is **no dashboard consuming this yet** — the planned Next.js `dashboard/` (reading `/findings` and `/stats`) is a separate, not-yet-built piece that will eventually query a *persistently hosted* version of this same API, not this ephemeral per-CI-run instance.

**What was missing from "it's triggered by juice-shop changes, scans run, then get posted to the DB"**: the trigger is on vigilant-engine's own repo (not juice-shop, because of the submodule pointer), the ingestion API itself is spun up fresh and thrown away every single run (so nothing accumulates yet), and there's a normalization step between "scanner JSON" and "row in SQLite" that's doing real work, not a passthrough.

## Phase 3 — the six tools, and which ones are actually free

Worth having this precisely, since it affects real CI setup (secrets,
signup steps) as well as being a plain interview fact-check.

| Tool | Category | What it does | License / cost |
| --- | --- | --- | --- |
| Semgrep | SAST | Scans source code for unsafe patterns without running it | **Free** — the CLI and community ruleset are open source. A paid "Semgrep AppSec Platform" tier exists on top (cross-file analysis, hosted dashboard) but the tool used here needs no account |
| npm audit | SCA | Checks `package-lock.json` against the GitHub Advisory Database | **Free** — ships built into `npm` itself, nothing to install |
| Snyk | SCA | Same idea as npm audit, broader DB + remediation advice | **Freemium** — free tier for individual/OSS use, but requires an account + API token (the one tool of the six with signup friction) |
| OWASP ZAP | DAST | Attacks the running app over HTTP, no source access | **Free** — fully open source, an OWASP project itself, no account |
| gitleaks | Secret scanning | Greps git history for key/token/password-shaped strings | **Free** — open source (MIT), a plain CLI binary |
| Trivy | Container scanning | Inspects a built Docker image's packages for known CVEs | **Free** — open source (Apache 2.0), by Aqua Security |

**Takeaway worth stating plainly in an interview**: 5 of 6 tools in this
pipeline need zero signup or licensing cost — Snyk is the single exception,
and that's specifically why it needs a GitHub Actions secret (an API
token) while the other five jobs just run.

**Q: What is IaC, and why isn't it one of the six tools above?**
A: IaC = Infrastructure as Code — infra (servers, networks, permissions,
containers) defined as text files (Terraform `.tf`, CloudFormation,
Kubernetes manifests, Ansible playbooks) instead of clicked together in a
console. Those files can be misconfigured the same way source code has
bugs — e.g. a Terraform file provisioning a publicly-readable S3 bucket, or
a security group open to `0.0.0.0/0` on port 22. Checkov/tfsec statically
scan those files for exactly that, before `terraform apply` ever runs —
same philosophy as SAST, just applied to infra definitions instead of app
code. This project has no Terraform/CloudFormation/K8s manifests at all
(everything runs via `docker compose` locally), so there's nothing for
Checkov/tfsec to point at — scoped out deliberately rather than adding
fake infra just to exercise a tool. See `ARCHITECTURE.md`'s scanner
coverage table.

**Q: What's the difference between IaC scanning and CSPM — they sound
similar?**
A: Both flag the same class of misconfiguration (public S3 bucket, security
group open to `0.0.0.0/0`), but at opposite points in the lifecycle:

| | IaC scanning (Checkov, tfsec) | CSPM (Cloud Security Posture Management) |
| --- | --- | --- |
| What it reads | Static files — Terraform `.tf`, CloudFormation, K8s YAML | Live cloud account, via API calls (e.g. boto3) |
| When it runs | Pre-deployment, in CI, before `terraform apply` | Runtime, against infra that's already deployed |
| Analogy | SAST, but for infra definitions | More like DAST/runtime audit, but for cloud config instead of an app |
| Needs | A repo with IaC files | Real cloud credentials pointed at a real account |

Concrete example that surfaced this distinction: a repo called
[perimeterWatch](https://github.com/creativecoder10/perimeterWatch) looked
at first glance like an IaC-assessment project, but its `config_checker`
module (`s3_checks.py`) actually calls `boto3.client("s3")` —
`list_buckets()`, `get_public_access_block()`, `get_bucket_encryption()` —
against a **live AWS account**, checked against CIS AWS Foundations
Benchmark controls. That's CSPM, not IaC scanning — it never touches a
Terraform file. Worth being precise about this distinction in an interview:
conflating "I scanned cloud config" with "I scanned IaC" is the kind of
imprecision that a follow-up question would expose fast.

**Q: Concretely, what does an IaC file actually declare — just servers, or
access rights too?**
A: Both. IaC covers the resources *and* their configuration — including IAM
roles/policies, security groups, and access rights — not just "spin up a
VM." Example, extending the S3 case above: instead of an admin clicking
bucket permissions together in the console, it's declared in a `.tf` file
that lives in version control and gets reviewed like any other code change:

```hcl
resource "aws_s3_bucket_public_access_block" "data" {
  bucket                  = aws_s3_bucket.data.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_iam_policy" "readonly_data_access" {
  policy = jsonencode({
    Statement = [{
      Effect   = "Allow"
      Action   = ["s3:GetObject"]
      Resource = "${aws_s3_bucket.data.arn}/*"
    }]
  })
}
```

Why this matters for AppSec specifically:
- **Diffable/reviewable** — an IAM policy change shows up as a PR diff, not
  a silent console click; a reviewer can catch `"Action": "s3:*"` before it
  ships.
- **Scannable pre-deploy** — Checkov/tfsec read this file and flag "no
  public access block" or "IAM policy uses `Action: "*"`" before
  `terraform apply` runs, the same way Semgrep flags unsafe code before a
  merge.
- **Drift detection** — `terraform plan` shows when someone manually
  changed something in the console after the fact, since the file is the
  declared source of truth.
- **Reproducible** — an identical environment (staging, DR) is built from
  the same files instead of being manually reconstructed.

The IAM piece is often where the highest-severity IaC findings live — an
over-broad policy (`"Action": "*"`, `"Resource": "*"`) has a much bigger
blast radius than one misconfigured bucket.

## Phase 3 — building the first CI workflow (`.github/workflows/security-scans.yml`)

**Q: Where does the ingestion API actually run during CI, and what's the
catch with that?**
A: It's started as a background process *inside the same CI job*
(`nohup uvicorn app.main:app --port 8000 &`), backed by a brand-new, empty
SQLite file that only exists for that one run. This proves the full
scan → normalize → store → query loop actually works end-to-end in real
CI — but it does **not** give trend data across runs, since nothing
persists once the job ends; every run starts from zero findings. That's a
deliberate, named simplification, not an oversight: pointing this workflow
at a *permanently hosted* ingestion API (so findings genuinely accumulate
over time) is Phase 5 (packaging/deployment) work, which comes later. This
phase proves the mechanism; a later phase makes it durable. A short polling
loop (`curl` the docs page a few times, 1s apart) is needed right after
starting it, since `uvicorn` takes a moment to boot and the first scanner's
POST could otherwise race server startup and fail intermittently.

**Q: What actually is uvicorn — is it part of FastAPI?**
A: No, and the split is worth knowing precisely. FastAPI is just your route/
controller code (`@app.get(...)`, request validation, response
serialization) — it defines *what happens* for a given request but has no
code that opens a socket or accepts a TCP connection. **uvicorn is an ASGI
server**: a separate program that actually binds to a port, accepts
incoming HTTP connections, parses raw HTTP, and for each request calls into
the FastAPI app object to get a response. ASGI (Asynchronous Server Gateway
Interface) is the standard interface Python async apps/servers agree on, so
any ASGI server (uvicorn, Hypercorn, Daphne) can run any ASGI app. Java/
Spring analogy: **FastAPI is your `@RestController` code; uvicorn is
Tomcat** — a Spring Boot app can't accept HTTP traffic without an embedded
servlet container listening on a socket, and a FastAPI app can't either
without uvicorn (or an equivalent) running it. `uvicorn app.main:app --port
8000` reads as "run the ASGI app object named `app`, found inside the
`app.main` module, listening on port 8000" — literally starting the
ingestion service so `post_to_ingestion.py` has something to POST to.

**Q: uvicorn "speaks HTTP" — what does that phrase actually mean, simply?**
A: A network connection by itself is just a pipe that carries raw bytes —
like a phone line that carries sound but doesn't understand English. HTTP
is a *language*: a specific, agreed-upon way of writing "give me this
page" (a request) and "here's the page" (a response) as text — things like
`GET /docs HTTP/1.1` followed by some headers. "uvicorn speaks HTTP" just
means uvicorn is the part that knows this language: it reads the raw bytes
off the connection, understands them as an HTTP request, and later writes
the reply back out in correct HTTP format. FastAPI never has to know any
of that — uvicorn hands it a simple, already-understood request, and takes
back a simple response to translate for the wire.

**Q: In the full pipeline (scan → normalize → SQLite → endpoints → Next.js
dashboard), where exactly does uvicorn come in?**
A: Everything up through "write to SQLite" and "define `/findings` in
FastAPI" is just Python logic sitting in files — none of it is reachable
over the network yet. uvicorn is the piece that makes the *endpoints*
part actually work as endpoints: it binds to a port and listens, and when
the Next.js dashboard calls `fetch("http://.../findings")`, uvicorn is
what receives that request, matches it to the right FastAPI route, calls
your Python function (which queries SQLite), and sends the JSON back over
the wire as an HTTP response. FastAPI decides *what* each endpoint does;
uvicorn is *how a request from Next.js ever reaches that code at all*. No
uvicorn running = Next.js's fetch fails with connection refused, even
though all the Python code is correct and the SQLite data is sitting
right there.

**Q: Concretely, what *is* "the FastAPI code" — pointing at our actual
file?**
A: [`ingestion/app/main.py`](ingestion/app/main.py) is it, in full. Three
pieces: (1) `app = FastAPI(...)` builds an "app object" — an empty routing
table, sitting in Python memory, nothing more. (2) `@app.post("/ingest")`,
`@app.get("/findings")`, `@app.get("/stats")` are decorators that register
a plain Python function against a URL path + method — `list_findings()`
is just normal Python: build a SQLModel query, apply filters, return a
list. (3) None of this file touches a socket. Importing it and running it
as a plain script builds the `app` object with its routes wired up and
then does nothing — there's no listener. `uvicorn app.main:app --port
8000` is the separate step that takes that already-built `app` object and
puts it behind an actual listening socket. Only after that does
`fetch("http://.../findings")` from Next.js have anything to hit. Spring
analogy: this file is the `@RestController` class (`@app.get` =
`@GetMapping`); uvicorn is the embedded Tomcat — except FastAPI doesn't
auto-start one the way Spring Boot does, you run uvicorn yourself.

**Q: Draw the FastAPI/uvicorn split as an Express.js/Node.js analogy.**
A: Map it in two layers, not one:
- **Routes & business logic** — Express (`app.get('/findings', handler)`)
  ≈ FastAPI (`@app.get("/findings")`). Same job: define what happens for
  a given path/method.
- **Socket + HTTP parsing** — Node's own `http` module (built into the
  Node runtime itself, on top of libuv) ≈ uvicorn (a separate ASGI server
  process). Express is a thin convenience layer *over* Node's built-in
  HTTP capability, not a replacement for it.

The part that actually trips people up coming from Node: in Express,
`app.listen(3000)` is called *from inside your own script*, and it's just
a wrapper around Node's own `http.createServer(app).listen(3000)` — so
`node server.js` alone is enough; one process, one command. FastAPI has
no equivalent call. `app/main.py` builds the `app` object and stops —
nothing in that file opens a socket. The listening step is a separate,
external command: `uvicorn app.main:app --port 8000`.

**Why the split even exists:** Node was designed from day one as a
non-blocking-I/O runtime — an HTTP-capable socket server ships inside the
language runtime itself. Python's interpreter has no equivalent built in,
which is exactly why the ASGI spec (and uvicorn as one implementation of
it) had to exist as an independent piece: it's the socket/HTTP capability
Python doesn't get for free. Also captured as a comparison table in
[`docs/architecture-diagram.html`](architecture-diagram.html), page 2,
"Aside — FastAPI/uvicorn vs. Express/Node."

**Q: Why does almost every scanner step end in `|| true`? Isn't that
hiding failures?**
A: It's distinguishing two different meanings of "the command exited
non-zero": Semgrep, npm audit, and Snyk all exit non-zero **specifically
because they found something to report** — that's what tells a normal CI
pipeline "fail the build." Our goal here is *ingestion*, not *gating*: we
want the findings recorded in the database, not the whole job halted
because a scanner did its job correctly. `|| true` tells the shell "treat
this step as successful either way." The honest trade-off, worth stating
in an interview rather than glossing over: this also swallows a *genuine*
tool crash (bad config, network failure) as if nothing happened. A more
mature pipeline checks each tool's specific documented exit codes (e.g.
"1 = findings present, 2 = actual error") instead of blanket-ignoring
every non-zero exit — a reasonable thing to tighten once the pipeline is
running reliably.

**Q: Why is the Snyk step gated behind `if: ${{ secrets.SNYK_TOKEN != '' }}`
instead of just always running it?**
A: Because Snyk (unlike the other five tools) needs a real account and API
token, and that hasn't been set up yet. This condition means the step
simply doesn't execute at all until a `SNYK_TOKEN` secret is added in the
repo's settings — the other three tools work today without the whole
workflow failing on a missing secret, and Snyk activates later with zero
YAML changes once the token exists.

**Q: The workflow installs the gitleaks CLI directly with a pinned
download URL instead of using the official `gitleaks/gitleaks-action` —
why not use the "normal" GitHub Action?**
A: Because the two produce different output *formats* for different
*audiences*. `gitleaks-action` outputs SARIF, a format built for GitHub's
own Security/code-scanning tab — a different consumption model than "POST
JSON to our own API." The plain gitleaks CLI's own `--report-format json`
matches the shape `app/parsers/gitleaks.py` was already written against
(`RuleID`, `File`, `StartLine`, etc.), so installing the CLI directly kept
this consistent with the other three tools rather than adding a second,
incompatible finding format to normalize. The release version and exact
Linux asset filename (`gitleaks_8.30.1_linux_x64.tar.gz`) were verified to
actually exist before being written into the workflow, not assumed from a
guessed naming pattern.

**Q: Why does the checkout step need `submodules: true` — isn't
`actions/checkout` enough on its own?**
A: No, and this is an easy silent-failure trap. By default,
`actions/checkout` pulls in the pointer to a submodule's commit but **not**
its actual file contents — without this flag, `demo-target/` would check
out as an empty directory, and every step after it (installing deps,
running scanners against it) would fail confusingly with no obvious cause
pointing back to the real problem.

## Why CI at all, and what SAST catches that Phase 2's manual testing didn't

**Q: Why do we need to set up a CI workflow at all — the scanners could just
be run by hand?**
A: Because "run by hand" only produces a security signal *on request*, and
that's precisely the gap called out in this doc's own opening section
("Tooling & pipeline ownership — wire scanning into CI/CD so security
signal shows up automatically, not on request"). Concretely, without CI:
someone has to remember to re-run five different tools, with their own
flags and JSON output formats, every time code changes — which in practice
means it happens rarely, inconsistently, or not at all once the novelty
wears off. Wiring it into `security-scans.yml` on `push`/`pull_request`
means every commit gets the same five scans with zero human action
required — the actual "shift left" property, not just a buzzword. It's
also what turns this from "I ran some security tools once" into "I built a
pipeline" for interview purposes: CI → ingestion API → DB → dashboard is
the full loop most take-home projects skip (already noted in the "what
this project demonstrates" table above), and none of that loop exists
without something to trigger it automatically.

**Q: What is "the ingestion pipeline," and what does the arrow from the
Juice Shop box to the CI-scanners box in the architecture diagram actually
represent?**
A: Two different things worth keeping separate:
- **The CI scanners box** (Semgrep, npm audit, Snyk, ZAP, gitleaks) is
  `.github/workflows/security-scans.yml` — a GitHub Actions job. The arrow
  labeled "on push / PR" from `demo-target` into that box is a **trigger**,
  not data flowing between running services: a git push or PR event on the
  repo makes GitHub Actions spin up a fresh runner, check out `demo-target`
  (with `submodules: true`, per the Q&A above), and execute each scanner
  against that checked-out source **and**, for ZAP specifically, against a
  live running instance of the app it starts in that same job — hence the
  diagram's "runs against source + running instance" caption.
- **The ingestion pipeline** is a completely separate component: the FastAPI
  service under `ingestion/app/` (`schema.py`, `models.py`, `main.py`, the
  `parsers/`). It doesn't run inside the CI workflow's logic at all — the
  workflow merely starts it as a background process for the duration of the
  job (`nohup uvicorn app.main:app &`, per the Q&A above) and then POSTs
  each scanner's raw JSON to its `/ingest` endpoint via
  `post_to_ingestion.py`. The "raw ..." arrows leaving the CI-scanners box
  in the diagram are exactly those POST calls — one per tool, carrying that
  tool's raw, not-yet-normalized JSON output.

**Q: What does "the ingestion pipeline is CI-agnostic to which scanner ran"
actually mean?**
A: It means `ingestion/app/` has no idea, and doesn't need to have any idea,
that GitHub Actions is the thing that invoked it — that knowledge is
deliberately kept out at the edge, not baked into the service. Concretely:
- The FastAPI service only ever sees an `IngestRequest` — `source`, `repo`,
  `branch`, `commit_sha`, `raw_output` (`schema.py`) — a plain HTTP JSON
  payload. Nothing in `main.py`, `models.py`, or any file under
  `ingestion/app/` references `GITHUB_REPOSITORY`, `GITHUB_SHA`, or
  anything else specific to GitHub Actions.
- All of that CI-specific plumbing lives in exactly one place:
  `.github/scripts/post_to_ingestion.py`, which reads
  `GITHUB_REPOSITORY`/`GITHUB_REF_NAME`/`GITHUB_SHA` as env-var defaults
  (visible in its `argparse` defaults) and translates them into the
  generic payload the API actually expects.
- The practical test of "agnostic": if this pipeline moved to GitLab CI,
  Jenkins, or CircleCI tomorrow, **zero code under `ingestion/app/` would
  change** — only the workflow YAML and the small script that knows which
  CI system it's running under would need rewriting. That's also exactly
  why `post_to_ingestion.py`'s own docstring frames it as shared glue
  ("each scanner step just calls this... instead of the workflow YAML
  hand-rolling a curl+JSON incantation once per tool") — one seam at the
  edge, not scattered CI assumptions throughout the service.
- This is the same design instinct as the `PARSERS` dispatch table
  (Q&A above): keep the thing that changes often (which CI system, which
  scanner) behind a small, swappable boundary, and keep the thing that
  should stay stable (the `Finding` schema, the dedupe/upsert logic) fully
  decoupled from it.

**Q: Why is `post_to_ingestion.py` a Python script instead of just a `curl`
call written inline in the workflow YAML?**
A: Because the two options aren't equally capable — YAML itself can't build
a JSON payload or POST it; the real choice is "six inline `curl`+shell
incantations, once per scanner step" vs. "one shared script, called six
times with different flags." The script wins on its own engineering merits:
- **Correct JSON construction.** The payload includes `repo`, `branch`,
  `commit_sha` — values that come from GitHub-provided env vars and could
  in principle contain characters that break naive shell string
  concatenation. `json.dumps()` (line 43) builds the payload correctly by
  construction; hand-assembling JSON inside a shell string is exactly the
  kind of fragile-and-occasionally-a-quoting-bug pattern that shows up in
  real CI YAML.
- **Real error handling.** The `try/except urllib.error.HTTPError` block
  (lines 47-52) catches a rejected request, prints the API's actual error
  body to stderr, and re-raises so the CI step fails loudly. Getting the
  same behavior from `curl` in YAML means bolting on `--fail`, capturing
  the response body separately, and checking `$?` — more moving parts to
  get the same guarantee.
- **DRY across six scanners.** One script parameterized by `--source`/
  `--file` (see the file header's own docstring), instead of the same
  curl-plus-JSON logic duplicated six times across the workflow — a schema
  change (new field, changed header) is a one-line edit here instead of
  six edits scattered through YAML.
- **No new dependency.** It deliberately imports only stdlib
  (`argparse`, `json`, `urllib.request`) rather than `requests` — noted
  directly in its own docstring — so it needs no `pip install` step before
  running in CI.
None of this is "wrote Python to showcase Python" — YAML was never
actually capable of doing this alone; some language has to build and POST
the JSON regardless, and Python was the deliberate choice over reaching
for `curl`+shell once error handling and reuse across six call sites
started to matter. It's a legitimate, defensible engineering call that
also happens to be a good example to point to for Python fluency.

**Q: What is SAST (Semgrep) actually going to catch that Phase 2's manual
threat modeling didn't already cover?**
A: A genuinely different surface, not a duplicate of the manual work — worth
being precise about the distinction rather than assuming "we already tested
this app, so the scanner will just repeat it":
- **Source access vs. runtime access.** Phase 2 was black-box: traffic
  observed through Burp/DevTools against a *running* instance, reasoning
  about what a request/response revealed. Semgrep never sends a request —
  it reads the raw source and pattern-matches on code *shape*: unsafe
  function calls (`eval`, unsanitized `child_process.exec`), weak crypto
  primitives, string-concatenated SQL, unsafe deserialization — bug
  classes that may never produce an *observable* difference during normal
  manual clicking, because they only trigger under a specific input nobody
  happened to try.
- **Whole-codebase coverage vs. one exercised flow.** Every one of the 9
  confirmed findings in Phase 2 sits on a single diagram edge (`Angular
  Frontend ⇄ Application Server`, confirmed above) — because that's the one
  flow manual testing actually walked. Semgrep scans every file in the
  repo in one pass, including the `B2B API` path and admin-only routes that
  Phase 2 explicitly never touched (already logged as an honest coverage
  gap above).
- **Where it *doesn't* substitute for manual work — the more important
  half of the answer.** The two most interesting Phase 2 findings are
  exactly the kind SAST tools are weak at: 4.2 (the commented-out
  authorization check on `PUT /api/Products/:id`) is a business-logic gap —
  "should a check exist here" requires understanding intent, not just
  pattern-matching suspicious syntax; 2.2 (the JSON-parameter-pollution
  parser differential in `POST /api/BasketItems`) is a mismatch between
  what two *different* pieces of code do with a duplicate key — there's no
  single suspicious line to flag, since each line in isolation looks fine.
  Both are BOLA/authorization findings, and BOLA is API1:2023 for exactly
  this reason: it's the category static, pattern-based analysis is
  structurally worst at, because it depends on business context a scanner
  doesn't have.
- **The honest framing**: SAST and manual STRIDE/API testing are
  complementary, not redundant — one gives full-codebase coverage of
  pattern-visible bug classes at zero marginal cost per scan; the other
  finds context-dependent logic flaws a pattern matcher structurally can't
  reason about. This is the same "no one tool subsumes the others" point
  already made about the SAST/SCA/DAST/secrets taxonomy — it applies
  between *manual testing* and *tooling*, too, not just between tool
  categories.

## Likely interview questions this project prepares you for

- "Walk me through how you'd take output from three different scanners and
  turn it into one dashboard." → walk the architecture diagram.
- "How do you avoid the same finding showing up as a new ticket every scan?"
  → `dedupe_hash`, upsert, `first_seen`/`last_seen`.
- "What's the difference between SAST, DAST, and SCA, and why do you need
  more than one?" → scanner coverage table; each tests a different surface
  (your code / the running app / your dependencies) and none subsumes the
  others.
- "How would you prioritize a backlog of hundreds of findings?" → severity +
  exploitability + exposure, not just raw scanner severity.
- "Would you build this or buy a platform?" → see build vs. buy above.

## Open — fill in once built

- [x] Raw evidence that the target has real, non-trivial findings: `npm
      install` in `demo-target/` reported 46 vulnerabilities (7 critical, 19
      high, 17 moderate, 3 low) via npm audit, before any of our own tooling
      ran — see build log above
- [ ] A specific finding this pipeline caught in Juice Shop, and how it maps
      to a real-world OWASP Top 10 category
- [ ] One false positive you had to handle, and how the schema represents that
      decision (`status: false_positive`)
- [ ] A screenshot-worthy dashboard view for the portfolio writeup
