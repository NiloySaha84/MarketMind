#!/usr/bin/env bash
set -euo pipefail

ENV_FILE="${1:-.env.production.local}"
SECRETS_DIR="${2:-.swarm-secrets}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE — copy from .env.production.local.example and fill in values." >&2
  exit 1
fi

mkdir -p "$SECRETS_DIR"

get_var() {
  local key="$1"
  local line val
  line=$(grep -E "^${key}=" "$ENV_FILE" | tail -1 || true)
  if [[ -z "$line" ]]; then
    return 0
  fi
  val="${line#*=}"
  val="${val%\"}"; val="${val#\"}"
  val="${val%\'}"; val="${val#\'}"
  printf '%s' "$val"
}

write_secret() {
  local env_key="$1"
  local file_name="$2"
  get_var "$env_key" > "${SECRETS_DIR}/${file_name}"
  chmod 600 "${SECRETS_DIR}/${file_name}"
}

write_secret DB_PASSWORD db_password
write_secret REDIS_PASSWORD redis_password
write_secret JWT_SECRET jwt_secret
write_secret OPENAI_API_KEY openai_api_key
write_secret TAVILY_API_KEY tavily_api_key
write_secret ARCJET_KEY arcjet_key
write_secret PGADMIN_DEFAULT_EMAIL pgadmin_email
write_secret PGADMIN_DEFAULT_PASSWORD pgadmin_password

echo "Prepared swarm secrets in ${SECRETS_DIR}/"
