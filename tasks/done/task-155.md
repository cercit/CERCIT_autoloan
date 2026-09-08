---
type: new
target: src/components/notification-dropdown.tsx
---

## Instructions

Create a React notification bell icon with a dropdown list of recent notifications.

Requirements:
- Named export `NotificationDropdown`
- Props interface `NotificationDropdownProps`:
  - `notifications: Array<{id: string; title: string; message: string; type: "info" | "success" | "warning" | "error"; read: boolean; createdAt: string; applicationId?: string}>`
  - `unreadCount: number`
  - `onMarkRead?: (id: string) => void`
  - `onMarkAllRead?: () => void`
  - `onNotificationClick?: (notification: {id: string; applicationId?: string}) => void`
  - `className?: string`
- Layout:
  - Bell icon button (simple SVG bell shape). If unreadCount > 0, show a small red circle badge with the count (max display "9+").
  - Clicking the bell toggles a dropdown panel positioned below/right of the bell.
  - Dropdown header: "Notifications" on the left, "Mark all read" link on the right.
  - List of notifications, most recent first:
    - Each row: colored left border by type (blue=info, green=success, yellow=warning, red=error). Title in bold, message below in smaller text, relative time ("2m ago", "1h ago") on the right.
    - Unread notifications: slightly highlighted background.
    - Clicking a notification calls onNotificationClick and onMarkRead.
  - If no notifications: "No notifications" centered text with a muted bell icon.
  - Max 8 notifications visible, scrollable if more.
  - Click outside the dropdown closes it.
- Import `cn` from `@/lib/utils`
- Use `useState` for open/closed state.
- Use `useRef` and `useEffect` for click-outside detection.
