#!/usr/bin/env bash
# Build a lean SPA into backend/app/static/web for Railway (no uchebnik/pilot videos).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CLIENT="$ROOT/frontend/volley-platform-client"
OUT="$ROOT/backend/app/static/web"
API_URL="${VITE_API_URL:-https://volley-platform-production.up.railway.app}"

cd "$CLIENT"
VITE_API_URL="$API_URL" npm ci
VITE_API_URL="$API_URL" npm run build

rm -rf "$OUT"
mkdir -p "$OUT"
cp dist/index.html "$OUT/"
cp -a dist/assets "$OUT/"
for f in favicon.png bfvb-logo.png bvf-splash.png sw.js vite.svg legal.css; do
  [[ -e "dist/$f" ]] && cp -a "dist/$f" "$OUT/"
done
for d in privacy terms pricing instructions outreach; do
  [[ -d "dist/$d" ]] && cp -a "dist/$d" "$OUT/"
done

echo "Wrote lean SPA to $OUT ($(du -sh "$OUT" | awk '{print $1}'))"
