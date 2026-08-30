# cercit — Application Flow (Phase 1)

**Scope:** Salaried, single applicant, direct leads, new vehicle only
**Each step = one screen. Customer can save and resume anytime using Application ID.**

---

## Step 1 — Registration & OTP (2 min)

**Screen: Welcome**

| Field | Type | Required | Notes |
|---|---|---|---|
| Full name (as per PAN) | Text | Yes | Exact PAN name — used for all doc matching |
| Email | Email | Yes | Primary identity — OTP sent here |
| Mobile | Phone | Yes | Contact only, not verified in Phase 1 |

**Action:** Send email OTP → verify → proceed

**On success:**
- Application ID created: `YYYYMM` + 6-digit serial (e.g., `202608000001`)
- Application ID emailed to customer
- Customer can close and resume anytime using Application ID + email OTP
- Status: `DRAFT`

---

## Step 2 — Vehicle & Cost (1 min)

**Screen: What car are you buying?**

| Field | Type | Required | Notes |
|---|---|---|---|
| Vehicle make/brand | Dropdown | Yes | e.g., Maruti, Hyundai, Tata, Mahindra |
| Model | Dropdown (filtered) | Yes | Filtered by make |
| Variant | Dropdown (filtered) | Yes | Filtered by model |
| Fuel type | Dropdown | Yes | Petrol / Diesel / CNG / Hybrid / Electric |
| Ex-showroom price | Currency | Yes | ₹ |
| Road tax | Currency | Yes | ₹ |
| Insurance | Currency | Yes | ₹ |
| Registration + other charges | Currency | Yes | ₹ |
| **On-road price** | **Auto-calculated** | — | Sum of above |
| Purpose | Radio | Yes | New car / Exchange / Additional vehicle |
| Down payment / own contribution | Currency | Yes | ₹ amount customer will pay upfront |
| **Loan amount requested** | **Auto-calculated** | — | On-road price minus down payment |

**If Exchange selected:**
| Field | Type | Required | Notes |
|---|---|---|---|
| Current vehicle make/model/year | Text | Yes | — |
| Existing loan on current vehicle? | Yes/No | Yes | — |
| Outstanding loan amount | Currency | If yes | ₹ |
| Monthly EMI on current vehicle | Currency | If yes | ₹ — feeds into obligation calc |

**On save:** Status remains `DRAFT`

---

## Step 3 — Self-Declared Financials (2 min)

**Screen: Your monthly finances**

### Income

| Field | Type | Required | Notes |
|---|---|---|---|
| Monthly net salary (in-hand) | Currency | Yes | ₹ — after all deductions |
| Other monthly income | Currency | No | ₹ — rental, interest, freelance |
| Source of other income | Text | If above > 0 | Brief description |

### Monthly Expenses

| Field | Type | Required | Notes |
|---|---|---|---|
| Rent / housing | Currency | Yes | ₹ (0 if owned) |
| Existing EMIs (all loans combined) | Currency | Yes | ₹ — home, personal, consumer, cards |
| Insurance premiums | Currency | No | ₹ — health, life, etc. |
| Food / household | Currency | Yes | ₹ |
| Travel / commute | Currency | No | ₹ |
| Other regular expenses | Currency | No | ₹ |
| **Total monthly outgo** | **Auto-calculated** | — | Sum of above |

### Summary (auto-calculated, shown to customer)

| Metric | Calculation |
|---|---|
| Total monthly income | Net salary + other income |
| Total monthly outgo | Sum of all expenses |
| **Disposable surplus** | Income − outgo |
| Proposed EMI (indicative) | Based on loan amount, assumed rate, default tenure |
| **Surplus after proposed EMI** | Disposable surplus − proposed EMI |

**On save:** Status remains `DRAFT`

---

## Step 4 — In-Principle Decision (instant)

**Screen: Your eligibility result**

