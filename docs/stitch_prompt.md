# cercit — Full UI prompt for Stitch

Build a complete web application called **cercit** (Credit Evaluation and Risk Compliance Intelligence Tool). This is an internal tool used by credit officers and managers at a vehicle finance company (bank/NBFC) to process new car loan applications. The design should be clean, professional, data-dense but not cluttered — similar to internal banking tools or Stripe's dashboard aesthetic. Use a neutral color palette with blue as primary accent. All screens should have a left sidebar navigation and a top header bar.

## Navigation sidebar (persistent across all screens)

- cercit logo at top
- Dashboard (home icon)
- Applications (file icon) — with a count badge showing pending items
- Policy Rules (settings/gear icon)
- Employer Master (building icon)
- Rate Grid (table icon)
- Users (people icon)
- Audit Log (clock icon)
- Collapsed state on mobile

## Top header bar (persistent)

- Search bar: "Search by name, PAN, application ID..."
- Notification bell with count badge
- User avatar + name + role label (e.g. "Rajeev Menon — Credit Officer")
- Logout

---

## Screen 1: Login page

Simple centered card layout. No sidebar on this screen.

- cercit logo + tagline "Credit Evaluation and Risk Compliance Intelligence Tool"
- Email input field
- Password input field
- "Sign in" button (blue, full width of card)
- "Forgot password?" link below
- Footer: "Powered by cercit v1.0"

---

## Screen 2: Dashboard

This is the home screen after login. Shows the credit officer's daily workload at a glance.

**Top row — 4 stat cards in a horizontal row:**
- "New Applications" — count (e.g. 12), small up/down arrow showing trend vs last week
- "In Progress" — count (e.g. 8)
- "Sanctioned Today" — count (e.g. 5)
- "Rejected Today" — count (e.g. 2)

**Second row — 2 panels side by side:**

Left panel: "Application Queue" — a table showing the next 10 applications to process, columns:
- Application ID (clickable link, e.g. "APP-2026-00847")
- Applicant Name
- Employer (with category badge: "A" in green, "B" in yellow, "C" in orange)
- Loan Amount (e.g. "Rs 8,50,000")
- CIBIL Score (color coded: 750+ green, 650-749 yellow, below 650 red)
- Status (pill badge: "New" blue, "Documents Uploaded" purple, "Under Review" orange, "Sanctioned" green, "Rejected" red)
- Submitted date
- "View" button on each row

Right panel: "Decision Distribution" — a donut chart showing this month's breakdown:
- Green segment: Auto-Approved (count and %)
- Yellow segment: Maybe / Manual Review (count and %)
- Red segment: Rejected (count and %)
- Center of donut: total applications count

**Third row — single panel:**
"Average Turnaround Time" — a simple bar chart showing avg TAT in hours for last 4 weeks, target line at 60 minutes for clean files.

---

## Screen 3: New Application Form (multi-step wizard)

A horizontal stepper at the top showing 5 steps with step numbers and labels. Active step highlighted in blue, completed steps show green checkmark, upcoming steps are grey.

Steps: 1. Customer Details → 2. Employment → 3. Vehicle & Deal → 4. Obligations → 5. Documents

**Step 1: Customer Details**
Two-column form layout:
- Left column: First Name, Middle Name, Last Name, Date of Birth (date picker), Gender (dropdown: Male/Female/Other), PAN Number (text, format: ABCDE1234F), Aadhaar Number (text, 12 digits)
- Right column: Mobile Number, Email, Current Address (textarea), City, State (dropdown), PIN Code, Residence Type (dropdown: Owned/Rented/Company Provided/Family), Years at Current Address
- Bottom: "Next" button (right aligned), "Save as Draft" button (left aligned, outlined style)

**Step 2: Employment**
Two-column form:
- Left: Employer Name (searchable dropdown with autocomplete — shows employer category badge next to name, e.g. "Tata Consultancy Services [A]"), Designation, Department, Employee ID, Official Email
- Right: Monthly Gross Salary (Rs), Monthly Net Salary (Rs), Total Work Experience (years), Current Employer Tenure (years + months), Salary Account Bank (dropdown), Salary Account Number
- Bottom: Same navigation buttons

