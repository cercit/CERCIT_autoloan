---
type: new
target: src/components/notification-bell.tsx
model: llama
---

## Instructions

Create a notification bell component with a dropdown list of recent notifications.

Requirements:
- Named export `NotificationBell`
- No props needed (self-contained with mock data)
- Define a `Notification` type internally (not exported): `{ id: string; title: string; message: string; time: string; read: boolean }`
- Hardcode 5 mock notifications:
  1. "New application assigned" / "APP-2024-0156 has been assigned to you" / "2m ago" / unread
  2. "Document uploaded" / "PAN card uploaded for APP-2024-0148" / "15m ago" / unread
  3. "Decision overridden" / "APP-2024-0142 was overridden to Approve" / "1h ago" / read
  4. "CIBIL score updated" / "Bureau refresh completed for APP-2024-0139" / "3h ago" / read
  5. "SLA breach warning" / "APP-2024-0131 approaching 24h SLA limit" / "5h ago" / read
- Use state to track which are read. Clicking a notification marks it read.
- Bell icon: import Bell from `lucide-react`. Show an unread count badge (small red circle with number) if any unread exist.
- Dropdown: use Popover and PopoverContent, PopoverTrigger from `@/components/ui/popover`
- Trigger: a Button variant="ghost" size="icon" with the Bell icon
- Popover content: w-80, header "Notifications" with a "Mark all read" text button, then a scrollable list (max-h-72 overflow-y-auto)
- Each notification row: flex layout, unread ones have a small blue dot on the left and slightly bolder text
- Import `cn` from `@/lib/utils`
- Import Button from `@/components/ui/button`
