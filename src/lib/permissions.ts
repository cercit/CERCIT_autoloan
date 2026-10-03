/**
 * What the signed-in person may do (fix list B1, B3). Read once from the
 * database (fn_my_permissions, sql/067) and shared, so the menu hides pages
 * and the case screens hide buttons the person's role can't use.
 *
 * This only tidies the screen: the database refuses every action the role
 * lacks, whatever the browser shows. So if the rights can't be read, nothing
 * is hidden (the site behaves as it did before), rather than locking people out.
 */

import { useEffect, useState } from "react";
import { isDemoMode } from "./auth";
import { isSupabaseConfigured, supabase } from "./supabase";

export type MyRights = {
  role: string | null;
  permissions: ReadonlySet<string>;
  seesRealCustomers: boolean;
  /** sample mode, or the rights could not be read: hide nothing */
  everything: boolean;
};

const EVERYTHING: MyRights = { role: null, permissions: new Set(), seesRealCustomers: true, everything: true };

let cached: Promise<MyRights> | null = null;

export function getMyRights(): Promise<MyRights> {
  if (!isSupabaseConfigured || isDemoMode()) return Promise.resolve(EVERYTHING);
  if (!cached) {
    cached = Promise.resolve(supabase.rpc("fn_my_permissions")).then(({ data, error }) => {
      if (error || !data) {
        cached = null; // ask again on the next page
        return EVERYTHING;
      }
      const d = data as { role: string | null; permissions: string[]; sees_real_customers: boolean };
      return {
        role: d.role,
        permissions: new Set(d.permissions ?? []),
        seesRealCustomers: Boolean(d.sees_real_customers),
        everything: false,
      };
    });
  }
  return cached;
}

/** Forget the rights (after signing out or in as someone else). */
export function forgetMyRights(): void {
  cached = null;
}

export function useMyRights(): MyRights | null {
  const [rights, setRights] = useState<MyRights | null>(null);
  useEffect(() => {
    let cancelled = false;
    void getMyRights().then((r) => {
      if (!cancelled) setRights(r);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return rights;
}

/** True when the person holds any of these rights. */
export function can(rights: MyRights | null, ...permissions: string[]): boolean {
  if (!rights) return false;
  return rights.everything || permissions.some((p) => rights.permissions.has(p));
}

const VIEW_CASES = ["app.view.own", "app.view.team", "app.view.all"];

// The rights each page's database functions ask for; a page is shown when the
// person holds any of `any` and all of `all`.
export const PAGE_RIGHTS: Record<string, { any: string[]; all?: string[] }> = {
  "/dashboard": { any: [...VIEW_CASES, "app.view.aggregate"] },
  "/applications": { any: VIEW_CASES },
  "/customer-applications": { any: VIEW_CASES, all: ["pii.reveal"] },
  "/approvals": { any: ["policy.approve"] },
  "/portfolio": { any: ["app.view.team", "app.view.all", "policy.simulate", "policy.author", "policy.approve"] },
  "/policy-rules": { any: [...VIEW_CASES, "app.view.aggregate", "policy.view", "policy.author", "policy.approve", "audit.view"] },
  "/document-checks": { any: ["policy.view", "policy.author", "app.evaluate"] },
  "/employers": { any: [...VIEW_CASES, "pricing.view", "pricing.author", "pricing.approve", "employer.manage"] },
  "/rate-grid": { any: ["pricing.view", "pricing.author", "pricing.approve", ...VIEW_CASES] },
  "/users": { any: ["user.view"] },
  "/roles": { any: ["role.manage", "role.approve", "user.view"] },
  "/organisation": { any: ["org.manage"] },
  "/audit-log": { any: ["audit.view"] },
};

/** Whether the person may open the page at this address (pages not listed are open to all staff). */
export function canOpen(rights: MyRights | null, path: string): boolean {
  if (!rights) return false;
  if (rights.everything) return true;
  const key = Object.keys(PAGE_RIGHTS)
    .filter((p) => path === p || path.startsWith(p + "/"))
    .sort((a, b) => b.length - a.length)[0];
  if (!key) return true;
  const need = PAGE_RIGHTS[key]!;
  return can(rights, ...need.any) && (need.all ?? []).every((p) => rights.permissions.has(p));
}
