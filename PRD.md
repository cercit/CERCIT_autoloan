# cercit — PRD
## End-to-End Automated Credit Appraisal for New Vehicle Finance

**Product & Domain:** Sameer S Mittimani
**Engineering & Architecture:** Claude (AI partner)
**Version:** 3.0 (consolidated from GPT brainstorm, Claude chat PRD, Copilot spec, Gemini research)
**Status:** E2E working — submit, assess, review flow live on Supabase
**Repo:** `cercit/CERCIT_autoloan` (private, main branch)
**Jira Project:** SCRUM at `samsm.atlassian.net`
**Supabase Project:** `izlxncfcuvjqzxxbyidt` (hosted PostgreSQL, free tier, Mumbai region)
**AI Layer:** OpenRouter with guardrails
**License:** AGPL-3.0 with dual licensing (commercial license required for financial institutions)
**Security audit:** Planned post-public-demo — Claude Fable 5, GPT 5.6, Kimi 3/DeepSeek (see `docs/security_audit_plan.md`)
**Timeline:** 12 weeks
**Last Updated:** 30 Aug 2026

---

## 1. Product Vision

> **Build a trusted AI-powered credit appraisal engine that converts customer and vehicle-finance data into a fast, explainable and policy-compliant credit decision.**

### Core Design Principles

1. **Rules decide; AI assists.** Policy, eligibility, pricing, scorecard, and delegation rules are deterministic and version-controlled. AI supports extraction, interpretation, anomaly detection, summarization, and recommendation.

2. **One fact, one source, one lineage.** Every material field retains its source, extraction method, confidence score, timestamp, and any manual changes.

3. **No silent assumptions.** Missing values remain missing unless a documented derivation rule is applied.

4. **Explainability by construction.** Every recommendation cites input facts, rule results, deviations, mitigants, and approval conditions.

5. **Human control at material decision points.** The system recommends, routes, and drafts — accountable humans approve material credit decisions.

6. **Policy as configuration.** Thresholds and matrices live in versioned tables, not hardcoded in application code. Policy changes = config change, not redeployment.

7. **Failure must be recoverable.** API failures, OCR failures, timeouts, partial responses — all enter controlled retry or manual-review queues.

8. **Customer data must remain protected.** Least privilege, purpose limitation, encryption, retention controls, monitored access.

> **Automate the predictable. Explain the decision. Escalate the uncertain. Learn from the outcome.**

---

## 2. Problem Statement

As a Credit/Underwriting Officer, I am unable to approve CAMs for clean, no-deviation income-class customers without manually reviewing and signing off on each file. The file has already passed every policy check before it reaches me — yet I must repeat the same manual steps: read documents, enter data, check bureau, calculate income, apply policy rules, write the appraisal note, and sign off.

This creates:

- High processing time on cases that carry no real decision value
- Underwriter bandwidth burned on rubber-stamp work instead of exception cases requiring judgment
- Data-entry errors and inconsistent interpretation across officers
- Delayed customer/dealer response
- Higher cost-to-serve per loan
- Difficulty scaling during peak volumes
- Limited real-time visibility into appraisal bottlenecks
- Rework caused by missing/incorrect documents

The opportunity is to convert appraisal from a **document-reading and calculation exercise** into a **data-driven automated decision workflow**.

---

## 3. Product Scope

### In Scope (Phase 1)

**Customer segment:** Salaried customers with income proof — single applicant only (no co-applicant/guarantor)

**Channel:** Direct leads only (customer applies directly)

**Vehicle segments:** Cars, SCVs, LCVs, 3-Wheeler Goods — **new vehicles only**

**Loan type:** Fresh loan applications only

**Bureau:** Existing credit history required (bureau score must exist). NTC excluded.

**Decision outcome:** Approve / Reject / Maybe (refer for manual review)

**Pricing:** Upfront rate if documents are clean and within policy. Risk-adjusted rate if borderline (Maybe cases that get approved after manual review).

### Phase 2 Scope (deferred)

- ITR-based / self-employed customers
- Co-applicant / guarantor cases
- Dealer / DSA channel
- NTC (New to Credit) customers
- Deviation handling and exception routing
- Re-appraisal / case amendments
- Auto-decisioning (STP for Green band)
- ML risk model

### Out of Scope (all phases)

- Used vehicles, title loans
- Restructured, top-up, or renewal loans
- Fraud or document-authenticity investigation (system flags, humans investigate)
- AI modifying or inventing credit policy
- Black-box approval without traceable reasons
- Silent policy overrides
- Modification of source data by a generative model
- Decisions based on protected or irrelevant personal characteristics

---

## 4. Phased Approach

### Phase 1 — AI Credit Copilot (MVP)

**Focus:** Salaried customers, direct leads, single applicant, bureau history exists

**Decision model:** Clean file per policy = **Approve** (with upfront rate). Policy breach = **Reject** (with reason codes). Borderline = **Maybe** (refer to credit officer for manual review, risk-adjusted rate if approved).

**No deviations in Phase 1.** If a file doesn't meet policy on any parameter, it's either a straight reject or a Maybe for human judgment. Deviation authority, mitigants, and exception routing come in Phase 2.

**Capabilities:**
- Digital application intake (direct customer)
- Document upload + OCR extraction (salary slip, Form 16, bank statement, KYC)
- Cross-document validation (name, employer, salary, account number matching)
- CIBIL/bureau integration and analysis (score must exist — NTC excluded)
- Bank statement parsing and derived metrics
- Income + obligation calculation (FOIR, DBR) — single applicant only
- LTV calculation against known ex-showroom/on-road price
- Policy rule engine (configurable, versioned)
- Upfront pricing for clean files, risk-adjusted pricing flag for Maybe cases
- Basic fraud/anomaly flags
- Structured credit recommendation (Approve / Reject / Maybe)
- Credit Officer Copilot UI — pre-filled appraisal with drill-down to evidence
- Complete audit trail with field-level lineage

