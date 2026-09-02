import { Link, useRouterState } from "@tanstack/react-router";
import {
  Bell,
  Building2,
  ClipboardList,
  Clock,
  LayoutDashboard,
  LogOut,
  Menu,
  Search,
  Settings2,
  Table2,
  Users2,
  X,
} from "lucide-react";
import { useState, type ReactNode } from "react";

import { Pill } from "@/components/status";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useSessionTimeout } from "@/hooks/use-session-timeout";
import { currentUser } from "@/lib/mock-data";
import { signOut } from "@/lib/auth";
import { cn } from "@/lib/utils";
const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/applications", label: "Applications", icon: ClipboardList, badge: 12 },
  { to: "/policy-rules", label: "Policy Rules", icon: Settings2 },
  { to: "/employers", label: "Employer Master", icon: Building2 },
  { to: "/rate-grid", label: "Rate Grid", icon: Table2 },
  { to: "/users", label: "Users", icon: Users2 },
  { to: "/audit-log", label: "Audit Log", icon: Clock },
];

function Logo() {
  return (
    <Link to="/dashboard" className="flex items-center gap-2 px-1">
      <span className="flex size-8 items-center justify-center rounded-md bg-primary text-sm font-bold text-primary-foreground">
        c
      </span>
      <span className="text-lg font-semibold tracking-tight">cercit</span>
    </Link>
  );
}

function NavItems({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <nav className="flex flex-col gap-1">
      {nav.map((item) => {
        const active = pathname.startsWith(item.to);
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-sidebar-accent text-sidebar-accent-foreground"
                : "text-sidebar-foreground/80 hover:bg-sidebar-accent/50 hover:text-sidebar-accent-foreground",
            )}
          >
            <item.icon className="size-4 shrink-0" />
            <span className="flex-1">{item.label}</span>
            {item.badge ? (
              <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
                {item.badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { showWarning, dismissWarning } = useSessionTimeout();

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar: fixed visible on lg+ */}
      <aside data-sidebar className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-sidebar-border bg-sidebar px-3 py-4 lg:flex">
        <Logo />
        <div className="mt-6 flex-1">
          <NavItems />
        </div>
        {/* Sign out button — bottom of sidebar below nav links */}
        <div className="mt-auto pt-3">
          <Button
            variant="outline"
            className="w-full justify-start gap-2 text-sm"
            onClick={async () => {
              await signOut();
              window.location.href = "/";
            }}
          >
            <LogOut className="size-4" />
            Sign out
          </Button>
        </div>
        <div className="rounded-md bg-sidebar-accent/50 p-3 text-xs text-muted-foreground">
          <p className="font-medium text-sidebar-accent-foreground">Prototype data</p>
          <p className="mt-1">All figures are illustrative sample records.</p>
        </div>
      </aside>

      {/* Mobile sidebar overlay: shown when sidebarOpen */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-label="Close sidebar"
        />
      )}

      {/* Mobile sidebar: hidden by default, shown with translate-x-0 when open */}
      <aside
        data-sidebar
        className={cn(
          "fixed inset-y-0 left-0 z-40 w-60 flex-col border-r border-sidebar-border bg-sidebar px-3 py-4 transition-transform duration-200 lg:hidden",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex items-center justify-between">
          <Logo />
          <button
            className="md:hidden rounded-md p-1 text-sidebar-foreground hover:bg-sidebar-accent"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close sidebar"
          >
            <X className="size-5" />
          </button>
        </div>
        <div className="mt-6 flex-1">
          <NavItems onNavigate={() => setSidebarOpen(false)} />
        </div>
        <div className="mt-auto pt-3">
          <Button
            variant="outline"
            className="w-full justify-start gap-2 text-sm"
            onClick={async () => {
              await signOut();
              window.location.href = "/";
            }}
          >
            <LogOut className="size-4" />
            Sign out
          </Button>
        </div>
        <div className="rounded-md bg-sidebar-accent/50 p-3 text-xs text-muted-foreground">
          <p className="font-medium text-sidebar-accent-foreground">Prototype data</p>
          <p className="mt-1">All figures are illustrative sample records.</p>
        </div>
      </aside>

      <div data-main-wrapper className="lg:pl-60">
        <header data-topbar className="sticky top-0 z-20 flex h-14 items-center gap-2 border-b border-border bg-card/90 px-3 backdrop-blur sm:px-5">
          {/* Mobile hamburger button: visible only on mobile */}
          <button
            className="md:hidden rounded-md p-2 text-foreground hover:bg-muted"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label="Toggle menu"
          >
            {sidebarOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>

          <div className="relative hidden max-w-md flex-1 sm:block">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name, PAN, application ID..."
              className="h-9 pl-9"
              aria-label="Search"
            />
          </div>

          <div className="hidden flex-1 items-center justify-center md:flex">
            <span className="inline-flex items-center gap-2 rounded-full border border-success/30 bg-success/8 px-3.5 py-1.5 text-xs font-semibold text-success">
              <span className="relative flex size-2.5">
                <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-40" />
                <span className="relative inline-flex size-2.5 rounded-full bg-success" />
              </span>
              Automated Underwriting: Active
            </span>
          </div>

          <div className="flex items-center justify-end gap-1 sm:flex-none">
            <ThemeToggle />
            <Button variant="ghost" size="icon" className="relative" aria-label="Notifications">
              <Bell className="size-4" />
              <span className="absolute top-1.5 right-1.5 flex size-4 items-center justify-center rounded-full bg-destructive text-[9px] font-semibold text-destructive-foreground">
                4
              </span>
            </Button>
            <div className="ml-1 hidden items-center gap-2 md:flex">
              <span className="flex size-8 items-center justify-center rounded-full bg-primary/12 text-xs font-semibold text-primary">
                {currentUser.initials}
              </span>
              <div className="leading-tight">
                <p className="text-sm font-medium">{currentUser.name}</p>
                <p className="text-xs text-muted-foreground">{currentUser.role}</p>
              </div>
            </div>
            <Button variant="ghost" size="icon" asChild aria-label="Logout">
              <Link to="/">
                <LogOut className="size-4" />
              </Link>
            </Button>
          </div>
        </header>

        <main className="min-w-0 overflow-x-hidden p-3 sm:p-5">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
              {subtitle && <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>}
            </div>
            {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
          </div>
          {children}
        </main>
      </div>
      <Dialog open={showWarning} onOpenChange={(open) => { if (!open) dismissWarning(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Session expiring</DialogTitle>
            <DialogDescription>
              You've been inactive for a while. Your session will end in 2 minutes.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={dismissWarning}>Stay signed in</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function SectionCard({
  title,
  description,
  action,
  children,
  className,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("panel", className)}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            {title && <h2 className="text-sm font-semibold tracking-tight">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>}
          </div>
          {action}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

export function LabelValue({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-sm font-medium break-words">{value}</p>
    </div>
  );
}

export { Pill };
