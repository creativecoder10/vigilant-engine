import { getFindings, getStats } from "@/lib/api";
import { SeverityStats } from "@/components/SeverityStats";
import { SourceBreakdown } from "@/components/SourceBreakdown";
import { FindingsTable } from "@/components/FindingsTable";
import { SEVERITY_ORDER } from "@/lib/colors";
import type { Severity } from "@/types/finding";

function parseSeverity(value: string | string[] | undefined): Severity | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return (SEVERITY_ORDER as string[]).includes(candidate ?? "") ? (candidate as Severity) : null;
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const activeSeverity = parseSeverity((await searchParams).severity);

  const [stats, findings] = await Promise.all([
    getStats(),
    getFindings({ status: "open", severity: activeSeverity ?? undefined, limit: 100 }),
  ]);

  return (
    <main className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-10">
      <header>
        <h1 className="text-2xl font-semibold">vigilant-engine</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--ink-muted)" }}>
          {stats.total_open} open finding{stats.total_open === 1 ? "" : "s"} across the ingested scans.
        </p>
      </header>

      <SeverityStats stats={stats} activeSeverity={activeSeverity} />

      <SourceBreakdown stats={stats} />

      <section>
        <h2 className="mb-3 text-sm font-medium" style={{ color: "var(--ink-secondary)" }}>
          Open findings
          {activeSeverity ? ` — ${activeSeverity}` : ""}
        </h2>
        <FindingsTable findings={findings} />
      </section>
    </main>
  );
}