**What Phase 1 is NOT:**
- Not auto-decisioning — every file gets human sign-off
- Not handling co-applicants or guarantors
- Not dealer/DSA sourced — direct leads only
- Not handling NTC customers
- Not handling deviations/exceptions — clean yes, dirty no, borderline maybe
- Not re-appraisal — rejected cases don't get reworked in Phase 1

### Phase 2 — Expanded Segments + Auto-Decisioning

- ITR-based / self-employed customers
- Co-applicant / guarantor income clubbing and joint bureau assessment
- Dealer / DSA channel with dealer portal and status tracking
- NTC customer handling with separate policy norms
- Deviation and exception routing with authority matrix
- Re-appraisal / case amendments (vehicle change, amount change, co-applicant added)
- Decision bands with STP for Green band (auto-approve, no human touch)
- Full policy-rule configuration with deviation and authority routing
- Advanced bank statement intelligence
- Dealer + vehicle risk scoring
- ML risk model (trained on Phase 1 outcome data)
- Fraud network analysis
- AI-generated appraisal notes
- Exception console and reprocessing workflows

### Phase 3 — Full STP + Continuous Learning

- Higher STP rate across more bands
- Real-time decisioning
- Champion/challenger model framework
- Dynamic risk-based pricing (where approved)
- Portfolio early-warning models
- Continuous model monitoring and automated retraining triggers
- Cross-case linkage and advanced anomaly analytics

---

## 5. Target Customer Journey

```
ENQUIRY / DIGITAL APPLICATION
        ↓
DOCUMENT UPLOAD
        ↓
DOCUMENT AI (OCR + Extraction + Classification + Quality Check)
        ↓
DATA NORMALIZATION (canonical schema, field-level confidence)
        ↓
CROSS-DOCUMENT VALIDATION & RECONCILIATION
        ↓
EXTERNAL ENRICHMENT (CIBIL / Bureau / AA / KYC / Vahan)
        ↓
FINANCIAL ANALYSIS (Income + Obligations + FOIR + LTV)
        ↓
VEHICLE + DEALER SIGNALS
        ↓
FRAUD / ANOMALY CHECK
        ↓
POLICY RULE ENGINE (versioned, configurable)
        ↓
AI RISK SCORE (Phase 2+)
        ↓
DECISION ENGINE
        ↓
┌──────────────┬───────────────┬──────────────┬────────────────┐
│              │               │              │                │
│  APPROVE     │  CONDITIONAL  │    REFER     │    REJECT      │
│  (STP)       │  (conditions) │              │  (reason code) │
│              │               │  Credit      │                │
│              │               │  Officer     │                │
│              │               │  Review      │                │
│              │               │     ↓        │                │
│              │               │  Decision    │                │
└──────────────┴───────────────┴──────────────┴────────────────┘
        ↓
SANCTION / DECLINE / QUERY / HOLD
        ↓
DOWNSTREAM UPDATE + DIGITAL DOCUMENTATION
        ↓
DISBURSEMENT (only after mandatory conditions satisfied)
        ↓
POST-DISBURSEMENT MONITORING → MODEL FEEDBACK LOOP
```

### System Outcome Categories

| Status | Meaning |
|---|---|
| `PASS` | Meets the applicable rule |
| `FAIL` | Violates a mandatory rule |
| `DEVIATION` | Outside standard policy but may be considered by authorized approver |
| `REFER` | Requires specialized or higher-level review |
| `INFORMATION_REQUIRED` | Decision cannot proceed — necessary evidence missing |
| `TECHNICAL_HOLD` | Processing cannot continue due to system/integration failure |
| `CONDITIONAL` | May proceed only after specified conditions are completed |

### Evidence Classification

| Type | Description |
|---|---|
| Verified fact | Confirmed through approved source or authorized manual verification |
| Extracted value | Read from document, not yet independently verified |
| Derived value | Calculated from input fields using an approved formula |
| Rule result | Produced by the versioned policy engine |
| AI observation | Generated interpretation, must remain grounded in cited evidence |
| Human judgment | Analyst/approver conclusion with user identity and rationale |

---

## 6. User Personas

### 6.1 Primary — Credit/Underwriting Officer

**Name:** Rajeev Menon | **Age:** 34 | **City:** Chennai | **Experience:** 6-8 years in vehicle finance (bank/NBFC)

**Daily load:** 25-40 CAM files per day across clean and deviation cases

**Pain points:**
- Fatigued by repetitive sign-offs on files with no real decision to make
- Anxious about accountability — worried "auto" doesn't remove personal blame
- Skeptical of automation replacing his role vs. augmenting it

**Needs:**
- More time for genuinely complex exception cases
- Confidence that auto-processed files won't come back as compliance/audit issues
- Visibility into WHY the system made a recommendation — not a black box
- Low-friction desktop UI, not a steep learning curve

**Success looks like:**

```
CUSTOMER SUMMARY
Income: ₹85K | Bureau: Eligible | Banking: Stable
FOIR: Within Policy | LTV: Within Policy | Fraud: No Flag

RISK BAND: A

POSITIVE: Stable income, good repayment history, consistent banking
CONCERNS: Recent bureau enquiries (3 in last 90 days)

POLICY: ✓ Income  ✓ FOIR  ✓ LTV  ✓ Documents  ✓ Bureau

RECOMMENDATION: APPROVE
[View Evidence] [Override] [Approve] [Refer] [Reject]
```

### 6.2 Secondary Personas (Sameer to detail)

- **State Credit Head** — approval authority for Amber-High band, portfolio quality monitoring, override review
- **Compliance/Audit** — needs reproducible decision trail, policy version tracking
- **Dealer** — faster TAT = more business, needs application status visibility

---

## 7. System Architecture

### Four Distinct Components — Never Conflate

