# Runbook — test sunucusu

> **Ne zaman okunur:** test sunucusunu sıfırdan kurarken, env değerlerini değiştirirken, dağıtım
> düştüğünde, bir sürümü geri alırken ya da test veritabanını sıfırlarken. Hattın kuralları
> `docs/architecture/WORKFLOW.md §3`'te; burada komutlar durur.
>
> Sunucu adresi ve erişim bilgisi repoda değil, `.env.deploy`'dadır (git'e girmez). Sunucudaki env
> dosyası okunmaz — değerleri sahibi düzenler.

## Düzen

| Ne | Nerede |
|---|---|
| Sürümler | `/opt/lezzet/releases/<zaman>-<commit>` — son 3'ü kalır |
| Yayındaki sürüm | `/opt/lezzet/current` → bir sürüm klasörü |
| Env | `/opt/lezzet/shared/app.env` — TEK dosya; sahibi `lezzet`, izin 600. Her sürümde dört yol (kök `.env`, `apps/{web,backend,mobile-api}/.env.local`) buna bağlanır |
| Derleme önbelleği | `/opt/lezzet/shared/next-cache` (her sürümün `apps/web/.next/cache` bağı) |
| Uygulanmış migration özeti | `/opt/lezzet/shared/migrations.sha256` |
| Süreçler | PM2, `lezzet` adına (`pm2-lezzet` servisi): web :3000 · backend :8787 · mobile-api :3002 |
| Önde | Caddy — `/etc/caddy/Caddyfile` ← repodaki `Caddyfile.example`; sertifika Let's Encrypt |

## Sunucuyu sıfırdan kurmak (bir kez)

Ubuntu 26.04, root olarak. Sürümler yereldekiyle aynı tutulur (Node 22.18.0, pnpm 9.15.9, Supabase CLI 2.72.7).

```bash
# 1 · Güncellemeler — mevcut ayar dosyaları (SSH dahil) korunur
apt-get update && DEBIAN_FRONTEND=noninteractive apt-get -y \
  -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold upgrade

# 2 · Node (resmî paket, SHA256 doğrulamalı) + pnpm + PM2
cd /tmp && curl -fsSLO https://nodejs.org/dist/v22.18.0/node-v22.18.0-linux-x64.tar.xz \
        && curl -fsSLO https://nodejs.org/dist/v22.18.0/SHASUMS256.txt
grep " node-v22.18.0-linux-x64.tar.xz$" SHASUMS256.txt | sha256sum -c -
tar -xJf node-v22.18.0-linux-x64.tar.xz -C /usr/local --strip-components=1 --no-same-owner \
  --exclude='*.md' --exclude=LICENSE
corepack enable && corepack prepare pnpm@9.15.9 --activate
npm install -g pm2

# 3 · Caddy (resmî depo)
curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/gpg.key \
  | gpg --batch --yes --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt -o /etc/apt/sources.list.d/caddy-stable.list
apt-get update && apt-get install -y caddy

# 4 · Supabase CLI — migration sunucudan gönderilir
curl -fsSLo /tmp/supabase.deb \
  https://github.com/supabase/cli/releases/download/v2.72.7/supabase_2.72.7_linux_amd64.deb
dpkg -i /tmp/supabase.deb

# 5 · Girişsiz süreç kullanıcısı, klasörler, açılışta PM2
useradd --system --create-home --home-dir /home/lezzet --shell /usr/sbin/nologin lezzet
mkdir -p /opt/lezzet/releases /opt/lezzet/shared/next-cache
chown -R lezzet:lezzet /opt/lezzet
runuser -u lezzet -- env HOME=/home/lezzet corepack prepare pnpm@9.15.9 --activate
runuser -u lezzet -- env HOME=/home/lezzet PM2_HOME=/home/lezzet/.pm2 pm2 install pm2-logrotate
pm2 startup systemd -u lezzet --hp /home/lezzet
```

Güncelleme `/var/run/reboot-required` bıraktıysa sonunda `systemctl reboot`; açılışta `pm2-lezzet`
servisinin `active` olduğu görülür.

**Neden ayrı kullanıcı:** uygulamada bir açık bulunursa saldırgan o sürecin yetkisini alır; süreç
`lezzet` ile koşunca zarar uygulamanın kendi dosyalarıyla sınırlı kalır. Giriş root ile yapılır; bu
kullanıcının parolası ve kabuğu yoktur.

