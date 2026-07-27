-- Modül 07 — Teslimat bölgesi (07.2). DOMAIN §6, ADR-002 (sınır ötesi posta kodları).
--
-- **Rota-içi/dışı SAKLANMAZ, türetilir:** adresin posta kodu aktif bir bölgeye düşüyorsa rota içi,
-- düşmüyorsa kargo. Adres tablosunda `in_route` diye bir kolon bilerek yok.
--
-- Bölgeler admin-editable: posta kodu kümesi ve haftalık günler kod sabiti değildir. Alman (Baden)
-- posta kodları da bir bölgeye dahil edilebilir — sınır, rotanın değil devletin çizgisidir.

create table public.delivery_zone (
  id uuid primary key default gen_random_uuid(),
  name text not null,                                -- iç etiket ("Strasbourg Kuzey")
  postal_codes text[] not null default '{}',
  -- Haftalık teslimat günleri, ISO: 1=Pazartesi … 7=Pazar.
  weekdays int[] not null default '{}',
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Posta kodundan bölgeye: checkout'un sıcak yolu ("bu adres rota içinde mi").
create index delivery_zone_postal_idx on public.delivery_zone using gin (postal_codes);

alter table public.delivery_zone enable row level security;

-- Sipariş bölgeye bağlanır (0015'te FK'siz açılmıştı — tablo geldi, bağ kuruldu).
-- `restrict` DEĞİL `set null`: bölge kapatılsa bile geçmiş sipariş silinmemeli; siparişteki alan
-- zaten snapshot niteliğindedir (bölge sınırı sonradan değişebilir).
alter table public.order add constraint order_delivery_zone_fk
  foreign key (delivery_zone_id) references public.delivery_zone (id) on delete set null;
