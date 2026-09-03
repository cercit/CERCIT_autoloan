import { cn } from "@/lib/utils";

const shortcuts = [
  { keys: "Ctrl+K", action: "Search applications" },
  { keys: "Ctrl+N", action: "New application" },
  { keys: "Escape", action: "Close dialog" },
  { keys: "?", action: "Show shortcuts" },
];

export function ShortcutOverlay({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  if (!visible) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-lg border border-border bg-popover p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-semibold">Keyboard shortcuts</h2>
        <ul className="mt-4 space-y-3">
          {shortcuts.map((s) => (
            <li key={s.keys} className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">{s.action}</span>
              <kbd className="rounded border border-border bg-muted px-2 py-1 text-xs font-mono">
                {s.keys}
              </kbd>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
