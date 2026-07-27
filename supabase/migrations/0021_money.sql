-- Modül 12 — Para: hesaplar + hareketler (12.1). DOMAIN §9, data-model/para.md.
--
-- TEK MANTIK: para bir hesapta durur, hareketlerle girer/çıkar. Kasa hareketi ile banka hareketi
-- AYNI ŞEYDİR, yalnız hesabı farklıdır — bu yüzden tek tablo, "kasa defteri / banka defteri" ayrımı
-- yok. "Online havuz" da ayrı bir kavram değil: Stripe bir hesaptır.
--
-- BAKİYE KOLONU YOKTUR. Bakiye hareketlerden türetilir (DATA_MODEL kalıcı kararlar: sayaç tutulmaz;
-- saklanan bakiye bir gün kayar ve hangi hareketin kaydırdığı bulunamaz). Türetim tek yerde:
-- `account_movement` görünümü.

create type account_type as enum ('cash', 'bank', 'provider');
create type movement_direction as enum ('in', 'out');
create type movement_type as enum (
  'order_payment', 'order_refund', 'purchase', 'expense', 'transfer', 'capital', 'misc'
);
create type movement_source as enum ('manual', 'bank_import');

create table public.account (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type account_type not null,
  currency currency not null default 'EUR',
  -- Hesap SİLİNMEZ, pasifleşir: geçmiş hareketleri ona bağlıdır (kapanan banka hesabı da tarihtir).
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index account_name_key on public.account (lower(name));

create table public.money_movement (
  id uuid primary key default gen_random_uuid(),
  -- Hesap silinemez (restrict): hareketi olan hesap yok edilirse para izi kopar.
  account_id uuid not null references public.account (id) on delete restrict,
  direction movement_direction not null,
  amount numeric(12, 2) not null check (amount > 0),
  -- Sıfır tutarlı hareket bilgi taşımaz; YÖN ayrı alandır, işaret tutara gömülmez (raporda
  -- "− yazılmış giriş" gibi çift-anlamlı satır doğmasın).
  type movement_type not null,
  -- Kategori SERBEST METİN, enum değil: gider kalemleri işletmeyle büyür (kira, akaryakıt, maaş,
  -- advertising…); enum olsaydı her yeni kalem migration isterdi.
  category text,
  -- Ek etiket. Reklam giderinde `{"campaign": "..."}` — kampanya gideri ile cirosu yan yana
  -- konabilsin diye (gerçek ROI, 12.5/13); Excel'e taşınmaz.
  meta jsonb,
  -- TRANSFER TEK SATIRDIR. İki satır (çift kayıt) yazmak yerine karşı hesap burada tutulur; hareket
  -- karşı hesaba TERS işaretle yansır (`account_movement`). Sebebi: iki satır arasındaki bağ
  -- kopabilir (biri silinir/düzeltilir) ve "yarım transfer" hiçbir yerde görünmez.
  counter_account_id uuid references public.account (id) on delete restrict,
  order_id uuid references public.order (id) on delete set null,
  stock_intake_id uuid references public.stock_intake (id) on delete set null,
  supplier_id uuid references public.supplier (id) on delete set null,
  -- Paranın gerçekten hareket ettiği gün. Kayıt günü (`created_at`) ondan farklı olabilir: dünkü
  -- nakit bugün girilir, banka satırı üç gün sonra import edilir. Raporlar bu tarihi okur.
  value_date date not null default current_date,
  description text,
  source movement_source not null default 'manual',
  -- Banka ekstresiyle eşleşti mi (12.4). Elle girilen hareket eşleşmeyi bekler.
  reconciled boolean not null default false,
  created_at timestamptz not null default now(),

  -- Transferin karşı ucu ZORUNLU ve kendisi olamaz; transfer olmayan harekette karşı hesap ANLAMSIZ.
  -- Veritabanı burada duruyor çünkü ihlali veri bozukluğudur: karşı ucu olmayan transfer, bakiyeyi
  -- sessizce kaydırır. Zenginleştirilmiş kurallar (tipten yön türetimi) motordadır.
  constraint money_movement_transfer_shape check (
    (type = 'transfer' and counter_account_id is not null and counter_account_id <> account_id)
    or (type <> 'transfer' and counter_account_id is null)
  )
);

-- Hesap ekstresi: "bu hesapta ne oldu", en yeni önce (sonsuz kaydırma).
create index money_movement_account_idx on public.money_movement (account_id, value_date desc);
-- Transferin karşı ucu da o hesabın ekstresine düşer.
create index money_movement_counter_idx on public.money_movement (counter_account_id, value_date desc)
  where counter_account_id is not null;
-- Siparişin tahsilat/iade toplamı (12.2 — `amount_*` cache'inin kaynağı).
create index money_movement_order_idx on public.money_movement (order_id) where order_id is not null;
-- Tedarikçi borcu türetimi (12.3): Σ giriş − Σ ödeme.
create index money_movement_supplier_idx on public.money_movement (supplier_id) where supplier_id is not null;
-- Dönem raporları ve muhasebe export'u (12.6/12.7) tarihe göre tarar.
create index money_movement_period_idx on public.money_movement (value_date desc, type);
-- Eşleşme kuyruğu (12.4): eşleşmemiş satırlar azınlıktır → kısmi indeks.
create index money_movement_unreconciled_idx on public.money_movement (account_id, value_date)
  where not reconciled;

-- ── Defter satırı ────────────────────────────────────────────────────────────
-- Bir hareket DOKUNDUĞU HER HESAPTA bir satır üretir: normal hareket bir, transfer iki. İşaret
-- kuralının TEK uygulaması burasıdır — bakiye de hesap ekstresi de bunun üstünde durur, kural
-- SQL'de ve TypeScript'te ayrı ayrı yazılmaz.
create or replace view public.account_movement as
select m.*,
       m.account_id as ledger_account_id,
       case when m.direction = 'in' then m.amount else -m.amount end as signed_amount
  from public.money_movement m
union all
-- Transferin karşı ucu: para gönderenden çıkıp alana girer → işaret ters.
select m.*,
       m.counter_account_id as ledger_account_id,
       case when m.direction = 'in' then -m.amount else m.amount end as signed_amount
  from public.money_movement m
 where m.counter_account_id is not null;

-- ── Bakiye ───────────────────────────────────────────────────────────────────
-- Hiç hareketi olmayan hesap da listede görünür (0 bakiyeyle) — `left join`; aksi halde yeni açılan
-- hesap ekranda hiç çıkmazdı.
create or replace view public.account_balance as
select a.id                                        as account_id,
       coalesce(sum(l.signed_amount), 0)::numeric(14, 2) as balance,
       count(l.id)                                 as movement_count
  from public.account a
  left join public.account_movement l on l.ledger_account_id = a.id
 group by a.id;

alter table public.account enable row level security;
alter table public.money_movement enable row level security;