```
1. DOCUMENT AI
   "What does the document say?"
   OCR, extraction, classification, cross-document matching, tampering detection

2. DATA / FEATURE ENGINE
   "What does the customer's financial behaviour look like?"
   Bureau features, banking metrics, income derivation, obligation mapping

3. ML RISK MODEL (Phase 2+)
   "How risky is this pattern based on historical outcomes?"
   Probability of default, risk band assignment, SHAP explainability

4. POLICY + DECISION ENGINE
   "Does this application qualify under approved policy?"
   Deterministic rules, versioned, auditable, configurable — no AI involvement
```

### Architecture Diagram

```
            CUSTOMER / DEALER / PARTNER API
                       │
                       ▼
             ┌───────────────────┐
             │ Intake Service     │  ← idempotency, schema validation,
             │                    │     duplicate check, correlation ID
             └─────────┬─────────┘
                       │
                       ▼
             ┌───────────────────┐
             │ Document Service   │  ← upload, classify, OCR, extract,
             │                    │     confidence score, hash, version
             └─────────┬─────────┘
                       │
                       ▼
             ┌───────────────────┐
             │ Canonical Data     │  ← one normalized case record,
             │ Layer              │     field-level lineage + confidence
             └─────────┬─────────┘
                       │
             ┌─────────┼──────────────────┐
             ▼         ▼                  ▼
        CIBIL/     Bank Statement    External Checks
        Bureau     Analysis          (KYC/Vahan/AA)
             │         │                  │
             └─────────┼──────────────────┘
                       ▼
             ┌───────────────────┐
             │ Financial Analysis │  ← income, FOIR, LTV, DBR,
             │ Engine             │     obligation, banking metrics
             └─────────┬─────────┘
                       │
          ┌────────────┴────────────┐
          ▼                         ▼
   Policy Rule Engine         ML Risk Model
   (deterministic,            (Phase 2+)
    versioned, configurable)
          │                         │
          └────────────┬────────────┘
                       ▼
             ┌───────────────────┐
             │ Decision Engine    │
             └─────────┬─────────┘
                       │
             ┌─────────┼──────────────────┐
             ▼         ▼                  ▼
          APPROVE    REFER/CONDITIONAL   REJECT
          (STP)      Credit Officer      Reason Code
                     Review
                       │
                       ▼
             ┌───────────────────┐
             │ Audit + Analytics  │  ← every decision reproducible
             │ Layer              │
             └───────────────────┘
```

### Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Database | Supabase (hosted PostgreSQL, free tier, Mumbai) | Relational, audit-friendly, auth + API built in, Sameer knows SQL |
| AI / LLM | OpenRouter | Multi-model access, guardrailed — LLM for document understanding and summaries only |
| Backend | Supabase Edge Functions + PostgreSQL functions | Serverless, no server to manage |
| Frontend | TBD (web app) | Claude builds from Sameer's Figma wireframes |
| Auth | Supabase Auth + RLS | Free, role-based row-level security |
| Policy config | Versioned tables in PostgreSQL (not hardcoded) | Policy changes = data update, not code change |

### Functional Components

| Component | Purpose |
|---|---|
| **Intake service** | Receives APIs/submissions, validates schema, assigns case + correlation IDs, duplicate control |
| **Document service** | Stores docs securely, file hash, classification, OCR extraction, versioning |
| **Canonical data layer** | One normalized case record with field-level lineage and confidence |
| **Validation engine** | Field-level and cross-source checks, identifies mismatches and missing data |
| **Financial analysis engine** | Income, obligations, FOIR, LTV, exposure, banking metrics — versioned formulas |
| **Policy rule engine** | Executes rules, produces pass/fail/deviation/referral, identifies required authority |
| **AI orchestration layer** | Retrieves case data, calls prompts, produces grounded summaries, validates output |
| **Workflow engine** | Case states, queues, assignments, SLA timers, escalations, approvals |
| **Exception console** | API/OCR/validation failures — retry, replay, manual continuation |
| **Audit layer** | Requests, responses, rule versions, prompt versions, model versions, human changes, final decisions |

---

## 8. Decision Methodology (6 Layers)

### Layer 1 — Hard Filters
KYC validation, negative/fraud database check, age eligibility, geography eligibility. **Binary pass/fail.** Fail = auto-reject.

### Layer 2 — Bureau Assessment
CIBIL/Experian score, DPD history (12/24/36 month), active accounts, outstanding exposure, enquiry velocity, written-off/settled accounts, credit utilization.

### Layer 3 — Income & Obligation Assessment
Net income calculation, eligible variable income, existing EMI obligations, proposed EMI, FOIR calculation, DBR calculation, net surplus. All formulas versioned and linked to applicable product policy.

### Layer 4 — Collateral Assessment
Vehicle ex-showroom/on-road price (from OEM/dealer — known for new vehicles), LTV calculation, vehicle make/model risk tier, OEM MoU terms.

### Layer 5 — AI/ML Risk Score (Phase 2+)
Probability of default prediction, risk band assignment (A-E), SHAP-based feature importance for explainability.

### Layer 6 — Policy Rule Engine
Product norms, MoU-specific rules, sanctioning authority matrix. **Deterministic. Versioned. Configurable.**

Each rule result returns:

```json
{
  "rule_id": "POLICY-FOIR-001",
  "policy_version": "2026.08",
  "result": "PASS | FAIL | DEVIATION",
  "actual_value": 52.3,
  "threshold": 55.0,
  "severity": "WITHIN_LIMIT | MINOR | MATERIAL",
  "reason": "Calculated FOIR within standard limit",
  "required_authority": "LEVEL_1",
  "possible_mitigants": []
}
```

---

## 9. Decision Bands & Routing

### Phase 1 — Three outcomes only

