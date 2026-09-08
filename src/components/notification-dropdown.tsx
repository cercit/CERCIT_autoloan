import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

export interface NotificationItem {
  id: string;
  type: "info" | "success" | "warning" | "error";
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
}

export interface NotificationDropdownProps {
  notifications?: NotificationItem[];
  unreadCount?: number;
  onMarkAllRead?: () => void;
  className?: string;
}

export function NotificationDropdown({ notifications = [], unreadCount = 0, onMarkAllRead, className }: NotificationDropdownProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);

  const typeColors = { info: "border-blue-500", success: "border-green-500", warning: "border-amber-500", error: "border-red-500" };
  const typeLabels: Record<string, string> = { info: "Info", success: "Success", warning: "Warning", error: "Error" };

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button onClick={() => setOpen(!open)} className="relative" aria-label="Notifications">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[9px] font-bold text-white">{unreadCount > 9 ? "9+" : unreadCount}</span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 rounded-xl border bg-background shadow-xl z-30 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <h4 className="text-sm font-bold">Notifications</h4>
            {onMarkAllRead && unreadCount > 0 && (
              <button onClick={onMarkAllRead} className="text-[10px] text-muted-foreground hover:text-foreground underline">Mark all read</button>
            )}
          </div>
          <div className="max-h-[320px] overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="p-6 text-center text-xs text-muted-foreground">No notifications</p>
            ) : (
              notifications.map((n) => (
                <div key={n.id} className={cn("border-l-2 px-4 py-3 hover:bg-muted/20 transition-colors", n.read ? "bg-background" : "bg-muted/5", typeColors[n.type])}>
                  <div className="flex items-start justify-between gap-2">
                    <h5 className="text-xs font-semibold text-foreground">{n.title}</h5>
                    <span className="text-[9px] text-muted-foreground whitespace-nowrap">{new Date(n.timestamp).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</span>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{n.message}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
