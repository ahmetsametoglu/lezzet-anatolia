-- Modül 05 — Katalog: kategori + koleksiyon (düz gruplama).
-- Ürün/varyant (task 3) ve product_collections çoklu bağı (Product FK'sine muhtaç) sonraki
-- migration'da gelir. Erişim modeli 0001 ile aynı: RLS deny-by-default; erişim sunucudan
-- service_role ile (RLS baypas). Client-side anon okuma gerekirse aktif-satır read policy'si eklenir.

-- ── category — düz, tek seviye; her ürün tek kategoride (DATA_MODEL, DOMAIN §13) ──
create table public.category (
  id uuid primary key default gen_random_uuid(),
  name jsonb not null,                          -- LocalizedText {tr?,fr?,de?}
  slug text not null,                           -- dil-bağımsız URL parçası (SEO_I18N)
  -- Kategori görseli: anasayfa kategori şeridinde görünür — web 3:2 kart, MOBİL DAİRE (aynı kare
  -- kırpma + yuvarlak maske). Tek kaynak 3:2 yüklenir; çerçeveler odak+zoom ile türer (§0B).
  image_key text,                               -- depo anahtarı, tam URL değil (STACK §5)
  image_focal_x smallint not null default 50,   -- odak %, 0-100 (object-position X)
  image_focal_y smallint not null default 50,   -- odak %, 0-100 (object-position Y)
  image_zoom smallint not null default 100,     -- zoom %, 100-400
  image_alt jsonb,                              -- LocalizedText; boşsa kategori adına düşer
  -- Görsel DOSYASININ son değişme anı. Anahtar deterministik (slug'a bağlı, üzerine yazılır) ve
  -- okuma URL'i public+immutable → sürüm damgası olmadan CDN/tarayıcı bir yıl eskiyi gösterir.
  -- Yalnız dosya değişince yazılır; odak/zoom değişimi dosyayı değiştirmez (kırpma CSS'te).
  image_updated_at timestamptz,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index category_slug_key on public.category (slug);

-- ── collection — esnek pazarlama grubu (Bayram/Yeni/İndirimde); ürün çok koleksiyona girer ──
-- Koleksiyon aynı zamanda KENDİ bağlantısıyla paylaşılan bir vitrin sayfasıdır (DOMAIN §13) →
-- sosyal paylaşım OG kartı için başlık yetmez: description + image_key de taşınır.
create table public.collection (
  id uuid primary key default gen_random_uuid(),
  name jsonb not null,                          -- LocalizedText {tr?,fr?,de?}
  description jsonb,                            -- LocalizedText, opsiyonel (OG açıklaması)
  slug text not null,                           -- paylaşım linki (SEO_I18N)
  -- Kapak = paylaşım (OG) kartı görseli (16:9); müşteri sayfasında bant olarak render EDİLMEZ, yalnız
  -- link önizleme kartını besler. Odak/zoom ile dikey/kare kaynak da yatay banda kırpılır (§0B).
  image_key text,                               -- kapak: depo anahtarı, tam URL değil (STACK §5)
  image_focal_x smallint not null default 50,   -- odak %, 0-100 (object-position X)
  image_focal_y smallint not null default 50,   -- odak %, 0-100 (object-position Y)
  image_zoom smallint not null default 100,     -- zoom %, 100-400
  image_alt jsonb,                              -- LocalizedText; OG kartı alt metni (boşsa ada düşer)
  image_updated_at timestamptz,                 -- görsel dosyasının sürüm damgası (kategoridekiyle aynı gerekçe)
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index collection_slug_key on public.collection (slug);

-- ── product_family — ÇEŞİT ekseni (05.15 · kullanıcı kararları 04.08) ────────
-- Bazı ürünler bir ailenin üyesidir: aynı kekin limonlu/mangolu/çilekli hâlleri. **Üye = bugünkü
-- ÜRÜN** — kendi sayfası, kendi beyanı, kendi görseli, kendi fiyatı olan tam bir ürün. Aile bunların
-- üstünde ince bir gruplamadır, yeni bir varlık türü değil.
--
-- **VARYANTTAN AYRI EKSEN:** varyant aynı ürünün boyudur (500 g / 1 kg), aile kimlik seçimidir.
--
-- ── NEDEN KOLEKSİYON DEĞİL ──────────────────────────────────────────────────
-- `collection` tasarım gereği ÇOKTAN-ÇOĞADIR. Bir ürün iki koleksiyondayken "öteki çeşitler"
-- sorusunun İKİ cevabı olur ve hiçbir yer hata vermez. `product.family_id` kolonu "en çok bir aile"
-- değişmezini yapısal kılar — kural veride durur. Emsal bu şemada yaşandı: `delivery_zone_postal_code`
-- dizi kolonundan kendi tablosuna taşındı, çünkü aynı kodu iki bölgeye yazmak serbestti ve çözücü
-- sessizce birini seçiyordu (0014).
--
-- Serbest metin bir `family_key` de elendi: `limonlu-kek` ile `limonlu_kek` sessizce iki aile yapar.
create table public.product_family (
  id uuid primary key default gen_random_uuid(),
  -- **TEK DİLLİ ve bu bilinçli** (kullanıcı kararı): aile adı MÜŞTERİYE GÖRÜNMEZ. Müşterinin
  -- gördüğü başlık arayüz metnidir ("Çeşitler"); bu ad yalnız operatörün panelde aileyi tanımasına
  -- yarar ve operasyon yüzeyi zaten tek dillidir (CLAUDE §2). Çok dilli yapmak, hiç okunmayacak iki
  -- alanı her ailede doldurtmak olurdu.
  name text not null,
  -- Aile pasifleştirilebilir: üyeleri satışta kalır ama çeşit bloğu çizilmez. Silmek yerine
  -- pasifleştirme, `family_id`'si `set null` olan üyelerin etiket ve sırasını da düşürürdü.
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.product_family is
  'Ürün ailesi (05.15) — çeşit ekseni. Üye = ürün; ad yalnız operasyona görünür.';

alter table public.product_family enable row level security;

-- RLS — deny-by-default (0001 deseni). Erişim sunucudan service_role ile.
alter table public.category enable row level security;
alter table public.collection enable row level security;
