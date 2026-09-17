-- Katalog: ürün + varyant + galeri + paket + ürün-koleksiyon bağı + fiyat.
-- Paylaşılan alanlar üründe, satılabilir birim varyantta (DOMAIN §13); RLS deny-by-default.

create type product_date_type as enum ('DLC', 'DDM');

-- Saklama rejimi — soğuk zincirin kendisi: `shippable` teslimat olgusudur, bu saklama olgusu; donuk ürünün iadesi
-- varsayılan olarak imha edilir (DOMAIN §8). Üç değer, çünkü soğuk zincir işareti chilled ve frozen'da çıkar ama imha
-- varsayılanı yalnız frozen'da doğar; varsayılan `frozen`, çünkü unutulan alanın bedeli gıda güvenliği tarafında kalmalı.
create type product_storage_type as enum ('ambient', 'chilled', 'frozen');

-- Satış durumu tek alanda: iki bayrak (aday + aktif) davranışta aynı olan imkânsız kombinasyonlara yer açardı.
--   active    → satışta
--   passive   → satışta değil, katalogda gizli
--   candidate → aday: satılamaz, yalnız keşif akışında görünür (DOMAIN §13)
create type product_status as enum ('active', 'passive', 'candidate');

-- AB'nin 14 alerjeni (FR/DE'de yasal beyan zorunlu); anahtar ASCII, görünen ad arayüzde.
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
  -- Görsel künyesi: tek 3:2 kaynak + odak; müşteri çerçeveleri buradan object-position ile türer, kırpılmış kopya tutulmaz.
  image_key text,                                    -- depo anahtarı, tam URL değil (STACK §5)
  image_focal_x smallint not null default 50,        -- odak %, 0-100 (object-position X)
  image_focal_y smallint not null default 50,        -- odak %, 0-100 (object-position Y)
  image_zoom smallint not null default 100,          -- zoom %, 100-400 (dikey/kare kaynağı yatay banda kırpar)
  -- LocalizedText; boşsa ürün adına düşer, bu yüzden ürün formunda ve yayın kısıtında yok.
  image_alt jsonb,
  image_updated_at timestamptz,                      -- görsel dosyasının sürüm damgası (gerekçe: 0004 kategori satırı)
  image_width smallint,                              -- kaynak ölçüsü (gerekçe: 0004 kategori satırı)
  image_height smallint,
  -- Yasal beyan (INCO). Metinler düz metin + `**vurgu**` işaretidir, HTML saklanmaz (temizleme yükü, XSS, çevirinin
  -- etiket bozması); vurgu türetilemez, çünkü INCO alerjenin listede yazıldığı hâlinin vurgulanmasını ister.
  ingredients jsonb,                                 -- LocalizedText, çok dilli içindekiler
  nutrition jsonb,                                   -- SABİT kalemli (100 g başına) — NutritionSchema
  storage_instructions jsonb,                        -- LocalizedText; saklama/hazırlama metni
  allergens product_allergen[] not null default '{}', -- AB 14 yasal beyan (manuel seçim)
  -- "Beyan eksik" tek kaynakta: süzgeç ve sayaç aynı üretilmiş kolonu okur, hangi beyanın eksik olduğunu uygulama söyler
  -- (`missingDeclarations`). Çok dilli alanlar varlığa değil doluluğa bakar (`has_all_locales`), çünkü boş dize dolu
  -- sayılırsa müşteri sessizce yedek dili görür.
  is_incomplete boolean generated always as (
    not public.has_all_locales(name)
    or not public.has_all_locales(ingredients)
    or not public.has_all_locales(storage_instructions)
    or nutrition is null
    or allergens = '{}'
  ) stored,
  traces product_allergen[] not null default '{}',   -- çapraz bulaşma; cümle i18n şablonuyla kurulur
  -- Fransa gıda oranları 5,5 (paketli/donuk) · 10 (hazır tüketim) · 20 (gıda dışı); kısıt yok, oran mali bir karardır
  -- ve mevzuatla değişir.
  vat_rate numeric(4, 2) not null default 5.5,
  date_type product_date_type not null default 'DDM',
  shelf_life_days int,                               -- toplam raf ömrü (gün); kalan % = (parti.dlc − bugün) ÷ bu
  -- Varsayılan `false` (yalnız rota/kapı): unutulan kargo izninin bedeli "satılamadı" olmalı, "çözülmüş ulaştı" değil.
  shippable boolean not null default false,
  -- Saklama rejimi — `shippable` ile karıştırılmaz: o satış kanalını, bu iade/imha ve vitrin işaretini belirler.
  storage_type product_storage_type not null default 'frozen',
  -- Varsayılan `candidate`: formu atlayan her yazan (asistan, servis, seed) kolonun varsayılanını alır ve ürün beyansız
  -- satışa doğmamalı; yayın kısıtının da ön şartı, çünkü yeni ürün üç dili dolmadan doğar.
  status product_status not null default 'candidate',
  target_margin_percent numeric(5, 2),              -- hedef kâr marjı (markup %); marj uyarısı / oto-fiyat
  target_margin_b2b_percent numeric(5, 2),          -- B2B'ye özel hedef; boş = ortak hedef geçerli
  auto_price boolean not null default false,         -- açıksa fiyat hedef marja göre otomatik
  sort_order int not null default 0,

  -- Ürün ailesi — çeşit ekseni; aile silinirse üyeler ürün olarak yaşar, etiket kısıtı etiketin de aileyle düşmesini zorlar.
  family_id uuid references public.product_family (id) on delete set null,

  -- Aile içi kart etiketi ("Limonlu") — ürün adından ayrı ve üç dilli; ortak eki kırparak türetmek "Kek Dilimi" gibi
  -- adlarda bozulur.
  family_label jsonb,                                -- LocalizedText {tr?,fr?,de?}

  -- Aile içindeki sıra (operatörün sürüklediği); `sort_order` katalog sırasıdır, iki karar tek kolona bağlanmaz.
  -- Tekillik aranmaz: toplu yeniden sıralamanın ara hâli geçici olarak çakışır.
  family_position int not null default 0,

  -- Aile üyesinin etiketi zorunlu: ekranda unutulduğunda kart sessizce ürün adına düşer ve doğru görünür.
  constraint product_family_label_required check (family_id is null or family_label is not null),

  -- Yayın üç dil ister — yedek dil zinciri eksik çeviriyi sessizce kapattığı için kural veride, yazma anında değil yayın
  -- anında (ürün aday doğar, üç dil dolunca satışa alınır). Kapsam yedeği olmayan metindir: `image_alt` ürün adına düştüğü,
  -- `nutrition` sabit kalemli olduğu için dışarıda.
  constraint product_publish_requires_all_locales check (
    status <> 'active'
    or (
      public.has_all_locales(name)
      and public.has_all_locales(description)
      and public.has_all_locales(ingredients)
      and public.has_all_locales(storage_instructions)
      and (family_id is null or public.has_all_locales(family_label))
    )
  ),

  created_at timestamptz not null default now()
);

