import { getFindings, getStats } from "@/lib/api";
import { SeverityStats } from "@/components/SeverityStats";
import { SourceBreakdown } from "@/components/SourceBreakdown";
import { FindingsTable } from "@/components/FindingsTable";
import { PendingOverlay } from "@/components/PendingOverlay";
import { PendingNavProvider } from "@/lib/navigation-pending";
import { SEVERITY_ORDER, SOURCE_COLOR, SOURCE_LABEL, SOURCE_LINK, SOURCE_ORDER } from "@/lib/colors";
import type { Severity, Source } from "@/types/finding";

function parseSeverity(value: string | string[] | undefined): Severity | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return (SEVERITY_ORDER as string[]).includes(candidate ?? "") ? (candidate as Severity) : null;
}

function parseSource(value: string | string[] | undefined): Source | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return (SOURCE_ORDER as string[]).includes(candidate ?? "") ? (candidate as Source) : null;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const activeSeverity = parseSeverity(params.severity);
  const activeSource = parseSource(params.source);

  const [stats, findings] = await Promise.all([
    getStats(),
    getFindings({
      status: "open",
      severity: activeSeverity ?? undefined,
      source: activeSource ?? undefined,
      limit: 100,
    }),
  ]);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6 sm:gap-8 sm:px-6 sm:py-10">
      <header>
        <h1 className="text-2xl font-semibold">vigilant-engine</h1>
        <p className="mt-2 text-sm" style={{ color: "var(--ink-secondary)" }}>
          Open-source dashboard aggregating findings from six scanners — SAST
          (Semgrep), secrets scanning (gitleaks), SCA (Snyk, npm audit), DAST
          (OWASP ZAP), and container scanning (Trivy).
        </p>
        <p className="mt-2 text-sm" style={{ color: "var(--ink-muted)" }}>
          {stats.total_open} open finding{stats.total_open === 1 ? "" : "s"} across the ingested scans.
        </p>
      </header>

      <PendingNavProvider>
        <PendingOverlay>
          <SeverityStats stats={stats} activeSeverity={activeSeverity} />

          <SourceBreakdown stats={stats} activeSource={activeSource} />

          <section>
            <h2 className="mb-3 text-sm font-medium" style={{ color: "var(--ink-secondary)" }}>
              Open findings
              {activeSeverity ? ` — ${activeSeverity}` : ""}
              {activeSource ? ` — ${SOURCE_LABEL[activeSource]}` : ""}
            </h2>
            <FindingsTable findings={findings} activeSeverity={activeSeverity} activeSource={activeSource} />
          </section>
        </PendingOverlay>
      </PendingNavProvider>

      <footer className="flex flex-col gap-2 border-t pt-4 text-xs" style={{ borderColor: "var(--border)", color: "var(--ink-muted)" }}>
        <p>
          Target:{" "}
          <a
            href="https://owasp.org/www-project-juice-shop/"
            target="_blank"
            rel="noopener noreferrer"
            className="underline underline-offset-2"
          >
            OWASP Juice Shop
          </a>{" "}
          — a deliberately vulnerable demo app used to practice and demonstrate real AppSec tooling end-to-end.
        </p>
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>Data sources:</span>
          {SOURCE_ORDER.map((source) => (
            <a
              key={source}
              href={SOURCE_LINK[source]}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 underline-offset-2 hover:underline"
            >
              <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: SOURCE_COLOR[source] }} />
              {SOURCE_LABEL[source]}
            </a>
          ))}
        </p>
        <p>
          Snapshot from real scanner runs, posted by hand/CI to this API — not a continuously
          re-scanning system. Findings are only as fresh as the last time each scanner ran.
        </p>
      </footer>
    </main>
  );
}