**Step 3: Vehicle & Deal**
Two-column form:
- Left: Make (dropdown: Maruti Suzuki, Hyundai, Tata, Mahindra, Kia, Toyota, Honda, MG, Skoda, VW, Jeep, Citroen, Renault), Model (dependent dropdown, loads based on Make), Variant (dependent dropdown, loads based on Model), Fuel Type (auto-filled from variant selection), Transmission (auto-filled)
- Right: Dealer Name (searchable dropdown), Dealer City, Ex-Showroom Price (auto-filled from variant, editable), On-Road Price (input), Insurance Amount, Registration + Road Tax, Total On-Road Cost (calculated, read-only, highlighted)
- Bottom section spanning full width: Requested Loan Amount (input), Down Payment (calculated = on-road minus loan amount, read-only), Tenure in Months (dropdown: 12, 24, 36, 48, 60, 72, 84), "Calculate EMI" button that shows estimated EMI below it
- Navigation buttons

**Step 4: Existing Obligations**
A table where the officer can add rows:
- Columns: Lender Name, Loan Type (dropdown: Home/Car/Personal/Credit Card/Gold/Education/Other), Original Amount, Current Outstanding, Monthly EMI, Remaining Tenure (months), DPD Status (dropdown: 0/30/60/90+)
- "Add Obligation" button to add rows
- "No existing obligations" checkbox
- Below the table: a read-only summary box showing Total Existing EMIs, Proposed New EMI, Total Obligations, Preliminary FOIR % (calculated using net salary from Step 2)
- Navigation buttons

**Step 5: Document Upload**
Grid of upload zones (2 columns, each upload zone is a dashed-border box):
- PAN Card (required) — drag-and-drop zone or click to browse, shows thumbnail after upload
- Aadhaar Card (required)
- Salary Slip — Month 1 (required)
- Salary Slip — Month 2 (required)
- Salary Slip — Month 3 (required)
- Bank Statement — 6 months (required) — note below: "PDF from bank portal preferred"
- Form 16 (required)
- Employee ID / Appointment Letter (required)
- Dealer Quotation (required)
- Additional Documents (optional) — multi-file upload

Each upload zone shows: file name, file size, upload status (uploading / uploaded / failed), and a remove button.

Bottom: "Submit Application" button (prominent, blue) + "Save as Draft" button

After submit: a confirmation modal — "Application APP-2026-00848 submitted successfully. Documents will be processed for extraction. You will be notified when the assessment is ready."

---

## Screen 4: Application Detail — Copilot Screen (MOST IMPORTANT SCREEN)

This is where the credit officer reviews an application with AI-generated insights. Dense, information-rich layout.

**Top bar (within the page, below the global header):**
- Application ID: "APP-2026-00847"
- Applicant: "Rajesh Kumar Sharma"
- Status badge (e.g. "Under Review" in orange)
- Submitted: "28 Aug 2026"
- Assigned to: "Rajeev Menon"
- Right side: "Approve" button (green), "Reject" button (red), "Send for Review" button (orange outline)

**Layout: 2 columns (65% left, 35% right)**

### Left column — stacked sections with expand/collapse:

**Section 1: AI Recommendation (always expanded, highlighted box)**
- Large colored banner: GREEN background with "Approve — Rs 8,50,000 at 8.99% for 60 months" OR YELLOW with "Maybe — Manual review recommended" OR RED with "Reject — Policy breach"
- Below the banner, bullet list of key reasons:
  - "CIBIL 782 — above 750 threshold"
  - "FOIR 38.2% — within 50% limit"
  - "LTV 87% — within 120% limit"
  - "All documents verified — no mismatches"
  - "Employer: TCS (Category A)"
- If there are risk flags, a separate orange callout box: "Flags: 3 bureau enquiries in last 90 days (threshold: 4)"

**Section 2: Customer Profile**
Two-column grid showing: Name, Age, PAN, Aadhaar, Address, Residence (Owned/Rented), City, State, Phone, Email. Clean label-value pairs.

