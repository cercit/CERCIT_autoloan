---
type: new
target: src/components/confirmation-dialog.tsx
model: inkling
---

## Instructions

Create a reusable confirmation dialog for destructive or important actions.

Requirements:
- Named export `ConfirmationDialog`
- Props type (export as `ConfirmationDialogProps`):
  - `open: boolean`
  - `onOpenChange: (open: boolean) => void`
  - `title: string`
  - `description: string`
  - `confirmLabel?: string` (default "Confirm")
  - `cancelLabel?: string` (default "Cancel")
  - `variant?: "default" | "destructive"` (default "default")
  - `onConfirm: () => void`
  - `loading?: boolean`
- Uses shadcn Dialog components: import Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle from `@/components/ui/dialog`
- Import Button from `@/components/ui/button`
- Cancel button: variant="outline", calls onOpenChange(false), disabled when loading
- Confirm button: variant matches the `variant` prop (use "default" or "destructive"), calls onConfirm, shows "..." text when loading, disabled when loading
- Clean, minimal layout — no icons, no extra padding
