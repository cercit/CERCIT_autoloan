# Rights and what the website shows: audit, 2 Oct 2026

This is a check only; nothing on the site was changed. The question was whether each role sees only what its rights allow. Findings are numbered **V1–V14** to be fixed later.

**Summary:** the database enforces the rights well; every action is checked there. The website doesn't follow the rights: every role sees the same full menu, some pages show fixed sample numbers, and a few pages are broken for everyone.

## What each staff role can open, and what happens

| Page | Officer | Manager | Head | Demo visitor | Notes |
|---|---|---|---|---|---|
| Dashboard | yes | yes | yes | yes | Counts read the applications table, which every staff role may read |
| Applications | **all cases** | all | all | staff + synthetic | Officer should see own cases only (V5) |
| Customer applications | all, real customers | all | all | none (restricted note) | Works as designed |
| Loan portfolio | **error: permission denied** | yes | yes | synthetic only | Menu shows it to officers anyway (V1) |
| Policy Rules / Rate Grid / Employer Master | read | read | read | read | Tables readable by any signed-in staff |
| Document checks | read only | read only | edit | read only | Read needs app.evaluate or policy.view; edit needs policy.author |
| Approvals (when Credit control is on) | **error** | **error** | approve | read | Shown in the menu to officers and managers anyway (V7) |
| Users | **error** | **error** | **error** | **error** | Needs user.view, so admin only (V1) |
| Roles | **error** | **error** | **error** | **error** | Needs role.manage / role.approve / user.view (V1) |
| Organisation | read only | read only | read only | read only | Saving needs org.manage, so admin only |
| Audit Log | **empty for everyone** | empty | empty | sample rows | Reads a table that doesn't exist (V3) |

## Problems to fix

| # | Problem | Where | Severity |
|---|---|---|---|
| V1 | The left menu ignores rights: all 15 items show for every role, including Users, Roles and Organisation for officers and the demo visitor. Opening one gives an error or an empty page. Fix: hide menu items the role can't open (read rights once at sign-in) | `src/components/app-shell.tsx` nav list | Medium |
| V2 | **The "12" on Applications is a fixed number in the code**, not a real count, so it never changes. Fix: show the real number waiting, or remove it | `app-shell.tsx` line 54, `badge: 12` | Low (flagged by Sameer) |
| V3 | **The bell's "4" comes from sample notifications** typed into the code, not from real events. Fix: drive it from real events (e.g. new customer submissions, referrals waiting) or hide it | `app-shell.tsx` `SAMPLE_NOTIFICATIONS` | Low (flagged by Sameer) |
| V4 | Audit Log reads `audit_trail`, which doesn't exist in the live database (the real table is `audit_events`). The page is empty for everyone live, and errors are swallowed | `src/lib/api.ts` `getAuditLog` | Medium |
| V5 | "Own cases only" for officers (app.view.own) is in the rights but not enforced: the Applications list and the customer queue show every case to an officer | `fn_list_applications`, `fn_staff_customer_queue` | Medium (design said "comes with Admin scopes") |
| V6 | Some pages quietly fall back to sample data when the database refuses or fails, so fake cases can look real: Applications list, one application, bureau report, rate grid, employers | `src/lib/api.ts` (`getApplications`, `getApplication`, `getBureauReport`, `getRateGrid`, `getEmployers`) | Medium |
| V7 | When Credit control is switched on, the Approvals page appears for officers and managers, but they hold no policy rights, so it errors. Part of V1, listed on its own because it only shows once the switch is on | `app-shell.tsx`, `fn_policy_pending` | Low |
| V8 | The daily case limit set on a user (`daily_case_limit`) is saved but not enforced on decisions. There are no amount or sanction limits by role either | `fn_officer_decision` | Medium (policy item) |
| V9 | The "Prototype data: all figures are illustrative sample records" note shows on the live site even though most figures are now real or synthetic data from the database | `app-shell.tsx` lines 265, 311 | Low |
| V10 | Dashboard subtitle "Wednesday workload — Chennai Region" is fixed text, whatever the day or user | `src/routes/dashboard.tsx` line 134 | Low |
| V11 | Buttons for actions a role can't take aren't hidden. The database refuses them, but the person sees an error after clicking (e.g. decide, issue offer, disburse for a demo visitor) | case screens | Low–Medium |
| V12 | The Demo visitor's toggles on Document checks look switched on and clickable, though locked. They should look clearly read-only | `document-checks.tsx` | Low |
| V13 | Three old capitalised roles (ADMIN, CREDIT_OFFICER, STATE_HEAD) are still in the roles table, switched off with no rights. Remove them or label them retired | `roles` table | Low |
| V14 | Credit Head is the only role that can approve policy, and Policy Manager has no users. For maker-checker to work, two different people must hold author and approve. Fine for a demo; matters when real staff use it | roles setup | Note |

## How this was checked

- Read the menu and each page's data calls in `src/`.
- Read the rights each database function demands, and the read rules on each table, from the live database (read-only).
- Read each role's rights from `role_permissions`.
- Not yet clicked through with each role signed in: that needs the Officer, Manager and Head logins.