| Outcome | Criteria | Action | Pricing |
|---------|---------|--------|---------|
| **Approve** | All policy checks pass, bureau clean, FOIR within limit, LTV within limit, documents verified | Recommend approve + human sign-off | Upfront standard rate |
| **Maybe** | Borderline on one or more parameters but not a hard fail (e.g., FOIR close to limit, bureau score in grey zone, minor doc mismatch) | Refer to credit officer for manual review | Risk-adjusted rate if approved |
| **Reject** | Hard policy breach — bureau fail, FOIR exceeds cap, KYC fail, negative list hit, mandatory doc missing | Auto-decline with reason codes | — |

**No deviation authority in Phase 1.** A file either passes policy or it doesn't. Maybe = human decides within standard policy, not deviation approval.

### Phase 2 — Full four-band routing with deviation authority

| Band | Risk Level | Action | Authority | Est. Volume % |
|------|-----------|--------|-----------|---------------|
| **Green** | Low risk, all checks pass | Auto-approve (STP) | System | TBD |
| **Amber-High** | Minor flags, within policy | Auto-approve with flags highlighted | State Credit Head | TBD |
| **Amber-Low** | Medium risk / data gaps / deviations | Manual review required | Credit Officer | TBD |
| **Red** | Policy breach / high risk | Auto-decline with reason codes | System | TBD |

---

## 10. Document Intelligence Layer

### Salaried Customer Documents (MVP)
- Salary slip → extract: employer, employee name, gross/net salary, deductions, month
- Form 16 → extract: annual income, employer, TDS, PAN
- Bank statement → extract: salary credits, EMI debits, bounces, balances, cash deposits
- KYC (PAN/Aadhaar) → identity validation

### Self-Employed Documents (Phase 2)
- Bank statement, ITR, GST returns, business proof, financial statements

### Field-Level Extraction Schema

Every extracted field stores:

```yaml
field_name: applicant_monthly_salary
value: 85000
source_type: document
source_document_id: DOC-0001
page_number: 1
extraction_method: OCR
confidence: 0.97
verified: false
verified_by: null
verified_at: null
```

### Cross-Document Validation Matrix

| Field | Application | Salary Slip | Form 16 | Bank Statement | Action on Mismatch |
|-------|-------------|-------------|---------|----------------|-------------------|
| Customer name | ✓ | ✓ | ✓ | ✓ | Flag for review |
| Employer | ✓ | ✓ | ✓ | Credit source | Flag if different |
| Monthly salary | ✓ | ✓ | Annual ÷ 12 | Credit amounts | Flag if >10% variance |
| Bank account | ✓ | ✓ | — | ✓ | Flag if different |

### Validation Output Classifications

| Classification | Action |
|---|---|
| Match | Proceed |
| Minor difference | Flag, continue |
| Material mismatch | Refer to human |
| Missing | Request document |
| Unable to verify | Refer |
| Suspected manipulation | Fraud review |

### Document AI Pipeline
1. File type + malware check
2. Duplicate detection (file hash)
3. Image quality assessment
4. Orientation/skew correction
5. Page classification + document splitting
6. OCR / document-AI extraction
7. Field-level confidence scoring
8. Cross-document reconciliation
9. Low-confidence fields → human review queue

---

## 11. Bank Statement Intelligence

### Automated Extraction
- Salary/business credits, EMI debits, rent, utilities, insurance
- Cash deposits/withdrawals, bounce charges, cheque returns
- Credit card payments, large one-off credits, circular/suspicious transactions

### Derived Metrics

**Income:** Average monthly credit, median monthly credit, salary consistency score, income trend

**Banking behaviour:** Average monthly balance, minimum balance events, bounce frequency, cash deposit ratio (high = risk flag), EMI servicing regularity

**Composite:**
```
Income Consistency + Balance Stability + Obligation Servicing + Bounce Behaviour
= Banking Stability Score
```

---

## 12. Fraud & Anomaly Detection (Separate Layer)

**Identity:** Multiple applications same PAN/phone, address anomalies, KYC inconsistencies
**Documents:** Duplicates across applications, image manipulation, font/layout anomalies, metadata flags
**Banking:** Unusual cash deposits before application, circular transactions, artificial salary credits
**Network (Phase 2+):** Customer ↔ Phone ↔ PAN ↔ Bank Account ↔ Employer ↔ Dealer ↔ Vehicle

A fraud indicator triggers investigation, not automatically establishes wrongdoing.

---

## 13. AI Guardrails & Instruction Contract

### 7 Guardrails
1. **No policy invention** — AI/LLM cannot create or modify credit policy
2. **Evidence-based output** — summaries reference structured data, not hallucinated content
3. **Confidence thresholds** — low-confidence extraction routes to human review
4. **Deterministic calculations** — FOIR, EMI, LTV calculated by PostgreSQL functions, not LLM
5. **Human escalation** — high-risk/ambiguous cases always go to a credit officer
6. **Versioning** — policy version + model version + prompt version retained with every decision
7. **Security** — PII encrypted, role-based access via Supabase RLS, API key management

### AI Instruction Contract

```
# Role
You are an AI credit-appraisal assistant. You prepare an evidence-based
draft appraisal from verified case data, approved calculations, and
policy-rule results.

# Mandatory Rules
1. Do not invent missing values.
2. Do not modify or bypass rule-engine results.
3. Separate verified facts, derived values, and AI observations.
4. Cite the source field or rule ID for material conclusions.
5. Identify all missing or conflicting information.
6. Identify policy deviations and the authority required.
7. Do not make the final approval decision.
8. Do not use protected or irrelevant personal characteristics.
9. If evidence is insufficient, return REFER or INFORMATION_REQUIRED.

# Output Order
1. Case summary
2. Key eligibility results
3. Financial assessment
4. Bureau assessment
5. Banking assessment
6. Verification results
7. Risks and anomalies
8. Deviations and mitigants
9. Recommended structure and conditions
10. Required approval authority
11. Missing information
```

### Where LLM Fits vs Where It Doesn't

