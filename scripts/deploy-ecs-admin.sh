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
# One-level subdomain under the apex so Cloudflare Universal SSL covers it
# (admin.inkara.zhouhua.site is multi-level and has no free edge cert).
public_url="${ECS_ADMIN_PUBLIC_URL:-https://inkara-admin.zhouhua.site}"
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
# Always rewrite unit: shared /etc/inkara.env sets PORT=3000, and on this
# host EnvironmentFile wins over Environment= — so force PORT/AUTH via env(1).
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
Environment=AUTH_TRUST_HOST=true
ExecStart=/usr/bin/env PORT=${APP_PORT} AUTH_URL=${PUBLIC_URL} NEXTAUTH_URL=${PUBLIC_URL} /bin/bash ${APP_DIR}/run.sh
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
UNIT
rm -rf "/etc/systemd/system/${SERVICE}.service.d"
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

# CentOS/RHEL nginx uses conf.d (no sites-available). Match product proxy style.
if command -v nginx >/dev/null 2>&1 && [[ -d /etc/nginx/conf.d ]]; then
  host="${PUBLIC_URL#https://}"
  host="${host#http://}"
  host="${host%%/*}"
  conf="/etc/nginx/conf.d/inkara-admin.conf"
  ssl_block=""
  if [[ -f /etc/nginx/inkara.crt && -f /etc/nginx/inkara.key ]]; then
    # Reuse product origin cert; Cloudflare Full (not Strict) tolerates CN mismatch.
    ssl_block=$(cat <<SSL
server {
  listen 443 ssl;
  listen [::]:443 ssl;
  server_name ${host};
  ssl_certificate /etc/nginx/inkara.crt;
  ssl_certificate_key /etc/nginx/inkara.key;
  client_max_body_size 20m;

  location / {
    proxy_pass http://127.0.0.1:${APP_PORT};
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto https;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "";
    proxy_buffering off;
    proxy_read_timeout 300s;
  }
}
SSL
)
  fi
  sudo -n tee "$conf" >/dev/null <<NGINX
server {
  listen 80;
  listen [::]:80;
  server_name ${host};
  client_max_body_size 20m;

  location / {
    proxy_pass http://127.0.0.1:${APP_PORT};
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header Upgrade \$http_upgrade;
    proxy_set_header Connection "";
    proxy_buffering off;
    proxy_read_timeout 300s;
  }
}
${ssl_block}
NGINX
  if sudo -n nginx -t; then
    sudo -n systemctl reload nginx || sudo -n nginx -s reload || true
  else
    echo "nginx -t failed; left $conf in place (admin service is already up)" >&2
  fi
fi

echo "admin public URL: $PUBLIC_URL (AUTH_URL override; env file: $ENV_FILE)"
EOF
