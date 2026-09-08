import { useState, useMemo } from "react";
import { cn } from "@/lib/utils";
import { inr } from "@/lib/format";

export interface QueueRow {
  applicantName: string;
  appId: string;
  vehicle: string;
  loanAmount: number;
  bureauScore: number;
  decision: "approve" | "review" | "decline" | "pending";
  riskGrade: "A" | "B" | "C" | "D" | "E";
  status: "pending" | "approved" | "declined" | "review";
  date: string;
  assignedTo?: string;
}

export interface ApplicationQueueProps {
  rows: QueueRow[];
  onRowClick?: (row: QueueRow) => void;
  className?: string;
}

const STATUS_FILTERS = ["All", "Submitted", "Processing", "Review", "Approved", "Declined"] as const;

export function ApplicationQueue({ rows, onRowClick, className }: ApplicationQueueProps) {
  const [filter, setFilter] = useState("All");
  const [sortKey, setSortKey] = useState<string>("");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [currentPage, setCurrentPage] = useState(0);
  const perPage = 10;

  const statusMap: Record<string, string[]> = {
    All: ["pending", "approved", "declined", "review"],
    Submitted: ["pending"],
    Processing: ["pending", "review"],
    Review: ["review"],
    Approved: ["approved"],
    Declined: ["declined"],
  };

  const allowed = statusMap[filter] || [];
  const filtered = rows.filter((r) => allowed.includes(r.status));

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    const sortedData = [...filtered];
    sortedData.sort((a, b) => {
      let aVal: any = (a as any)[sortKey] ?? "";
      let bVal: any = (b as any)[sortKey] ?? "";
      if (typeof aVal === "number" && typeof bVal === "number") return sortDir === "asc" ? aVal - bVal : bVal - aVal;
      return sortDir === "asc" ? String(aVal).localeCompare(String(bVal)) : String(bVal).localeCompare(String(aVal));
    });
    return sortedData;
  }, [filtered, sortKey, sortDir]);

  const paginated = sorted.slice(currentPage * perPage, (currentPage + 1) * perPage);
  const totalPages = Math.ceil(sorted.length / perPage);

  const handleSort = (key: string) => {
    if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else { setSortKey(key); setSortDir("asc"); }
  };

  const gradeColors = { A: "text-green-600 bg-green-50", B: "text-amber-600 bg-amber-50", C: "text-amber-700 bg-amber-50", D: "text-red-600 bg-red-50", E: "text-red-800 bg-red-50" };
  const decisionColors = { approve: "bg-green-100 text-green-700", review: "bg-amber-100 text-amber-700", decline: "bg-red-100 text-red-700", pending: "bg-blue-50 text-blue-700" };

  return (
    <div className={cn("panel", className)}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-xs font-medium text-muted-foreground">
              {["applicantName", "appId", "vehicle", "loanAmount", "bureauScore", "decision", "riskGrade", "status", "date"].map((h) => (
                <th key={h} className="text-left p-2 whitespace-nowrap cursor-pointer hover:text-foreground" onClick={() => handleSort(h)}>{h === "loanAmount" ? "Loan" : h === "bureauScore" ? "Score" : h === "applicantName" ? "Applicant" : h === "appId" ? "App ID" : h === "riskGrade" ? "Grade" : h.charAt(0).toUpperCase() + h.slice(1)} {sortKey === h && (sortDir === "asc" ? "▲" : "▼")}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginated.map((r, i) => (
              <tr key={`${r.appId}-${i}`} className="border-b hover:bg-muted/20 cursor-pointer" onClick={() => onRowClick?.(r)}>
                <td className="p-2 font-medium">{r.applicantName}</td>
                <td className="p-2 text-xs text-muted-foreground">{r.appId}</td>
                <td className="p-2 text-xs">{r.vehicle}</td>
                <td className="p-2 text-xs tabular-nums">{inr(r.loanAmount)}</td>
                <td className="p-2"><span className={cn("text-xs font-bold px-1.5 py-0.5 rounded-full", gradeColors[r.riskGrade] ?? "bg-muted")}>{r.bureauScore}</span></td>
                <td className="p-2"><span className={cn("text-[10px] font-medium px-1.5 py-0.5 rounded-full", decisionColors[r.decision as keyof typeof decisionColors] ?? "bg-muted")}>{r.decision}</span></td>
                <td className="p-2 text-xs font-bold">{r.riskGrade}</td>
                <td className="p-2 text-[10px] text-muted-foreground">{new Date(r.date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}</td>
              </tr>
            ))}
            {paginated.length === 0 && (<tr><td colSpan={9} className="p-4 text-center text-muted-foreground text-sm">No applications found</td></tr>)}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between border-t pt-3">
        <div className="flex gap-1.5">
          {STATUS_FILTERS.map((s) => (
            <button key={s} onClick={() => { setFilter(s); setCurrentPage(0); }} className={cn("text-xs px-2.5 py-1 rounded-full border transition-colors", filter === s ? "bg-primary text-primary-foreground border-primary" : "bg-background border-border hover:bg-muted")}
            >{s}</button>
          ))}
        </div>
        <div className="text-xs text-muted-foreground">
          Showing {Math.min(perPage, paginated.length)} of {sorted.length}
        </div>
        <div className="flex gap-1">
          <button onClick={() => setCurrentPage((p) => Math.max(0, p - 1))} disabled={currentPage === 0} className="px-2 py-1 text-xs border rounded hover:bg-muted disabled:opacity-30">Prev</button>
          <span className="text-xs px-2 py-1">{currentPage + 1} / {totalPages}</span>
          <button onClick={() => setCurrentPage((p) => Math.min(totalPages - 1, p + 1))} disabled={currentPage >= totalPages - 1} className="px-2 py-1 text-xs border rounded hover:bg-muted disabled:opacity-30">Next</button>
        </div>
      </div>
    </div>
  );
}