| LLM (OpenRouter) handles | PostgreSQL / deterministic code handles |
|---|---|
| Document OCR and understanding | FOIR / EMI / LTV calculation |
| Extracting info from complex docs | Policy threshold checks |
| Generating appraisal summaries | Bureau score thresholds |
| Explaining outcomes in natural language | Probability of default (ML, Phase 2+) |
| Credit officer copilot / search | Risk ranking |
| Conversational application investigation | Portfolio monitoring |

---

## 14. Appraisal Output Contract

### Machine-Readable Output

```json
{
  "case_id": "CASE-...",
  "data_completeness": {
    "status": "COMPLETE | INCOMPLETE",
    "missing_fields": []
  },
  "eligibility": {
    "status": "PASS | FAIL | REFER",
    "failed_rules": [],
    "deviations": []
  },
  "financial_assessment": {
    "verified_income": null,
    "existing_obligation": null,
    "proposed_emi": null,
    "foir": null,
    "ltv": null
  },
  "risk_flags": [],
  "mitigants": [],
  "recommendation": {
    "outcome": "APPROVE | REJECT | MAYBE",
    "amount": null,
    "tenure": null,
    "rate": null,
    "rate_type": "STANDARD | RISK_ADJUSTED",
    "reject_reasons": [],
    "maybe_flags": []
  },
  "evidence_references": [],
  "versions": {
    "policy": "2026.08",
    "model": "v1.0",
    "prompt": "v1.0"
  }
}
```

### Human-Readable Output
The appraisal note is generated from the same structured result. Users never reconcile conflicting machine and narrative outputs.

---

## 15. Data Architecture

### Core Entities

```
Application
    ├── Customer (demographics, KYC, employment, income)
    ├── Co-Applicant / Guarantor (if any)
    ├── Vehicle (make, model, variant, price)
    ├── Dealer (code, name, risk tier, performance)
    ├── State (code, name, policy rules, buying habits)
    ├── Documents[] (type, file, hash, OCR output, confidence, status)
    ├── Document Extractions[] (field, value, confidence, source, verified)
    ├── Bureau Report (score, DPD, accounts, enquiries, exposure)
    ├── Bank Statement Analysis (credits, debits, bounces, derived metrics)
    ├── Bank Transactions[] (date, type, amount, category, flag)
    ├── Income Assessment (eligible income, obligations, FOIR, DBR)
    ├── Policy Results[] (rule ID, version, pass/fail, actual vs threshold)
    ├── Deviations[] (type, severity, mitigants, required authority)
    ├── Risk Score (model version, probability, band, SHAP factors)
    ├── Fraud Signals[] (type, score, evidence)
    ├── Recommendation (outcome, amount, tenure, conditions, authority)
    ├── Credit Decision (final decision, approver, timestamp, conditions)
    ├── Override Log (original vs final, reason, approver)
    ├── Conditions[] (type, status, satisfied_by, satisfied_at)
    └── Audit Events[] (action, actor, timestamp, data snapshot)
```

### Database Design

**Owned by:** Sameer (schema design, DDL scripts, seed data, SQL functions)
**Reviewed by:** Claude (normalization, indexing, constraints, edge cases)
**Platform:** Supabase (hosted PostgreSQL, free tier — 500 MB, Mumbai)

**Table groups:**

| Group | Tables |
|---|---|
| **Core** | `applications`, `customers`, `co_applicants`, `vehicles`, `dealers`, `states` |
| **Documents** | `documents`, `document_extractions` |
| **Assessment** | `bureau_reports`, `bank_statement_analyses`, `bank_transactions`, `income_assessments`, `obligation_details`, `verifications` |
| **Decision** | `policy_rules`, `policy_results`, `deviations`, `risk_scores`, `fraud_signals`, `recommendations`, `credit_decisions`, `override_logs`, `conditions` |
| **Reference** | `credit_policy_versions`, `product_rules`, `eligibility_rules`, `oem_mou_terms`, `vehicle_risk_tiers`, `dealer_risk_tiers`, `sanctioning_authority_matrix`, `employer_categories`, `deviation_matrix`, `document_requirements`, `reason_codes` |
| **Audit** | `audit_events`, `integration_events`, `data_lineage` |

### Data Sources

| Source | Integration | Purpose |
|---|---|---|
| LOS / Application form | API / Direct | Customer + loan details |
| CIBIL / Experian / CRIF | Bureau API | Credit history |
| Account Aggregator (Perfios/Finbit) | AA API | Bank statement data |
| Vahan | API / batch | Vehicle registration verification |
| NSDL / UIDAI | API | PAN validation, Aadhaar e-KYC |
| OEM / Dealer Portal | API / master file | Vehicle pricing, MoU terms |
| Internal DMS | API | Document storage |
| Historical portfolio | Batch | ML training data |
| Fraud consortium / negative DB | API | Negative list checks |

---

## 16. API & Integration Failure Handling

### Controls
- Idempotency key on every case creation — prevents duplicates
- Raw request payload retained in access-controlled store
- Correlation ID across all services
- Schema validation against versioned contract
- Field-level error details returned for correctable failures
- Business rejection separated from technical failure

### Failure Recovery
- Retry only transient failures (exponential backoff, max retry count)
- Unrecoverable events → dead-letter / exception queue
- Authorized replay using original payload + new attempt ID
- Replay cannot duplicate approved business transactions
- Dashboard for failed, retried, recovered, and unresolved events

---

## 17. Regulatory & Compliance

### RBI Framework
- NBFC (ND-SI) Master Direction / Banking Regulation Act
- Scale-Based Regulation (SBR)
- Fair Practices Code (FPC)
- Digital Lending Guidelines (Sept 2022)
- KYC Master Direction
- IT Governance, Risk, Controls
- Outsourcing Circular

### Fair Lending & Transparency
- Adverse action notice with specific reasons for auto-decline
- Right to explanation for any AI-assisted decision
- Non-discrimination checks on protected attributes
- Grievance redressal path

