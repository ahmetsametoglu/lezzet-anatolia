# 18 — Operasyon ve Güvenlik

## ÖZEL STATÜ — bu modül önce konuşulur, sonra kodlanır

> Bu modülün **tamamı**, kod yazılmadan önce kullanıcıyla **karar oturumu** olarak ele alınır (STACK §13 statü notu). Her başlıkta: **konuşulacak seçenekler artı/eksileriyle masaya konur, net karar verilir, sonra uygulanır.** Aşağıdakiler görev değil, o oturumun gündemidir; her biri bir "önerilen varsayılan" taşır ama bağlayıcı değildir. Bazı başlıklar (VPS/CI) erken de yapılabilir — nota bakılır.

## Okunacaklar

- `STACK.md §13` (operasyon ve güvenlik ilkeleri — taslak), `§2-3` (yığın, iskelet)
- `WORKFLOW.md` (migration, deploy, git disiplini)

## Bağımlılık

Fiilen tüm modüllerin ürettiği yüzeyler; ama **VPS kurulumu, CI ve staging erken kurulabilir** (00'dan hemen sonra bile) — geliştirme boyunca değer verir. Güvenlik sertleştirmesi (RLS kapsamı, webhook) ilgili modüllerde (02/07/15) kurulmuş olanların gözden geçirilmesidir.

## Karar oturumu gündemi

- [ ] **Veri erişim modeli (RLS kapsamı):** service-role + guard tek kat mı, + RLS ikinci hat mı; RLS'nin ilk kapsadığı tablolar (müşteri kendi satırı, kurye kendi teslimatı). *Öneri:* çift kat, RLS temel tablolarda ikinci savunma.
- [ ] **Migration aracı:** Supabase CLI vs kendi runner. *Öneri:* CLI ile başla, yeterli gelmezse runner.
- [ ] **Webhook güvenliği gözden geçirme:** 07 (Stripe) ve 15 (360dialog) idempotency + imza doğrulaması yerinde mi; `WebhookEvent` tablosu tüm sağlayıcıları kapsıyor mu. *Öneri:* tek desen, her sağlayıcı aynı.
- [ ] **Yedekleme / felaki kurtarma:** günlük yedek/PITR (Supabase planı) + haftalık off-site `pg_dump` + Storage senkronu + yılda bir **restore provası**. *Öneri:* provası yapılmamış yedeğe güvenilmez — provayı takvime bağla.
- [ ] **Log ve alarm:** JSON log + logrotate; kritik hatada (webhook düşmesi, cron gecikmesi, ödeme hatası) admin'e e-posta. *Öneri:* ağır APM değil, ölçeğe uygun asgari; büyüyünce Sentry.
- [ ] **Cron disiplini doğrulama:** `apps/backend` tek instance (fork); her iş taramalı-idempotent; kritik işler `last_run` + gecikince alarm. (TTL süpürme 06'da, feedback daveti 17'de bu disiplinle yazıldı — kontrol.)
- [ ] **Deploy atomikliği:** ayrı dizine derle → symlink swap → `pm2 reload`; derleme düşük trafik saatinde. *Öneri:* symlink deseni + reload.
- [ ] **CI + staging:** GitHub Actions (typecheck+lint+birim test her push); entegrasyon testleri lokal Supabase'de (özellikle **paralel rezervasyon yarışı** + para RPC'leri); staging = ikinci ücretsiz Supabase projesi + ikinci PM2 app; migration provası önce staging. *Öneri:* erken kur — geliştirmeyi hızlandırır.
- [ ] **VPS kurulumu:** Caddy (TLS + reverse proxy), PM2 (web + backend), env yönetimi; Caddyfile/PM2 ecosystem repo'da. *Öneri:* erken kur, canlı ortamı baştan gerçekçi tut.
- [ ] **Paket sınırı aracı son kontrolü:** `apps/*` sipariş/stok/para yazımını yalnız domain-core üzerinden yapıyor; database servislerini doğrudan import edemiyor (00'da kurulan kural üretimde sağlam mı).

## Not

Bu modülün çıktısı çoğunlukla **konfigürasyon ve karar kaydı**dır, ürün kodu değil. Her karar alındıkça ilgili yer (`STACK.md §13` taslak → kesinleşmiş) güncellenir; "taslak" işareti kalkar.