**Section 3: Income Assessment**
A comparison table with 3 columns:
| Source | Monthly Amount | Status |
| Salary Slip | Rs 85,000 | Extracted |
| Bank Credit | Rs 83,450 | Extracted |
| Form 16 (annualized) | Rs 84,166 | Extracted |
| **Computed Net Income** | **Rs 83,450** (lowest) | **Used for FOIR** |

Variance indicator: "1.8% variance across sources — within 5% threshold" with green checkmark.

If variance > 5%: red warning with "Salary mismatch detected — manual review required"

**Section 4: Bureau Summary**
- CIBIL Score: large number (e.g. 782) with a color-coded gauge/meter (green/yellow/red zones)
- Grid of key metrics: Active Accounts (count), Overdue Accounts (count), Total Outstanding (Rs), Enquiries Last 90 Days (count), Oldest Account Age, Writeoffs (Yes/No), Settlements (Yes/No), Suits Filed (Yes/No)
- DPD History: small heatmap or table showing last 12 months DPD status across accounts (all 0 = clean row of green cells)

**Section 5: Obligations & FOIR**
Table of all obligations (from bureau + declared):
| Lender | Type | EMI | Outstanding | DPD | Source |
| HDFC Bank | Home Loan | Rs 22,000 | Rs 18,50,000 | 0 | Bureau |
| Axis Bank | Credit Card | Rs 5,000 | Rs 45,000 | 0 | Bureau |
| **Proposed** | **Car Loan** | **Rs 17,450** | **Rs 8,50,000** | **—** | **This application** |

Below the table:
- Total Existing EMIs: Rs 27,000
- Proposed EMI: Rs 17,450
- Total Obligations: Rs 44,450
- Net Monthly Income: Rs 83,450
- **FOIR: 53.3%** — shown with a horizontal progress bar, threshold line at 50%, color changes to yellow/red if exceeded

**Section 6: Vehicle & LTV**
- Make/Model/Variant: Hyundai Creta SX(O) 1.5 Turbo DCT
- Dealer: Lakshmi Hyundai, Chennai
- Ex-Showroom: Rs 18,40,000
- On-Road: Rs 21,15,000
- Loan Amount: Rs 8,50,000
- Down Payment: Rs 12,65,000
- **LTV (on ex-showroom): 46.2%** — progress bar with 120% threshold line
- **LTV (on on-road): 40.2%**

**Section 7: Policy Check Results**
A checklist-style list. Each rule shows: Rule name, Expected value, Actual value, Pass/Fail icon.
- Min CIBIL Score: 750 → 782 → green checkmark
- Max FOIR: 50% → 53.3% → red cross (or yellow if in Maybe range)
- Max LTV: 120% → 46.2% → green checkmark
- Min Employment Tenure: 1 year → 3.5 years → green checkmark
- Min Age: 21 → 32 → green checkmark
- Max Age: 60 → 32 → green checkmark
- Employer Category: A/B → A → green checkmark
- Zero Writeoffs: Yes → Yes → green checkmark
- Zero Bounces: Yes → Yes → green checkmark
- Max Enquiries (90 days): 4 → 3 → green checkmark

**Section 8: Employer & Stability**
- Employer: Tata Consultancy Services
- Category: A (green badge)
- Designation: Senior Software Engineer
- Total Experience: 8 years
- Current Tenure: 3.5 years
- Salary Account: HDFC Bank

### Right column — stacked panels:

**Panel 1: Documents**
List of uploaded documents, each showing:
- Document name (e.g. "PAN Card")
- OCR Status: "Extracted" (green), "Processing" (yellow spinner), "Failed" (red)
- Confidence: percentage (e.g. "98%")
- Click to expand: shows extracted fields as key-value pairs
- "View Original" link to open the uploaded document

**Panel 2: Cross-Document Verification**
Automated checks:
- Name match (PAN vs Aadhaar vs Salary Slip vs Bank): "All match" green or "Mismatch found" red with details
- Employer match (Salary Slip vs Form 16 vs Bank narration): status
- Salary amount consistency: status with variance %

