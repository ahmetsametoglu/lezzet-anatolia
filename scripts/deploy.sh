#!/usr/bin/env bash
set -euo pipefail

# Test sunucusuna atomik dağıtım — hat WORKFLOW.md §3, sunucu tarafı docs/runbook/test-sunucusu.md.
# Çalışma ağacı değil HEAD gönderilir: ağaç üç şeridin ortak alanı, commit'lenmemiş iş sunucuya gitmemeli.

cd "$(git rev-parse --show-toplevel)"
if [ -f .env.deploy ]; then set -a; . ./.env.deploy; set +a; fi

: "${SSH_HOST:?SSH_HOST gerekli (.env.deploy)}"
SSH_USER="${SSH_USER:-root}"
APP_DIR="${APP_DIR:-/opt/lezzet}"
APP_USER="${APP_USER:-lezzet}"
KEEP_RELEASES="${KEEP_RELEASES:-3}"
PASS_FILE="${SSH_PASSWORD_FILE:-}"
PASS_FILE="${PASS_FILE/#\~/$HOME}"
TARGET="$SSH_USER@$SSH_HOST"

# Tek kimlik doğrulama: ana bağlantı bir kez açılır, sonraki her ssh onu kullanır; art arda parolalı
# girişlerde sunucu aralıklı ret veriyor.
CTL_DIR="$(mktemp -d)"
SSH_OPTS=(-o "ControlPath=$CTL_DIR/cm" -o ConnectTimeout=10)
cleanup() {
  ssh "${SSH_OPTS[@]}" -O exit "$TARGET" >/dev/null 2>&1 || true
  rm -rf "$CTL_DIR"
}
trap cleanup EXIT

# Parola dosyadan ya da çağrı anındaki SSH_PASSWORD'dan gelir; sshpass'a ortamla verilir, çünkü argv
# süreç listesinde görünür. İkisi de yoksa SSH anahtarı kullanılır.
PASS_OPTS=(-o PreferredAuthentications=password -o PubkeyAuthentication=no)
if [ -n "$PASS_FILE" ] && [ -f "$PASS_FILE" ]; then
  command -v sshpass >/dev/null || { echo "✗ sshpass kurulu değil (brew install sshpass)"; exit 1; }
  sshpass -f "$PASS_FILE" ssh "${SSH_OPTS[@]}" "${PASS_OPTS[@]}" -o ControlMaster=yes -o ControlPersist=30m -fN "$TARGET"
elif [ -n "${SSH_PASSWORD:-}" ]; then
  command -v sshpass >/dev/null || { echo "✗ sshpass kurulu değil (brew install sshpass)"; exit 1; }
  SSHPASS="$SSH_PASSWORD" sshpass -e ssh "${SSH_OPTS[@]}" "${PASS_OPTS[@]}" -o ControlMaster=yes -o ControlPersist=30m -fN "$TARGET"
else
  ssh "${SSH_OPTS[@]}" -o ControlMaster=yes -o ControlPersist=30m -fN "$TARGET"
fi

REV="$(git rev-parse --short HEAD)"
REL="$APP_DIR/releases/$(date -u +%Y%m%d-%H%M%S)-$REV"
git diff --quiet HEAD || echo "⚠ commit'lenmemiş değişiklikler gönderilmiyor; giden: HEAD ($REV)"

echo "→ HEAD ($REV) → $REL"
git archive --format=tar HEAD -- . ':(exclude)design' \
  | ssh "${SSH_OPTS[@]}" "$TARGET" "mkdir -p '$REL' && tar -x -C '$REL'"

ssh "${SSH_OPTS[@]}" "$TARGET" \
  "APP_DIR='$APP_DIR' APP_USER='$APP_USER' REL='$REL' KEEP_RELEASES='$KEEP_RELEASES' bash -s" <<'REMOTE'
set -euo pipefail
SHARED="$APP_DIR/shared"
ENV_FILE="$SHARED/app.env"
as_app() {
  runuser -u "$APP_USER" -- env HOME="/home/$APP_USER" PM2_HOME="/home/$APP_USER/.pm2" APP_DIR="$APP_DIR" "$@"
}
cd "$REL"

echo "→ env bağı"
[ -f "$ENV_FILE" ] || { echo "✗ $ENV_FILE yok"; exit 1; }
# Dört okuyucu (kök betikler, web, backend, mobile-api) kendi yolunu okur; hepsi tek dosyaya varır.
for f in .env apps/web/.env.local apps/backend/.env.local apps/mobile-api/.env.local; do
  ln -sfn "$ENV_FILE" "$f"
done
# Derleme önbelleği sürümler arasında ortak; `next build` klasörü silerken `cache`e dokunmaz.
mkdir -p apps/web/.next
ln -sfn "$SHARED/next-cache" apps/web/.next/cache
chown -R "$APP_USER:$APP_USER" "$REL"

# Derlemeden önce: sitemap derleme sırasında veritabanını okur, tablolar hazır olmalı. Yayına geçişten
# önce kaldığı için "şema kodu bekler" kuralı korunur.
echo "→ migration"
MANIFEST="$SHARED/migrations.sha256"
if [ -f "$MANIFEST" ] && ! sha256sum --quiet -c "$MANIFEST"; then
  echo "✗ uzakta uygulanmış bir migration değişmiş ya da silinmiş — test veritabanı sıfırlanmalı (runbook)"
  exit 1
fi
DB_URL="$(sed -n 's/^SUPABASE_DB_URL=//p' "$ENV_FILE" | tail -n 1)"
DB_URL="${DB_URL#[\"\']}"
DB_URL="${DB_URL%[\"\']}"
[ -n "$DB_URL" ] || { echo "✗ SUPABASE_DB_URL boş: $ENV_FILE"; exit 1; }
supabase db push --db-url "$DB_URL" --yes
sha256sum supabase/migrations/*.sql > "$MANIFEST"

echo "→ bağımlılıklar"
as_app pnpm install --frozen-lockfile \
  --filter lezzet-anatolie --filter '@lezzet/web...' --filter '@lezzet/backend...' --filter '@lezzet/mobile-api...'

echo "→ tip denetimi + derleme"
as_app pnpm --filter @lezzet/backend --filter @lezzet/mobile-api run typecheck
as_app env NEXT_DIST_DIR=.next pnpm --filter @lezzet/web run build

echo "→ yayına alma"
ln -sfn "$REL" "$APP_DIR/current.new"
mv -Tf "$APP_DIR/current.new" "$APP_DIR/current"
as_app pm2 startOrReload "$APP_DIR/current/ecosystem.config.cjs" --update-env
as_app pm2 save

echo "→ sağlık"
for url in http://127.0.0.1:3000/ http://127.0.0.1:8787/health http://127.0.0.1:3002/health; do
  curl -fsS -o /dev/null --retry 20 --retry-connrefused --retry-delay 1 "$url" \
    || { echo "✗ $url cevap vermiyor — geri dönüş için runbook"; exit 1; }
done

echo "→ eski sürümler (son $KEEP_RELEASES kalır)"
ls -1d "$APP_DIR"/releases/*/ | sort -r | tail -n +"$((KEEP_RELEASES + 1))" | xargs -r rm -rf
echo "✓ yayında: $REL"
REMOTE
