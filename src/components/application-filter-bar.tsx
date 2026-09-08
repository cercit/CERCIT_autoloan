import { useState, useRef, useEffect, useCallback } from "react";
import { cn } from "@/lib/utils";

export interface FilterState {
  search?: string | undefined;
  status?: string | undefined;
  decision?: string | undefined;
  dateFrom?: string | undefined;
  dateTo?: string | undefined;
  bureauMin?: number | undefined;
  bureauMax?: number | undefined;
  assignedTo?: string | undefined;
}

export interface ApplicationFilterBarProps {
  onFilterChange: (filters: FilterState) => void;
  assignedToOptions?: string[];
  className?: string;
}

export function ApplicationFilterBar({ onFilterChange, assignedToOptions = ["System", "Credit Officer", "Reviewer"], className }: ApplicationFilterBarProps) {
  const [filters, setFilters] = useState<FilterState>({});
  const [searchValue, setSearchValue] = useState("");
  const [expanded, setExpanded] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  const debouncedSearch = useCallback((val: string) => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      const next = { ...filters, search: val || undefined };
      setFilters(next);
      onFilterChange(next);
    }, 300);
  }, [filters, onFilterChange]);

  useEffect(() => () => { if (timeoutRef.current) clearTimeout(timeoutRef.current); }, []);

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchValue(e.target.value);
    debouncedSearch(e.target.value);
  };

  const clearFilters = () => {
    setFilters({});
    setSearchValue("");
    onFilterChange({});
  };

  const activeFilters = Object.entries(filters).filter(([k, v]) => v !== undefined && v !== "" && v !== 0);

  const FilterPill = ({ label, value }: { label: string; value: string }) => (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2.5 py-0.5 text-[10px] font-medium">
      {label}: {value}
      <button onClick={() => {
        const next = { ...filters, [label === "Search" ? "search" : label === "Status" ? "status" : label === "Decision" ? "decision" : label === "From" ? "dateFrom" : label === "To" ? "dateTo" : label === "Bureau min" ? "bureauMin" : label === "Bureau max" ? "bureauMax" : label === "Assigned" ? "assignedTo" : label]: undefined };
        setFilters(next);
        onFilterChange(next);
      }} className="text-primary hover:text-primary/80 ml-0.5">×</button>
    </span>
  );

  return (
    <div className={cn("panel", className)}>
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[200px]">
          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground">🔍</span>
          <input
            type="text"
            value={searchValue}
            onChange={handleSearchChange}
            placeholder="Search by name, PAN, app ID..."
            className="w-full rounded-md border pl-8 pr-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
        <button onClick={() => setExpanded(!expanded)} className="text-xs font-medium text-muted-foreground hover:text-foreground border rounded-md px-3 py-2">Filters {expanded ? "▲" : "▼"}</button>
        {activeFilters.length > 0 && <button onClick={clearFilters} className="text-xs text-red-600 hover:text-red-700 underline">Clear all</button>}
      </div>

      {expanded && (
        <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t">
          <select onChange={(e) => { const next = { ...filters, status: e.target.value || undefined }; setFilters(next); onFilterChange(next); }} className="rounded-md border px-2.5 py-1.5 text-xs bg-background">
            <option value="">Status: All</option>
            <option value="pending">Pending</option>
            <option value="review">Review</option>
            <option value="approved">Approved</option>
            <option value="declined">Declined</option>
          </select>
          <select onChange={(e) => { const next = { ...filters, decision: e.target.value || undefined }; setFilters(next); onFilterChange(next); }} className="rounded-md border px-2.5 py-1.5 text-xs bg-background">
            <option value="">Decision: All</option>
            <option value="approve">Approve</option>
            <option value="review">Review</option>
            <option value="decline">Decline</option>
          </select>
          <input type="date" onChange={(e) => { const next = { ...filters, dateFrom: e.target.value || undefined }; setFilters(next); onFilterChange(next); }} className="rounded-md border px-2.5 py-1.5 text-xs bg-background" placeholder="From" />
          <input type="date" onChange={(e) => { const next = { ...filters, dateTo: e.target.value || undefined }; setFilters(next); onFilterChange(next); }} className="rounded-md border px-2.5 py-1.5 text-xs bg-background" placeholder="To" />
          <input type="number" placeholder="Bureau min" onChange={(e) => { const v = e.target.value ? Number(e.target.value) : undefined; const next = { ...filters, bureauMin: v }; setFilters(next); onFilterChange(next); }} className="w-20 rounded-md border px-2.5 py-1.5 text-xs bg-background" />
          <input type="number" placeholder="Bureau max" onChange={(e) => { const v = e.target.value ? Number(e.target.value) : undefined; const next = { ...filters, bureauMax: v }; setFilters(next); onFilterChange(next); }} className="w-20 rounded-md border px-2.5 py-1.5 text-xs bg-background" />
          <select onChange={(e) => { const next = { ...filters, assignedTo: e.target.value || undefined }; setFilters(next); onFilterChange(next); }} className="rounded-md border px-2.5 py-1.5 text-xs bg-background">
            <option value="">Assigned to: Any</option>
            {assignedToOptions.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
      )}

      {activeFilters.length > 0 && !expanded && (
        <div className="flex flex-wrap gap-1.5 mt-2">
          {filters.search && <FilterPill label="Search" value={String(filters.search)} />}
          {filters.status && <FilterPill label="Status" value={String(filters.status)} />}
          {filters.decision && <FilterPill label="Decision" value={String(filters.decision)} />}
          {filters.dateFrom && <FilterPill label="From" value={String(filters.dateFrom)} />}
          {filters.dateTo && <FilterPill label="To" value={String(filters.dateTo)} />}
          {filters.bureauMin && <FilterPill label="Bureau min" value={String(filters.bureauMin)} />}
          {filters.bureauMax && <FilterPill label="Bureau max" value={String(filters.bureauMax)} />}
          {filters.assignedTo && <FilterPill label="Assigned" value={String(filters.assignedTo)} />}
        </div>
      )}
    </div>
  );
}
