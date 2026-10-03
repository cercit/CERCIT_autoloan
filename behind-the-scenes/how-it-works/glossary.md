# Glossary

[← Back to the overview](README.md)

| Term | Meaning |
|---|---|
| **Bureau** | A credit bureau (CIBIL, Experian, CRIF, Equifax): it reports a person's loans and cards, how they paid, and a score. cercit pulls two and combines them (simulated in the demo). |
| **Bureau score** | The bureau's three-digit score (300–900); higher is better. The rate band and several rules depend on it. |
| **Category A / B / C** | The employer's category in the Employer Master. A: government, PSU, listed company or multinational; B: a limited company or LLP filing for 3 years or more; C: the rest, or struck off. It sets the rate loading, the LTV cap and the longest tenure. |
| **DPD** | Days past due: how late a payment is, counted from its due date to the day the full amount arrived. |
| **Disbursal** | Paying the loan out, here to the car dealer. It creates the loan account and the repayment schedule. |
| **e-NACH** | The electronic mandate that lets the lender debit the EMI from the customer's bank account each month (simulated in the demo). |
| **EMI** | Equated monthly instalment: the fixed monthly payment. |
| **FOIR** | Fixed obligations to income ratio: all monthly EMIs (existing ones plus the new car loan's, at the priced rate) as a share of net monthly income. The rules cap it. |
| **Fast lane** | A customer case whose documents all passed the automatic checks and whose recommendation is approve; a person still approves. |
| **In principle / final approval** | The two approvals: in principle on the customer's documents, final once the dealer's quotation is in. |
| **KFS** | Key Facts Statement: the RBI-required one-page summary of the loan (amount, rate, fees, APR, EMI) that the customer accepts before signing. Valid for 3 working days. |
| **LTV** | Loan to value: the loan as a share of the car's price. The rules cap it, with a lower cap for some employer categories. |
| **NPA** | Non-performing asset: a loan with a payment more than 90 days overdue. |
| **No-hit** | No record at the bureau (a new-to-credit customer). Such a case is never approved automatically; a person looks. |
| **Override** | An officer's decision that differs from the engine's; it needs a reason and is logged. |
| **PAR 30** | Portfolio at risk, 30 days: the share of the principal still owed on loans with a payment more than 30 days late. |
| **Policy version** | The credit rules and settings in force from a date. A new version needs a second person's approval; old ones are kept so past decisions can be explained. |
| **Practice login** | A visitor login (officer, manager or head) that works only on synthetic cases; its changes are reset. |
| **Rate grid** | The prices: a rate, LTV cap, FOIR cap and longest tenure for each bureau score band, plus each employer category's loading. Versioned like the policy. |
| **Refer** | The engine's "a person should look": neither approve nor decline. |
| **Risk model** | The XGBoost model that gives each case's chance of going 90+ days late, shown next to the engine's answer. |
| **Row rules (RLS)** | Row level security: database rules that decide which rows a signed-in person can see; nothing gets past them from the website. |
| **SMA-1 / SMA-2** | Special mention accounts: 31–60 and 61–90 days overdue (RBI's early-warning buckets before NPA). |
| **Synthetic** | Made-up customers and loans (IDs starting SYN, emails ending @synthetic.invalid) used for the demo, training and practice. Never real people. |
| **Tenure** | The loan's length in months. |