System runs quick check on self-declared numbers:
- Rough FOIR: (existing EMIs + proposed EMI) ÷ net salary
- LTV: loan amount ÷ on-road price
- Surplus check: can they still eat after paying the EMI?

### If eligible:

```
IN-PRINCIPLE APPROVAL

Application ID: 202608000001

Max loan eligible: ₹X,XX,XXX
Indicative rate: X.X% p.a.
Tenure: XX months
EMI: ₹XX,XXX/month
Down payment required: ₹X,XX,XXX

* Subject to satisfactory credit and document verification.
  Final terms may vary based on verified income and credit history.

[Accept & Upload Documents]  [Change Amount / Tenure]
```

**[Change Amount / Tenure]** — lets customer adjust loan amount or tenure, recalculates EMI and FOIR in real-time, re-checks eligibility.

### If not eligible:

```
NOT ELIGIBLE

Based on the financial details provided, the requested loan
amount exceeds our current eligibility criteria.

Reason: Monthly obligations exceed income threshold
  - Your declared FOIR: XX%
  - Maximum allowed: XX%

Options:
  - Increase down payment to reduce loan amount
  - Reduce loan tenure
  - Revise expense details if entered incorrectly

[Revise Details]  [Exit]
```

**On accept:** Status changes to `IN_PRINCIPLE_APPROVED`

---

## Step 5 — Document Upload

**Screen: Upload your documents**

Customer uploads one by one. Each document shows upload status.

| # | Document | Format | Required | Notes |
|---|---|---|---|---|
| 1 | PAN card | Image/PDF | Yes | Name matching against application |
| 2 | Aadhaar card | Image/PDF | Yes | Address proof, identity |
| 3 | Salary slip — Month 1 (latest) | Image/PDF | Yes | Last 3 months |
| 4 | Salary slip — Month 2 | Image/PDF | Yes | |
| 5 | Salary slip — Month 3 | Image/PDF | Yes | |
| 6 | Bank statement (last 6 months) | PDF | Yes | Salary account — single PDF preferred |
| 7 | Form 16 (latest) | PDF | Yes | Annual income + TDS |
| 8 | CIBIL report (self-pull) | PDF | Yes | From myscore.cibil.com |
| 9 | Dealer quotation / proforma invoice | Image/PDF | Yes | Must match vehicle details in Step 2 |

**Upload UX:**
- Drag and drop or browse
- Show file name, size, upload progress
- Green tick on successful upload
- All 9 required before proceeding
- Customer can upload across sessions (resume via Application ID)

**On all uploaded:** Status changes to `DOCUMENTS_SUBMITTED`

---

## Step 6 — Extracted Data Review

**Screen: Verify your details**

System reads all documents → extracts data → compares with self-declared values from Step 3.

Customer sees a pre-filled summary. **No re-typing.** They review, accept, or correct.

```
EXTRACTED vs DECLARED COMPARISON

INCOME
  Salary (declared):       ₹85,000
  Salary (salary slip):    ₹84,500    ✓ Match
  Salary (bank credit):    ₹84,200    ✓ Match
  Salary (Form 16 ÷ 12):  ₹83,333    ✓ Within range

EMPLOYER
  Declared:                ABC Ltd
  Salary slip:             ABC Technologies Pvt Ltd    ✓ Minor variant
  Form 16:                 ABC Technologies Pvt Ltd    ✓ Match

OBLIGATIONS
  Declared EMIs:           ₹15,000
  Bureau total EMIs:       ₹22,000    ⚠ Mismatch
  Undisclosed loan:        Personal loan ₹7,000/month (HDFC Bank)

IDENTITY
  PAN name:                SAMEER S MITTIMANI    ✓ Match
  Aadhaar name:            SAMEER SHREENIVAS MITTIMANI    ✓ Match

BUREAU
  CIBIL Score:             745
  Active accounts:         3
  DPD (last 12 months):    0
  Enquiries (90 days):     2

VEHICLE
  Quotation vehicle:       Hyundai Creta SX(O) Diesel
  Application vehicle:     Hyundai Creta SX(O) Diesel    ✓ Match
  Quotation on-road:       ₹18,50,000
  Application on-road:     ₹18,50,000    ✓ Match
```

