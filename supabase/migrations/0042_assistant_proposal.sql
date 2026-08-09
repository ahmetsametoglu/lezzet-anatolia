-- Modül 22 — AI yönetici asistanının ONAY KUYRUĞU (22.3). Kurgu: docs/architecture/AI_ADMIN_ASSISTANT.md §5.
--
-- ── TASARIMIN KALBİ BURASI ──────────────────────────────────────────────────
-- Asistanın gücü ne yazabildiğinde değil, **neyi uygulatabildiğinde**. Yazma araçları hiçbir
-- tabloya dokunmaz; niyetlerini buraya yazar, patron tek tek onaylar, uygulama ONDAN SONRA ve
-- **normal servis/motor yolundan** koşar. Kuyruk ikinci bir yazma yolu AÇMAZ — açsaydı iş
-- kuralları (DOMAIN) atlanabilen bir kapı doğardı.
--
-- ── NİYET SAKLANIR, SQL SAKLANMAZ ───────────────────────────────────────────
-- `payload` bir KOMUT değil bir DİLEKÇEDİR: "şu paketi şu kalemlerle kur". Ham SQL ya da
-- doğrudan tablo yazımı saklansaydı kuyruk, motorun etrafından dolaşan bir arka kapı olurdu.
-- Şekli `kind`'a göre değişir ve Zod ile doğrulanır (packages/types `AssistantProposalPayload`) —
-- doğrulama uygulamada çünkü şeklin kuralı iş kuralıdır, kolon kısıtı değil.
--
-- ── `kind` NEDEN ENUM (ve bu bir yetki kapısıdır) ───────────────────────────
-- Serbest metin olsaydı yeni bir öneri tipi eklemek tek satırlık bir kod değişikliği olurdu.
-- Oysa yeni tip = asistana YENİ BİR YAZMA YETKİSİ açmak ve bu, kullanıcı kararı gerektiren bir
-- şeydir (AI_ADMIN_ASSISTANT §9.4). Enum, o kararı migration'a — yani gürültülü ve gözden geçirilen
-- bir yere — taşır. Genişlemenin maliyeti bilinçli olarak sıfır değildir.
create type public.assistant_proposal_kind as enum (
  'bundle_draft',      -- paket taslağı: kalemler + atanmış paylar (bundleBalance motorundan geçer)
  'featured_flag',     -- vitrin işareti aç/kapa (kategori · koleksiyon · paket)
  'discount_draft',    -- kampanya/indirim tanımı
  'purchase_order',    -- tedarik siparişi (eşik-altı sinyalinden)
  'stock_intake',      -- mal kabul / alım girişi (patronun verdiği faturadan)
  'money_movement',    -- para hareketi (elle giriş: gider, tahsilat, transfer)
  'zone_extend',       -- teslimat bölgesine posta kodu ekleme (talep panosundan)
  'product_draft',     -- ürün detayının tamamlanması (taslak alanlar)
  'recipe_draft',      -- sofra tarifi taslağı
  -- Parti teklifi: SKT'si yaklaşan bir partiye indirimli satış fiyatı (`stock.offer_price`).
  -- İlk kez SATIŞ FİYATINA dokunan yetki (kullanıcı kararı 09.08) — öteki dokuz tip ya taslak
  -- doğurur ya defter/stok yazar, hiçbiri müşterinin gördüğü fiyatı oynatmazdı. Onay yine şart;
  -- fiyat onaylanır onaylanmaz vitrinde görünür.
  'batch_offer',
  -- Ambalaj fotoğrafından YENİ ÜRÜN (22.6). Öteki tipler var olan bir kaydı değiştirir; bu, katalogda
  -- olmayan bir şeyi doğurur. `status` payload'da YOK: ürün aday doğar, satışa çıkarmak ayrı karardır.
  'product_create'
);

-- `failed` AYRI bir hâl ve şart: onaylandı ama uygulanamadı (stok bu arada bitti, motor reddetti).
-- `rejected` ile aynı kovaya atılsaydı "patron istemedi" ile "sistem yapamadı" tek renge düşer,
-- ikincisi de kimsenin dönüp bakmadığı bir yerde ölürdü.
create type public.assistant_proposal_status as enum ('pending', 'applied', 'rejected', 'expired', 'failed');

