import { useState } from "react";
import { cn } from "@/lib/utils";

export interface AppDetailLayoutProps {
  appId: string;
  applicantName: string;
  status: string;
  decision?: string;
  statusColor?: string;
  tabs: string[];
  activeTab: string;
  onTabChange: (tab: string) => void;
  children?: React.ReactNode;
  onBack?: () => void;
  className?: string;
}

export function ApplicationDetailLayout({ appId, applicantName, status, decision, statusColor, tabs, activeTab, onTabChange, children, onBack, className }: AppDetailLayoutProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className={cn("min-h-0", className)}>
      <header className="sticky top-0 z-20 bg-background/90 backdrop-blur border-b">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3 min-w-0">
            <button onClick={onBack} className="text-muted-foreground hover:text-foreground" aria-label="Back">←</button>
            <div className="min-w-0">
              <h1 className="text-sm font-bold truncate">{applicantName}</h1>
              <p className="text-[10px] text-muted-foreground truncate">{appId}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide", statusColor || (status === "approved" ? "bg-green-100 text-green-700" : status === "declined" ? "bg-red-100 text-red-700" : status === "review" ? "bg-amber-100 text-amber-700" : "bg-blue-50 text-blue-700"))}>
              {status}
            </span>
            {decision && <span className="text-xs font-extrabold">{decision}</span>}
            <button onClick={() => setMenuOpen(!menuOpen)} className="text-muted-foreground hover:text-foreground" aria-label="Menu">⋮</button>
          </div>
        </div>
        <nav className="flex gap-0 border-t overflow-x-auto">
          {tabs.map((tab) => (
            <button key={tab} onClick={() => onTabChange(tab)} className={cn("px-4 py-2 text-xs font-medium whitespace-nowrap transition-colors border-b-2", activeTab === tab ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground")}>
              {tab}
            </button>
          ))}
        </nav>
      </header>
      <main className="p-3">{children}</main>
    </div>
  );
}
