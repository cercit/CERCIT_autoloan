# Market sizing: TAM, SAM, SOM (9 Oct 2026)

cercit is sold to lenders, not borrowers, so the market is counted in **appraisals** (application files a lender has to check) times a **fee per appraisal**. The loan value those files carry is shown alongside, because that is the number lenders think in. **New cars only**: CVs, 3Ws and used cars are left out because they are not the focus now.

## Inputs

| Input | Figure | Source or basis |
|---|---|---|
| Passenger vehicles sold, FY26 | 46,43,439 | SIAM, domestic wholesales, released 14 Apr 2026 |
| Share of four-wheelers bought on a loan | 79.96% | Data given in Parliament: 36.67 lakh of 45.86 lakh four-wheelers registered in 2025 were under hypothecation |
| Average car loan | Rs 8.6 lakh | CRIF High Mark, Q1 FY27 |
| Salaried share of new-car borrowers | **59%** | Worked out from HSIE Exhibit 9 (CRIF High Mark data, Mar 2022, marked "indicative"): banks' car borrowers are 70% salaried, NBFCs' 25%. HSIE also says banks hold about 75% of new car finance. 75% × 70% + 25% × 25% = 58.75%. By loan value, not count |
| Applications per loan | 1.5 | **Assumption:** about 2 in 3 applications end in a loan |
| Fee per appraisal | Rs 250 | **Assumption**, tested against cost below |

## The three numbers

| | Who | Loans a year | Appraisals a year | Loan value | cercit revenue a year |
|---|---|---|---|---|---|
| **TAM** | Every new-car loan in India, salaried and self-employed | 37.1 lakh | 55.7 lakh | Rs 3.2 lakh crore | **Rs 139 crore** |
| **SAM** | Phase 1 scope: salaried, new cars | 21.8 lakh | 32.7 lakh | Rs 1.9 lakh crore | **Rs 82 crore** |
| **SOM** | 3 years out: 4 mid-size lenders at 1,500 applications a month each | 48,000 | 72,000 | Rs 4,100 crore | **Rs 1.8 crore** |

Workings:
- TAM: 46.43 lakh × 79.96% = 37.1 lakh loans; × 1.5 = 55.7 lakh appraisals; × Rs 250 = Rs 139 crore.
- SAM: 37.1 lakh × 58.75% = 21.8 lakh loans; × 1.5 = 32.7 lakh appraisals; × Rs 250 = Rs 82 crore. Loan value 21.8 lakh × Rs 8.6 lakh = Rs 1.9 lakh crore.
- SOM: 4 × 1,500 × 12 = 72,000 appraisals, about 2% of SAM.

## Is Rs 250 a file right? What cercit costs to run

### Cost that grows with every file (from cercit's own document readers)

AWS prices from the Textract and Rekognition price pages (US region; Mumbai may differ slightly), at Rs 88 to the dollar.

| Document in a salaried file | Pages | What cercit's reader uses | Cost |
|---|---|---|---|
| PAN | 1 | Textract Forms ($0.05 a page) | $0.050 |
| Aadhaar, front and back | 2 | Forms, plus plain text reading to mask the number | $0.103 |
| Salary slips, 3 months | 3 | Forms + Tables ($0.065 a page) | $0.195 |
| Bank statement, 6 months | ~12 | Tables ($0.015 a page) | $0.180 |
| Form 16 Part B | ~3 | Forms + Tables | $0.195 |
| Live photo face match | 1 | Rekognition | $0.001 |
| Lambda, S3, API calls | | | ~$0.010 |
| **Total** | | | **~$0.73 ≈ Rs 65** |

Add 20% for re-uploads and retries: **about Rs 80 a file.** Keeping the documents for 8 years adds about Rs 1 a file over its life.

Not included: bureau pulls and Account Aggregator fetches. In production the lender pays for those under its own membership; cercit reads the result.

### Cost that is fixed each year (production-grade, 4 lenders)

All **assumptions**, to be checked:

