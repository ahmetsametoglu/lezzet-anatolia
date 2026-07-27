-- Modül 06 — Stok: parti (`stock`) + rezervasyon (`reservation`). Kurallar: DOMAIN §4.
--
-- Temel denklem: KULLANILABİLİR = FİİLİ − AKTİF REZERVASYON. "Ayrılmış toplam" hiçbir yerde
-- SAKLANMAZ; `reservation` satırlarından türetilir (DATA_MODEL kalıcı kararlar: sayaç tutulmaz,
-- kayarsa izi bulunamaz). Bu yüzden burada `reserved_qty` kolonu yoktur — arayan `available_stock`
-- görünümünü okur.
--
-- Atomik ayırma bu dosyada değil, `0008_reserve_stock.sql`'deki RPC'dedir (STACK §13 yazma eşiği:
-- eşzamanlılık yarışı olan yazım RPC'ye ödenir).
-- RLS deny-by-default (0001 deseni); erişim sunucudan service_role ile.

create table public.stock (
  id uuid primary key default gen_random_uuid(),
  -- Stok VARYANT seviyesindedir (satılabilir birim varyanttır). Parti silinmez → restrict.
  variant_id uuid not null references public.product_variant (id) on delete restrict,
  physical_qty int not null default 0 check (physical_qty >= 0),
  -- Partinin son tarihi. TİPİ üründedir (`product.date_type`): DLC = güvenlik (geçince satılamaz),
  -- DDM = kalite (geçse de satılır). Kolon adı bu yüzden tipten bağımsız: `expiry_date`.
  expiry_date date not null,
  lot_number text,                                   -- tedarikçinin lot no'su — geri çağırma (rappel) eşleşmesi
  -- BİRİM (paket) başına alış maliyeti. Toptan alınıp paketlenirse giriş paket adediyle yapılır
  -- (1 kg → 10 × 100 gr) ve maliyet pakete bölünür; gerçek COGS bu alandan çıkar (DOMAIN §12).
  purchase_price numeric(10, 2) check (purchase_price >= 0),
  -- Bağlı stok girişi. FK YOK: `stock_intake` tablosu 06.10'da açılır (greenfield — o gün eklenir).
  intake_id uuid,
  -- Doluysa bu parti indirimli teklifte (near-expiry). Fiyat çözümünde partiye çıpalı satır olur
  -- ve rezervasyonu `stock_id` ile bu partiye bağlanır (DOMAIN §5).
  offer_price numeric(10, 2) check (offer_price >= 0),
  location text,                                     -- depo konumu (dolap/raf)
  created_at timestamptz not null default now()
);

-- FEFO'nun tek okuma yolu: varyantın partileri son tarihe göre artan. Kullanılabilir hesabı da
-- varyant üzerinden toplanır, o yüzden baş kolon variant_id.
create index stock_variant_expiry_idx on public.stock (variant_id, expiry_date);
-- Teklif havuzu: indirimli partiler doğrudan süzülür (kısmi indeks — çoğu satır null).
create index stock_offer_idx on public.stock (variant_id) where offer_price is not null;

create table public.reservation (
  id uuid primary key default gen_random_uuid(),
  -- FK YOK: `order` tablosu 07'de açılır. Sipariş kapanınca satır silinir (teslim/iptal).
  order_id uuid not null,
  variant_id uuid not null references public.product_variant (id) on delete restrict,
  -- YALNIZ partiye bağlı teklif satırında dolu (batch-pinned). Normal rezervasyon varyant-toplamı
  -- seviyesindedir; parti seçimi hazırlıkta FEFO ile yapılır (DOMAIN §4).
  stock_id uuid references public.stock (id) on delete restrict,
  qty int not null check (qty > 0),
  -- Online checkout TTL'i (varsayılan 30 dk, `Setting`). Kapıda/vadeli rezervasyonda null:
  -- süresizdir, siparişin kendisi kapatır.
  expires_at timestamptz,
  created_at timestamptz not null default now()
);

-- Kullanılabilir hesabının sıcak yolu: varyantın aktif rezervasyonları.
create index reservation_variant_idx on public.reservation (variant_id);
-- Sipariş kapanışında toplu silme.
create index reservation_order_idx on public.reservation (order_id);
-- TTL süpürücüsü (06.4) yalnız süreli satırları tarar — kısmi indeks, tablo büyüdükçe fark açılır.
create index reservation_expires_idx on public.reservation (expires_at) where expires_at is not null;
-- Partiye çıpalı miktarın o partinin kullanılabilirinden düşülmesi (FEFO önerisi, 06.5).
create index reservation_stock_idx on public.reservation (stock_id) where stock_id is not null;

-- Kullanılabilir stok — TÜRETİLİR, saklanmaz. Süresi dolmuş rezervasyon sayılmaz (cron onu zaten
-- geri bırakır; görünüm cron'u beklemez). Varyant düzeyi: vitrin ve eşik uyarısı bunu okur.
--
-- Görünüm KARAR VERMEZ, olguyu toplar (STACK §13): `expired_dlc_qty` "tarihi geçmiş DLC partilerde
-- ne kadar var" olgusudur; "o yüzden satma" kararı motorundur. Satışa açık miktar isteyen çağıran
-- `available_qty − expired_dlc_qty` alır (parti kırılımı gerekiyorsa `listBatches` + motor).
create or replace view public.available_stock as
select
  v.id                                                as variant_id,
  coalesce(s.physical_qty, 0)                         as physical_qty,
  coalesce(r.reserved_qty, 0)                         as reserved_qty,
  greatest(coalesce(s.physical_qty, 0) - coalesce(r.reserved_qty, 0), 0) as available_qty,
  coalesce(s.expired_dlc_qty, 0)                      as expired_dlc_qty
from public.product_variant v
left join (
  select
    st.variant_id,
    sum(st.physical_qty) as physical_qty,
    sum(st.physical_qty) filter (where p.date_type = 'DLC' and st.expiry_date < current_date) as expired_dlc_qty
  from public.stock st
  join public.product_variant pv on pv.id = st.variant_id
  join public.product p on p.id = pv.product_id
  group by st.variant_id
) s on s.variant_id = v.id
left join (
  select variant_id, sum(qty) as reserved_qty
  from public.reservation
  where expires_at is null or expires_at > now()
  group by variant_id
) r on r.variant_id = v.id;

alter table public.stock enable row level security;
alter table public.reservation enable row level security;
