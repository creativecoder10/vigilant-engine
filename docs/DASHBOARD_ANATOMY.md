# Dashboard app anatomy

*vigilant-engine · Phase 4*

How `dashboard/` is put together: a Next.js 15 App Router app with no
client-side data fetching at all — every finding and stat is pulled
server-side from the ingestion API before a byte of HTML ships.

**Legend**

| Role | Meaning |
|---|---|
| Server Component | Renders on the server, never bundled to the browser |
| Client Component | `"use client"`, ships JS, handles clicks |
| Not a component | Types, constants, or an external service |

## File tree — `dashboard/src/`

App Router + TypeScript + Tailwind, scaffolded via `create-next-app`.

### `app/` — the one route this app has: `/`

| File | Role | Notes |
|---|---|---|
| `layout.tsx` | Server Component | Root shell every route renders inside. Loads Geist Sans/Mono via `next/font/google`, sets `<html>`/`<body>`, exports the page's `<title>`/description metadata. |
| `page.tsx` | Server Component, async | `DashboardPage`. Awaits `searchParams` for `?severity=`, then fires `getStats()` and `getFindings({status:"open"})` through `Promise.all` — two real network calls, run concurrently, before any HTML is sent to the browser. |
| `globals.css` | Tailwind + tokens | Tailwind base plus the CSS custom properties (`--surface`, `--status-critical`, `--cat-1-blue` …) every component reads through `style={{...}}` instead of hard-coded hex — light/dark just swaps the token values underneath. |

### `components/` — only one of these three is interactive

| File | Role | Notes |
|---|---|---|
| `SeverityStats.tsx` | Client Component | The one `"use client"` file in the app. Its tiles double as the severity filter: `onClick` calls `router.push` with an updated `?severity=`, which `page.tsx` reads back on the *next* server render — no array filtering happens in the browser. |
| `SourceBreakdown.tsx` | Server Component | Pure render of `stats.by_source` into one bar per scanner. No state and no clicks, so it never needed `"use client"` in the first place. |
| `FindingsTable.tsx` | Server Component | Renders the `findings` array it's handed as a prop. The actual filtering already happened server-side, inside the `/findings?severity=` request — this component never sees the unfiltered set. |

### `lib/` — server-only, no components here

| File | Role | Notes |
|---|---|---|
| `api.ts` | server-only module | `getFindings` / `getStats`. `INGESTION_API_URL` deliberately has no `NEXT_PUBLIC_` prefix, so it's never bundled to the browser. Every `fetch()` is tagged `next: {revalidate: 60}` — findings change per CI run, not per page load, so Next.js caches the response instead of refetching on every request. |
| `colors.ts` | shared constants | The single source of truth for two fixed palettes: `SEVERITY_COLOR` (the status ramp — critical/serious/warning/good; `info` falls back to muted ink) and `SOURCE_COLOR` (a 6-slot categorical ramp, one hue per scanner, order fixed so a scanner keeps its color across filters). |

### `types/`

| File | Role | Notes |
|---|---|---|
| `finding.ts` | shared types | Hand-kept mirror of `ingestion/app/schema.py` + `models.py` (`Finding`, `Severity`, `Source`, `FindingStatus`, `Stats`). One shape, two languages, no codegen — kept in sync by hand. |

## One request, start to finish

```
Browser --GET /--> page.tsx --Promise.all--> api.ts --fetch /stats-------> ingestion API (FastAPI :8000) --SQL--> SQLite (findings.db)
                                              api.ts --fetch /findings?severity=-->

                    ^                                                                        |
                    |________________ rows -> rendered HTML (one response) ___________________|

Client-only loop:
  click severity tile -> router.push("?severity=...") -> same GET / cycle above, re-run with a new filter
```

Every open of `/` is server-rendered: **page.tsx** fetches both endpoints
concurrently through **api.ts**, which the ingestion API answers from
SQLite. The only client-side moment in the whole page is **SeverityStats**
pushing a new `?severity=` query string — which just triggers this exact
same request again, with a different filter attached.

## Scope note

Source: `Plan_vigilant_engine.md`, Phase 4. The ingestion API itself
(parsers, `/findings`, `/stats`, the SQLite schema) is Phase 2/3 and not
re-drawn here. `dashboard/Dockerfile` and the root `docker-compose.yml`
that wires this container to `ingestion` by service name belong to Phase
5, and the open-vs-fixed trend chart is deferred until the Phase 5
`scan_runs` table exists.
