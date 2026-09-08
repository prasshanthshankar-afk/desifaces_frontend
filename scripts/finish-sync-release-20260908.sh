#!/usr/bin/env bash
set -Eeuo pipefail

PROD_HOST="${PROD_HOST:-desifaces-gpu}"
LEGACY="/home/azureuser/workspace/desifaces-v2"
REPO="prasshanthshankar-afk/desifaces_frontend"
REF="release/mobile-production-sync-20260908"
SUBMIT_SCRIPT="scripts/submit-exact-testflight-build-20260908.sh"

need(){ command -v "$1" >/dev/null 2>&1 || { echo "FAIL: missing required command: $1" >&2; exit 2; }; }
for x in ssh gh base64 bash; do need "$x"; done
[[ "$(uname -s)" == "Darwin" ]] || { echo "FAIL: run from the Mac release environment" >&2; exit 2; }

echo "============================================================"
echo " desifaces.ai — FINAL SYNC RELEASE CLOSEOUT"
echo "============================================================"
echo "PRODUCTION_MUTATION=NONE"
echo "LEGACY_DELETE=NONE"
echo "TESTFLIGHT_TARGET=EXACT_BUILD"

echo
echo "===== 1. LEGACY V2 REFERENCE AUDIT — READ ONLY ====="
ssh "$PROD_HOST" "LEGACY='$LEGACY' bash -s" <<'REMOTE'
set -Eeuo pipefail
LEGACY="${LEGACY:?}"
refs=0

mark(){
  local label="$1" value="$2"
  echo "$label=$value"
  [[ "$value" == "0" ]] || refs=1
}

echo "LEGACY_WORKSPACE=$LEGACY"
[[ -d "$LEGACY" ]] && echo "LEGACY_WORKSPACE_PRESENT=YES" || echo "LEGACY_WORKSPACE_PRESENT=NO"

# Docker bind mounts / named mount metadata.
docker_mount_refs="$(
  for c in $(docker ps -aq); do
    docker inspect "$c" --format '{{.Name}} {{range .Mounts}}{{.Source}} -> {{.Destination}} {{end}}' 2>/dev/null || true
  done | grep -F "$LEGACY" || true
)"
if [[ -n "$docker_mount_refs" ]]; then
  echo "--- DOCKER_REFERENCES ---"
  printf '%s\n' "$docker_mount_refs"
  mark DOCKER_REFERENCE_COUNT "$(printf '%s\n' "$docker_mount_refs" | grep -c .)"
else
  mark DOCKER_REFERENCE_COUNT 0
fi

# Running process command lines.
proc_refs="$(ps auxww 2>/dev/null | grep -F "$LEGACY" | grep -v grep || true)"
if [[ -n "$proc_refs" ]]; then
  echo "--- PROCESS_REFERENCES ---"
  printf '%s\n' "$proc_refs"
  mark PROCESS_REFERENCE_COUNT "$(printf '%s\n' "$proc_refs" | grep -c .)"
else
  mark PROCESS_REFERENCE_COUNT 0
fi

# Nginx/systemd/cron configuration references. Read only.
config_refs="$({
  grep -RsnF --exclude='*.log' "$LEGACY" /etc/nginx /etc/systemd/system 2>/dev/null || true
  grep -RsnF --exclude='*.log' "$LEGACY" /lib/systemd/system 2>/dev/null || true
  crontab -l 2>/dev/null | grep -nF "$LEGACY" || true
  if sudo -n true >/dev/null 2>&1; then
    sudo crontab -l 2>/dev/null | grep -nF "$LEGACY" || true
  fi
} | awk 'NF' || true)"
if [[ -n "$config_refs" ]]; then
  echo "--- CONFIG_REFERENCES ---"
  printf '%s\n' "$config_refs"
  mark CONFIG_REFERENCE_COUNT "$(printf '%s\n' "$config_refs" | grep -c .)"
else
  mark CONFIG_REFERENCE_COUNT 0
fi

# Filesystem mount table and symlinks.
mount_refs="$(findmnt -rn 2>/dev/null | grep -F "$LEGACY" || true)"
if [[ -n "$mount_refs" ]]; then
  echo "--- MOUNT_REFERENCES ---"
  printf '%s\n' "$mount_refs"
  mark MOUNT_REFERENCE_COUNT "$(printf '%s\n' "$mount_refs" | grep -c .)"
else
  mark MOUNT_REFERENCE_COUNT 0
fi

link_refs="$(find /home/azureuser/workspace -maxdepth 3 -type l -lname "${LEGACY}*" -print 2>/dev/null || true)"
if [[ -n "$link_refs" ]]; then
  echo "--- SYMLINK_REFERENCES ---"
  printf '%s\n' "$link_refs"
  mark SYMLINK_REFERENCE_COUNT "$(printf '%s\n' "$link_refs" | grep -c .)"
else
  mark SYMLINK_REFERENCE_COUNT 0
fi

# Current canonical production runtime must not resolve from V2.
canonical_refs="$(
  docker ps --format '{{.Names}}' | while read -r c; do
    docker inspect "$c" --format '{{.Name}} {{index .Config.Labels "com.docker.compose.project.working_dir"}} {{index .Config.Labels "com.docker.compose.project.config_files"}}' 2>/dev/null || true
  done | grep -F "$LEGACY" || true
)"
if [[ -n "$canonical_refs" ]]; then
  echo "--- COMPOSE_ORIGIN_REFERENCES ---"
  printf '%s\n' "$canonical_refs"
  mark COMPOSE_ORIGIN_REFERENCE_COUNT "$(printf '%s\n' "$canonical_refs" | grep -c .)"
else
  mark COMPOSE_ORIGIN_REFERENCE_COUNT 0
fi

if [[ "$refs" -eq 0 ]]; then
  echo "V2_RETIREMENT_READY=YES"
else
  echo "V2_RETIREMENT_READY=NO"
fi
echo "LEGACY_MUTATION=NONE"
REMOTE

echo
echo "===== 2. EXACT TESTFLIGHT SUBMISSION ====="
TMP="$(mktemp /tmp/desifaces-submit-exact.XXXXXX.sh)"
trap 'rm -f "$TMP"' EXIT
gh api "repos/$REPO/contents/$SUBMIT_SCRIPT?ref=$REF" --jq .content | base64 -d > "$TMP"
bash -n "$TMP"
exec bash "$TMP"
