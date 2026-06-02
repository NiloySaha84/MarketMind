#!/usr/bin/env bash
set -euo pipefail

TARGET="${TARGET:-https://marketmind.name}"
SHARD="${SHARD:-0}"
RUN_ID="${RUN_ID:-local}"
REPORT="${REPORT:-loadtests/report-shard-${SHARD}.json}"

EMAIL="loadtest-${RUN_ID}-shard-${SHARD}@loadtest.invalid"
PASSWORD="LoadTest-${RUN_ID}-${SHARD}!"

echo "Shard ${SHARD} -> ${TARGET} (user: ${EMAIL})"

SIGNUP_BODY=$(curl -sf -X POST "${TARGET}/api/v1/auth/signup" \
  -H "Content-Type: application/json" \
  -d "{\"name\":\"Load Test ${SHARD}\",\"email\":\"${EMAIL}\",\"password\":\"${PASSWORD}\"}") || {
  echo "Signup failed for shard ${SHARD}" >&2
  exit 1
}

TOKEN=$(node -e "const d=JSON.parse(process.argv[1]); process.stdout.write(d?.data?.token||'')" "$SIGNUP_BODY")

if [[ -z "$TOKEN" ]]; then
  echo "No token returned for shard ${SHARD}" >&2
  exit 1
fi

export TARGET LOADTEST_TOKEN="$TOKEN"

artillery run loadtests/stress-test.yml --output "$REPORT"

echo "Shard ${SHARD} complete -> ${REPORT}"
