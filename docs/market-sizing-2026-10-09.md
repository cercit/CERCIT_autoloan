# Market sizing: TAM, SAM, SOM (9 Oct 2026)

cercit is sold to lenders, not borrowers, so the market is counted in **appraisals** (application files a lender has to check) times a **fee per appraisal**. The loan value those files carry is shown alongside, because that is the number lenders think in.

## Inputs

| Input | Figure | Source or basis |
|---|---|---|
| Passenger vehicles sold, FY26 | 46,43,439 | SIAM, domestic wholesales, released 14 Apr 2026 |
| Commercial vehicles sold, FY26 | 10,79,871 | SIAM |
| Three-wheelers sold, FY26 | 8,36,231 | SIAM |
| Share of four-wheelers bought on a loan | 79.96% | Data given in Parliament: 36.67 lakh of 45.86 lakh four-wheelers registered in 2025 were under hypothecation |
| Share of CVs and 3Ws bought on a loan | 80% | **Assumption** (no clean source found) |
| Average car loan | Rs 8.6 lakh | CRIF High Mark, Q1 FY27 |
| Salaried share of new-car borrowers | 60% | **Assumption.** HSIE (2022, from CRIF data): banks hold ~75% of new car finance and their customers are "predominantly salaried"; no exact figure published |
| Applications per loan | 1.5 | **Assumption:** about 2 in 3 applications end in a loan |
| Fee per appraisal | Rs 250 | **Assumption.** Below the officer's labour cost per file once checking time and turnaround are counted; above cercit's own running cost (Textract reading is about $0.065 a page, so a 15-page file costs roughly Rs 85) |

## The three numbers

| | Who | Loans a year | Appraisals a year | Loan value | cercit revenue a year |
|---|---|---|---|---|---|
| **TAM** | Every new-vehicle loan in India: cars, CVs, 3Ws, salaried and self-employed | 52.5 lakh | 78.7 lakh | — | **Rs 197 crore** |
| **SAM** | Phase 1 scope: salaried, new cars | 22.3 lakh | 33.4 lakh | Rs 1.9 lakh crore | **Rs 84 crore** |
| **SOM** | 3 years out: 4 mid-size lenders at 1,500 applications a month each | 48,000 | 72,000 | Rs 4,100 crore | **Rs 1.8 crore** |

Workings:
- TAM loans: 46.43 lakh × 79.96% + (10.80 + 8.36) lakh × 80% = 37.1 + 15.3 = 52.5 lakh.
- SAM loans: 37.1 lakh × 60% = 22.3 lakh; × Rs 8.6 lakh = Rs 1.92 lakh crore.
- SOM: 4 × 1,500 × 12 = 72,000 appraisals, about 2% of SAM.

## What moves it

- **Fee per appraisal** moves every revenue line in proportion: at Rs 150 the SAM is Rs 50 crore; at Rs 400 it is Rs 134 crore.
- **Salaried share**: each 10 points moves the SAM by about Rs 14 crore.
- **Who buys:** large banks mostly build their own systems, so the realistic buyers are NBFCs, small finance banks and co-operative banks. That doesn't change the SAM, but it is why the SOM is a handful of mid-size lenders and not a share of the whole market.
- **Not counted:** used cars, top-ups, the self-employed (all outside Phase 1), and any fee for monitoring the loan book after disbursal.

## Check against an older estimate

HSIE put new car finance disbursals at about US$20 billion in FY22, growing 17% a year. Grown to FY26 that is about US$37 billion, or Rs 2.9–3.2 lakh crore depending on the exchange rate. This sizing gives Rs 3.2 lakh crore for all new car loans (37.1 lakh × Rs 8.6 lakh), so the two agree.

## Sources

- SIAM FY26 figures: [Outlook Business](https://www.outlookbusiness.com/industry/automobile-wholesales-in-india-clock-record-283-crore-units-in-fy26-siam), [Business Today](https://www.businesstoday.in/auto/story/indian-auto-industry-clocks-record-cv-sales-ev-registrations-surge-to-3-5-million-in-fy26-siam-553054-2026-09-03)
- Share bought on a loan: [Business Today, 2 Apr 2026](https://www.businesstoday.in/auto/story/nearly-80-cars-bought-on-loans-govt-rules-out-parking-proof-rule-523721-2026-04-02)
- Average loan: [Outlook Money, CRIF report](https://www.outlookmoney.com/banking/2010-per-cent-growth-bigger-loans-mark-a-shift-in-indias-vehicle-finance-market-says-report)
- Banks' share and salaried customers: [HSIE, Vehicle Financing, Jul 2022](https://www.hdfcsec.com/hsl.docs/Vehicle%20Financing%20-%20Secular%20opportunity%20meets%20cyclical%20tailwinds%20-%20HSIE-202208081149589969988.pdf)
