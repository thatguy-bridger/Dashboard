#!/bin/zsh
# Builds and deploys the dashboard to Cloudflare. Any .env* / .dev.vars files are set aside while it runs, because the OpenNext deploy would otherwise upload their contents
# to the Worker as secrets (secrets are set only with `npm run cf:secrets`). They are put back afterwards, whatever happens.
cd "$(dirname "$0")/.."
hold=$(mktemp -d)
restore() { for f in "$hold"/*(N) "$hold"/.*(N); do [[ -f $f ]] && mv "$f" . ; done; rmdir "$hold" 2>/dev/null }
trap restore EXIT INT TERM
for f in .env .env.local .env.production .env.development .dev.vars; do [[ -f $f ]] && mv "$f" "$hold/"; done
BUILD_ID=$(git rev-parse --short HEAD) && npx opennextjs-cloudflare build && npx wrangler deploy --var BUILD_ID:$BUILD_ID
