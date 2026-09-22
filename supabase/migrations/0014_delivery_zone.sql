-- Teslimat bölgesi. Rota içi/dışı saklanmaz, adresin posta kodundan türetilir; bölge sınır ötesi kod da
-- kapsayabilir (sınır rotanın değil devletin çizgisidir).

create table public.delivery_zone (
  id uuid primary key default gen_random_uuid(),
  name text not null,                                -- iç etiket ("Strasbourg Kuzey")
  -- Bölge tek depoya bağlıdır: posta kodu → bölge → depo zinciri tekil çözülür. FK yok: `warehouse` 0031'de açılır.
  warehouse_id uuid not null,
  -- Haftalık teslimat günleri, ISO: 1=Pazartesi … 7=Pazar. Günü olmayan rota hiçbir sefere düşmez, bu yüzden en az bir gün;
  -- form tek yazma yolu olmadığı için kural veride.
  weekdays int[] not null check (cardinality(weekdays) > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Posta kodu ↔ bölge: tekillik veride, çünkü iki bölgedeki aynı kod siparişi yanlış depoya düşürürdü. Anahtar
-- `(country, postal_code)`, çünkü `67000` iki ülkede de geçerli; pasif bölge de kodunu tutar.
create table public.delivery_zone_postal_code (
  country country_code not null,
  -- Normalize saklanır (boşluksuz, büyük harf) — arama tarafı da normalize eder; iki taraf aynı
  -- kuralı uygulamazsa "67 000" ile "67000" iki ayrı kod olur ve tekillik kâğıt üstünde kalır.
  postal_code text not null check (postal_code = upper(replace(postal_code, ' ', ''))),
  zone_id uuid not null references public.delivery_zone (id) on delete cascade,
  primary key (country, postal_code)
);

-- "Bu bölgenin kodları" — bölge ekranı ve rota listesi.
create index delivery_zone_postal_zone_idx on public.delivery_zone_postal_code (zone_id);

alter table public.delivery_zone enable row level security;
alter table public.delivery_zone_postal_code enable row level security;

-- Sipariş bölgeye bağlanır (0012'de FK'siz açılmıştı — tablo geldi, bağ kuruldu).
-- `restrict` DEĞİL `set null`: bölge kapatılsa bile geçmiş sipariş silinmemeli; siparişteki alan
-- zaten snapshot niteliğindedir (bölge sınırı sonradan değişebilir).
alter table public.order add constraint order_delivery_zone_fk
  foreign key (delivery_zone_id) references public.delivery_zone (id) on delete set null;