-- Bir üyenin sayfasında "öteki çeşitler" okuması: aile + sıra.
create index product_family_idx on public.product (family_id, family_position) where family_id is not null;
create unique index product_slug_key on public.product (slug);
create index product_incomplete_idx on public.product (is_incomplete) where is_incomplete;
create index product_category_idx on public.product (category_id);

create type portion_kind as enum ('item', 'slice');

create table public.product_variant (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.product (id) on delete cascade,
  -- Müşteriye görünen boy etiketi ("700 g tepsi") — çok dilli; tek boylu üründe boş olabilir, birden çok varyantta en az
  -- bir dilin dolu olması form kuralıdır.
  label jsonb not null default '{}'::jsonb,          -- LocalizedText
  net_weight_g int,
  -- Paket içi adet ("12'li" ile "36'lı" aynı ürünün iki boyu) — gramajın yanında, ayrı soruya cevap verir;
  -- null = adet bilgisi yok (dökme ürün), sıfır değil.
  pieces_count int,
  -- Porsiyon türü: 4'lü simit dört ayrı parçadır, 12 dilimlik cheesecake tek pasta; ekran doğru kelimeyi ancak böyle yazar.
  -- Kaynaktan gelir, tahmin edilmez; null = tek parça ürün.
  portion_kind portion_kind,
  -- Ambalajlı ürün ölçüsü — kargonun girdisi; `net_weight_g` gıdanın INCO ağırlığıdır, bu taşınan kutunun.
  -- Milimetre ve gram, çünkü tam sayı alanı ondalığı sessizce yuvarlar; null = ölçülmedi, ölçülmüş ambalaj sıfır olamaz.
  packed_weight_g int check (packed_weight_g is null or packed_weight_g > 0),
  packed_length_mm int check (packed_length_mm is null or packed_length_mm > 0),
  packed_width_mm int check (packed_width_mm is null or packed_width_mm > 0),
  packed_height_mm int check (packed_height_mm is null or packed_height_mm > 0),
  min_stock_qty int,                                 -- asgari eşik (DOMAIN §16); null = öneri yok
  sku text,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now(),

  -- Üç ölçü birlikte yaşar ya da hiç: yarım kutu hacim vermez ama "ölçüsü var" diye okunurdu.
  -- Ağırlık kuralın dışında: kimi tarife yalnız ağırlığa bakar ve operatör önce tartıp sonra ölçebilir.
  constraint product_variant_packed_dims_all_or_none check (
    (packed_length_mm is null and packed_width_mm is null and packed_height_mm is null)
    or (packed_length_mm is not null and packed_width_mm is not null and packed_height_mm is not null)
  )
);
create index product_variant_product_idx on public.product_variant (product_id);

