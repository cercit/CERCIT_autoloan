import { Link, createFileRoute } from "@tanstack/react-router";
import { Download, Search } from "lucide-react";
import { useMemo, useState } from "react";

import { AppShell, SectionCard } from "@/components/app-shell";
import { Pill } from "@/components/status";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { auditActions, auditLog, users } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/audit-log")({
  head: () => ({
    meta: [
      { title: "Audit Log — cercit" },
      {
        name: "description",
        content:
          "Searchable audit trail of every decision, override, policy change and login across the cercit credit platform.",
      },
      { property: "og:title", content: "Audit Log — cercit" },
      {
        property: "og:description",
        content: "Full audit trail of decisions, overrides, policy changes and sign-ins.",
      },
    ],
  }),
  component: AuditLogPage,
});

const actionTone: Record<string, "primary" | "success" | "warning" | "destructive" | "muted"> = {
  "Application Created": "primary",
  "Decision Made": "success",
  Override: "warning",
  "Policy Changed": "destructive",
  "Document Uploaded": "muted",
  Login: "muted",
  Logout: "muted",
};

function AuditLogPage() {
  const [query, setQuery] = useState("");
  const [user, setUser] = useState("All users");
  const [action, setAction] = useState("All actions");

  const rows = useMemo(
    () =>
      auditLog.filter((row) => {
        const q = query.trim().toLowerCase();
        return (
          (user === "All users" || row.user === user) &&
          (action === "All actions" || row.action === action) &&
          (!q ||
            row.details.toLowerCase().includes(q) ||
            row.app.toLowerCase().includes(q) ||
            row.user.toLowerCase().includes(q))
        );
      }),
    [query, user, action],
  );

  return (
    <AppShell
      title="Audit Log"
      subtitle={`${rows.length} events`}
      actions={
        <Button variant="outline">
          <Download className="size-4" /> Export CSV
        </Button>
      }
    >
      <SectionCard className="overflow-hidden">
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative lg:col-span-2">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search details, user or application"
              className="pl-9"
            />
          </div>
          <Select value={user} onValueChange={setUser}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All users">All users</SelectItem>
              <SelectItem value="System">System</SelectItem>
              {users.map((u) => (
                <SelectItem key={u.email} value={u.name}>
                  {u.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={action} onValueChange={setAction}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All actions">All actions</SelectItem>
              {auditActions.map((a) => (
                <SelectItem key={a} value={a}>
                  {a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="mt-4 -mx-4 -mb-4 overflow-x-auto">
          <table className="w-full min-w-[880px] text-sm">
            <thead className="bg-surface-subtle text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Timestamp</th>
                <th className="px-4 py-2 text-left font-medium">User</th>
                <th className="px-4 py-2 text-left font-medium">Action</th>
                <th className="px-4 py-2 text-left font-medium">Application</th>
                <th className="px-4 py-2 text-left font-medium">Details</th>
                <th className="px-4 py-2 text-left font-medium">IP address</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, i) => (
                <tr
                  key={`${row.time}-${i}`}
                  className={cn("border-t border-border", i % 2 === 1 && "bg-surface-subtle/60")}
                >
                  <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground">
                    {row.time}
                  </td>
                  <td className="px-4 py-2.5 whitespace-nowrap">{row.user}</td>
                  <td className="px-4 py-2.5">
                    <Pill tone={actionTone[row.action] ?? "muted"}>{row.action}</Pill>
                  </td>
                  <td className="px-4 py-2.5">
                    {row.app === "—" ? (
                      <span className="text-muted-foreground">—</span>
                    ) : (
                      <Link
                        to="/applications/$id"
                        params={{ id: row.app }}
                        className="text-primary hover:underline"
                      >
                        {row.app}
                      </Link>
                    )}
                  </td>
                  <td className="px-4 py-2.5">{row.details}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{row.ip}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                    No events match those filters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </AppShell>
  );
}
