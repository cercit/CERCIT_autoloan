# cercit — Customer Portal & Landing Page

Extend the existing cercit application with a public-facing landing page and a customer self-service portal. The existing app serves internal employees (credit officers, managers). This addition gives customers a way to apply for a car loan, track their application, e-sign documents, download their sanction letter, and raise disputes — all without visiting a branch.

## How login works (unified, role-detected)

One login page for everyone. The system detects who you are after you enter credentials:

- **Employee login:** If the email ends with `@cercit.in` OR the user enters an employee code (e.g. `EMP-00412`), redirect to the internal dashboard (existing screens).
- **Customer login:** If the email is a personal email (`@gmail.com`, `@yahoo.com`, etc.) or mobile number, redirect to the customer portal.
- **New customers:** "Don't have an account? Apply now" link goes to the application form. Account is created during the application process using mobile OTP.

No separate login pages. One entry point, two experiences.

---

## Screen 1: Landing Page (public, no login required)

This is the marketing homepage. Modern, clean, aspirational — think Slice, Jupiter, or Bajaj Finserv landing pages. NOT a corporate banking page with stock photos of handshakes.

**Hero section (full viewport height):**
- Large headline: **"Your new car is closer than you think"**
- Subtext: "Apply online. Get approved in minutes. Drive home today."
- Two CTAs side by side: "Apply Now" (primary, blue, large) and "Track Application" (outline, secondary)
- Background: subtle gradient (dark blue to indigo) with an abstract geometric pattern or soft car silhouette illustration. No stock photos.
- In the top-right corner of the hero: "Login" button (text style, not prominent)

**Trust bar (horizontal strip below hero):**
- "Trusted by 50,000+ customers" | "Average approval in 47 minutes" | "Rates from 8.75%" | "100% digital process"
- Each with a small icon (shield, clock, percentage, phone)

**How it works section (3 steps):**
- Step 1: "Apply in 5 minutes" — icon of a form/phone. "Fill basic details, upload documents from your phone."
- Step 2: "Get instant decision" — icon of a checkmark/gauge. "Our AI checks eligibility in real-time. Most decisions in under an hour."
- Step 3: "Drive home" — icon of a car/key. "e-Sign your agreement, dealer gets the funds, you get the car."
- Below: another "Apply Now" button

**EMI Calculator section:**
- Interactive calculator with sliders:
  - Loan amount slider: Rs 1,00,000 to Rs 50,00,000 (default Rs 8,00,000)
  - Interest rate: display only (8.99% shown, "exact rate after application")
  - Tenure slider: 12 to 84 months (default 60)
- Right side shows: Monthly EMI (large number), Total interest, Total payable
- "Apply for this amount" button below the calculator

**Supported brands section:**
- Grid of car brand logos: Maruti Suzuki, Hyundai, Tata, Mahindra, Kia, Toyota, Honda, MG, Skoda, VW, Jeep, Citroen, Renault
- Text: "Finance available for all new cars from authorized dealers"

**Why cercit section (4 cards in a grid):**
- "No branch visits" — "Apply, track, and sign everything from your phone or laptop"
- "Transparent pricing" — "See your exact rate upfront. No hidden charges, no last-minute surprises"
- "Real-time tracking" — "Know exactly where your application stands, every step"
- "Secure & private" — "Bank-grade encryption. Your documents are safe with us"

**FAQ section (accordion/collapsible):**
- "What documents do I need?" → PAN, Aadhaar, 3 salary slips, 6-month bank statement, Form 16
- "How long does approval take?" → Most salaried applications are decided within 1 hour. Complex cases may take 1-2 business days.
- "What CIBIL score do I need?" → 650+ for consideration. 750+ for the best rates.
- "Can I prepay my loan?" → Yes, partial or full prepayment allowed after 6 EMIs. No foreclosure charges on floating rate.
- "What if my application is rejected?" → You'll receive a clear reason. You can reapply after 90 days or address the concern and try again.

**Footer:**
- cercit logo + tagline
- Links: About, Contact, Privacy Policy, Terms of Use, Grievance Redressal
- "cercit is a product demo. Not a licensed financial institution."
- Social icons (LinkedIn, Twitter/X)

---

## Screen 2: Customer Application Form (after "Apply Now")

Similar to the employee-side application form but simplified for self-service. The customer fills their own details. No employer category or dealer code fields — those are internal.

**Progress bar at top:** 4 steps (not 5 — no obligations step, that comes from bureau automatically)

**Step 1: Personal details**
- Full name, Date of birth, Gender, PAN, Aadhaar, Mobile (with OTP verification button), Email, Current address, City, State, PIN code, Residence type (Own/Rent/Family)

**Step 2: Employment & income**
- Company name (free text, not the internal employer dropdown), Designation, Monthly take-home salary, Years in current company, Total work experience, Salary account bank

**Step 3: Car & loan details**
- Which car are you looking at? (Make dropdown → Model dropdown)
- Dealer name or city (free text)
- Approximate on-road price (input, with hint "check with your dealer")
- How much loan do you need? (input)
- Preferred tenure (dropdown: 3/4/5/6/7 years)
- "Calculate EMI" button showing estimated monthly payment

**Step 4: Upload documents**
- Simplified upload — same drag-drop zones but friendlier language:
  - "PAN Card" (required)
  - "Aadhaar Card — front & back" (required)
  - "Last 3 salary slips" (required) — single multi-upload zone, not 3 separate
  - "Bank statement — last 6 months" (required) — hint: "Download PDF from your netbanking portal"
  - "Form 16" (required)
  - "Any other document" (optional)
- Each shows upload progress bar and file size

