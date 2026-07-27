-- Modül 05 — Katalog: ürün + varyant + ürün-koleksiyon bağı.
-- Paylaşılan alanlar Product'ta; satılabilir birim ProductVariant (DATA_MODEL, DOMAIN §13).
-- product_collections = task 1'de ertelenen çoklu bağ (artık Product FK'si var). RLS deny-by-default.
-- Incremental: ingredients/nutrition alanları ilgili özellikleriyle sonra.

create type product_date_type as enum ('DLC', 'DDM');

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
  allergens product_allergen[] not null default '{}', -- AB 14 yasal beyan (manuel seçim)
  vat_rate numeric(4, 2) not null default 5.5,       -- 5.5 / 20
  date_type product_date_type not null default 'DDM',
  shelf_life_days int,                               -- toplam raf ömrü (gün); kalan % = (parti.dlc − bugün) ÷ bu
  shippable boolean not null default true,           -- false = yalnız rota/kapı (soğuk zincir)
  is_candidate boolean not null default false,       -- aday: keşifte gösterilir, satılamaz (DOMAIN §13)
  is_active boolean not null default true,
  target_margin_percent numeric(5, 2),              -- hedef kâr marjı (markup %); marj uyarısı / oto-fiyat
  auto_price boolean not null default false,         -- açıksa fiyat hedef marja göre otomatik (motor sonraki modül)
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create unique index product_slug_key on public.product (slug);
create index product_category_idx on public.product (category_id);

create table public.product_variant (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.product (id) on delete cascade,
  label text not null,                               -- "70gr"/"500gr"; tek varyantlıda varsayılan
  net_weight_g int,
  min_stock_qty int,                                 -- asgari eşik (DOMAIN §16); null = öneri yok
  sku text,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index product_variant_product_idx on public.product_variant (product_id);

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

alter table public.product enable row level security;
alter table public.product_variant enable row level security;
alter table public.product_collections enable row level security;
