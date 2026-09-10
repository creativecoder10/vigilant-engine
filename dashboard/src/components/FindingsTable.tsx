import type { Finding } from "@/types/finding";
import { SEVERITY_COLOR, SOURCE_COLOR, SOURCE_LABEL } from "@/lib/colors";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function FindingsTable({ findings }: { findings: Finding[] }) {
  if (findings.length === 0) {
    return (
      <p className="rounded-lg border p-6 text-sm" style={{ borderColor: "var(--border)", color: "var(--ink-muted)" }}>
        No findings match the current filters.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border" style={{ borderColor: "var(--border)" }}>
      <table className="w-full min-w-[720px] border-collapse text-sm">
        <thead>
          <tr className="border-b text-left" style={{ borderColor: "var(--border)" }}>
            <th className="px-4 py-3 font-medium" style={{ color: "var(--ink-secondary)" }}>Severity</th>
            <th className="px-4 py-3 font-medium" style={{ color: "var(--ink-secondary)" }}>Source</th>
            <th className="px-4 py-3 font-medium" style={{ color: "var(--ink-secondary)" }}>Finding</th>
            <th className="px-4 py-3 font-medium" style={{ color: "var(--ink-secondary)" }}>Location</th>
            <th className="px-4 py-3 font-medium" style={{ color: "var(--ink-secondary)" }}>Last seen</th>
          </tr>
        </thead>
        <tbody>
          {findings.map((finding) => (
            <tr key={finding.id} className="border-b last:border-0" style={{ borderColor: "var(--border)" }}>
              <td className="px-4 py-3">
                <span className="flex items-center gap-2 capitalize">
                  <span
                    aria-hidden="true"
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: SEVERITY_COLOR[finding.severity] }}
                  />
                  {finding.severity}
                </span>
              </td>
              <td className="px-4 py-3">
                <span className="flex items-center gap-2">
                  <span
                    aria-hidden="true"
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ backgroundColor: SOURCE_COLOR[finding.source] }}
                  />
                  {SOURCE_LABEL[finding.source]}
                </span>
              </td>
              <td className="px-4 py-3">
                <p className="font-medium">{finding.title}</p>
                <p className="text-xs" style={{ color: "var(--ink-muted)" }}>{finding.rule_id}</p>
              </td>
              <td className="px-4 py-3 text-xs" style={{ color: "var(--ink-secondary)" }}>
                {finding.file_path ?? finding.package_name ?? "—"}
                {finding.line_number != null ? `:${finding.line_number}` : ""}
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-xs" style={{ color: "var(--ink-muted)" }}>
                {formatDate(finding.last_seen)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
