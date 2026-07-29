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
  - **Durum:** dokümantasyon + veri modeli + ekran envanteri yazıldı; **kod yazılmadı.** `docs:check` yeni üç varlığı bugünden izliyor (tablo doğunca karşılaştırma kendiliğinden devreye girer). Yol üstünde kapanan boşluk: `job_run` bugüne dek veri modelinde HİÇ dokümante edilmemişti — artık `data-model/operasyon.md`'de ve denetim kapsamında. Sıradaki adım ekranın görsel tasarımı (Claude Design) ile kodun paralel yürümesi.
- [ ] (18.6) **Cron disiplini doğrulama:** `apps/backend` tek instance (fork); her iş taramalı-idempotent; kritik işler `last_run` + gecikince alarm. (TTL süpürme 06'da, feedback daveti 17'de bu disiplinle yazıldı — kontrol.)
- [ ] (18.7) **Deploy atomikliği:** ayrı dizine derle → symlink swap → `pm2 reload`; derleme düşük trafik saatinde. *Öneri:* symlink deseni + reload.
- [ ] (18.8) **CI + staging:** GitHub Actions (typecheck+lint+birim test her push); entegrasyon testleri lokal Supabase'de (özellikle **paralel rezervasyon yarışı** + para RPC'leri); staging = ikinci ücretsiz Supabase projesi + ikinci PM2 app; migration provası önce staging. *Öneri:* erken kur — geliştirmeyi hızlandırır.
- [ ] (18.9) **VPS kurulumu:** Caddy (TLS + reverse proxy), PM2 (web + backend), env yönetimi; Caddyfile/PM2 ecosystem repo'da. *Öneri:* erken kur, canlı ortamı baştan gerçekçi tut.
- [ ] (18.10) **Paket sınırı aracı son kontrolü:** `apps/*` sipariş/stok/para yazımını yalnız domain-core üzerinden yapıyor; database servislerini doğrudan import edemiyor (00'da kurulan kural üretimde sağlam mı).

## Not

Bu modülün çıktısı çoğunlukla **konfigürasyon ve karar kaydı**dır, ürün kodu değil. Her karar alındıkça ilgili yer (`STACK.md §13` taslak → kesinleşmiş) güncellenir; "taslak" işareti kalkar.
