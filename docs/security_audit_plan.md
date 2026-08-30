# cercit — Security audit plan

**Stage:** Post-public-demo (Phase 5)
**Approach:** Independent review by 3 AI models, findings consolidated, fixes applied before making repo public

---

## Why three models

Each model has different training data, reasoning patterns, and blind spots. Running the same audit prompt through three independent models reduces the chance of missing something that one model's training didn't cover. Disagreements between models surface areas worth closer manual review.

## Models

| Model | Strength | What it covers |
|---|---|---|
| Claude Fable 5 | Deep code reasoning, long context | Full schema review, function logic, data flow analysis |
| GPT 5.6 | Broad vulnerability knowledge | OWASP top 10, injection patterns, auth bypass |
| Kimi 3 / DeepSeek R1 | Alternative perspective, different training corpus | Edge cases, regulatory compliance, data privacy |

## Audit scope

### 1. Database layer
- SQL injection via RPC parameters
- SECURITY DEFINER function privilege escalation
- RLS policy gaps (when re-enabled)
- Data exposure through PostgREST auto-generated endpoints
- Sensitive data in audit_events (PII in event_detail JSONB)
- Rate grid / policy rule tampering via anon role

### 2. Frontend layer
- XSS in form inputs (name, employer, address fields)
- CSRF on state-changing operations
- Client-side validation bypass
- Sensitive data in browser console/network logs
- Env var exposure in Vite build output

### 3. API layer
- Anon key exposure and abuse (rate limiting, row limits)
- Unauthenticated access to all data (RLS disabled)
- No input sanitization on RPC parameters
- Missing rate limiting on fn_submit_full_application

### 4. Auth and access control
- No authentication (fake login)
- No role-based access (officer vs manager vs admin)
- No session management
- No CORS restrictions beyond Supabase defaults

### 5. Regulatory compliance
- RBI Digital Lending Guidelines (2022) alignment
- DPDP Act 2023 — consent, purpose limitation, data retention
- Bureau data handling (CIBIL score storage and display)
- Audit trail completeness for regulatory inspection

### 6. Infrastructure
- Supabase free tier limitations (connection pooling, backup)
- Anon key scope and rotation policy
- No WAF or DDoS protection
- No monitoring or alerting

## Audit process

1. Share full codebase (sql/, src/, docs/) with each model
2. Use a standardized prompt asking for: critical findings, high findings, medium findings, low findings, informational notes
3. Each model produces its own report independently
4. Consolidate into a single findings tracker with severity, status, and fix plan
5. Fix critical and high findings before making repo public
6. Document medium/low findings as known limitations for Phase 2

## Output

Each audit produces a report in `docs/security/`:
- `audit_fable.md` — Claude Fable 5 findings
- `audit_gpt.md` — GPT 5.6 findings
- `audit_kimi_deepseek.md` — Kimi 3 / DeepSeek findings
- `audit_consolidated.md` — Merged findings, severity matrix, fix status

## Known pre-audit findings

These are already known and will be fixed as part of the build-out, not the audit:

1. **No authentication** — Supabase Auth not implemented, login is cosmetic
2. **RLS disabled** — all tables readable by anon role
3. **No input validation on RPCs** — parameters pass through unchecked
4. **PII in plaintext** — PAN, Aadhaar, mobile stored without encryption
5. **No rate limiting** — anyone can call fn_submit_full_application repeatedly
6. **Anon key in .env** — not rotated, no expiry monitoring
