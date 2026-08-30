# Connecting cercit_mock to Supabase

## What's ready

The Supabase backend is live with:
- 22 tables with RLS policies
- 132 dealers across 12 OEMs
- 16 policy rules with thresholds
- 7 PostgreSQL functions callable via `supabase.rpc()`
- Two smoke-tested scenarios (APPROVE + REJECT)

The integration layer is written and sitting in `Lov_cercit/src/lib/`:
- `supabase.ts` — client init, reads URL and anon key from env vars
- `api.ts` — wraps Supabase queries and RPCs, maps DB rows to the UI's `Application` type, falls back to mock data when Supabase isn't configured

## Steps to wire up

### 1. Add supabase-js

In Lovable, add the dependency:
```
npm install @supabase/supabase-js
```

Or in Lovable's package editor, add `@supabase/supabase-js` to dependencies.

### 2. Set environment variables

In Lovable project settings (or `.env` locally):
```
VITE_SUPABASE_URL=https://izlxncfcuvjqzxxbyidt.supabase.co
VITE_SUPABASE_ANON_KEY=<get from Supabase dashboard > Settings > API > anon public>
```

### 3. Replace mock imports

Each route file currently imports from `mock-data.ts`. Replace with `api.ts`:

```tsx
// Before
import { applications } from "@/lib/mock-data";

// After
import { getApplications } from "@/lib/api";

// In component, use useEffect or TanStack Query:
const [apps, setApps] = useState<Application[]>([]);
useEffect(() => {
  getApplications().then(setApps);
}, []);
```

### 4. RPC functions available

| UI action | Function | Call |
|---|---|---|
| New application form submit | `fn_create_application` | `supabase.rpc('fn_create_application', {p_full_name, p_email, p_mobile})` |
| Quick eligibility check | `fn_in_principle_check` | `supabase.rpc('fn_in_principle_check', {p_application_id: uuid})` |
| Run full assessment | `fn_assess_application` | `supabase.rpc('fn_assess_application', {p_application_id: uuid})` |
| EMI calculator widget | `fn_calculate_emi` | `supabase.rpc('fn_calculate_emi', {p_principal, p_annual_rate, p_tenure_months})` |

### 5. Direct table reads

Policy rules, rate grid, audit log, and dealers can be read directly:

```ts
supabase.from('policy_rules').select('*').eq('is_active', true)
supabase.from('rate_grid').select('*').order('score_band_min')
supabase.from('dealers').select('*').eq('is_active', true)
supabase.from('audit_events').select('*').order('created_at', {ascending: false})
```

### 6. Graceful fallback

The API layer falls back to mock data when env vars aren't set. This means the app works in both modes — mock for Lovable preview, live for connected deployment.

## What's not wired yet

- **Authentication** — Supabase Auth not set up. RLS policies exist but currently allow all access (no auth_user_id checks). Phase 2 item.
- **fn_list_applications** — a view or function to list applications with joined data (customer name, vehicle, recommendation). Needs to be created for the dashboard.
- **Real-time subscriptions** — Supabase supports `supabase.channel().on('postgres_changes', ...)` for live updates. Not needed for Phase 1.
- **File uploads** — document upload flow (salary slips, bank statements) uses Supabase Storage. Phase 2.