**Panel 3: Proposed Terms**
Editable card (credit officer can adjust before approving):
- Loan Amount: Rs 8,50,000 (editable)
- Interest Rate: 8.99% (editable dropdown based on rate grid)
- Tenure: 60 months (editable dropdown)
- EMI: Rs 17,450 (auto-calculated)
- Processing Fee: Rs 5,000 (editable)

**Panel 4: Decision**
- Decision dropdown: Approve / Reject / Refer to Credit Manager
- If Approve: Conditions field (text area, optional)
- If Reject: Reason codes (multi-select dropdown: Low CIBIL, High FOIR, Employment Instability, Document Mismatch, Fraud Suspicion, Other)
- If Refer: Notes for credit manager (text area)
- "Submit Decision" button
- Override toggle: if the AI recommended differently from the officer's choice, a mandatory text field appears: "Override Reason (required)"

**Panel 5: Activity Log**
Timeline showing:
- "Application submitted — 28 Aug 2026, 10:15 AM"
- "Documents uploaded — 28 Aug 2026, 10:16 AM"
- "OCR extraction completed — 28 Aug 2026, 10:18 AM"
- "Bureau data fetched — 28 Aug 2026, 10:19 AM"
- "AI assessment generated — 28 Aug 2026, 10:20 AM"
- "Assigned to Rajeev Menon — 28 Aug 2026, 10:20 AM"

---

## Screen 5: Sanction Letter Preview

A document preview screen with the letter on the left (styled like a formal letter on white paper) and controls on the right.

**Letter content (read-only preview):**
- Company letterhead
- Date
- To: Applicant name and address
- Subject: "Sanction of Car Loan — Application APP-2026-00847"
- Dear [Name],
- We are pleased to inform you that your car loan application has been approved with the following terms:
  - Loan Amount, Interest Rate, Tenure, EMI, Processing Fee, Disbursement Mode
  - Vehicle Details
  - Conditions (if any)
- This sanction is valid for 30 days from the date of this letter.
- Terms and conditions apply.
- Authorized Signatory

**Right side controls:**
- "Edit Terms" button (opens editable fields)
- "Download PDF" button
- "Print" button
- "Send to Customer" button (email/SMS)
- "Back to Application" link

---

## Screen 6: Credit Manager Review Screen

Same layout as Screen 4 (Copilot Screen) with these additions:

- Top bar shows "Referred by: Rajeev Menon" with the referral notes
- An additional "Override History" panel in the right column showing past overrides on this application (who, when, what they changed, why)
- The Decision panel shows the credit officer's recommendation and allows the manager to agree or override
- "Delegation Authority" badge showing the manager's approval limit (e.g. "Up to Rs 25,00,000")

---

## Screen 7: Policy Rules Management (Admin)

A table-based management screen.

**Tabs across the top:** CIBIL Rules | FOIR Rules | LTV Rules | Tenure Rules | Age Rules | Employment Rules | Documentation Rules

**Each tab shows a table:**
- Columns: Rule Name, Parameter, Operator (=, >, <, between), Threshold Value, Action (Approve/Maybe/Reject), Effective From, Effective To, Status (Active/Inactive)
- Each row has Edit and Deactivate buttons
- "Add New Rule" button at top
- Version history: "Last updated: 28 Aug 2026 by Admin — FOIR limit changed from 55% to 50%"

---

## Screen 8: Audit Log (Admin)

A searchable, filterable table showing all system events:
- Columns: Timestamp, User, Action (Application Created, Decision Made, Override, Policy Changed, Document Uploaded, Login, Logout), Application ID (clickable), Details, IP Address
- Filters: Date range picker, User dropdown, Action type dropdown
- Export button (CSV)

---

## Design specifications

- Font: Inter or system sans-serif
- Primary blue: #2563EB
- Success green: #16A34A
- Warning yellow: #EAB308
- Danger red: #DC2626
- Background: #F8FAFC (light grey)
- Cards: white with subtle shadow, 8px border radius
- Tables: alternating row colors, sticky headers
- All monetary values formatted with Indian numbering (e.g. Rs 8,50,000 not Rs 850,000)
- Responsive: works on 1280px+ screens (no mobile needed — internal banking tool used on desktops)
- Dark mode not required
