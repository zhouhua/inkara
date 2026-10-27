#!/usr/bin/env bash
# Upload .deploy/admin-standalone to ECS and restart the admin service.
# Shares the product env file (/etc/inkara.env); overrides AUTH_URL for the admin host.
# Requires ECS_HOST, ECS_USER, ECS_SSH_KEY (same as product deploy).
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

: "${ECS_HOST:?ECS_HOST is required}"
: "${ECS_USER:?ECS_USER is required}"
: "${ECS_SSH_KEY:?ECS_SSH_KEY is required}"

port="${ECS_PORT:-22}"
app_dir="${ECS_ADMIN_APP_DIR:-/opt/inkara-admin}"
# Same env file as the product app (shared DB / AUTH_SECRET / ADMIN_EMAILS).
env_file="${ECS_ENV_FILE:-/etc/inkara.env}"
service="${ECS_ADMIN_SERVICE:-inkara-admin}"
app_port="${ECS_ADMIN_APP_PORT:-3001}"
public_url="${ECS_ADMIN_PUBLIC_URL:-https://admin.inkara.zhouhua.site}"
public_url="${public_url%/}"

if [[ ! -f .deploy/admin-standalone/run.sh ]]; then
  echo "missing .deploy/admin-standalone — run scripts/pack-standalone-admin.sh first" >&2
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

tar -C .deploy/admin-standalone -czf - . | "${ssh_base[@]}" "$target" "tar -xzf - -C '$stage'"

# shellcheck disable=SC2087
"${ssh_base[@]}" "$target" \
  "APP_DIR='$app_dir' STAGE='$stage' PREV='$prev' ENV_FILE='$env_file' SERVICE='$service' APP_PORT='$app_port' PUBLIC_URL='$public_url' bash -s" <<'EOF'
set -euo pipefail
export PATH="/usr/local/bin:${PATH}"

if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$ENV_FILE"
  set +a
  (cd "$STAGE" && NODE_PATH="$STAGE/apps/admin/node_modules:$STAGE/node_modules${NODE_PATH:+:$NODE_PATH}" node apply-mysql-migrations.mjs)
else
  echo "no $ENV_FILE — skip migrations (expected shared product env at $ENV_FILE)" >&2
fi

if [[ -d "$PREV" ]]; then
  rm -rf "$PREV"
fi
if [[ -d "$APP_DIR" ]]; then
  mv "$APP_DIR" "$PREV"
fi
mv "$STAGE" "$APP_DIR"

unit="/etc/systemd/system/${SERVICE}.service"
drop_in_dir="/etc/systemd/system/${SERVICE}.service.d"
node_bin="$(command -v node)"

if [[ ! -f "$unit" ]]; then
  sudo -n tee "$unit" >/dev/null <<UNIT
[Unit]
Description=inkara-admin
After=network.target

[Service]
Type=simple
WorkingDirectory=${APP_DIR}
EnvironmentFile=${ENV_FILE}
Environment=NODE_ENV=production
Environment=HOSTNAME=0.0.0.0
Environment=PORT=${APP_PORT}
ExecStart=/bin/bash ${APP_DIR}/run.sh
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT
fi

# Always refresh overrides so AUTH_URL points at the admin public host
# (shared env still has product NEXT_PUBLIC_APP_URL).
sudo -n mkdir -p "$drop_in_dir"
sudo -n tee "$drop_in_dir/override.conf" >/dev/null <<UNIT
[Service]
Environment=PORT=${APP_PORT}
Environment=AUTH_URL=${PUBLIC_URL}
Environment=NEXTAUTH_URL=${PUBLIC_URL}
Environment=AUTH_TRUST_HOST=true
UNIT

# Nginx (or Caddy-less) vhost → local admin port, if nginx is installed.
if command -v nginx >/dev/null 2>&1; then
  host="${PUBLIC_URL#https://}"
  host="${host#http://}"
  host="${host%%/*}"
  conf="/etc/nginx/sites-available/inkara-admin.conf"
  sudo -n tee "$conf" >/dev/null <<NGINX
server {
    listen 80;
    listen [::]:80;
    server_name ${host};

    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
NGINX
  if [[ -d /etc/nginx/sites-enabled ]]; then
    sudo -n ln -sfn "$conf" /etc/nginx/sites-enabled/inkara-admin.conf
  fi
  if sudo -n nginx -t; then
    sudo -n systemctl reload nginx || sudo -n nginx -s reload || true
  else
    echo "nginx -t failed; left $conf in place" >&2
  fi
fi

sudo -n systemctl daemon-reload
sudo -n systemctl enable "$SERVICE" >/dev/null 2>&1 || true

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
echo "admin public URL: $PUBLIC_URL (AUTH_URL override; env file: $ENV_FILE)"
EOF
