import { createFileRoute } from "@tanstack/react-router";
import { UserPlus } from "lucide-react";

import { AppShell, SectionCard } from "@/components/app-shell";
import { Pill } from "@/components/status";
import { Button } from "@/components/ui/button";
import { users } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/users")({
  head: () => ({
    meta: [
      { title: "Users & Delegation — cercit" },
      {
        name: "description",
        content:
          "Manage credit officers, managers and administrators with their approval limits and branch assignments in cercit.",
      },
      { property: "og:title", content: "Users & Delegation — cercit" },
      {
        property: "og:description",
        content: "Credit team roles, approval limits and branch assignments.",
      },
    ],
  }),
  component: Users,
});

function Users() {
  return (
    <AppShell
      title="Users"
      subtitle="Roles and delegated approval authority"
      actions={
        <Button>
          <UserPlus className="size-4" /> Invite user
        </Button>
      }
    >
      <SectionCard className="overflow-hidden">
        <div className="-mx-4 -my-4 overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead className="bg-surface-subtle text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2 text-left font-medium">Name</th>
                <th className="px-4 py-2 text-left font-medium">Email</th>
                <th className="px-4 py-2 text-left font-medium">Role</th>
                <th className="px-4 py-2 text-left font-medium">Approval limit</th>
                <th className="px-4 py-2 text-left font-medium">Branch</th>
                <th className="px-4 py-2 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u, i) => (
                <tr
                  key={u.email}
                  className={cn("border-t border-border", i % 2 === 1 && "bg-surface-subtle/60")}
                >
                  <td className="px-4 py-2.5 font-medium">{u.name}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{u.email}</td>
                  <td className="px-4 py-2.5">{u.role}</td>
                  <td className="px-4 py-2.5 tabular">{u.limit}</td>
                  <td className="px-4 py-2.5 text-muted-foreground">{u.branch}</td>
                  <td className="px-4 py-2.5">
                    <Pill tone={u.status === "Active" ? "success" : "destructive"}>{u.status}</Pill>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SectionCard>
    </AppShell>
  );
}
