# cercit audit brief

You are auditing **cercit**, an AI-assisted credit appraisal product for salaried new-car loans in India: a customer applies on their phone, documents are read and checked automatically, two credit bureaus are pulled, a policy engine and a risk model recommend Approve / Maybe / Reject, and a credit officer decides with plain-English reasons. After that come the offer, agreement, mandate, disbursal, repayments and a loan portfolio view. It is a portfolio-grade product build for the Masai × IIT Roorkee Product Management course, built by one person (Sameer, product and credit) with AI tools. All customer data is synthetic.

Be blunt. We want the problems, not compliments.

## What you can use

- **Live site:** https://cercit.github.io/CERCIT_autoloan/
- **Code:** this repository (local copy or https://github.com/cercit/CERCIT_autoloan)
- **Demo login:** `cercit+demo@gmail.com` (staff view, synthetic and test cases only, read-only)
- **The customer journey** (apply, check eligibility) is open without a login.

## Rules

1. **Read-only on anything live.** Don't submit applications with real personal details, don't upload real documents (yours or anyone's), don't try to change live data, don't run SQL against the live database.
2. **No attacks on the live service:** no load testing, no brute-forcing logins, no scanning. Security problems: find them in the code and describe them; don't exploit them.
3. **Don't create accounts** other than through the customer journey with obviously fake details.
4. **Read before you report.** `docs/fix-list.md` lists known problems and decisions already made; `docs/migration-run-log.md` shows what is live. Mark anything already listed as "known" and move on.
5. **Say how sure you are.** For each finding: seen it happen (with steps), read it in the code (with file and line), or suspect it.

## Where to start reading

| What | Where |
|---|---|
| How it works: flows, database layout, where data lives | `behind-the-scenes/how-it-works/` |
| Product requirements (source of truth) | `../PRD.md` (one level up, if you have the local folder) |
| Database: tables, functions, row rules | `sql/001`–`081` |
| Site code | `src/routes/` (pages), `src/components/`, `src/lib/` (data access) |
| Document readers (AWS Lambda, Python) | `aws/` |
| Risk model | `docs/risk-model-v2.md` |
| Tests | `tests/sql/run.mjs` (database), `tests/` (Playwright) |
| Known issues and decisions | `docs/fix-list.md` |
| Rights and visibility audit (2 Oct) | `docs/rights-and-visibility-audit-2026-10-02.md` |

## What we want from you

### 1. Break it: what's wrong, and why
Try everything. Every page, every button, every form, on desktop and on a phone. Look for:
- pages that don't load, spin forever, or quietly show sample data instead of real data;
- buttons that do nothing, do the wrong thing, or stay after they should be gone;
- numbers that disagree with each other on the same screen (FOIR, LTV, CIBIL, EMI, AI recommendation vs the engine's breakdown);
- wrong maths: EMI, FOIR, LTV, rate grid, eligibility;
- the customer journey with odd inputs: zero, negative, huge numbers, blank fields, wrong file types, going back and forth, refreshing mid-way;
- what each role can see and do vs what it should (see the rights audit);
- errors in the browser console and failed network calls.

### 2. Credit and policy logic: would a real lender sign off on this?
- Do the decisions follow the policy (bureau bands, FOIR, LTV, income rules, hard filters)? Find a case where the system approves something it shouldn't, or rejects something it shouldn't.
- Can an officer approve against a hard-filter failure? Should they be able to?
- Is every decision explainable and traceable (policy version, model version, who decided, why)?
- Anything that would worry an RBI inspector, an internal auditor or a DPDP Act reviewer?

### 3. Security and privacy (from the code, not by attacking)
- Can a signed-in user read or change data they shouldn't (row rules, `SECURITY DEFINER` functions, missing permission checks)?
- Is anything secret in the code or the built site (keys, passwords, service-role tokens)?
- Is personal data (PAN, Aadhaar, mobile) masked everywhere it should be, including logs and exports?
- File uploads: size, type, where they go, who can read them.

### 4. What's worth changing, or adding new, and why
- Features a credit officer, a credit head, or a customer would expect and doesn't find.
- Things that exist but shouldn't (clutter, half-built screens, fake claims on the landing page).
- What would make this convincing to (a) a bank or NBFC, (b) a hiring manager for a product role.

### 5. Visual and UX changes, and why
- Hard to read, hard to find, or confusing: name the screen and the element.
- Mobile: anything cut off, too small, overlapping, or needing sideways scrolling.
- Consistency: colours, spacing, wording, number formats (Rs, lakh/crore, dates).
- Accessibility: contrast, keyboard use, labels, focus.
- Does it look like a real lending product or a template? What would fix that?

### 6. What we did wrong, what we should have done, and how
Look at the build as a whole, not just the bugs:
- product decisions (scope, order of work, what was built before it was needed);
- architecture (where logic lives: browser vs database vs AWS; duplication; the same number calculated in two places);
- data model and migrations (81 SQL files: is that sustainable?);
- testing (what isn't tested that should be);
- process (how a one-person team with AI tools should have run this).
For each one: what went wrong, what should have happened, and how to fix it now.

### 7. Anything else you notice
Performance, cost, dead code, stale docs, things that will break at 10× the data, things that will confuse the next person to work on it.

## How to report

Start with a **summary of at most 10 lines**: the 5 most important findings, and your overall verdict.

Then one entry per finding:

```
### [Area] Short title
- Severity: Critical / High / Medium / Low
- Where: page URL or file:line
- What's wrong:
- Why it matters:
- How to reproduce (or the code that shows it):
- Suggested fix:
- How sure: seen it / read it in code / suspect
- Known already? yes (fix-list item) / no
```

Group findings by the seven sections above, most severe first in each. Keep the wording plain: Sameer is a credit and product person, not a developer.
