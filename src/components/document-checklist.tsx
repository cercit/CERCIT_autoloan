import { Circle, Upload, CheckCircle, XCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type DocCheckItem = {
  name: string;
  status: "pending" | "uploaded" | "verified" | "rejected";
  note?: string;
};

export type DocumentChecklistProps = {
  items: DocCheckItem[];
  className?: string;
};

export function DocumentChecklist({ items, className }: DocumentChecklistProps) {
  const allVerified = items.length > 0 && items.every((i) => i.status === "verified");

  return (
    <div className={cn("space-y-2", className)}>
      {allVerified && (
        <div className="rounded-lg bg-green-100 px-4 py-3 text-sm font-medium text-green-800">
          All documents verified
        </div>
      )}
      {items.map((item) => {
        const Icon =
          item.status === "pending"
            ? Circle
            : item.status === "uploaded"
            ? Upload
            : item.status === "verified"
            ? CheckCircle
            : XCircle;

        const iconColor =
          item.status === "pending"
            ? "text-muted-foreground"
            : item.status === "uploaded"
            ? "text-blue-600"
            : item.status === "verified"
            ? "text-green-600"
            : "text-red-600";

        const badgeVariant =
          item.status === "pending"
            ? "outline"
            : item.status === "uploaded"
            ? "default"
            : item.status === "verified"
            ? "secondary"
            : "destructive";

        return (
          <div
            key={item.name}
            className="flex items-start gap-3 rounded-lg border p-3"
          >
            <Icon className={cn("h-5 w-5 shrink-0 mt-0.5", iconColor)} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">{item.name}</p>
              {item.note && (
                <p className="text-xs text-muted-foreground">{item.note}</p>
              )}
            </div>
            <Badge
              variant={badgeVariant}
              className={item.status === "verified" ? "bg-green-600 hover:bg-green-700 text-white" : undefined}
            >
              {item.status}
            </Badge>
          </div>
        );
      })}
    </div>
  );
}