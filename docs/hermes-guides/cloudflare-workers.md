# B7 — Cloudflare Workers Deploy + Custom Domain

Status: BLOCKED — requires Claude's manual account setup and deploy verification.

## Source evidence
- `Lov_cercit/wrangler.toml` — exists but not configured with account.
- `docs/cercit-status.html` — Cloudflare Workers status: "Not deployed"; SSR build ready, needs account setup.
- `docs/current_state_workflow.md` — deploy options listed (GitHub Pages live; Cloudflare Workers ready but not deployed).
- `docs/supabase_integration_guide.md` — environment variables include `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` (must be set in wrangler secrets).

## Deploy steps
1. Create Cloudflare account; install `wrangler` CLI (`npm install -g wrangler` or `npx wrangler`).
2. Configure `wrangler.toml`:
   - `name = "cercit-autoloan"`
   - `main = ".output/server/index.mjs"`
   - `compatibility_flags = ["nodejs_compat"]`
   - `compatibility_date` (e.g., `2026-01-01`)
3. Set secrets: `wrangler secret put VITE_SUPABASE_URL` and `wrangler secret put VITE_SUPABASE_ANON_KEY`.
4. Build SSR: `npm run build` (uses `vite.config.ts` — outputs `.output/server/index.mjs`).
5. Deploy: `wrangler deploy`.
6. Configure custom domain via Cloudflare dashboard (e.g., `autoloan.cercit.in` or `cercit-autoloan.cercit.in`).

## Assumptions / Risks (`.meta.json`)
- Account not set up (`docs/cercit-status.html` confirms "Not deployed").
- SSR build uses `.output/server/index.mjs`; SPA fallback (`vite.spa.config.ts`) produces `dist/index.html` (for GitHub Pages). Cloudflare deploy uses SSR build only.
- Custom domain requires manual dashboard configuration (not automatable by subagent).
- Environment variables (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_AWS_API_URL`) must be set as secrets; `.env` values cannot be read automatically by wrangler.
- Manual verification required: open deployed URL, confirm Supabase connection works, confirm Lambda endpoints respond, confirm rate grid (A6) and timeline (A10) render correctly.