### Data Privacy
- DPDP Act 2023 compliance
- Consent framework for bureau/AA/KYC
- Purpose limitation, data minimization
- Consent audit trail

### Audit Readiness

> **Golden rule: Every decision must be reproducible.**

Retain per case: source inputs, document versions + hashes, extracted values + confidence, manual corrections, calculation version + output, policy version + rule results, AI prompt + model version + response, user review + changes, approval chain, final decision + conditions, integration requests + responses.

---

## 18. Risk Management

| Risk | Impact | Mitigation |
|---|---|---|
| AI treated as decision engine | Inconsistent/non-compliant decisions | Deterministic rules control; AI assists only |
| Poor source data quality | Fast but incorrect appraisals | Data lineage, confidence scores, cross-checks |
| Policy embedded in prompts | Rules become ambiguous, hard to test/audit | Structured versioned tables, not narrative |
| API failures without recovery | Lost enquiries, duplicate submissions | Payload retention, idempotency, replay |
| Automation bias | Approvers rubber-stamp AI recommendations | Display evidence, uncertainty, deviations, mandatory review triggers |
| Data leakage | Customer harm, regulatory exposure | Encryption, least privilege, masking, retention controls |
| No feedback loop | Optimizes speed but not credit quality | Connect appraisal to portfolio outcomes |
| Model drift (Phase 2+) | Degraded predictions | PSI/CSI monitoring, champion-challenger |

### Risk Appetite & Limits (Sameer to define)
- Max % of portfolio auto-approved
- Max ticket size for STP
- Product/geography restrictions
- Kill-switch conditions

---

## 19. Product Metrics

### North Star Metric

> **% of eligible applications processed through straight-through credit decisioning with acceptable portfolio risk.**

### Supporting Metrics

| Category | Metrics |
|---|---|
| **Speed** | Median appraisal TAT, P90 appraisal TAT |
| **Automation** | STP %, manual-touch %, auto-document validation % |
| **Quality** | Data extraction accuracy, decision consistency, override %, appraisal correction rate |
| **Risk** | 30+ DPD, 90+ DPD, fraud loss, bad rate by risk band |
| **Business** | Approval conversion, disbursement conversion, cost per appraisal |
| **Operations** | API failure rate, OCR accuracy by document type, rule-failure rate, exception queue depth |

---

## 20. Monitoring & Dashboards

### Executive KPIs
Total applications, auto-approved %, referred %, rejected %, STP %, average/median TAT, manual-touch %, override %, early delinquency rate

### State View
Applications, STP %, TAT, referral %, approval %, documentation issues, state-specific policy compliance

### Dealer View
Applications, approval rate, STP rate, exception rate, early delinquency, fraud alerts

### Model Performance (Phase 2+)
Score distribution, bad-rate by risk band, model drift (PSI/CSI), KS/Gini/AUC, override performance

### Operations Dashboard
Cases by stage, aging/SLA breaches, API failures, OCR failures, manual-review queue, reprocessing status

---

## 21. What AI Does vs Rules vs Humans

| Activity | AI/ML | Rules Engine | Human |
|---|---|---|---|
| OCR / document extraction | ✓ | | |
| Document classification | ✓ | | |
| Cross-document matching | ✓ | | ✓ (review flags) |
| CIBIL threshold check | | ✓ | |
| FOIR / EMI / LTV calculation | | ✓ | |
| Fraud anomaly detection | ✓ | ✓ | ✓ |
| Risk prediction (PD model) | ✓ | | |
| Policy eligibility check | | ✓ | |
| Appraisal summary generation | ✓ | | Review |
| Exception handling | Assist | Route | ✓ |
| Override decision | | | ✓ (logged) |
| Final high-risk decision | Assist | Control | ✓ |

---

## 22. Human-in-the-Loop Controls

Mandatory manual intervention when:
- Critical information missing
- Extraction confidence below threshold
- Identity/banking information conflicts across sources
- Hard policy fail present
- Material deviation requiring discretionary approval
- Fraud/manipulation indicators present
- AI output fails structural/grounding validation
- User overrides system recommendation
- Case exceeds STP limits

Manual changes require: user identity, role/authority validation, original value, new value, reason code, timestamp, recalculation trigger.

---

## 23. Test Strategy

| Level | What to test |
|---|---|
| **Unit** | Field normalization, financial calculations, individual policy rules, authority selection |
| **Integration** | API → case creation, document upload → extraction, bureau/banking interfaces, rule engine → workflow |
| **Policy regression** | Boundary values, pass/fail cases, permitted/prohibited deviations, authority escalation, conflicting rules |
| **AI evaluation** | Factual grounding, completeness, calculation consistency, rule consistency, unsupported statements, output schema compliance |
| **UAT** | Credit analysts, approvers, operations, policy, risk, audit, compliance |

---

## 24. Success Criteria

1. Straight-through eligible applications processed significantly faster than manual baseline
2. Manual data entry reduces by >60%
3. Document extraction accuracy reaches agreed production threshold
4. Credit policy application becomes more consistent across officers
5. Credit officers spend more time on exceptions than routine cases
6. Every automated decision remains auditable and reproducible
7. No unacceptable deterioration in portfolio risk
8. Business users trust the system enough to adopt at scale
9. Every conclusion traceable to input evidence, calculation, or rule
10. Business continuity and manual fallback documented and tested

---

## 25. Implementation Roadmap — 12 Weeks

### Phase A — Foundation (Week 1-3)

| Step | What | Owner | Time |
|---|---|---|---|
| 1 | Supabase project setup (done — Mumbai, RLS enabled) | Sameer | Done |
| 2 | Jira project setup — create project, epics, stories | Sameer | 2-3 hours |
| 3 | Scheme design — CIBIL cutoffs, FOIR limits, LTV caps, loan range, tenure | Sameer | 3-4 hours |
| 4 | Current-state workflow mapping | Sameer | 1-2 hours |
| 5 | Define "no-deviation" criteria | Sameer | 1 hour |

