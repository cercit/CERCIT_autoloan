# Deploy instructions

## SCRUM-22: Add Supabase secrets to GitHub

1. Go to https://github.com/cercit/CERCIT_autoloan/settings/secrets/actions
2. Click "New repository secret"
3. Add `VITE_SUPABASE_URL` -- paste your Supabase project URL (from Supabase dashboard > Settings > API)
4. Add `VITE_SUPABASE_ANON_KEY` -- paste the anon/public key from the same page
5. Go to Actions tab, click "Deploy to GitHub Pages" workflow, click "Run workflow"
6. After deploy completes, the live site will load real Supabase data instead of mock

## SCRUM-23: Cloudflare Workers SSR deployment

Prerequisites: Cloudflare account (free tier works), `wrangler` CLI.

```bash
cd "PM Projects\AI-Credit-Underwriter\Lov_cercit"

# Install wrangler if not already
npm install -g wrangler

# Login to Cloudflare
npx wrangler login

# Build the SSR output
npm run build

# Add secrets (prompts for value -- paste from Supabase dashboard)
npx wrangler secret put VITE_SUPABASE_URL
npx wrangler secret put VITE_SUPABASE_ANON_KEY

# Deploy
npx wrangler deploy
```

After deploy, Cloudflare gives you a `*.workers.dev` URL. To add a custom domain, go to Cloudflare dashboard > Workers & Pages > cercit-autoloan > Settings > Domains & Routes.

## What changes after both deploys

| Feature | GitHub Pages (current) | Cloudflare Workers |
|---|---|---|
| Rendering | SPA (client-side) | SSR (server-side) |
| First paint | Slower (JS bundle loads first) | Faster (HTML streamed) |
| SEO | Limited (SPA) | Full (SSR) |
| Data | Real if secrets added, mock otherwise | Real (secrets via wrangler) |
| URL | cercit.github.io/CERCIT_autoloan | cercit-autoloan.workers.dev (or custom) |

Both deployments can coexist. GitHub Pages stays as the demo/portfolio link. Cloudflare Workers becomes the "real" deployment when you want to show SSR + real data.