create table public.assistant_proposal (
  id uuid primary key default gen_random_uuid(),
  kind public.assistant_proposal_kind not null,

  -- Öneriyi ÜRETEN oturum — hangi sohbetten çıktığı kaybolmasın (denetim izi). Bugün MCP çağrı
  -- izi log'da; oturum tablosu üretim turunda gelince FK olur, o güne kadar serbest etiket.
  source_session text,

  -- Niyet + parametreler. Şekli `kind`'a göre değişir; doğrulama uygulamada (Zod).
  payload jsonb not null,

  -- **Patronun okuyacağı TEK cümle.** Kuyruk ekranı bunu gösterir, JSON'u değil: operatörden kod
  -- okumasını istemek, onayı bir formaliteye çevirmenin en hızlı yoludur. Üreten araç yazar.
  summary text not null,

  -- **Öneri NEYE DAYANIYOR** — "şu üç kod 47 kez soruldu", "un eşiğin altında, 8 gün yeter".
  -- `summary`den ayrı bir alan çünkü ekranda ayrı bir karar girdisi: gerekçesiz bir öneri
  -- onaylanabilir ama patron neye dayandığını göremediğini BİLMELİ (tasarım bunu soluk/kesikli
  -- bir kutuyla söylüyor). Nullable ve öyle kalmalı — zorunlu yapmak, asistanı gerekçe
  -- UYDURMAYA iter; boş bırakabilmek dürüstlüğün ucuz yolu.
  reason text,

  status public.assistant_proposal_status not null default 'pending',

  -- ── TAZELİK: ÖNERİNİN SON KULLANMA TARİHİ VARDIR ──────────────────────────
  -- Dünkü stoğa göre kurulmuş bir paket önerisi bugün hâlâ doğru olmayabilir. Süre dolduğunda
  -- satır `expired` olur ve uygulanamaz. Bu, uygulama anındaki motor doğrulamasının YERİNE geçmez
  -- (o her hâlde koşar) — onun ÖNÜNE geçer: bayat bir öneriyi patronun önüne hiç koymamak,
  -- reddedilecek bir kararı sormaktan iyidir.
  expires_at timestamptz not null,

  created_at timestamptz not null default now(),

  -- Kararın kimliği ve anı. **Onayı MCP yüzeyi VEREMEZ** (AI_ADMIN_ASSISTANT §5): karar operasyon
  -- panelinden, personel oturumuyla verilir — bu yüzden `user_profiles`'a bakar.
  decided_by uuid references public.user_profiles (id) on delete set null,
  decided_at timestamptz,
  -- Reddin gerekçesi: "bunu neden reddetmişiz" sorusunun cevabı (B2B onay ekranının dersi).
  decided_note text,

  applied_at timestamptz,
  -- Uygulamanın DOĞURDUĞU kayıtların kimlikleri (`{"bundleId": "..."}`) — "bu paketi kim kurdu"
  -- sorusunun cevabı "asistan önerdi, X onayladı" olarak kalıcılaşsın diye.
  result jsonb,
  -- Uygulama düştüyse sebebi (status = 'failed'). Sessiz başarısızlık yok.
  error text,

  -- **Karar anı ile durum ayrışamaz.** Ayrışsaydı kuyruk, karar verilmiş bir satırı tekrar
  -- patronun önüne koyar ya da hiç karar verilmemiş bir satırı "uygulandı" sayardı. `expired`
  -- bilerek karar-verilmemiş tarafta: süresini doldurmak bir karar değil, kararın kaçırılmasıdır.
  -- (Kısıt `decided_by`'a BAKMAZ: FK `set null` olduğu için personel silinince kimlik düşer ama
  -- karar gerçekten verilmiştir — o satırı ihlale çevirmek, izi silmenin cezasını satıra keserdi.)
  constraint assistant_proposal_decided_status check (
    (decided_at is null and status in ('pending', 'expired'))
    or (decided_at is not null and status in ('applied', 'rejected', 'failed'))
  ),
  -- Uygulanmış satır uygulanma anını taşır; taşımayan bir 'applied' satırı "ne zaman oldu"
  -- sorusunu cevaplayamaz ve o soru iade/denetimde mutlaka sorulur.
  constraint assistant_proposal_applied_stamp check (status <> 'applied' or applied_at is not null),
  constraint assistant_proposal_failed_reason check (status <> 'failed' or error is not null),
  constraint assistant_proposal_ttl check (expires_at > created_at)
);

alter table public.assistant_proposal enable row level security;

-- Kuyruk ekranının ana okuması: bekleyenler, eskiden yeniye (en eski unutulmasın — B2B kuyruğunun
-- kuralı). Kısmi indeks: karar verilmiş satırlar zamanla birikir, kuyruk sorgusu onları taramamalı.
create index assistant_proposal_pending_idx on public.assistant_proposal (created_at)
  where status = 'pending';

-- Süre süpürücüsünün okuması (cron): "bekliyor ama süresi geçmiş".
create index assistant_proposal_expiry_idx on public.assistant_proposal (expires_at)
  where status = 'pending';

-- Geçmiş görünümü: karar verilenler yeniden eskiye ("bunu neden reddetmişiz").
create index assistant_proposal_decided_idx on public.assistant_proposal (decided_at desc)
  where decided_at is not null;

comment on table public.assistant_proposal is
  'AI yönetici asistanının onay kuyruğu (22.3): niyet + parametre saklanır, uygulama onaydan sonra normal servis/motor yolundan koşar. Kurgu: docs/architecture/AI_ADMIN_ASSISTANT.md §5.';
