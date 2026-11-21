#!/bin/zsh
# Sets the dashboard's secrets on Cloudflare, one prompt each (the value is typed or pasted, hidden, and goes straight to Cloudflare; nothing is saved on this Mac).
# The values are the same ones the project has on Vercel (Settings → Environment Variables).
# Any .env* / .dev.vars files are set aside while it runs (a CLOUDFLARE_API_TOKEN in one of them would override your browser login and be refused), then put back.
cd "$(dirname "$0")/.."
hold=$(mktemp -d)
restore() { for f in "$hold"/*(N) "$hold"/.*(N); do [[ -f $f ]] && mv "$f" . ; done; rmdir "$hold" 2>/dev/null }
trap restore EXIT INT TERM
for f in .env .env.local .env.production .env.development .dev.vars; do [[ -f $f ]] && mv "$f" "$hold/"; done
unset CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID
for name in HOME_ASSISTANT_URL HOME_ASSISTANT_TOKEN SUPABASE_URL SUPABASE_KEY SPOTIFY_CLIENT_ID SPOTIFY_REFRESH_TOKEN; do
  echo "\n$name (press Return with nothing typed to skip)"
  npx wrangler secret put "$name" || true
done
