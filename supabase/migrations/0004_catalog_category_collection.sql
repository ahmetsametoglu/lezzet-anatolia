-- Modül 05 — Katalog: kategori + koleksiyon (düz gruplama).
-- Ürün/varyant (task 3) ve product_collections çoklu bağı (Product FK'sine muhtaç) sonraki
-- migration'da gelir. Erişim modeli 0001 ile aynı: RLS deny-by-default; erişim sunucudan
-- service_role ile (RLS baypas). Client-side anon okuma gerekirse aktif-satır read policy'si eklenir.

-- ── ÇOK DİLLİ METİN ÖLÇÜTÜ — katalogun ortak kapısı ───────────────────────────────────────────
--
-- **Anahtarın VARLIĞI yetmez, DOLU olması aranır:** operatör alanı açıp boş bırakırsa `{"fr": ""}`
-- yazılır ve `? 'fr'` bunu "dolu" sayardı — yayındaki üründe boş bir içindekiler listesi, hiç
-- olmayan listeden kötüdür (yasal beyan, üstelik gıda).
--
-- **Neden BURADA, `0038_recipe.sql`de değil** (27.08): fonksiyon tarif için yazılmıştı ama ölçüt
-- tarife özel değil — ürün de aynı soruyu soruyor ve `product` bu dosyadan iki sıra sonra doğuyor
-- (`0005`). Migration sırası gereği 0038'deki tanım 0005'ten görülemezdi; tek kopya yukarı taşındı,
-- 0038 onu artık yalnız KULLANIYOR. İki ayrı tanım yazmak, bir gün ikisinin ayrışması demekti.
--
-- ⚠ Kısıt YAZMA anında bakar: fonksiyon ileride değişirse mevcut satırlar yeniden doğrulanmaz.
create or replace function public.has_all_locales(p jsonb) returns boolean
language sql
immutable
parallel safe
as $$
  select p is not null
     and coalesce(btrim(p ->> 'tr'), '') <> ''
     and coalesce(btrim(p ->> 'fr'), '') <> ''
     and coalesce(btrim(p ->> 'de'), '') <> '';
$$;

comment on function public.has_all_locales(jsonb) is
  'Çok dilli metin üç dilde de DOLU mu (boş dize dolu sayılmaz). Ürün ve tarif yayın kısıtının ortak ölçütü.';

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
  -- Kısa tanıtım — mobil vitrin bandının ALTYAZISI (05.17). Bugün o metin tasarımın içinde sabit
  -- bir sözlük (`Mobil - Musteri v3.dc.html`, `CSUB`): veriden gelmiyor, yani yeni kategori
  -- altyazısız doğuyor ve cümle operatörün elinde değil.
  --
  -- **Başlık DEĞİL, ikincil satır.** Bandın başlığı kategori ADIdır (`name`); ikinci bir başlık
  -- alanı açılsaydı aynı şeyin iki kaynağı olur ve bir gün ayrışırdı.
  --
  -- **Boş bırakılabilir ve öyle kalmalı:** altyazısı olmayan kategori altyazısız çizilir — yedek
  -- metin UYDURULMAZ (ada düşmek "Börekler / Börekler" gibi bir tekrar üretirdi).
  tagline jsonb,                                -- LocalizedText {tr?,fr?,de?}
  sort_order int not null default 0,
  is_active boolean not null default true,
  -- **Vitrinde göster** (05.18) — ana sayfanın ızgarası sınırlı (tasarım: kategoride 6 slot), kod
  -- ise bugün kategorileri SINIRSIZ okuyor; seed'de 10 kategori var ve ızgara bozuluyor.
  --
  -- **İŞARET SEÇİMDİR, SIRA `sort_order`'DAN GELİR.** İkinci bir vitrin sırası tutulmuyor: iki sıra
  -- bir gün çelişir ve hangisinin kazandığı ekrandan anlaşılmaz. Aynı sebeple "vitrin ekranı" da
  -- yok — seçim katalog ekranından yapılır (kullanıcı kararı 08.08).
  --
  -- Hiç işaret yoksa okuma bugünkü davranışa düşer (sıradan ilk N): vitrin boş kalmaz.
  is_featured boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index category_slug_key on public.category (slug);
-- Vitrin okuması yalnız işaretlilere bakar ve küme küçüktür (tasarım 6 slot) — kısmi indeks.
create index category_featured_idx on public.category (sort_order) where is_featured;

-- ── category_image — kategorinin EK fotoğrafları (05.23) ─────────────────────────────────────────
-- Kategori kartı bugüne kadar TEK fotoğrafla yaşıyordu: bir kere seçilen kare, kategorinin yıl boyu
-- yüzü oluyordu. Oysa "Börekler" bir ürün değil bir RAF — su böreği de, kol böreği de, ıspanaklısı da
-- aynı rafta durur ve hiçbiri tek başına o rafın doğru resmi değildir.
--
-- **Ürün galerisiyle AYNI tablo deseni** (`product_image`, 0005) ve bu bilinçli: aynı işi yapan iki
-- tablonun alanları ayrışırsa editörü de, okuması da, kırpması da ikiye bölünür. Fark yalnız hangi
-- varlığa asıldığı — ve nasıl OKUNDUĞU (aşağıda).
--
-- **Kapak burada TEKRARLANMAZ:** o `category.image_key`'de durur. Sebep ürünündekiyle aynı — kartı
-- çizen okuma kategoriyi zaten satır olarak alıyor, kapak için ikinci bir sorgu doğmasın. Galeri boş
-- olan kategori bugünkü davranışını aynen sürdürür (tek fotoğraf), yani bu tablo hiçbir mevcut
-- ekranı değiştirmeden boş kalabilir.
--
-- **Ürün galerisinden AYRILAN tek yer okumadır.** Ürün galerisi müşteriye TOPLU gösterilir (detay
-- sayfasında hepsi yan yana); kategori galerisi gösterilmez — kart tek kare çizer ve o kare
-- havuzdan GÜNE göre seçilir (`application/catalog/rotation.ts`). Yani buradaki `sort_order` bir
-- vitrin sırası değil, rotasyonun DÖNGÜ sırasıdır: operatör hangi fotoğrafın hangisini izleyeceğini
-- belirler.
create table public.category_image (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.category (id) on delete cascade,
  image_key text not null,                      -- depo anahtarı, tam URL değil (STACK §5)
  image_focal_x smallint not null default 50,   -- odak %, 0-100 (object-position X)
  image_focal_y smallint not null default 50,   -- odak %, 0-100 (object-position Y)
  image_zoom smallint not null default 100,     -- zoom %, 100-400
  image_alt jsonb,                              -- LocalizedText; boşsa kategori adına düşer
  image_updated_at timestamptz,                 -- sürüm damgası (gerekçe: yukarıdaki kapak satırı)
  sort_order int not null default 0,            -- rotasyonun döngü sırası (sürükle-bırak)
  created_at timestamptz not null default now()
);
-- Havuz her zaman kategori başına ve SIRALI okunur.
create index category_image_category_idx on public.category_image (category_id, sort_order);

comment on table public.category_image is
  'Kategori fotoğraf havuzu (05.23) — kart tek kare çizer, kare GÜNE göre buradan seçilir. Kapak category.image_key''de.';

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
  -- Vitrinde göster (05.18) — gerekçe ve kural kategoridekiyle birebir aynı; ana sayfa tasarımı
  -- koleksiyona 2 slot çiziyor. `is_active` ile KARIŞTIRILMAZ: aktiflik "yayında mı", bu "ana
  -- sayfada mı" — pasif bir koleksiyon işaretli kalabilir (kampanya hazırlanıyor) ve okuma ikisini
  -- birden sorar.
  is_featured boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index collection_slug_key on public.collection (slug);
create index collection_featured_idx on public.collection (sort_order) where is_featured;

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
alter table public.category_image enable row level security;
alter table public.collection enable row level security;