## Dışarıdaki ayarlar

- **Hetzner duvarı:** 22/TCP yalnız işletmecinin IPv4'ü; 80 ve 443 herkese; başka port yok. SSH IPv4
  adresiyle yapılır — IPv6'dan gelen bağlantı duvarda düşer.
- **Cloudflare DNS:** `test` için A ve AAAA kaydı, **DNS only** (gri bulut); sertifikayı Caddy alır.
- **Supabase (AB bölgesi):** Authentication → URL Configuration — Site URL
  `https://test.lezzetanatolie.com`, Redirect URLs `https://test.lezzetanatolie.com/**` ve uygulama
  şeması `lezzetanatolie://**`. Yereldeki karşılığı `supabase/config.toml` `[auth]`; uzak projeye
  kendiliğinden gitmez.

## Caddy

```bash
# yerelden
ssh root@<sunucu> 'cat > /etc/caddy/Caddyfile.new' < Caddyfile.example
# sunucuda
caddy validate --config /etc/caddy/Caddyfile.new --adapter caddyfile \
  && mv /etc/caddy/Caddyfile.new /etc/caddy/Caddyfile && systemctl reload caddy
```

## Env dosyası

Tek dosya: `/opt/lezzet/shared/app.env`. Anahtarları dört `.env.example`'ın birleşimidir; yeni bir anahtar
bir şablona eklenince buraya da eklenir. Dağıtım env dosyası TAŞIMAZ; her sürümün dört env yolu bu
dosyaya bağlanır, dosya yoksa dağıtım durur.

Düzenleme sunucuda, root olarak (`nano /opt/lezzet/shared/app.env`); var olan dosyayı düzenlemek sahibini
ve iznini korur. Dosyayı yeniden yaratan bir araç kullanıldıysa: `chown lezzet:lezzet
/opt/lezzet/shared/app.env && chmod 600 /opt/lezzet/shared/app.env`. Değer bir sonraki PM2 yeniden
yüklemesinde okunur; `NEXT_PUBLIC_*` değerleri derlemeye gömüldüğü için onlarda yeniden dağıtım gerekir.

Yereldekinden farklı olması gerekenler:

- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` → test projesi
- `NEXT_PUBLIC_SITE_URL` → `https://test.lezzetanatolie.com`; `SITE_HOST` → `test.lezzetanatolie.com`
- `SUPABASE_DB_URL` — migration gönderimi için veritabanı bağlantı adresi, yüzde kodlanmış
- boş: `CLOUDFLARE_TUNNEL_TOKEN`, `OTP_TEST_CODE`, `DEV_LOGIN_ENABLED`
- Portlar ve `NEXT_DIST_DIR` `ecosystem.config.cjs`'ten gelir; dosyadaki değerleri kullanılmaz.

## Dağıtım

```bash
cp .env.deploy.example .env.deploy   # SSH_HOST, SSH_PASSWORD_FILE
bash scripts/deploy.sh
```

Yalnız HEAD gider; sıra WORKFLOW §3'te. Düşen adımda durur, yayındaki sürüme dokunmaz.

## Sürümü geri almak

```bash
# sunucuda, root olarak — önceki sürüm klasörünü seç
ls -1d /opt/lezzet/releases/*/
ln -sfn /opt/lezzet/releases/<önceki> /opt/lezzet/current.new && mv -Tf /opt/lezzet/current.new /opt/lezzet/current
runuser -u lezzet -- env HOME=/home/lezzet PM2_HOME=/home/lezzet/.pm2 APP_DIR=/opt/lezzet \
  pm2 startOrReload /opt/lezzet/current/ecosystem.config.cjs --update-env
```

Kod geri döner, şema dönmez.

## Test veritabanını sıfırlamak

Uzakta uygulanmış bir migration dosyası düzenlendiyse dağıtım "migration değişmiş" diye durur (WORKFLOW §2).

1. Uzak veritabanını sıfırla — yıkıcı; kararı ve işlemi veritabanının sahibi yapar.
2. Sunucuda `rm /opt/lezzet/shared/migrations.sha256`.
3. `bash scripts/deploy.sh` — migration'lar baştan uygulanır.
4. Temel veri, sunucuda:
   `cd /opt/lezzet/current && runuser -u lezzet -- env HOME=/home/lezzet SEED_ALLOW_REMOTE=true pnpm db:seed:base`
