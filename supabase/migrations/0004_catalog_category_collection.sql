-- Modül 05 — Katalog: kategori + koleksiyon (düz gruplama).
-- Ürün/varyant (task 3) ve product_collections çoklu bağı (Product FK'sine muhtaç) sonraki
-- migration'da gelir. Erişim modeli 0001 ile aynı: RLS deny-by-default; erişim sunucudan
-- service_role ile (RLS baypas). Client-side anon okuma gerekirse aktif-satır read policy'si eklenir.

-- ── category — düz, tek seviye; her ürün tek kategoride (DATA_MODEL, DOMAIN §13) ──
create table public.category (
  id uuid primary key default gen_random_uuid(),
  name jsonb not null,                          -- LocalizedText {tr?,fr?,de?}
  slug text not null,                           -- dil-bağımsız URL parçası (SEO_I18N)
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index category_slug_key on public.category (slug);

-- ── collection — esnek pazarlama grubu (Bayram/Yeni/İndirimde); ürün çok koleksiyona girer ──
create table public.collection (
  id uuid primary key default gen_random_uuid(),
  name jsonb not null,
  slug text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index collection_slug_key on public.collection (slug);

-- RLS — deny-by-default (0001 deseni). Erişim sunucudan service_role ile.
alter table public.category enable row level security;
alter table public.collection enable row level security;