### Phase B — Design (Week 4-6)

| Step | What | Owner | Time |
|---|---|---|---|
| 6 | DB schema design — DDL scripts for all entities | Sameer (Claude reviews) | 4-5 hours |
| 7 | Deploy schema to Supabase | Sameer | 1 hour |
| 8 | User flow diagrams | Sameer | 2-3 hours |
| 9 | Wireframes in Figma — Copilot screen, applicant form, dashboard | Sameer (Claude refines) | 3-4 hours |
| 10 | Prototype in Figma — clickable flow | Sameer | 2 hours |
| 11 | User stories with acceptance criteria | Sameer | 2 hours |

### Phase C — Build (Week 7-9)

| Step | What | Owner | Time |
|---|---|---|---|
| 12 | Seed data — SQL INSERTs for sample applications | Sameer | 2 hours |
| 13 | Rule engine (versioned, configurable policy tables + functions) | Claude | — |
| 14 | Application intake form | Claude | — |
| 15 | Document upload + OCR (OpenRouter with guardrails) | Claude | — |
| 16 | Credit Officer Copilot UI (from Sameer's wireframes) | Claude | — |
| 17 | Decision engine + band routing | Claude | — |
| 18 | Dashboard | Claude | — |
| 19 | Mid-build review | Sameer | 3 hours |

### Phase D — Test (Week 10-11)

| Step | What | Owner | Time |
|---|---|---|---|
| 20 | Test cases — happy path + edge cases | Sameer | 3 hours |
| 21 | Execute tests | Sameer | 3 hours |
| 22 | Bug fixes | Claude | — |
| 23 | UAT — 2-3 colleagues test | Sameer | 2 hours |
| 24 | Refinement from feedback | Claude + Sameer | 2 hours |

### Phase E — Launch (Week 12)

| Step | What | Owner | Time |
|---|---|---|---|
| 25 | Public eligibility checker | Claude (build) + Sameer (review) | 1 hour review |
| 26 | Share — LinkedIn, colleagues, Masai cohort | Sameer | 1 hour |
| 27 | Copyright registration filing (₹500) | Sameer | 1 hour |
| 28 | Collect feedback, plan Phase 2 | Sameer + Claude | Ongoing |

**Sameer's total: ~35-40 hours across 12 weeks (~3 hours/week)**
**Claude handles: All code.**

---

## 26. Ownership Matrix

| Area | Sameer | Claude |
|---|---|---|
| Product vision & scope | Owns | Advises |
| Scheme design (policy thresholds) | Owns | — |
| Current-state workflow | Owns | — |
| Jira setup & management | Owns | — |
| DB schema design (DDL) | Owns | Reviews + refines |
| DB deployment (Supabase) | Owns | — |
| Seed data (SQL INSERTs) | Owns | — |
| Wireframes & prototype (Figma) | Owns | Refines |
| User stories & acceptance criteria | Owns | — |
| Test cases | Owns | — |
| UAT coordination | Owns | — |
| LinkedIn post / public launch | Owns | — |
| Copyright registration | Owns | — |
| Rule engine code | — | Owns |
| Frontend code | — | Owns (from wireframes) |
| AI/LLM integration (OpenRouter) | — | Owns |
| Backend / API code | — | Owns |
| Bug fixes | — | Owns |
| Architecture decisions | Consulted | Owns |
| Regulatory compliance design | Owns (domain) | Implements |

---

## 27. AI Knowledge Repository Structure

```
AI-Credit-Underwriter/
├── PRD.md                              ← this document (source of truth)
├── LICENSE                             ← AGPL-3.0 + dual licensing
├── docs/
│   ├── application_flow.md             ← 7-step customer journey (done)
│   ├── scheme_design_template.xlsx     ← policy thresholds — 38 parameters (done)
│   ├── db_schema_template.xlsx         ← 22 tables, 293 columns (done)
│   └── current_state_workflow.md       ← as-is manual salaried new-car appraisal process (done)
├── system/
│   ├── ai_instruction_contract.md      ← role, rules, output order
│   ├── output_contract.md              ← JSON + narrative schema
│   └── prohibited_actions.md           ← what AI must never do
├── policy/
│   ├── product_rules.yaml              ← configurable thresholds
│   ├── eligibility_rules.csv           ← pass/fail conditions
│   └── document_requirements.csv       ← mandatory docs by product/segment
├── schemas/
│   ├── canonical_case.schema.json      ← master case data model
│   ├── rule_result.schema.json         ← policy engine output
│   └── appraisal_output.schema.json    ← final appraisal contract
├── data/
│   ├── indian_car_oem_dealers.csv      ← 132 dealers across OEMs (seed for dealers table)
│   └── indian_car_oem_models.csv       ← 355 model/variant/price records (seed for vehicle dropdowns)
├── db/
│   ├── ddl/                            ← CREATE TABLE scripts (from schema template)
│   ├── seed/                           ← sample data INSERTs
│   └── functions/                      ← PostgreSQL functions (FOIR, LTV, etc.)
├── src/                                ← application code (Claude builds)
└── tests/
    ├── policy_test_cases.csv
    └── expected_outputs/
```

---

## 28. Open Items Tracker

### Closed

| # | Item | Decision | Date |
|---|---|---|---|
| 1 | **Scope decision** | Phase 1 = salaried, single applicant, direct leads, bureau required, no deviations. Approve/Reject/Maybe. | 2026-08-28 |
| 2 | **Co-applicant** | Phase 2. Phase 1 = single applicant only. | 2026-08-28 |
| 3 | **Channel** | Phase 1 = direct leads. Dealer/DSA = Phase 2. | 2026-08-28 |
| 4 | **NTC customers** | Phase 2. Salaried almost always have bureau history. | 2026-08-28 |
| 5 | **Deviations/exceptions** | Phase 2. Phase 1 = clean yes, dirty no, borderline maybe. | 2026-08-28 |
| 6 | **Re-appraisal** | Phase 2. Phase 1 = reject is final, no rework. | 2026-08-28 |
| 7 | **Pricing model** | Upfront rate if clean per policy. Risk-adjusted rate for Maybe cases approved after manual review. | 2026-08-28 |
| 8 | **TAT target** | 60 min for Approve cases (doc submit to decision). 48 working hrs for Maybe resolution. | 2026-08-28 |
| 9 | **Scheme design** | Complete — see `docs/scheme_design_template.xlsx`. Cars only, 38 parameters across 8 sections. | 2026-08-28 |
| 10 | **Application flow** | 7-step flow designed — see `docs/application_flow.md`. Registration → Vehicle → Financials → In-Principle → Documents → Extraction Review → Final Assessment. | 2026-08-28 |
| 11 | **Bureau thresholds** | 750+ = Approve (8.99%), 650-749 = Maybe (9.9%), below 650 = Reject. DPD: 0 in 12mo, max 30-day x2 in 24mo. Enquiries: max 3 in 90 days. Writeoff: 0 in 5 years. | 2026-08-28 |
| 12 | **Bank statement rules** | 0 bounces (dispute letter = Maybe). Cash deposits up to 10L with proof = ok, above = reject. AMB = 20% of proposed EMI on 5th/10th/15th/20th/25th. | 2026-08-28 |
| 13 | **FOIR/DBR limits** | FOIR max 50% (net salary excl bonus). DBR max 45%. EMIs ending in 3 months excluded. | 2026-08-28 |
| 14 | **Rate grid** | 750+ CIBIL = 8.99%. 650-749 = 9.9%. Processing fee 1-2%. | 2026-08-28 |
| 15 | **Income rules** | Net salary (excl bonus) for FOIR. Variable income: 20% of avg last 6 months. | 2026-08-28 |
| 16 | **LTV & down payment** | LTV base = ex-showroom. Max 120% (covers road tax + insurance + registration). Min down payment = 0%. | 2026-08-28 |
| 17 | **Maybe criteria** | CIBIL 650-749, bounce with dispute letter within 72 hrs, cash deposits up to 10L with proof. | 2026-08-28 |
| 18 | **Current-state workflow** | Manual salaried new-car appraisal process documented — see `docs/current_state_workflow.md`. 9 stages, 6 lenders, TAT and bottleneck analysis. | 2026-08-29 |
| 19 | **Database schema** | 22 tables, 293 columns defined — see `docs/db_schema_template.xlsx`. Reviewed and approved. Next: convert to DDL scripts. | 2026-08-29 |
| 20 | **UI prototype** | Interactive Lovable prototype with all screens — employee side (dashboard, 5-step application, copilot review, manager review, sanction letter, policy rules, rate grid, employer master, audit log) + customer side (landing page, self-service apply, portal dashboard, track, e-sign, complaints). Repo: `cercit/cercit_mock`. | 2026-08-29 |

### All 20 items closed. Build phase ready.

---

## 29. Glossary

| Term | Meaning |
|---|---|
| cercit | Credit Evaluation and Risk Compliance Intelligence Tool |
| CAM | Credit Appraisal Memo |
| LOS | Loan Origination System |
| DPD | Days Past Due |
| FOIR | Fixed Obligation to Income Ratio (total EMIs ÷ net income) |
| DBR | Debt Burden Ratio (total debt ÷ gross income) |
| LTV | Loan to Value (loan amount ÷ vehicle value) |
| NPA | Non-Performing Asset |
| STP | Straight-Through Processing |
| FPC | Fair Practices Code |
| NTC | New to Credit |
| SEP | Self-Employed Professional |
| SENP | Self-Employed Non-Professional |
| AA | Account Aggregator |
| PSI | Population Stability Index |
| CSI | Characteristic Stability Index |
| KS | Kolmogorov-Smirnov statistic |
| SHAP | SHapley Additive exPlanations |
| RLS | Row Level Security (Supabase/PostgreSQL) |

---

## 30. Reference Documents

| Document | Location | Purpose |
|---|---|---|
| Solution Blueprint (GPT) | `Vault\Brain_Storm_GPT_AI_Based_Credit_Appraisal_System_End_to_End.md` | 53-section architecture — document AI, bank statement intelligence, fraud, guardrails, pilot, business case |
| Copilot Spec | `PM Projects\New Initiative\End_to_End_AI_Credit_Appraisal_System.md` | 23-section detailed spec — API failure handling, OCR pipeline, AI contract, output schemas, test strategy |
| Claude Chat PRD | Prior Claude chat session | Original product planning — personas, regulatory framework |
| Gemini Research | Prior Gemini chat session | Data pipeline architecture |
| Jira Basics | `Career\jira-basics.md` | Quick reference for Jira workflow |
| Indian Car OEM Dealers | `cercit/desk` repo — `output/indian_car_oem_dealers.csv` | Scraped dealer data — seed for dealers table (Phase 2 dealer channel) |
| Indian Car OEM Models | `cercit/desk` repo — `output/indian_car_oem_models.csv` | Scraped make/model/variant data — seed for vehicle dropdowns + ex-showroom pricing |

---

*Built by Sameer S Mittimani and Claude — equal partners.*
*Sameer: product vision, domain expertise (12 years vehicle finance), scheme design, DB schema, wireframes, testing, launch.*
*Claude: architecture, code, AI integration, rule engine, frontend, bug fixes.*
*Sources: GPT brainstorm (53 sections), Copilot spec (23 sections), Claude chat PRD, Gemini research.*

*All 20 open items closed. Backend build complete: 22-table schema deployed, 8 PostgreSQL functions live, 132 dealers seeded, policy engine + decision pipeline smoke-tested (APPROVE + REJECT). Next: wire Lovable prototype to Supabase, UI wireframes, Jira epics.*
