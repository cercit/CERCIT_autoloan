---
type: new
target: src/components/application-filter-bar.tsx
---

## Instructions

Create a React filter bar component for searching and filtering applications on the dashboard.

Requirements:
- Named export `ApplicationFilterBar`
- Props interface `ApplicationFilterBarProps`:
  - `onFilterChange?: (filters: {search: string; status: string | null; dateFrom: string | null; dateTo: string | null; bureauMin: number | null; bureauMax: number | null; decision: string | null; assignedTo: string | null}) => void`
  - `statusOptions: string[]` — e.g. ["submitted", "processing", "review", "approved", "declined"]
  - `assigneeOptions: Array<{id: string; name: string}>`
  - `activeFilters: Record<string, unknown>`
  - `className?: string`
- Layout: a horizontal bar that wraps on mobile.
  - Search input: text field with a search icon, placeholder "Search by name, ID, or PAN...". Debounced — call onFilterChange 300ms after typing stops. Use a ref for the timeout.
  - Status dropdown: "All statuses" default, then each status option.
  - Decision dropdown: "All decisions" default, then "Approve", "Review", "Decline".
  - Date range: two date inputs labeled "From" and "To".
  - Bureau score range: two small number inputs "Min score" and "Max score".
  - Assigned to dropdown: "Anyone" default, then each assignee.
  - "Clear filters" link: resets all filters and calls onFilterChange with defaults.
- Active filter pills: below the filter bar, show a pill for each non-default filter (e.g. "Status: Approved" with an X to remove). Clicking X clears that individual filter.
- Compact mode: on mobile, show only the search input and a "Filters" button that expands the rest.
- Import `cn` from `@/lib/utils`
- Use `useState` for local filter state, `useRef` for debounce timer, `useEffect` to sync with activeFilters prop.
