-- Modül 14 — Bildirim KAYDI ve teslim defteri (14.12). Kurgu incelemesi 26.08 (iki-ajanlı
-- karşı-inceleme) sonrası düzeltilmiş şema; kararların gerekçeleri kolon künyelerinde.
--
-- ── NEDEN BİR TABLO GEREKTİ ─────────────────────────────────────────────────
-- Bugün olay doğduğu an maile dönüşüyor (`packages/notify` → `packages/email`) ve HİÇBİR İZ
-- KALMIYOR: müşteri maili silerse haber yok olur, uygulamadaki zil boş bir yer tutucuya bakar
-- (21.13 defteri), "okundu mu / gizlendi mi" diye bir kavram hiçbir yüzeyde yok. Kuyruktan
-- türetme fikri ölçüldü ve ELENDİ (kullanıcı 26.08): mobil tasarımın satırlarının yarısının
-- arkasında türetilecek kuyruk yok ("Rota güncellendi" bir AN'dır) ve her satır zaman damgası
-- taşıyor — tasarım bunu baştan olay akışı olarak çizmiş.
--
-- ── BİLDİRİM ≠ KUYRUK ───────────────────────────────────────────────────────
-- Bildirim "şu anda şu oldu" der, okunur ve biter; kuyruk "şu an şu kadar iş bekliyor" der ve iş
-- bitince kendiliğinden düşer. Toplama kuyruğu KUYRUK kalır (preparation.ts, depo süzgeçli);
-- buraya kuyruk maddesi yazılmaz — yazılsaydı "47 bildiriminiz var" ekranı doğar ve içi bugünkü
-- iş listesi olurdu.
-- ============================================================================

create table public.notification (
  id uuid primary key default gen_random_uuid(),
  -- Alıcı. Müşteri de personel de BURADA (kimlik zaten tek tabloda, rol ayırır — 0001 kararının
  -- devamı). İki tablo olsaydı tekilleştirme, okundu, gizleme, teslim ve silme İKİ KEZ yazılırdı.
  -- Cascade bilinçli: bildirim, alıcısından bağımsız bir hayat sürmez — ve test purge'ü ile GDPR
  -- silmesi (0037) ek hedef istemez (customer_phone'un aynı gerekçesi).
  profile_id  uuid not null references public.user_profiles (id) on delete cascade,
  -- Olay türü. DB'de TEXT, enum DEĞİL — küme `packages/types`ta (Zod) yaşıyor ve her modülle
  -- büyüyecek; DB enum'u her yeni türde migration + refresh isterdi. Yanlış değeri Zod katmanı
  -- reddeder; ekran bilinmeyen türe genel cümleyle düşer (emekliye ayrılan tür eski satırları
  -- kırmaz — karşı-incelemenin 6. bulgusu).
  kind        text not null,
  -- Neye işaret ediyor — "tıkla, git" hedefi. İçerik DEĞİL adres: cümle bundan kurulmaz.
  target_type text,
  target_id   uuid,
  -- DEPO BOYUTU (karşı-incelemenin 1. bulgusu — CLAUDE "depo bir boyut değil, DEĞİŞMEZ").
  -- Depo-bağlamlı personel olayı (toplama, stok) deposunu taşır ve dağıtım rol × depo kesişimiyle
  -- yapılır; Colmar açıkken (19.25) Strasbourg personeline Colmar'ın işi yazılmaz. Müşteri
  -- olaylarında ve depo-üstü olaylarda null. FK yok değil — depo silinmez zaten, yine de bağla:
  warehouse_id uuid references public.warehouse (id) on delete set null,
  -- CÜMLE KURMAYA YETECEK dil-BAĞIMSIZ küçük veri ({referenceNo}, {postalCode} gibi). Metin
  -- SAKLANMAZ (dil müşterinin tercihine bağlı ve değişebilir) ama VERİ saklanır — üç sebep
  -- (karşı-inceleme 6): 20 satırlık liste hedefe N+1 okuma yapmasın; hedef silinince (0037
  -- ticket'ı TÜMÜYLE siler) satır cümlesiz kalmasın; hedef sonradan değişince cümle o GÜNÜ
  -- anlatsın, bugünü değil. Serbest metin ve kişisel içerik GİRMEZ (OBSERVABILITY §5 ruhu):
  -- buraya yazılan her şey kimliksiz ayrıntıdır.
  payload     jsonb not null default '{}'::jsonb,
  -- Tekilleştirme anahtarı — FORMÜLÜ OLAY TANIMLAR, tablo değil. Sipariş durum olayları
  -- `order:<id>:<durum>` (bugünkü "geçiş başına tek mail" kuralının aynısı); istisna olayları
  -- (eksik, iade) NULL çünkü her düzeltme AYRI olaydır ve müşteri iki kez haber almalıdır
  -- (order/notify.ts kuralı) — naif bir (kind,target) anahtarı o ikinci meşru haberi sessizce
  -- yutardı. Çift tetiği olmayan olayda null bırakılır; uydurma anahtar dedupe değil tuzaktır.
  dedupe_key  text,
  created_at  timestamptz not null default now(),
  -- Okundu ve gizlendi AYRI damgalar: gizlenen-ama-okunmamış satır rozete SAYILMAZ (sayacın tek
  -- tanımı: read_at is null AND dismissed_at is null — @lezzet/application'da tek yerde).
  read_at      timestamptz,
  dismissed_at timestamptz
);

-- Tekillik ALICI BAŞINA: aynı olay fan-out ile birden çok personele yazılır, her biri kendi
-- satırını alır. Kısmi indeks — anahtarsız olaylar (her tekrarı meşru) hiç yarışmaz.
create unique index notification_dedupe_key
  on public.notification (profile_id, dedupe_key) where dedupe_key is not null;

-- Rozet sayacı SICAK YOLDUR (her ekran açılışı): kısmi indeks yalnız sayılacak satırları tutar.
create index notification_unread_idx
  on public.notification (profile_id) where read_at is null and dismissed_at is null;

-- Liste keyset ile iner (created_at + id eş-zaman kırıcısı — aynı milisaniyede iki satır
-- sayfalamayı kaydırmasın).
create index notification_list_idx on public.notification (profile_id, created_at desc, id desc);

alter table public.notification enable row level security;

comment on table public.notification is
  'Bildirim KAYDI (14.12): "şu müşteriye/personele şu oldu" satırı. Metin taşımaz — olayı taşır, '
  'cümleyi okuyan yüzey kurar. Kuyruk maddesi buraya yazılmaz (bildirim ≠ kuyruk).';
comment on column public.notification.payload is
  'Dil-bağımsız, kimliksiz küçük veri (referenceNo gibi) — cümle hedefe gitmeden kurulabilsin; '
  'serbest metin ve kişisel içerik girmez.';
comment on column public.notification.dedupe_key is
  'Formülü OLAY tanımlar; istisna olaylarında null (her düzeltme ayrı haber).';

-- ============================================================================
-- notification_delivery — TESLİM DEFTERİ. Bildirim OLGUsu ile kanala TESLİMİ ayrı şeylerdir
-- (karşı-incelemenin 3. bulgusu): BELGE sınıfı "e-posta her zaman + push da" der, yani tek satır
-- birden çok teslim sonucu doğurur; notifier zaten NotifyResult[] (DİZİ) döndürüyordu ve tek
-- enum kolonu o diziyi eziyordu. Ayrıca "none" iki farklı şeyi söylerdi: "kanal yoktu" (skipped)
-- ve "vardı, düştü" (error) — çaresi farklı iki hâl tek değerde birleşemez.
-- ============================================================================

create table public.notification_delivery (
  id              uuid primary key default gen_random_uuid(),
  notification_id uuid not null references public.notification (id) on delete cascade,
  -- Kanal adı TEXT — küme `NotifyChannel`dan (packages/notify) türer; `push` sürücüsü
  -- geldiğinde (14.16) DB'ye dokunulmaz. `whatsapp_api` değeri 15.11 kapanana dek YAZILAMAZ
  -- (sürücü supports=false) — kullanılmayan enum değeri yalan söyler, o yüzden kısıt yok.
  channel    text not null,
  -- sent · skipped · error — NotifyResult'ın üçlüsü, olduğu gibi.
  status     text not null,
  -- skipped/error sebebi (no_email, provider_key_absent, sağlayıcı hatası). sent'te null.
  reason     text,
  -- Sağlayıcı referansı — "gerçekten ne gitti" sorusunun izi. Push'ta JSON eşleme:
  -- [{"token":..,"ticket":..}] — makbuz turu hangi biletin hangi CİHAZA ait olduğunu bilmek
  -- zorunda (çürük jetonu silecek olan o). Jeton DB içinde zaten var (push_device); burada
  -- tekrarı sızıntı değil, aynı veritabanının iki satırı.
  ref        text,
  -- ── MAKBUZ (14.16): Expo teslimi ASENKRON söyler ─────────────────────────
  -- Gönderim anında dönen şey BİLETTİR ("aldım, sıraya koydum") — teslim değil. Teslim tutanağı
  -- (makbuz) 15-30 dk sonra bilet numarasıyla SORULUR; soran süpürme cron'u, cevabı buraya yazar.
  -- Teslim satırının değişebilen TEK yüzü budur: gönderim gerçeği donuk kalır, makbuz sonradan
  -- eklenen ikinci gerçektir. `null` = henüz sorulmadı (yalnız push'ta sorulur).
  receipt_status     text,
  receipt_checked_at timestamptz,
  created_at timestamptz not null default now()
);

-- Süpürme turunun tek okuması: makbuzu sorulmamış push teslimleri, en eskiden.
create index notification_delivery_receipt_idx
  on public.notification_delivery (created_at)
  where channel = 'push' and status = 'sent' and receipt_checked_at is null;

create index notification_delivery_notification_idx
  on public.notification_delivery (notification_id);

alter table public.notification_delivery enable row level security;

comment on table public.notification_delivery is
  'Bildirimin kanal-başına teslim sonucu (14.12). Bildirim satırı olgu, bu satır teslim — '
  'BELGE sınıfında ikisi bilerek ayrışır (mail + push aynı olaydan iki teslim).';
