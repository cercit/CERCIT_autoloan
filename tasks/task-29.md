# Task 29 — Print stylesheet for copilot review

**Read `tasks/hermes-rules.md` first. Follow every rule.**

## Goal

Add a print-specific stylesheet so Ctrl+P on the application review page produces clean output: sidebar hidden, sections expanded, full-width content.

## Current state

- `src/styles.css` has no `@media print` block (letter-layout.tsx has its own inline print styles, but those only affect the letter pages)
- `src/components/app-shell.tsx` has:
  - Desktop sidebar: `<aside>` at line ~98 with class `hidden ... lg:flex`
  - Mobile sidebar: `<aside>` at line ~134
  - Header: `<header>` at line ~172
  - Main content: `<main>` at line ~216 inside a `<div className="lg:pl-60">`
- Collapsible sections in copilot-review stay collapsed on print

## Steps

### 1. Add data attributes in `src/components/app-shell.tsx`

Add `data-sidebar` to both `<aside>` elements:
- Line ~98 (desktop sidebar): add `data-sidebar` to the element
- Line ~134 (mobile sidebar): add `data-sidebar` to the element

Add `data-topbar` to the `<header>` element at line ~172.

Add `data-main-wrapper` to the `<div className="lg:pl-60">` that wraps header + main.

Run `npx tsc --noEmit` after these changes.

### 2. Add `@media print` block at the end of `src/styles.css`

```css
@media print {
  [data-sidebar],
  [data-topbar],
  .no-print {
    display: none !important;
  }

  [data-main-wrapper] {
    padding-left: 0 !important;
  }

  main {
    padding: 0 !important;
  }

  [data-state="closed"] [data-collapsible-content] {
    display: block !important;
    height: auto !important;
    overflow: visible !important;
  }

  .panel,
  section {
    box-shadow: none !important;
    break-inside: avoid;
  }

  button:not(.print-visible),
  [role="combobox"] {
    display: none !important;
  }

  body {
    background: white !important;
    color: black !important;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
}
```

Run `npx tsc --noEmit` after this change (CSS changes shouldn't break types, but verify).

## Files to edit

- `src/components/app-shell.tsx` — add data attributes
- `src/styles.css` — add `@media print` block

## Done when

- `npx tsc --noEmit` exits clean
- Both `<aside>` elements have `data-sidebar`
- `<header>` has `data-topbar`
- The `lg:pl-60` wrapper div has `data-main-wrapper`
- `@media print` block exists in styles.css hiding sidebar, topbar, and expanding collapsibles
- No `// # reason:` or `// Self-review` comments in any edited file
