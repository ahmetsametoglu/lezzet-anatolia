# 18 — Operasyon ve Güvenlik

## ÖZEL STATÜ — bu modül önce konuşulur, sonra kodlanır

> Bu modülün **tamamı**, kod yazılmadan önce kullanıcıyla **karar oturumu** olarak ele alınır (STACK §13 statü notu). Her başlıkta: **konuşulacak seçenekler artı/eksileriyle masaya konur, net karar verilir, sonra uygulanır.** Aşağıdakiler görev değil, o oturumun gündemidir; her biri bir "önerilen varsayılan" taşır ama bağlayıcı değildir. Bazı başlıklar (VPS/CI) erken de yapılabilir — nota bakılır.

## Okunacaklar

- `STACK.md §13` (operasyon ve güvenlik ilkeleri — taslak), `§2-3` (yığın, iskelet)
- `WORKFLOW.md` (migration, deploy, git disiplini)

## Bağımlılık

Fiilen tüm modüllerin ürettiği yüzeyler; ama **VPS kurulumu, CI ve staging erken kurulabilir** (00'dan hemen sonra bile) — geliştirme boyunca değer verir. Güvenlik sertleştirmesi (RLS kapsamı, webhook) ilgili modüllerde (02/07/15) kurulmuş olanların gözden geçirilmesidir.

## Karar oturumu gündemi

- [ ] (18.1) **Veri erişim modeli (RLS kapsamı):** service-role + guard tek kat mı, + RLS ikinci hat mı; RLS'nin ilk kapsadığı tablolar (müşteri kendi satırı, kurye kendi teslimatı). *Öneri:* çift kat, RLS temel tablolarda ikinci savunma.
- [ ] (18.2) **Migration aracı:** Supabase CLI vs kendi runner. *Öneri:* CLI ile başla, yeterli gelmezse runner.
- [ ] (18.3) **Webhook güvenliği gözden geçirme:** 07 (Stripe) ve 15 (360dialog) idempotency + imza doğrulaması yerinde mi; `WebhookEvent` tablosu tüm sağlayıcıları kapsıyor mu. *Öneri:* tek desen, her sağlayıcı aynı.
- [ ] (18.4) **Yedekleme / felaki kurtarma:** günlük yedek/PITR (Supabase planı) + haftalık off-site `pg_dump` + Storage senkronu + yılda bir **restore provası**. *Öneri:* provası yapılmamış yedeğe güvenilmez — provayı takvime bağla.
- [~] (18.5) **Gözlemleme: log · hata izleme · sistem sağlığı** — **KARAR VERİLDİ (29.07), tasarım yazıldı:** [`architecture/OBSERVABILITY.md`](../architecture/OBSERVABILITY.md) · tablolar [`data-model/operasyon.md`](../architecture/data-model/operasyon.md) · ekran [`design/pages/admin-sistem.md`](../../design/pages/admin-sistem.md)
  - *Bitti:* üretimde bir hata olduğunda nerede olduğu tek ekrandan görülüyor; disk/bellek/süreç durumu izleniyor; hiçbir kayıt süresiz büyümüyor
  - **Neden gerekti (ölçüldü 29.07):** loglama diye bir şey YOKTU. Kodda 17 çıplak `console.*`, her biri farklı biçimde; logger, seviye, istek kimliği, PII disiplini, saklama süresi, bakılacak ekran — hiçbiri yok. Yani üretimde bir şey ters gittiğinde elimizde hiçbir şey olmayacaktı. Dokümanda konu `STACK`'te **tek satır niyet** olarak duruyordu.
  - **Alan izleriyle karıştırılmamalı:** `order_status_log`, `job_run`, `webhook_event`, `temperature_log`, `account_movement` sağlam duruyor ama **iş kaydı**dır — "sipariş ne zaman teslim oldu"yu yanıtlar, "checkout dün gece neden 500 döndü"yü yanıtlamaz (`OBSERVABILITY §1`). Bu görev ikinciyi kapatıyor.
  - **Kullanıcı kararları (29.07):** (1) **kademeli geçiş YOK** — üç katman birlikte kurulur; yalnız logger yazmak, hatayı görecek ekranı olmayan bir sistem bırakırdı. (2) **E-posta/itme alarmı YOK** — izleme çekme modeliyle çalışır, ekran alarmın yerini tutar (`OBSERVABILITY §4.1`). Bu yüzden operasyon panelindeki **çözülmemiş hata sayacı zorunlu**, süs değil. (3) Yapı referans projeden alınır; sapmalar gerekçeleriyle yazılı (`§4`).
  - **Kapsam (sıra bağlayıcı, kademe değil — hepsi bu iş):**
    1. `pino` logger (web + backend) + `LOG_LEVEL` + 17 `console.*` çağrısının dönüştürülmesi
    2. Backend `reqId` ara katmanı (method/path/status/süre; 5xx→error, 4xx→warn)
    3. `error_log` tablosu + `capture_error` RPC (migration) + Zod + servis
    4. `captureError` köprüsü (önce stdout, sonra DB, asla fırlatmaz) + Next `instrumentation.ts` `onRequestError` + Hono `onError` + cron kabuğuna bağlanması
    5. `system_health_snapshot` tablosu + toplama işi (`*/2 dk`) + eşiklerden durum türetimi
    6. İki süpürme işi mevcut `runJob` kabuğunda: hata 90 gün (yalnız çözülmüşler), sağlık 14 gün
    7. `/operations/system` ekranı (tek sayfa, iki panel) + panelde sayaç/rozet
    8. `pm2-logrotate` — dağıtım işinin parçası, 18.9 ile birlikte
  - **Kapsam dışı (bilinçli):** dış izleme servisi (Sentry) · ham log akışını ekrana taşımak · zaman serisi veritabanı · ekrandan ayarlanabilir eşik · referansın `mcp_call_log`/`chromeCount` metrikleri (oradaki MCP kurulumuna özgü, bizde karşılığı yok).
  - **Durum (29.07):** dokümantasyon + veri modeli + ekran envanteri yazıldı. Yol üstünde kapanan boşluk: `job_run` bugüne dek veri modelinde HİÇ dokümante edilmemişti — artık `data-model/operasyon.md`'de ve `docs:check` kapsamında.
  - **Durum (30.07 — ARKA UÇ BİTTİ, ekran kaldı):** 1–6. adımlar yazıldı ve koştu. Kalan: **7. adım (ekran)** — görsel karar (`.dc.html`) bekliyor, ondan önce kodlanmaz (`CLAUDE.md §3`); **8. adım (`pm2-logrotate`)** dağıtım işinin parçası (18.9).
    - **`packages/observability`** (yeni paket): `logger` (pino — üretimde JSON stdout, geliştirmede okunur) + `captureError` + `SOURCES`. TEK paket: referansta web ve backend kendi yapılandırmasını kuruyor, burada duplication yasak. **Alt yol dışa açımı** (`@lezzet/observability/logger`) yaprak paketler için: kök giriş `captureError` üzerinden `@lezzet/database`'e bağlanıyor, `packages/email`'in veritabanıyla işi yok.
    - **`0039_error_log.sql`** + `capture_error` RPC (atomik ekle-ya-da-say, `service_role`-only) · **`0040_system_health.sql`**. İkisi de YENİ dosya → `supabase migration up` yetti, `db:reset` gerekmedi.
    - **Eşik hesabı motorda** (`domain-core/observability/health-status`), toplama işi backend'de. Ayrım STACK §4: "disk %84 uyarı mı" saf yüklemdir ve testlenir; `df`/`pm2` okumak I/O'dur. 20 birim testi.
    - **Kancalar:** Next `instrumentation.ts` → `onRequestError` (RSC/route/action; `NEXT_*` digest'li redirect/notFound atlanır) · Hono `app.onError` + `reqId` ara katmanı · `runJob` kabuğu artık `job_run` İZİNE ek olarak `error_log` KAYDI da yazıyor ("koştu mu" ile "neden koşamadı" ayrı sorular).
    - **`lib/error.ts` merkezi funnel'ı bağlandı** — orada duran `BEKLEYEN(18.5)` kapandı. Bütün server action hataları artık stdout + `error_log`'a düşüyor; doğrulama hataları da yazılıyor ve listeyi boğmuyor çünkü aynı parmak izi tek satırda gruplanıyor. Dosyaya `server-only` eklendi: artık sunucu paketleri içeriyor ve sınır derleme zamanında zorlanıyor (`ActionResult` tipi etkilenmez).
    - **İki süpürme işi** tek cron'da (`purge_observability`, gece 03:20): çözülmüş hata 90 gün, sağlık görüntüsü 14 gün. **Çözülmemiş hata süpürülmez.**
    - **`console.*` dönüşümü:** sunucu tarafındaki 8 çağrı logger'a/`captureError`'a geçti. Dört tanesi BİLİNÇLİ kaldı — `global-error.tsx`, iki `error.tsx`, `payment-element.tsx` hepsi `'use client'` ve `pino` node-only'dir (`OBSERVABILITY §2`).
    - **Test bir hata yakaladı:** parmak izi normalizasyonu `\b\d{4,}\b` kullanıyordu ve *"timeout after 30000ms"* gibi **birime yapışık** sayıları sabitlemiyordu (rakam-harf arasında kelime sınırı oluşmaz) — her zaman aşımı kendi satırını açardı, yani gruplama en çok gerektiği yerde çalışmıyordu. Son sınır kaldırıldı.
    - **RLS politikası YAZILMADI** (bilinçli): tablolar deny-by-default, `job_run`/`webhook_event` deseni. Referansın admin `SELECT` politikası alınmadı — oradaki `is_admin()` yardımcısının burada karşılığı yok ve RLS kapsamı 18.1'de karara bağlanacak. Okuma ekranın `requireAdmin` kapısından geçecek.
    - Doğrulama: 37 yeni test (20 birim eşik + 13 hata kaydı + 4 sağlık servisi). Kapılar yeşil: typecheck · lint · knip · boundaries (0 hata) · docs:check.
  - **Durum (30.07 — kullanım denetimi, `OBSERVABILITY §6c`):** "sistem kuruldu ama alışkanlık kuruldu mu" diye ölçüldü; üç düzeltme çıktı.
    - **Fail-open ölçüm (en ağır bulgu):** `df` düşünce disk sıfıra, `pm2` okunamayınca boş diziye düşüyordu → eşiklerden `ok`. **Bozuk ölçüm sağlıklı sistem gibi okunuyordu** ve bu davranışı doğrulayan bir test bile vardı (hatayı sertifikalamak — aynı hatayı aday-kaydırma testinde de yapmıştım). İkisi de `null` döner oldu, **ölçüm boşluğu kendi başına `warn` üretiyor**, yanlış test değiştirildi + 3 yeni test.
    - **`no-console` sertleşti:** `warn` + `{allow:['warn','error']}` idi — 17 çıplak çağrı tam bu boşluktan birikmişti. Artık `error`; muafiyetler kökte tek tek yazılı (istemci hata sınırları, `payment-element`, `instrumentation.ts`, `scripts/`).
    - **Kural `CLAUDE.md §1`'e girdi** (4 madde): `console` yasak · sessiz `catch` yok · ölçülemeyen değer sıfır değildir · log'a kimlik yazılır, içerik yazılmaz. Öncesinde yalnız doküman haritasında bir işaret vardı; bir kural okunması ihtimaline bırakılamaz.
    - **İzsiz `catch` taraması:** 100 blok, 63'ü iz bırakıyor (neredeyse hepsi `lib/error.ts` funnel'ı sayesinde). Kalan 37'nin çoğu gerekçeli; **4 gerçek boşluk kapatıldı** — sipariş maili, talep maili (dönen `{status:'error'}` nesnesini okuyan yoktu), `order.create` telafi silmesi (düşerse kalemsiz sipariş kalıyordu, kimse bilmiyordu → hata mesajına yazılıyor; kalıcı çare 07.4 RPC borcu), sağlık uygulama metrikleri.
- [ ] (18.6) **Cron disiplini doğrulama:** `apps/backend` tek instance (fork); her iş taramalı-idempotent; kritik işler `last_run` + gecikince alarm. (TTL süpürme 06'da, feedback daveti 17'de bu disiplinle yazıldı — kontrol.)
- [ ] (18.7) **Deploy atomikliği:** ayrı dizine derle → symlink swap → `pm2 reload`; derleme düşük trafik saatinde. *Öneri:* symlink deseni + reload.
- [ ] (18.8) **CI + staging:** GitHub Actions (typecheck+lint+birim test her push); entegrasyon testleri lokal Supabase'de (özellikle **paralel rezervasyon yarışı** + para RPC'leri); staging = ikinci ücretsiz Supabase projesi + ikinci PM2 app; migration provası önce staging. *Öneri:* erken kur — geliştirmeyi hızlandırır.
- [ ] (18.9) **VPS kurulumu:** Caddy (TLS + reverse proxy), PM2 (web + backend), env yönetimi; Caddyfile/PM2 ecosystem repo'da. *Öneri:* erken kur, canlı ortamı baştan gerçekçi tut.
- [ ] (18.10) **Paket sınırı aracı son kontrolü:** `apps/*` sipariş/stok/para yazımını yalnız domain-core üzerinden yapıyor; database servislerini doğrudan import edemiyor (00'da kurulan kural üretimde sağlam mı).

## Not

Bu modülün çıktısı çoğunlukla **konfigürasyon ve karar kaydı**dır, ürün kodu değil. Her karar alındıkça ilgili yer (`STACK.md §13` taslak → kesinleşmiş) güncellenir; "taslak" işareti kalkar.
