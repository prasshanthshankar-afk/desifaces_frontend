#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "== DesiFaces Mobile: Dev Reset =="
echo "Project: $ROOT_DIR"
echo

echo "1) Killing Expo/Metro/React-Native/Node/Watchman…"
pkill -9 -f "expo" 2>/dev/null || true
pkill -9 -f "metro" 2>/dev/null || true
pkill -9 -f "react-native" 2>/dev/null || true
pkill -9 -f "watchman" 2>/dev/null || true
pkill -9 -f "node " 2>/dev/null || true

echo "2) Releasing common ports (8081, 19000, 19001, 19002)…"
for p in 8081 19000 19001 19002; do
  if lsof -ti :"$p" >/dev/null 2>&1; then
    lsof -ti :"$p" | xargs kill -9 2>/dev/null || true
    echo "   - Freed port $p"
  fi
done

echo "3) Shutting down Watchman server (if installed)…"
if command -v watchman >/dev/null 2>&1; then
  watchman shutdown-server >/dev/null 2>&1 || true
fi

echo "4) Clearing Expo/Metro caches…"
rm -rf .expo 2>/dev/null || true
rm -rf /tmp/metro-* 2>/dev/null || true
rm -rf "${TMPDIR:-/tmp}/metro-*" 2>/dev/null || true
rm -rf "${TMPDIR:-/tmp}/haste-map-*" 2>/dev/null || true
rm -rf "${TMPDIR:-/tmp}/react-*"" 2>/dev/null || true

echo "5) Starting Expo fresh (BROWSER=none, cache cleared)…"
echo "   Tip: press 'i' for iOS, 'a' for Android once it starts."
echo
BROWSER=none npx expo start -c