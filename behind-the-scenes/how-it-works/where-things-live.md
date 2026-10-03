# Where everything lives: models, data and the team behind them

This page answers two questions: which model or engine does each job and where it runs, and where each kind of data is kept. The short answer is that **everything that touches customer data runs in Mumbai** (AWS and Supabase, region ap-south-1), and the risk score runs in the visitor's own browser.

## The models and engines inside cercit

| Job | What does it | Where it runs | Notes |
|---|---|---|---|
| **Risk score** (chance of going 30+ days late) | XGBoost model **v2**, exported to ONNX | **In the browser** (onnxruntime-web). The file is `public/models/cercit-risk-v2.onnx` | Trained on a laptop from 16,995 synthetic customers (`behind-the-scenes/synthetic-training-data/`). The live version is recorded in the `model_versions` table, and every decision records which model scored it. v1 is kept for older decisions |
| **Credit decision** (approve / closer look / decline) | Policy engine: versioned rules, rate grid, FOIR and LTV checks | **Supabase Postgres, Mumbai**: `fn_run_policy_engine`, `fn_generate_recommendation` | Rules are data (`policy_rules`, `policy_versions`), changed only through draft → approval → live on a date |
| **Rules check for impact tests** | Zen rules engine | **AWS Lambda, Mumbai** (`cercit-policy-engine`) | Runs a proposed policy against recent cases before it's approved |
| **Reading documents** (PAN, Aadhaar, payslips, Form 16, bank statements) | Amazon **Textract**, plus cercit's own readers | **AWS Lambda + Textract, Mumbai** | Results are saved in the `document_readings` table |
| **Face match** (live photo vs PAN/Aadhaar photo) | Amazon **Rekognition** | **AWS, Mumbai** | Match / review / mismatch. A mismatch goes to an officer and never blocks the customer |
| **Aadhaar masking** (digits and QR code) | cercit's masking code; **zxing-cpp** finds the QR | **AWS Lambda, Mumbai** (`cercit-document-finalize`) | Masked before the file is stored, as the RBI KYC Master Direction asks |
| **Automatic document checks** | Rules stored as data (`document_check_rules`) | **Supabase Postgres, Mumbai** | Editable on the Document checks page |
| **Credit bureau** | **Simulator**: two simulated bureaus, combined worst-of | **Supabase Postgres, Mumbai** (`fn_bureau_sim_raw` and related) | Simulation only. A real bureau connection replaces it in production |
| **Income and bank detail** | **Simulator** for salary slips, Form 16 and bank months | **Supabase Postgres, Mumbai** | Simulation only |
| **Synthetic customers and loans** | Generator (055, 056) and the daily simulation (075) | **Supabase Postgres, Mumbai** | Marked SYNTHETIC everywhere. **Remove before real use** (see `docs/production-checklist.md`) |
| **Employer checks** | Employer Master checks (069), simulated company lookups | **Supabase Postgres, Mumbai** | Simulated first, with a switch for a real provider |

## Where the data is kept

| Data | Where | Protection |
|---|---|---|
| Customers, applications, decisions, loans, repayments, audit log | **Supabase Postgres, Mumbai** | Row-level rules decide who sees what. PAN and mobile are stored encrypted. Staff read through checked functions, and the public demo login never sees real customers |
| Uploaded documents | **AWS S3 bucket `cercit-docs-…`, Mumbai** | Private bucket, signed links only. Aadhaar masked before storage. Old file versions deleted |
| The website itself | **GitHub Pages** | Static files only. It holds no customer data |
| Risk model files | **GitHub Pages** (`public/models/`), loaded into the browser | Contain no customer data |
| Synthetic training data | **GitHub**, `behind-the-scenes/synthetic-training-data/` | Synthetic only, no real people |
| Settings backups | **Supabase** (weekly, 079) and a GitHub Actions copy | Settings and policy only, no customer data |
| Tests | Local copy of Postgres (**PGlite**) on the laptop or in the cloud session | Made-up data only |

## The team that built it, and what they could see

None of the AI tools below ever received customer data. They worked on code, designs, plans and synthetic data only.

| Who | Role | Saw customer data? |
|---|---|---|
| **Sameer Shreenivas Mittimani** | Founder: product, credit policy, testing and sign-off | Yes, as the admin (his own test documents) |
| **Claude** (Anthropic, through Claude Code) | Chief architect: system design, code, database, cloud, risk model, tests, docs | No. Database checks are read-only and never print customer details |
| **Lovable** | First clickable prototype of the screens | No |
| **Google Stitch** | Early screen design concepts | No |
| **ChatGPT** | First brainstorm: the 53-part solution blueprint | No |
| **Gemini** | Market and regulation research, quick drafts | No |
| **Microsoft Copilot** | Detailed spec: failure handling, document pipeline, tests | No |
| **Hermes** (agent) | Overnight drafting jobs and guides | No |
| **Inkling, MiniMax M3, DeepSeek** (through Hermes / OpenRouter) | Free models for drafts and small scripts | No |
| **Qwen** (local, on the laptop) | Private and bulk drafts, offline | Only on the laptop, never sent anywhere |

Sameer's routing rule decides who gets what: confidential material goes only to the local model; anything that needs tools, files or accuracy goes to Claude; quick text goes to free models; and anything a free model says is checked by Claude before it's used.
