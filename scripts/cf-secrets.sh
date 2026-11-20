#!/bin/zsh
# Sets the dashboard's secrets on Cloudflare, one prompt each (the value is typed or pasted, hidden, and goes straight to Cloudflare; nothing is saved on this Mac).
# The values are the same ones the project has on Vercel (Settings → Environment Variables).
cd "$(dirname "$0")/.."
for name in HOME_ASSISTANT_URL HOME_ASSISTANT_TOKEN SUPABASE_URL SUPABASE_KEY SPOTIFY_CLIENT_ID SPOTIFY_REFRESH_TOKEN; do
  echo "\n$name (press Return with nothing typed to skip)"
  npx wrangler secret put "$name" || true
done
