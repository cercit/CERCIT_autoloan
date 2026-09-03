import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export function SlaTimer({ since }: { since: string }) {
  const [elapsed, setElapsed] = useState("");
  const [tone, setTone] = useState<"success" | "warning" | "destructive">("success");

  useEffect(() => {
    function tick() {
      const diff = Date.now() - new Date(since).getTime();
      const hours = Math.floor(diff / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      setElapsed(hours > 0 ? `${hours}h ${mins}m` : `${mins}m`);
      setTone(hours >= 24 ? "destructive" : hours >= 8 ? "warning" : "success");
    }
    tick();
    const id = setInterval(tick, 60000);
    return () => clearInterval(id);
  }, [since]);

  return (
    <span className={cn(
      "text-xs font-medium tabular",
      tone === "success" && "text-success",
      tone === "warning" && "text-warning",
      tone === "destructive" && "text-destructive",
    )}>
      {elapsed}
    </span>
  );
}
