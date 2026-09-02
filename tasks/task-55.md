# Task 55 — Assignment and queue management

**Read `tasks/hermes-rules.md` first. Follow every rule.**

## Goal

Add `assignApplication(applicationId, officerId)` and `getOfficerQueue(officerId)` to `src/lib/api.ts`. Add an "Assign" button on the application detail page that opens a Dialog with a dropdown of users.

## Current state

- `src/lib/api.ts` exports `getUsers()` — returns a list of users with `name`, `email`, `role`, `status` fields
- `src/lib/mock-data.ts` exports `users` array and `currentUser` object
- `Application` type has `assignedTo: string` field (stores the officer's name)
- `src/routes/applications/$id/index.tsx` renders the application detail page (updated by tasks 32, 54)
- Supabase `applications` table likely has an `assigned_to` or `officer_id` column
- No assignment UI exists

## Steps

### 1. Add API functions to `src/lib/api.ts`

```typescript
export async function assignApplication(
  applicationId: string,
  officerName: string
): Promise<boolean> {
  if (!isSupabaseConfigured) return true;

  const { error } = await supabase
    .from("applications")
    .update({ officer_name: officerName })
    .eq("application_id", applicationId);

  if (error) {
    console.error("Assignment failed:", error);
    return false;
  }
  return true;
}

export async function getOfficerQueue(
  officerName: string
): Promise<Application[]> {
  if (!isSupabaseConfigured) {
    return mockApplications.filter((a) => a.assignedTo === officerName);
  }

  const { data, error } = await supabase
    .rpc("fn_list_applications")
    .then(({ data, error }) => {
      if (error || !data) return { data: null, error };
      return {
        data: (data as any[]).filter((row: any) => row.officer_name === officerName),
        error: null,
      };
    });

  if (error || !data) return mockApplications.filter((a) => a.assignedTo === officerName);
  return data.map(mapToApplication);
}
```

**Note:** The `getOfficerQueue` implementation above uses a filter after fetching. If Supabase supports a direct query, adjust accordingly. The key requirement is that it returns applications assigned to the given officer. The fallback filters mock data by `assignedTo`.

Alternatively, use a simpler pattern that avoids chaining `.then` on the Supabase query:

```typescript
export async function getOfficerQueue(
  officerName: string
): Promise<Application[]> {
  if (!isSupabaseConfigured) {
    return mockApplications.filter((a) => a.assignedTo === officerName);
  }

  const { data, error } = await supabase.rpc("fn_list_applications");
  if (error || !data) {
    return mockApplications.filter((a) => a.assignedTo === officerName);
  }
  return (data as any[])
    .filter((row: any) => row.officer_name === officerName)
    .map(mapToApplication);
}
```

Run `npx tsc --noEmit`.

### 2. Add Assign button and dialog to `src/routes/applications/$id/index.tsx`

Import new dependencies:

```typescript
import { assignApplication, getUsers } from "@/lib/api";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
```

Add state:

```typescript
const [showAssign, setShowAssign] = useState(false);
const [assignee, setAssignee] = useState("");
const [assigning, setAssigning] = useState(false);
const [userList, setUserList] = useState<{ name: string; role: string; status: string }[]>([]);
```

Load users when dialog opens:

```typescript
useEffect(() => {
  if (showAssign) {
    getUsers().then((list) => setUserList(list.filter((u) => u.status === "Active")));
  }
}, [showAssign]);
```

Add handler:

```typescript
async function handleAssign() {
  if (!app || !assignee) return;
  setAssigning(true);
  const ok = await assignApplication(app.id, assignee);
  setAssigning(false);
  if (ok) {
    toast.success(`Assigned to ${assignee}`);
    setShowAssign(false);
    const refreshed = await getApplication(id);
    setApp(refreshed ?? null);
  } else {
    toast.error("Assignment failed");
  }
}
```

Add "Assign" button in the actions area and the Dialog:

```tsx
<Button variant="outline" onClick={() => setShowAssign(true)}>
  Assign
</Button>

<Dialog open={showAssign} onOpenChange={setShowAssign}>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Assign application</DialogTitle>
      <DialogDescription>Select an officer to assign {app.id}</DialogDescription>
    </DialogHeader>
    <Select value={assignee} onValueChange={setAssignee}>
      <SelectTrigger>
        <SelectValue placeholder="Select officer" />
      </SelectTrigger>
      <SelectContent>
        {userList.map((u) => (
          <SelectItem key={u.name} value={u.name}>
            {u.name} — {u.role}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
    <DialogFooter>
      <Button variant="outline" onClick={() => setShowAssign(false)}>Cancel</Button>
      <Button disabled={!assignee || assigning} onClick={handleAssign}>
        {assigning ? "Assigning..." : "Assign"}
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

Run `npx tsc --noEmit`.

## Files to edit

- `src/lib/api.ts` — add `assignApplication` and `getOfficerQueue`
- `src/routes/applications/$id/index.tsx` — add Assign button with Dialog

## Done when

- `npx tsc --noEmit` exits clean
- `assignApplication` updates Supabase (or returns true in mock mode)
- `getOfficerQueue` filters applications by officer name
- "Assign" button opens a Dialog with a dropdown of active users
- Selecting a user and clicking "Assign" calls `assignApplication` and refreshes the page
- Toast confirms success or reports error
- No `// # reason:` or `// Self-review` comments in any edited file
- Every new button/link has a working handler
- Every new data field resolves from its source, not a hardcoded fallback