**Submit page:**
- Summary card showing: Name, Car, Loan amount, Tenure, Estimated EMI
- Checkbox: "I authorize cercit to pull my credit report from CIBIL/Experian"
- Checkbox: "I agree to the Terms and Conditions and Privacy Policy"
- "Submit Application" button
- After submit: confirmation screen with application ID (e.g. "CER-2026-04821"), estimated timeline ("You should hear from us within 2 hours"), and "Track your application" button

---

## Screen 3: Customer Portal — Dashboard (after login)

Clean, simple dashboard. Not data-dense like the employee side — the customer only needs to know their application status and next steps.

**Top section:**
- Welcome message: "Hi Rajesh, here's your application status"
- Application ID: CER-2026-04821
- Large status indicator with timeline/stepper:

**Application timeline (vertical stepper, always visible):**
1. "Application Submitted" — green checkmark, "28 Aug 2026, 10:15 AM"
2. "Documents Verified" — green checkmark, "28 Aug 2026, 10:18 AM"
3. "Credit Assessment" — yellow spinner (in progress), "Under review"
4. "Decision" — grey (pending)
5. "Agreement & e-Sign" — grey (pending)
6. "Disbursement" — grey (pending)

Current step is highlighted with a pulsing indicator and a short explanation:
- "We're reviewing your credit profile. Most decisions are made within 1 hour."

**Below the timeline — action cards (only show when relevant):**

Card: "Action required: Upload missing document"
- "Your bank statement could not be read. Please re-upload a clearer copy."
- "Upload" button
- Only shows if there's a pending action

Card: "Your offer is ready"
- Shows when status = Sanctioned
- Displays: Approved amount, Interest rate, Tenure, EMI, Processing fee
- "View Sanction Letter" button
- "Accept & e-Sign" button (primary, prominent)
- "I have questions" link → opens dispute/query form

**Sidebar or bottom section — quick links:**
- "Download Sanction Letter" (enabled only after sanction)
- "View my documents" (list of uploaded docs with status)
- "Raise a query" → goes to complaint/dispute screen
- "Contact us" → phone number + email

---

## Screen 4: Customer — Sanction Letter View & e-Sign

**Left side (60%):** Sanction letter rendered as a formal document preview (same as employee side but customer-facing):
- Company header
- Addressed to the customer
- Loan details: amount, rate, tenure, EMI, processing fee, conditions
- Valid for 30 days

**Right side (40%):**
- "Accept this offer" section:
  - Checkbox: "I have read and agree to the terms in this sanction letter"
  - Checkbox: "I authorize auto-debit (NACH/e-mandate) for EMI payments"
  - "e-Sign with Aadhaar OTP" button (primary, large)
  - Hint: "An OTP will be sent to your Aadhaar-linked mobile number"
- After signing:
  - Green confirmation: "Agreement signed successfully"
  - "Download signed copy (PDF)" button
  - "Next step: Your dealer will receive the funds within 1 business day"

- "Decline this offer" link (small, bottom) → opens a confirmation dialog: "Are you sure? You can reapply after 90 days." with Cancel/Decline buttons

---

## Screen 5: Customer — Track & Documents

**Tab 1: Application Timeline (default)**
- Full timeline with all events and timestamps (expanded version of the dashboard stepper)
- Each completed step shows: what happened, when, any notes
- Each pending step shows: what will happen, estimated time

**Tab 2: My Documents**
- List of all uploaded documents:
  - Document name, upload date, status (Verified / Under Review / Re-upload Required)
  - "View" button to see the uploaded file
  - "Re-upload" button (only if status is Re-upload Required)
- "Upload additional document" button at bottom

**Tab 3: Loan Details (visible only after sanction)**
- Sanction letter summary: amount, rate, tenure, EMI, start date
- "Download sanction letter" button
- "Download signed agreement" button (if e-signed)
- Repayment schedule table: Month, EMI, Principal, Interest, Outstanding balance

---

## Screen 6: Customer — Complaints & Disputes

**Raise a new query:**
- Category dropdown: "Document issue", "Application status", "Sanction terms", "EMI/repayment", "Technical issue", "Other"
- Subject (text input)
- Description (textarea)
- Attach file (optional)
- "Submit" button

**My queries (history):**
- Table/list of past queries:
  - Ticket ID (e.g. "TKT-00142"), Category, Subject, Status (Open / In Progress / Resolved), Created date, Last updated
  - Click to expand: full conversation thread between customer and support
  - Customer can add a reply to open tickets

**Grievance redressal note at bottom:**
- "Not satisfied with the resolution? Write to our Grievance Redressal Officer at grievance@cercit.in within 30 days."
- "If unresolved, escalate to the Banking Ombudsman at rbi.org.in/scripts/Complaints.aspx"
- (This is an RBI compliance requirement for all lending platforms)

---

## Navigation for customer portal

Simple top navigation bar (not sidebar — customers don't need 10 nav items):
- cercit logo (left)
- "My Application" | "Documents" | "Help"
- Profile icon + name (right) → dropdown: "My Profile", "Logout"

---

## Design specifications (customer-facing)

- Same design system as employee side (Inter font, same color palette) but lighter and more spacious
- Landing page can use larger fonts, more whitespace, and bolder CTAs
- Customer portal should feel simple and reassuring — not like a banking back-office
- Mobile-responsive: landing page and customer portal MUST work on mobile (most customers will apply from their phone)
- Employee side remains desktop-only as before
- Use the same component library (shadcn/ui) for consistency
- Landing page hero gradient: from #1e3a5f (dark navy) to #2563EB (primary blue)
- All monetary values in Indian formatting (Rs 8,50,000)
- No stock photography anywhere — use icons, illustrations, or abstract patterns
