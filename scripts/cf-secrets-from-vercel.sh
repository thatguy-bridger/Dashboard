#!/bin/zsh
# Copies the dashboard's secrets from Vercel to Cloudflare, so none of them has to be changed.
# The values go from Vercel into a private temporary file, and from there straight into Cloudflare. They are never printed, never kept in this project, and the temporary
# file is deleted when the script ends. Needs `npx vercel login` once first. (A variable Vercel marks "Sensitive" can't be read back by anyone; the script says so.)
cd "$(dirname "$0")/.."
names=(HOME_ASSISTANT_URL HOME_ASSISTANT_TOKEN SUPABASE_URL SUPABASE_KEY SPOTIFY_CLIENT_ID SPOTIFY_REFRESH_TOKEN)

hold=$(mktemp -d); work=$(mktemp -d); chmod 700 "$work"
restore() { for f in "$hold"/*(N) "$hold"/.*(N); do [[ -f $f ]] && mv "$f" . ; done; rmdir "$hold" 2>/dev/null; rm -rf "$work" }
trap restore EXIT INT TERM
for f in .env .env.local .env.production .env.development .dev.vars; do [[ -f $f ]] && mv "$f" "$hold/"; done      # a stray CLOUDFLARE_API_TOKEN in one of them would override your browser login
unset CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID

if ! npx --yes vercel whoami >/dev/null 2>&1; then echo "Not signed in to Vercel. Run: npx vercel login   (then run this again)"; exit 1; fi
npx vercel link --yes --project dashboard --scope thatguy-bridgers-projects >/dev/null 2>&1 || { echo "Couldn't link the Vercel project 'dashboard'."; exit 1; }
npx vercel env pull "$work/vercel.env" --environment=production --yes >/dev/null 2>&1 || { echo "Couldn't read the environment variables from Vercel."; exit 1; }
chmod 600 "$work/vercel.env"

for name in $names; do
  value=$(NAME=$name FILE="$work/vercel.env" python3 - <<'PY'
import os, json
want, out = os.environ["NAME"], ""
for line in open(os.environ["FILE"]):
    line = line.rstrip("\n")
    if line.startswith(want + "="):
        v = line[len(want) + 1:]
        if v.startswith('"') and v.endswith('"'):
            try: v = json.loads(v)
            except Exception: v = v[1:-1]
        out = v
print(out, end="")
PY
)
  if [[ -z $value ]]; then echo "✘ $name: not found in Vercel (or marked Sensitive, which can't be read back)"; continue; fi
  if printf %s "$value" | npx wrangler secret put "$name" >/dev/null 2>&1; then echo "✔ $name copied to Cloudflare"; else echo "✘ $name: Cloudflare refused it"; fi
done
unset value
echo "\nDone. The temporary copy is deleted."