-- Ürün galerisi — detaydaki ek fotoğraflar; kapak burada tekrarlanmaz, liste ve kart onu ürün satırından okur.
-- Her fotoğrafın kendi odağı var ama tek çerçevede (detay 3:2) görünür.
create table public.product_image (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.product (id) on delete cascade,
  image_key text not null,                           -- depo anahtarı, tam URL değil (STACK §5)
  image_focal_x smallint not null default 50,        -- odak %, 0-100 (object-position X)
  image_focal_y smallint not null default 50,        -- odak %, 0-100 (object-position Y)
  image_zoom smallint not null default 100,          -- zoom %, 100-400
  image_alt jsonb,                                   -- LocalizedText; boşsa ürün adına düşer
  image_updated_at timestamptz,                      -- sürüm damgası (gerekçe: 0004 kategori satırı)
  image_width smallint,                              -- kaynak ölçüsü (gerekçe: 0004 kategori satırı)
  image_height smallint,
  sort_order int not null default 0,                 -- müşteri galerisinin sırası (sürükle-bırak)
  created_at timestamptz not null default now()
);
-- Galeri her zaman ürün başına ve SIRALI okunur.
create index product_image_product_idx on public.product_image (product_id, sort_order);

-- ── Paket (bundle) ───────────────────────────────────────────────────────────────────────────────
-- Birden çok ürünü tek fiyata sunan katalog kısayolu (DOMAIN §13): sepette her kalem ayrı `order_item` olur, bu yüzden
-- paketin varyantı, stoğu ve KDV'si yok. Yalnız B2C'dedir ve `total_price` KDV dahil tek sayıdır; `0012`deki
-- `order_item.bundle_id` bu tabloya bağlandığı için ürün migration'ında durur.
create table public.bundle (
  id uuid primary key default gen_random_uuid(),
  name jsonb not null,                               -- LocalizedText
  description jsonb,                                 -- LocalizedText; listede kısa, detayda tam
  slug text not null,                                -- sosyal paylaşımın tek bağlantısı (dil-bağımsız)
  -- Görsel künyesi ürünle aynı alanlar: tek 3:2 kaynak + odak, müşteri çerçeveleri buradan türer.
  image_key text,
  image_focal_x smallint not null default 50,
  image_focal_y smallint not null default 50,
  image_zoom smallint not null default 100,
  image_alt jsonb,
  image_updated_at timestamptz,
  image_width smallint,                              -- kaynak ölçüsü (gerekçe: 0004 kategori satırı)
  image_height smallint,
  total_price numeric(10, 2) not null,               -- müşterinin gördüğü TEK fiyat, TTC
  -- "6 kişilik" künyesi — serbest metne gömülmez: boşsa satır hiç çizilmez.
  serves int,
  is_active boolean not null default true,
  sort_order int not null default 0,                 -- kürelenmiş vitrin sırası (müşteri sıralamaz)
  -- Ana sayfada göster — seçimdir, sıra `sort_order`dan; `is_active` "satışta mı", bu "ana sayfada mı".
  is_featured boolean not null default false,
  created_at timestamptz not null default now()
);
create unique index bundle_slug_key on public.bundle (slug);
create index bundle_featured_idx on public.bundle (sort_order) where is_featured;

