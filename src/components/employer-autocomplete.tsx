import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { searchEmployers } from "@/lib/api";
import type { EmployerSuggestion } from "@/lib/api";
import { cn } from "@/lib/utils";

export function EmployerAutocomplete({
  value,
  onChange,
}: {
  value: string;
  onChange: (name: string, category: string | undefined) => void;
}) {
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<EmployerSuggestion[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  function handleChange(text: string) {
    setQuery(text);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (text.length < 2) {
      setSuggestions([]);
      setShowDropdown(false);
      return;
    }
    timerRef.current = setTimeout(async () => {
      const results = await searchEmployers(text);
      setSuggestions(results);
      setShowDropdown(results.length > 0);
    }, 300);
  }

  function handleSelect(s: EmployerSuggestion) {
    setQuery(s.name);
    setShowDropdown(false);
    onChange(s.name, s.category);
  }

  function handleBlur() {
    setTimeout(() => {
      setShowDropdown(false);
      if (query !== value) {
        onChange(query, undefined);
      }
    }, 200);
  }

  return (
    <div className="relative">
      <Input
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => suggestions.length > 0 && setShowDropdown(true)}
        onBlur={handleBlur}
        placeholder="Type employer name..."
      />
      {showDropdown && (
        <ul className="absolute z-50 mt-1 w-full rounded-md border border-border bg-popover shadow-md">
          {suggestions.map((s) => (
            <li key={s.name}>
              <button
                type="button"
                className={cn(
                  "flex w-full items-center justify-between px-3 py-2 text-sm hover:bg-accent",
                )}
                onMouseDown={() => handleSelect(s)}
              >
                <span>{s.name}</span>
                <span className="text-xs text-muted-foreground">{s.category}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
