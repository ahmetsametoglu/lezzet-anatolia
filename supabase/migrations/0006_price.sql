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