**Customer actions:**
- **[Accept All]** — confirms extracted data is correct
- **[Edit]** — correct specific fields with reason
- **[Upload Additional Doc]** — if something is wrong/missing

**On accept:** Status changes to `UNDER_ASSESSMENT`

---

## Step 7 — Final Assessment (system processes, customer waits)

**Screen: Assessment in progress**

System runs the full credit assessment on **verified numbers** (not self-declared):
1. Hard filters (KYC, negative list, age, geography)
2. Bureau assessment (score thresholds, DPD, enquiry velocity)
3. Income & obligation (FOIR on actual numbers, DBR)
4. Collateral (LTV on verified on-road price)
5. Policy rule engine (all rules, versioned)
6. Fraud/anomaly flags

### Result: APPROVE

```
APPLICATION APPROVED

Application ID: 202608000001

Sanctioned amount: ₹XX,XX,XXX
Rate of interest: X.X% p.a.
Tenure: XX months
EMI: ₹XX,XXX/month

This approval is valid for 30 days from the date of sanction.

Next steps:
  1. Loan agreement will be sent to your email
  2. Complete e-signing and NACH mandate
  3. Disbursement to dealer on vehicle delivery

[Download Sanction Letter]
```

### Result: REJECT

```
APPLICATION NOT APPROVED

Application ID: 202608000001

We are unable to approve your application at this time.

Reason(s):
  - CIBIL score below minimum threshold
  - FOIR exceeds maximum limit after verified obligations

You may re-apply after 90 days.

[Download Decision Letter]
```

### Result: MAYBE

```
APPLICATION UNDER REVIEW

Application ID: 202608000001

Your application requires additional review by our credit team.

Flagged items:
  - Obligation mismatch: declared vs bureau EMIs differ
  - Bureau enquiry velocity: 5 enquiries in last 90 days

A credit officer will review your file within [TAT SLA].
You will receive an update via email.

No action required from you at this time.
```

**Status updates:** `APPROVED` / `REJECTED` / `UNDER_REVIEW`

---

## Application Status Flow

```
DRAFT
  → (Step 1-3 complete, Step 4 eligible)
IN_PRINCIPLE_APPROVED
  → (all documents uploaded)
DOCUMENTS_SUBMITTED
  → (extraction complete, customer accepts)
UNDER_ASSESSMENT
  → APPROVED
  → REJECTED
  → UNDER_REVIEW (Maybe — credit officer picks up)
     → APPROVED (with risk-adjusted rate)
     → REJECTED (with reasons)
```

---

## Resume Flow

Customer can close and come back anytime:
1. Enter Application ID + email
2. Email OTP sent → verify
3. Resume from last saved step
4. All previously entered data and uploaded documents are preserved

---

## Application ID Format

`YYYYMM` + 6-digit serial number, zero-padded

Examples:
- First application of Aug 2026: `202608000001`
- Hundredth: `202608000100`
- Rolls over each month: `202609000001`

Capacity: 999,999 applications per month (more than enough)

---

## Data saved per step

| Step | What's saved | When |
|---|---|---|
| 1 | Name, email, mobile, Application ID | On OTP verification |
| 2 | Vehicle details, costs, purpose, down payment | On "Save & Continue" |
| 3 | Income, expenses, obligations (self-declared) | On "Save & Continue" |
| 4 | In-principle result, accepted terms | On "Accept" |
| 5 | Document files (stored securely) | On each upload |
| 6 | Extracted data, declared vs actual comparison, customer edits | On "Accept All" |
| 7 | Final assessment result, all rule outputs, audit trail | On assessment completion |