| Item | Rs a year |
|---|---|
| Supabase Team plan ($599 a month, needed for SOC 2) + a separate database per lender (4 × $110 a month) | 11 lakh |
| AWS fixed costs (logging, backups, firewall, keys) | 3 lakh |
| 2 engineers to maintain, fix and stay on call (Rs 20 lakh each) | 40 lakh |
| 1 implementation and support person | 10 lakh |
| Half of a product owner | 10 lakh |
| Security testing and an ISO 27001 / SOC 2 audit | 12 lakh |
| Making today's demo production-grade (real bureau and AA links, lender sign-in, hardening): about Rs 40 lakh once, spread over 3 years | 13 lakh |
| **Total** | **about Rs 99 lakh** |

For comparison, a software firm quotes Rs 37–100 lakh to build a full loan origination system from scratch (EngineerBabu, 2026). cercit has most of that built already, which is why the remaining build is put at Rs 40 lakh.

### Cost per file at different sizes

| Scale | Files a year | Fixed cost | Per-file cost | **Total cost per file** | Margin at Rs 250 |
|---|---|---|---|---|---|
| SOM: 4 lenders | 72,000 | Rs 99 lakh | Rs 80 | **Rs 218** | 13% |
| ~15 lenders (1% of SAM) | 3 lakh | Rs 1.5 crore (3 engineers, 3 support, 15 databases) | Rs 80 | **Rs 131** | 48% |
| ~40 lenders (3% of SAM) | 10 lakh | Rs 2.7 crore (5 engineers, 6 support, 40 databases) | Rs 75 | **Rs 102** | 59% |

### What this says about Rs 250

- **At the SOM it only just covers cost.** Rs 250 against Rs 218 leaves 13%. Anything under about Rs 220 loses money until there are more than 4 lenders.
- **It gets comfortable with scale.** Once there are 15 or more lenders, the cost falls to about Rs 100–130 a file.
- **It is more than the officer's time it saves.** An officer earning Rs 7 lakh a year who checks 30 files a day (7,500 a year) costs about Rs 95 a file (both are assumptions). So Rs 250 can't be sold as "cheaper than your officer". It has to be sold on what else it removes:
  - days of waiting for the customer and the dealer;
  - document fraud caught before disbursal;
  - fewer bad loans;
  - the separate bank-statement and document tools lenders already pay for per file.
- **A better shape for the first lenders:** a smaller fee per file plus a yearly platform fee per lender, so the fixed costs are covered while volumes are low.

## What moves it

- **Fee per appraisal** moves every revenue line in proportion: at Rs 150 the SAM is Rs 49 crore; at Rs 400 it is Rs 131 crore.
- **Salaried share**: each 10 points moves the SAM by about Rs 14 crore.
- **Who buys:** large banks mostly build their own systems, so the realistic buyers are NBFCs, small finance banks and co-operative banks. That is why the SOM is a handful of mid-size lenders and not a share of the whole market.
- **Not counted:** used cars, CVs, 3Ws, top-ups, the self-employed in the SAM, and any fee for watching the loan book after disbursal.

## Check against an older estimate

HSIE put new car finance disbursals at about US$20 billion in FY22, growing 17% a year. Grown to FY26 that is about US$37 billion, or Rs 2.9–3.2 lakh crore depending on the exchange rate. This sizing gives Rs 3.2 lakh crore for all new car loans, so the two agree.

## Sources

- SIAM FY26 figures: [Outlook Business](https://www.outlookbusiness.com/industry/automobile-wholesales-in-india-clock-record-283-crore-units-in-fy26-siam)
- Share bought on a loan: [Business Today, 2 Apr 2026](https://www.businesstoday.in/auto/story/nearly-80-cars-bought-on-loans-govt-rules-out-parking-proof-rule-523721-2026-04-02)
- Average loan: [Outlook Money, CRIF report](https://www.outlookmoney.com/banking/2010-per-cent-growth-bigger-loans-mark-a-shift-in-indias-vehicle-finance-market-says-report)
- Salaried share and banks' share: [HSIE, Vehicle Financing, Jul 2022](https://www.hdfcsec.com/hsl.docs/Vehicle%20Financing%20-%20Secular%20opportunity%20meets%20cyclical%20tailwinds%20-%20HSIE-202208081149589969988.pdf), page 4 (Exhibit 9) and page 8
- AWS prices: [Textract pricing](https://aws.amazon.com/textract/pricing/)
- Supabase plans: [Supabase pricing](https://supabase.com/pricing)
- Build cost of a loan origination system: [EngineerBabu, 2026](https://engineerbabu.com/blog/loan-origination-software-development-cost/)
