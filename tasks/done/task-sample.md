---
type: new
target: src/components/loading-dots.tsx
---

## Instructions

Create a simple animated loading dots component for cercit.

- Export a named function `LoadingDots`
- No props needed
- Render three dots that fade in/out in sequence using CSS animation
- Use Tailwind classes only (no inline styles)
- Each dot is a `span` with classes for size (size-2), rounded-full, bg-primary
- Stagger the animation-delay on each dot

## Code

```tsx
import { cn } from "@/lib/utils";

export function LoadingDots() {
  return (
    <span className="inline-flex items-center gap-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={cn(
            "size-2 rounded-full bg-primary animate-pulse",
          )}
          style={{ animationDelay: `${i * 150}ms` }}
        />
      ))}
    </span>
  );
}
```
