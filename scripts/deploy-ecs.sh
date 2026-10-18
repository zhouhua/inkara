#!/usr/bin/env bash
# Upload .deploy/standalone to ECS and restart the inkara service.
# Does not change git config. Requires ECS_HOST, ECS_USER, ECS_SSH_KEY.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

: "${ECS_HOST:?ECS_HOST is required}"
: "${ECS_USER:?ECS_USER is required}"
: "${ECS_SSH_KEY:?ECS_SSH_KEY is required}"

port="${ECS_PORT:-22}"
app_dir="${ECS_APP_DIR:-/opt/inkara}"
env_file="${ECS_ENV_FILE:-/etc/inkara.env}"
service="${ECS_SERVICE:-inkara}"

if [[ ! -f .deploy/standalone/server.js ]]; then
  echo "missing .deploy/standalone — run scripts/pack-standalone.sh first" >&2
  exit 1
fi

key="$(mktemp)"
trap 'rm -f "$key"' EXIT
printf '%s' "$ECS_SSH_KEY" | sed 's/\\n/\n/g' >"$key"
printf '\n' >>"$key"
chmod 600 "$key"

ssh_base=(ssh -i "$key" -p "$port" -o StrictHostKeyChecking=accept-new)
target="${ECS_USER}@${ECS_HOST}"
stage="${app_dir}.next"
prev="${app_dir}.prev"

"${ssh_base[@]}" "$target" "rm -rf '$stage' && mkdir -p '$stage'"

tar -C .deploy/standalone -czf - . | "${ssh_base[@]}" "$target" "tar -xzf - -C '$stage'"

"${ssh_base[@]}" "$target" "APP_DIR='$app_dir' STAGE='$stage' PREV='$prev' ENV_FILE='$env_file' SERVICE='$service' bash -s" <<'EOF'
set -euo pipefail
export PATH="/usr/local/bin:${PATH}"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
  (cd "$STAGE" && node apply-mysql-migrations.mjs)
else
  echo "no $ENV_FILE — skip migrations"
fi

if [[ -d "$PREV" ]]; then
  rm -rf "$PREV"
fi
if [[ -d "$APP_DIR" ]]; then
  mv "$APP_DIR" "$PREV"
fi
mv "$STAGE" "$APP_DIR"

unit="/etc/systemd/system/${SERVICE}.service"
if [[ ! -f "$unit" ]]; then
  node_bin="$(command -v node)"
  sudo -n tee "$unit" >/dev/null <<UNIT
[Unit]
Description=inkara
After=network.target

[Service]
Type=simple
WorkingDirectory=${APP_DIR}
EnvironmentFile=${ENV_FILE}
Environment=NODE_ENV=production
Environment=HOSTNAME=0.0.0.0
Environment=PORT=3000
ExecStart=${node_bin} server.js
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT
  sudo -n systemctl daemon-reload
  sudo -n systemctl enable "$SERVICE"
fi

if ! sudo -n systemctl restart "$SERVICE"; then
  echo "restart failed, rolling back" >&2
  rm -rf "$APP_DIR"
  if [[ -d "$PREV" ]]; then
    mv "$PREV" "$APP_DIR"
  fi
  sudo -n systemctl restart "$SERVICE" || true
  exit 1
fi
sudo -n systemctl is-active "$SERVICE"
EOF
