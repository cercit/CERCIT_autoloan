# Step 4: what the customer enters, and what checks it

Written 3 Oct 2026 for fix list C8. Step 4 ("Your details") saves three groups through `fn_customer_save_details` (sql/046). This lists every field, what checks it today, and whether it needs a check.

"Checked automatically" means one of the document checks (sql/052, Document checks page), the income checks (sql/054), the bureau (sql/053) or the Employer Master (sql/069, 070).

## Personal

| Field | Checked today | Needs a check? |
|---|---|---|
| PAN | Format (4th letter P), not already on another account; e-PAN: PAN number and name match | No more needed |
| Date of birth | PAN: date of birth match (must pass); Aadhaar date of birth (switch, off) | No more needed |
| Father's name | Nothing | **Low.** It appears on the PAN card; add a name-words check to the PAN reader when convenient |
| Gender | Nothing | No: not used in any decision |
| Marital status | Nothing | **No check, keep as declared.** Not used in a decision; there is no document for it |

## Address

| Field | Checked today | Needs a check? |
|---|---|---|
| Permanent address | Aadhaar: PIN code matches (must pass), address read | No more needed |
| Current address (when different) | Electricity bill asked for; **no reader yet** | **Yes, medium.** A person checks the bill today; an EB-bill reader would close it |
| Residence type (owned / rented / family / company) | Nothing | **Medium.** Owned or family home is a stability signal; the EB bill's name (owner vs customer) could confirm it once there is a reader |
| House owner's name and mobile (if rented) | Format only | **Low.** Used for collection contact; a call-back by a person is the usual check |
| Years at current address | Nothing | **Low.** Not used in a decision today |

## Employment

| Field | Checked today | Needs a check? |
|---|---|---|
| Employer name | Payslips and Form 16: employer matches (must pass); Employer Master: name and other names (070) | No more needed |
| Kind of company (private, public, MNC, government, PSU…) | **Now** replaced by the Employer Master's category when the employer is there; provisional when not | Add the employer to the master and run its checks (Employer Master page) |
| Designation | Nothing (payslips carry it, unread) | **Low.** Payslip reader already reads `designation`; a comparison is a small add |
| Date of joining (years at the employer) | Nothing | **Yes, medium.** Lenders usually want 1+ year with the current employer. Form 16 `period_from` and the first payslip month give a floor; the bank statement's first salary credit gives another. Suggest a check that refers the case when the evidence shows less than the declared time |
| Net monthly salary | Payslips: take-home within 10%; Form 16; bank salary credits (054) | No more needed |

## Suggested order

1. Date of joining (years at the employer) against Form 16 and the bank statement: it affects affordability and stability.
2. Current-address proof (EB bill reader), which also gives the residence-type check.
3. Father's name and designation: small additions to readers that already exist.

Marital status, gender, years at the current address and the house owner's details stay as declared.
