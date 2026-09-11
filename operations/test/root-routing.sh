#!/usr/bin/env bash
set -euo pipefail

repository_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)
for command in nginx curl ss realpath; do command -v "$command" >/dev/null; done
for port in 18081 18082; do
  if ss -H -ltn | awk '{print $4}' | grep -Eq "(^|:)${port}$"; then
    echo "root routing test port $port is occupied" >&2
    exit 1
  fi
done
test_root=$(mktemp -d /tmp/bgmss-root-routing.XXXXXX)
started=false
cleanup() {
  local result=$?
  trap - EXIT
  if [[ "$started" == true ]]; then
    nginx -p "$test_root/" -c "$test_root/nginx.conf" -s quit || result=1
  fi
  [[ "$(realpath "$test_root")" == /tmp/bgmss-root-routing.* ]] || exit 1
  rm -rf -- "$test_root"
  exit "$result"
}
trap cleanup EXIT
mkdir -p "$test_root"/{logs,new/assets,old/assets,previous/assets}
chmod 0755 "$test_root" "$test_root"/{new,old,previous}
printf NEW_ROOT > "$test_root/new/index.html"
printf OLD_ROOT > "$test_root/old/index.html"
printf NEW_ASSET > "$test_root/new/assets/new.js"
printf OLD_ASSET > "$test_root/old/assets/old.js"
printf PREVIOUS_ASSET > "$test_root/previous/assets/previous.js"
printf OLD_ICON > "$test_root/old/bgmss.png"
sed \
  -e "s|@@BGMSS_FRONTEND_ROOT@@|$test_root/new|g" \
  -e "s|@@BGMSS_LEGACY_FRONTEND_ROOT@@|$test_root/old|g" \
  -e "s|@@BGMSS_PREVIOUS_FRONTEND_ROOT@@|$test_root/previous|g" \
  -e "s|@@BGMSS_NGINX_LOG_ROOT@@|$test_root/logs|g" \
  -e 's|@@BGMSS_API_PORT@@|18082|g' \
  "$repository_root/operations/nginx/bgmss.conf" > "$test_root/template.conf"
head -n -1 "$test_root/template.conf" > "$test_root/nginx.conf"
cat >> "$test_root/nginx.conf" <<'EOF'
  server {
    listen 127.0.0.1:18082;
    location / { return 200 "$request_method $uri"; }
  }
}
EOF
nginx -p "$test_root/" -c "$test_root/nginx.conf" -t
nginx -p "$test_root/" -c "$test_root/nginx.conf"
started=true
base=http://127.0.0.1:18081
expect_body() {
  [[ "$(curl --fail --silent --show-error --max-time 5 "$base$1")" == "$2" ]] || {
    echo "wrong body for $1" >&2; exit 1;
  }
}
expect_body / NEW_ROOT
expect_body /ranking NEW_ROOT
expect_body /co-star NEW_ROOT
expect_body /old/ OLD_ROOT
expect_body /assets/new.js NEW_ASSET
expect_body /assets/old.js OLD_ASSET
expect_body /old/assets/old.js OLD_ASSET
expect_body /bgmss.png OLD_ICON
expect_body /v2/assets/new.js NEW_ASSET
expect_body /v2/assets/previous.js PREVIOUS_ASSET
expect_body /api/v1/catalog 'GET /api/v1/catalog'
expect_body /v2/api/v1/catalog 'GET /api/v1/catalog'
[[ "$(curl -fsS --max-time 5 -X POST "$base/v2/api/v1/candidates")" == 'POST /api/v1/candidates' ]]
for route in /metrics /assets/missing.js /v2/assets/missing.js /old/missing.js; do
  [[ "$(curl -sS --max-time 5 -o /dev/null -w '%{http_code}' "$base$route")" == 404 ]]
done
for route in '/v2?user=lucay126' '/v2/?user=lucay126' '/v2/ranking?user=lucay126' '/v2/co-star?user=lucay126'; do
  target=${route#/v2}
  [[ "$target" == /* ]] || target="/$target"
  curl -sS --max-time 5 -D "$test_root/headers" -o /dev/null "$base$route"
  grep -q '^HTTP/1.1 308' "$test_root/headers"
  tr -d '\r' < "$test_root/headers" | grep -Fqx "Location: $base$target"
  tr -d '\r' < "$test_root/headers" | grep -Fqx 'Cache-Control: no-store'
done
echo 'root routing tests passed'
