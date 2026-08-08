-- Modül 05 — Katalog: ürün + varyant + ürün-koleksiyon bağı.
-- Paylaşılan alanlar Product'ta; satılabilir birim ProductVariant (DATA_MODEL, DOMAIN §13).
-- product_collections = task 1'de ertelenen çoklu bağ (artık Product FK'si var). RLS deny-by-default.
-- Incremental: ingredients/nutrition alanları ilgili özellikleriyle sonra.

create type product_date_type as enum ('DLC', 'DDM');

-- Ürün satış durumu TEK alanda. Önce iki bayrak (is_candidate + is_active) vardı; üç durum için dört
-- kombinasyon doğuruyordu ve ikisi ("aday + aktif", "aday + pasif") davranışta AYNI şeydi — imkânsız
-- durum temsil edilebilir kalıyordu. Enum bunu kapatır: her satır tam olarak bir durumdadır.
--   active    → satışta
--   passive   → satışta değil (arşiv değil; katalogda gizli)
--   candidate → aday: satılamaz, yalnız keşif akışında görünür (DOMAIN §13)
create type product_status as enum ('active', 'passive', 'candidate');

-- AB 14 alerjeni (FR/DE'de yasal beyan zorunlu). Enum anahtarı ASCII; görünen ad (TR/FR/DE) UI'da.
create type product_allergen as enum (
  'gluten', 'kabuklu', 'yumurta', 'balik', 'yer_fistigi', 'soya', 'sut',
  'sert_kabuklu', 'kereviz', 'hardal', 'susam', 'sulfit', 'aci_bakla', 'yumusaka'
);

create table public.product (
  id uuid primary key default gen_random_uuid(),
  name jsonb not null,                               -- LocalizedText
  description jsonb,                                 -- LocalizedText, opsiyonel
  slug text not null,                                -- dil-bağımsız (SEO_I18N)
  category_id uuid references public.category (id) on delete set null,
  -- Görsel künyesi (Komponent Envanteri §0B): tek kaynak 3:2 dosya + odak noktası; her müşteri
  -- çerçevesi (3:2 kart, 1:1 sepet, daire) buradan object-position ile türer, kırpılmış kopya yok.
  image_key text,                                    -- depo anahtarı, tam URL değil (STACK §5)
  image_focal_x smallint not null default 50,        -- odak %, 0-100 (object-position X)
  image_focal_y smallint not null default 50,        -- odak %, 0-100 (object-position Y)
  image_zoom smallint not null default 100,          -- zoom %, 100-400 (dikey/kare kaynağı yatay banda kırpar)
  image_alt jsonb,                                   -- LocalizedText; erişilebilirlik + SEO, kart görselinde zorunlu
  image_updated_at timestamptz,                      -- görsel dosyasının sürüm damgası (gerekçe: 0004 kategori satırı)
  -- Yasal beyan (INCO) — müşteri ürün sayfasının zorunlu bölümleri.
  -- ingredients/storage_instructions DÜZ METİN'dir; içinde yalnız `**vurgu**` işareti taşır. HTML
  -- SAKLANMAZ: temizleme (sanitize) yükü, XSS yüzeyi ve AI çevirinin etiketleri bozması buradan gelirdi.
  -- Vurgu otomatik türetilemez — INCO alerjenin listede YAZILDIĞI hâlinin ("buğday unu") vurgulanmasını
  -- ister, kategori adının ("Gluten") değil; üstelik saklama metnindeki vurgu hiçbir alerjene bağlı değil.
  ingredients jsonb,                                 -- LocalizedText, çok dilli içindekiler
  nutrition jsonb,                                   -- SABİT kalemli (100 g başına) — NutritionSchema
  storage_instructions jsonb,                        -- LocalizedText; saklama/hazırlama metni
  allergens product_allergen[] not null default '{}', -- AB 14 yasal beyan (manuel seçim)
  -- "BEYAN EKSİK" TEK KAYNAKTA. Aynı ölçüt daha önce sorgu kurucusunda bir `or` dizesi olarak
  -- yaşıyordu ve sayaç için ayrı, süzgeç için ayrı kuruluyordu — ikisi ayrışırsa ekran "24 beyan
  -- eksik" yazıp süzgeçte 12 satır gösterir. Üretilmiş kolon: yazarken hesaplanır, indekslenebilir,
  -- hem süzgeç hem sayaç aynı gerçeği okur. HANGİ beyanın eksik olduğu (rozet ayrıntısı) uygulamada
  -- kalır; burada yalnız "eksik var mı" sorusu var.
  is_incomplete boolean generated always as (name ->> 'tr' is null or name ->> 'fr' is null or name ->> 'de' is null or ingredients is null or nutrition is null or storage_instructions is null or allergens = '{}') stored,
  traces product_allergen[] not null default '{}',   -- çapraz bulaşma; cümle i18n şablonuyla kurulur
  vat_rate numeric(4, 2) not null default 5.5,       -- 5.5 / 20
  date_type product_date_type not null default 'DDM',
  shelf_life_days int,                               -- toplam raf ömrü (gün); kalan % = (parti.dlc − bugün) ÷ bu
  -- **VARSAYILAN `false` — kullanıcı kararı 08.08.** Önce `true`ydu: işaretlenmemiş her ürün
  -- "evet, kargola" sayılıyordu. Donuk gıdada o varsayımın bedeli ekranda bir sayı değil, müşteriye
  -- çözülmüş ulaşan bir pakettir. Unutulan alanın bedeli **"satılamadı"** olmalı, "bozuk gitti" değil.
  -- Not: bu bir güvenlik kısıtı değil bir varsayılan — `false` = yalnız rota/kapı (soğuk zincir).
  shippable boolean not null default false,
  status product_status not null default 'active',   -- satışta / pasif / aday (tek alan, yukarıdaki enum)
  target_margin_percent numeric(5, 2),              -- hedef kâr marjı (markup %); marj uyarısı / oto-fiyat
  auto_price boolean not null default false,         -- açıksa fiyat hedef marja göre otomatik (motor sonraki modül)
  sort_order int not null default 0,

  -- ── ÜRÜN AİLESİ — ÇEŞİT EKSENİ (05.15) ────────────────────────────────────
  -- `on delete set null`: aile silinirse üyeler ürün olarak yaşamaya devam eder. Aşağıdaki kısıt
  -- etiketin de aileyle birlikte düşmesini zorluyor — ailesiz bir üründe duran "Limonlu" etiketi,
  -- hiçbir yerde okunmayan ve bir gün yanlış aileye taşınacak ölü veridir.
  family_id uuid references public.product_family (id) on delete set null,

  -- **AİLE İÇİ ETİKET — ürün adından AYRI ve ÜÇ DİLLİ** (kullanıcı kararı 04.08).
  -- Ürün adı "Limonlu kek", kart etiketi "Limonlu". Kartta okunan ikincisidir: kartlar yan yana
  -- dururken her birinde "kek" kelimesini tekrar etmek seçimi zorlaştırır.
  -- **Türetilemez:** ortak eki kırpmak "Çilekli Kek" ile "Kek Dilimi" yan yana gelince bozulur.
  family_label jsonb,                                -- LocalizedText {tr?,fr?,de?}

  -- **SIRA AİLE İÇİNDEDİR** ve operatörün sürüklediği sıradır. `sort_order` KULLANILMAZ: o katalog
  -- sırasıdır ve iki kararı tek kolona bağlamak, ailedeki sırayı değiştiren operatöre katalog
  -- sırasını da farkında olmadan değiştirtirdi. Yazma tüm aileyi birden değiştirir, o yüzden
  -- (family_id, family_position) tekilliği ARANMAZ: toplu güncellemenin ara hâli geçici olarak
  -- çakışır ve ertelenmiş bir kısıt bu kadar küçük bir küme için fazla makine olurdu.
  family_position int not null default 0,

  -- **Ailedeki üyenin etiketi ZORUNLU.** Kural veride duruyor çünkü ekranda unutulduğunda hata
  -- vermez: kart ürün adına düşer, "Limonlu kek" yazar ve DOĞRU GÖRÜNÜR — kısa etiketin bütün
  -- amacı sessizce kaybolur. Gürültülü bir kayıt hatası, sessiz bir tasarım kaybından iyidir.
  constraint product_family_label_required check (family_id is null or family_label is not null),

  created_at timestamptz not null default now()
);

-- Bir üyenin sayfasında "öteki çeşitler" okuması: aile + sıra.
create index product_family_idx on public.product (family_id, family_position) where family_id is not null;
create unique index product_slug_key on public.product (slug);
create index product_incomplete_idx on public.product (is_incomplete) where is_incomplete;
create index product_category_idx on public.product (category_id);

create table public.product_variant (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.product (id) on delete cascade,
  -- Müşteriye GÖRÜNEN boy etiketi ("700 g tepsi" / "plateau 700 g") → çok dilli. Üç dilli vitrinde
  -- tek dil kalamazdı: ürünün adı/açıklaması/beyanı çevriliyken boy seçicisi Türkçe kalıyordu.
  -- Boş olabilir ({}): tek boylu üründe etiket yoktur, müşteri seçici görmez. Birden çok varyantta
  -- en az bir dilin dolu olması FORM kuralıdır (boy'ları ayırt edilemez bırakmamak için).
  label jsonb not null default '{}'::jsonb,          -- LocalizedText
  net_weight_g int,
  min_stock_qty int,                                 -- asgari eşik (DOMAIN §16); null = öneri yok
  sku text,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index product_variant_product_idx on public.product_variant (product_id);

-- Ürün galerisi — detay sayfasındaki EK fotoğraflar. Kapak burada TEKRARLANMAZ: o
-- `product.image_key`'de durur, çünkü liste/kart/paylaşım kartı kapağı ürünle aynı satırda okur
-- (ayrı sorgu doğurmasın). Bu tablo yalnız 2., 3., … fotoğrafı tutar.
--
-- Kırpma künyesi kapaktakiyle AYNI alanlar: her fotoğrafın kendi odağı vardır (tasarım her slota ayrı
-- odak veriyor). Ama galeri fotoğrafı tek çerçevede görünür (detay galerisi, 3:2) — kapak gibi dört
-- ayrı çerçeveye türemez; fark veride değil, editörün gösterdiği önizlemede.
create table public.product_image (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.product (id) on delete cascade,
  image_key text not null,                           -- depo anahtarı, tam URL değil (STACK §5)
  image_focal_x smallint not null default 50,        -- odak %, 0-100 (object-position X)
  image_focal_y smallint not null default 50,        -- odak %, 0-100 (object-position Y)
  image_zoom smallint not null default 100,          -- zoom %, 100-400
  image_alt jsonb,                                   -- LocalizedText; boşsa ürün adına düşer
  image_updated_at timestamptz,                      -- sürüm damgası (gerekçe: 0004 kategori satırı)
  sort_order int not null default 0,                 -- müşteri galerisinin sırası (sürükle-bırak)
  created_at timestamptz not null default now()
);
-- Galeri her zaman ürün başına ve SIRALI okunur.
create index product_image_product_idx on public.product_image (product_id, sort_order);

-- ── Paket (bundle) ───────────────────────────────────────────────────────────────────────────────
-- Birden çok ürünü TEK fiyata sunan katalog kısayolu (DOMAIN §13). Yeni ürün YARATMAZ: sepete
-- eklenince içindeki her kalem ayrı `order_item` olur, sistem müşteri hepsini tek tek almış gibi akar
-- (stok, hazırlık, kâr, fatura kalem kalem). Bu yüzden paketin varyantı, stoğu ve KDV'si yoktur.
--
-- Burada, ürün migration'ında duruyor çünkü kalemleri `product_variant`'a bağlı ve `0012`'teki
-- `order_item.bundle_id` bu tabloya FK verecek — paket ondan ÖNCE var olmak zorunda.
--
-- Paket YALNIZ B2C'dedir: `total_price` tek sayıdır ve **KDV dahil (TTC)** — b2c kanal tabanı. Kanal
-- listesi, müşteriye özel fiyatı ve `price` satırı YOKTUR. Toptan müşteri paketi görmez; pazarlık
-- kalem üzerinden yürür, paket ise sosyal medyaya yönelik bir pazarlama kısayoludur.
create table public.bundle (
  id uuid primary key default gen_random_uuid(),
  name jsonb not null,                               -- LocalizedText
  description jsonb,                                 -- LocalizedText; listede kısa, detayda tam
  slug text not null,                                -- sosyal paylaşımın tek bağlantısı (dil-bağımsız)
  -- Görsel künyesi ürünle AYNI alanlar (Komponent Envanteri §0B): tek 3:2 kaynak + odak; müşteri
  -- çerçeveleri (liste kartı 3:2, detay 3:2, anasayfa koyu kart 1:1) buradan türer.
  image_key text,
  image_focal_x smallint not null default 50,
  image_focal_y smallint not null default 50,
  image_zoom smallint not null default 100,
  image_alt jsonb,
  image_updated_at timestamptz,
  total_price numeric(10, 2) not null,               -- müşterinin gördüğü TEK fiyat, TTC
  -- "6 kişilik" — tasarımda ad üstü künyede duruyor (Paket Detay + Paketler listesi). Serbest metne
  -- gömülemez: künye olarak tutarlı basılması ve boş olduğunda satırın HİÇ çizilmemesi gerekiyor.
  serves int,
  is_active boolean not null default true,
  sort_order int not null default 0,                 -- kürelenmiş vitrin sırası (müşteri sıralamaz)
  -- Vitrinde göster (05.18) — ana sayfa tasarımı pakete 2 slot çiziyor; kod bugün seçimsiz ilk
  -- üçünü kesiyor (`HOME_PACKAGE_LIMIT`). İşaret SEÇİMDİR, sıra `sort_order`'dan gelir.
  -- `is_active` ile karıştırılmaz: aktiflik "satışta mı", bu "ana sayfada mı".
  is_featured boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index bundle_slug_key on public.bundle (slug);
create index bundle_featured_idx on public.bundle (sort_order) where is_featured;

-- Paket kalemi. `allocated_unit_price` MÜŞTERİYE GÖRÜNMEZ: iç muhasebe aracıdır — faturada her
-- kalemin KDV'si kendi ürününün oranından işlensin diye gerekli (baklava %5,5, malzeme %20).
-- Σ(allocated × qty) = bundle.total_price kuralını uygulama katmanı doğrular (motor: domain-core);
-- SQL check'e konamaz, çünkü kural satır değil KÜME üzerindedir.
create table public.bundle_item (
  id uuid primary key default gen_random_uuid(),
  bundle_id uuid not null references public.bundle (id) on delete cascade,
  -- `restrict`: pakette duran varyant silinemez. Varyant silme zaten okunabilir hataya çevriliyor
  -- (ProductVariantService.deleteVariant) — paket de o cümlenin kaynaklarından biri olur.
  variant_id uuid not null references public.product_variant (id) on delete restrict,
  qty int not null check (qty > 0),
  allocated_unit_price numeric(10, 2) not null check (allocated_unit_price >= 0), -- 0 = hediye kalem
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
-- Kalemler paket başına ve SIRALI okunur.
create index bundle_item_bundle_idx on public.bundle_item (bundle_id, sort_order);
-- Aynı varyant bir pakete iki kez giremez — "iki tane" demek için adet artırılır. İki satır olsaydı
-- müşteri aynı ürünü listede iki kez görürdü ve toplam doğrulaması sessizce iki yerden beslenirdi.
create unique index bundle_item_variant_key on public.bundle_item (bundle_id, variant_id);

-- Ürün ↔ koleksiyon çoklu bağı (bir ürün birçok koleksiyona girer).
-- position: koleksiyon İÇİNDEKİ vitrin sırası — admin sürükle-bırakla kürasyon yapar.
create table public.product_collections (
  product_id uuid not null references public.product (id) on delete cascade,
  collection_id uuid not null references public.collection (id) on delete cascade,
  position int not null default 0,
  primary key (product_id, collection_id)
);
-- Üyeler koleksiyon başına sıralı okunur; PK'nın baş kolonu product_id olduğu için collection_id ile
-- filtreleyen sorgular o indeksten yararlanamaz.
create index product_collections_order_idx on public.product_collections (collection_id, position);

alter table public.bundle enable row level security;
alter table public.bundle_item enable row level security;
alter table public.product enable row level security;
alter table public.product_variant enable row level security;
alter table public.product_collections enable row level security;
alter table public.product_image enable row level security;


-- ═══ FİYAT (03.4) ═══
-- Buraya AYRI BİR MIGRATION dosyasından taşındı (02.11 · denetim P2 — aile içi
-- birleştirme). İçerik değişmedi; eski dosya numarasıyla anılmıyor, çünkü o numara artık yok.

-- Modül 05 — Katalog: fiyat (05.4). Fiyat VARYANT seviyesindedir; aynı tablo üç işi görür:
-- kanal listesi (customer_id boş), müşteriye özel fiyat (customer_id dolu), tarihli geçerlilik.
-- Çözüm sırası ve KDV tabanı: DOMAIN §5, motor: packages/domain-core/src/pricing.
-- RLS deny-by-default (0001 deseni); erişim sunucudan service_role ile.

-- Kanal — *kim* alıyor. Order ve Customer türetimi de bu tipi kullanacak (DATA_MODEL enum listesi).
create type channel as enum ('b2b', 'b2c');

-- Tek pazar → tek para birimi; çoklu döviz Faz 1'de yok (tip yine de açık, ileride genişler).
create type currency as enum ('EUR');

create table public.price (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references public.product_variant (id) on delete cascade,
  channel channel not null,
  -- Dolu → o müşteriye özel fiyat. FK YOK: `customer` tablosu henüz açılmadı (modül 04);
  -- tablo gelince bu kolona FK eklenir (greenfield — bu dosya o gün yerinde düzenlenir).
  customer_id uuid,
  -- KANAL TABANINDA tutulur: b2c satırları KDV dahil (TTC), b2b satırları hariç (HT) — DOMAIN §5.
  amount numeric(10, 2) not null check (amount >= 0),
  currency currency not null default 'EUR',
  -- Tarihli geçerlilik: aynı (varyant, kanal, müşteri) için birden çok satır olabilir; çözümde
  -- "geçmiş ve en yeni" kazanır. Gelecek tarihli satır fiyat değişimini önceden hazırlar.
  valid_from timestamptz not null default now(),
  created_at timestamptz not null default now()
);

-- Fiyat çözümünün tek sorgu yolu: varyant + kanal + (müşteri | liste) → en yeni geçerli satır.
create index price_lookup_idx on public.price (variant_id, channel, customer_id, valid_from desc);

alter table public.price enable row level security;