-- Paket kalemi. `allocated_unit_price` müşteriye görünmez: faturada her kalemin KDV'si kendi ürününün oranından işlensin diye var.
-- Σ(allocated × qty) = total_price kuralı küme üzerinde olduğu için SQL check'te değil, uygulamada (domain-core) doğrulanır.
create table public.bundle_item (
  id uuid primary key default gen_random_uuid(),
  bundle_id uuid not null references public.bundle (id) on delete cascade,
  -- `restrict`: pakette duran varyant silinemez; silme hatası okunur cümleye çevrilir (`ProductVariantService.deleteVariant`).
  variant_id uuid not null references public.product_variant (id) on delete restrict,
  qty int not null check (qty > 0),
  allocated_unit_price numeric(10, 2) not null check (allocated_unit_price >= 0), -- 0 = hediye kalem
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
-- Kalemler paket başına ve SIRALI okunur.
create index bundle_item_bundle_idx on public.bundle_item (bundle_id, sort_order);
-- Aynı varyant bir pakete iki kez giremez — "iki tane" adetle söylenir, iki satır toplam doğrulamasını iki yerden beslerdi.
create unique index bundle_item_variant_key on public.bundle_item (bundle_id, variant_id);

-- Ürün ↔ koleksiyon çoklu bağı; `position` koleksiyon içindeki vitrin sırasıdır (sürükle-bırak).
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


-- ═══ FİYAT ═══
-- Fiyat varyant seviyesindedir ve tek tablo üç işi görür: kanal listesi (customer_id boş), müşteriye özel fiyat, tarihli
-- geçerlilik. Çözüm sırası ve KDV tabanı DOMAIN §5, motor `packages/domain-core/src/pricing`; erişim service_role ile.

-- Kanal — kim alıyor; sipariş ve müşteri türetimi de bu tipi kullanır.
create type channel as enum ('b2b', 'b2c');

-- Tek pazar, tek para birimi; tip genişlemeye açık.
create type currency as enum ('EUR');

-- Müşteri fiyat grubu — B2B'nin alt kademeleri; fark indirim değil fiyattır, kampanyayla yarışmaz. Çözüm müşteriye özel →
-- grup → liste (`domain-core/resolve-price`); satır bazlı grup listesi yok, katalog bakımı grup sayısıyla çarpılırdı.
create table public.price_group (
  id uuid primary key default gen_random_uuid(),
  -- Operatörün tanıyacağı ad ("Market", "Restoran / Pastane") — iç etiket, müşteriye görünmez.
  name text not null,
  -- B2B listeden düşülen yüzde; 0 grubu listeyle eşitler, 100 bedava demektir, ikisi de anlamsız.
  percent_off numeric(5, 2) not null check (percent_off > 0 and percent_off < 100),
  created_at timestamptz not null default now()
);

alter table public.price_group enable row level security;

create table public.price (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null references public.product_variant (id) on delete cascade,
  channel channel not null,
  -- Dolu → o müşteriye özel fiyat; FK `0011_customer_fields.sql`te eklenir, `customer` tablosu bu dosyadan sonra açılıyor.
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
