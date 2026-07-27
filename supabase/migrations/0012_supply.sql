-- Modül 06 — Tedarik zinciri: tedarikçi, ürün-kod eşlemesi, tedarik siparişi, mal kabul.
-- DOMAIN §16. İlke: **sistem önerir, siparişi insan verir**; sistem tedarikçiye hiçbir şey GÖNDERMEZ.
--
-- Zincir: PurchaseOrder (ne sipariş ettim) → StockIntake (ne geldi) → Stock partileri (nerede duruyor)
-- → MoneyMovement (ne ödedim, modül 12). Eksik gelen mal bu zincirde fark olarak görünür.

create table public.supplier (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact jsonb,                                     -- telefon/e-posta/adres
  vat_number text,                                   -- muhasebe eşleşmesi
  payment_term_days int,                             -- BİZE tanıdığı vade; null = peşin
  note text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Tedarikçiye borç SAKLANMAZ, türetilir: Σ girişler − Σ ödemeler (DOMAIN §16).

create table public.supplier_product (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.supplier (id) on delete cascade,
  variant_id uuid not null references public.product_variant (id) on delete cascade,
  supplier_code text not null,                       -- tedarikçinin sipariş kodu — liste onun diliyle yazılır
  name_at_supplier text,
  pack_qty int,                                      -- koli içi adet (sipariş koliyle veriliyorsa çeviri)
  last_purchase_price numeric(10, 2),                -- mal kabulde otomatik güncellenir — "geçen sefer kaçtı"
  is_preferred boolean not null default false,
  created_at timestamptz not null default now()
);

-- Aynı varyant aynı tedarikçide iki kez tanımlanmasın (kod değişirse satır güncellenir).
create unique index supplier_product_key on public.supplier_product (supplier_id, variant_id);
-- "Bu varyantı kimden alıyorum" — alternatif kaynak listesi.
create index supplier_product_variant_idx on public.supplier_product (variant_id);

create type purchase_order_status as enum ('draft', 'sent', 'received', 'cancelled');

create table public.purchase_order (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.supplier (id) on delete restrict,
  status purchase_order_status not null default 'draft',
  sent_at timestamptz,                               -- İNSAN gönderdikten sonra işaretlenir
  note text,
  created_at timestamptz not null default now()
);
create index purchase_order_supplier_idx on public.purchase_order (supplier_id, created_at desc);

create table public.purchase_order_item (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_order (id) on delete cascade,
  variant_id uuid not null references public.product_variant (id) on delete restrict,
  -- Kod eşlemesi; tedarikçide tanımlı değilse null (liste bizim adımızla yazılır).
  supplier_product_id uuid references public.supplier_product (id) on delete set null,
  qty int not null check (qty > 0),
  unit_price numeric(10, 2)                          -- beklenen alış (varsa)
);
create index purchase_order_item_order_idx on public.purchase_order_item (purchase_order_id);

create table public.stock_intake (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid references public.supplier (id) on delete restrict,
  -- Bağlı tedarik siparişi; PO'suz doğrudan giriş de mümkündür (küçük/plansız alım).
  purchase_order_id uuid references public.purchase_order (id) on delete set null,
  date date not null default current_date,
  total_amount numeric(10, 2) not null default 0,
  note text,
  created_at timestamptz not null default now()
);
create index stock_intake_supplier_idx on public.stock_intake (supplier_id, date desc);

-- Partiler girişe bağlanır (0007'de FK'siz açılmıştı — tablo geldi, bağ kuruldu).
alter table public.stock add constraint stock_intake_fk
  foreign key (intake_id) references public.stock_intake (id) on delete set null;

alter table public.supplier enable row level security;
alter table public.supplier_product enable row level security;
alter table public.purchase_order enable row level security;
alter table public.purchase_order_item enable row level security;
alter table public.stock_intake enable row level security;

-- ── Mal kabul (06.10) ────────────────────────────────────────────────────────
-- NEDEN RPC: dört tabloya bölünemez yazım — giriş kaydı + partiler + PO kapanışı + son alış fiyatı.
-- Yarısı yazılırsa "partiler girdi ama PO açık kaldı" gibi elle düzeltilecek tutarsızlık doğar
-- (STACK §13 (b) koşulu). MLOR uyarısı BURADA hesaplanmaz — o motorun işi, kabulü de engellemez.
--
-- p_lines: [{"variant_id":…,"qty":…,"expiry_date":…,"lot_number":…,"unit_cost":…,"location":…}]
create or replace function public.receive_intake(
  p_supplier_id uuid,
  p_lines jsonb,
  p_purchase_order_id uuid default null,
  p_date date default current_date,
  p_note text default null
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_intake_id uuid;
  v_line jsonb;
  v_total numeric(10, 2) := 0;
  v_qty int;
  v_cost numeric(10, 2);
  v_variant uuid;
  v_stock_ids uuid[] := '{}';
  v_stock_id uuid;
begin
  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    raise exception 'receive_intake: en az bir kalem gerekir';
  end if;

  insert into public.stock_intake (supplier_id, purchase_order_id, date, total_amount, note)
  values (p_supplier_id, p_purchase_order_id, p_date, 0, p_note)
  returning id into v_intake_id;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_variant := (v_line ->> 'variant_id')::uuid;
    v_qty := (v_line ->> 'qty')::int;
    v_cost := nullif(v_line ->> 'unit_cost', '')::numeric;

    if v_qty is null or v_qty <= 0 then
      raise exception 'receive_intake: kalem miktarı pozitif olmalı (varyant %)', v_variant;
    end if;

    insert into public.stock (variant_id, physical_qty, expiry_date, lot_number, purchase_price, intake_id, location)
    values (
      v_variant,
      v_qty,
      (v_line ->> 'expiry_date')::date,
      nullif(v_line ->> 'lot_number', ''),
      v_cost,
      v_intake_id,
      nullif(v_line ->> 'location', '')
    )
    returning id into v_stock_id;
    v_stock_ids := v_stock_ids || v_stock_id;

    v_total := v_total + coalesce(v_cost, 0) * v_qty;

    -- "Geçen sefer kaçtı" — eşleme varsa son alış fiyatı tazelenir.
    if v_cost is not null then
      update public.supplier_product
        set last_purchase_price = v_cost
        where variant_id = v_variant and supplier_id = p_supplier_id;
    end if;
  end loop;

  update public.stock_intake set total_amount = v_total where id = v_intake_id;

  -- Sipariş kapanır: "sipariş ettim ↔ gelen mal" halkası tamamlanır. Eksik gelen kalem farkı
  -- PO kalemleri ile giren partiler karşılaştırılarak GÖRÜNÜR olur (rapor işi, burada değil).
  if p_purchase_order_id is not null then
    update public.purchase_order set status = 'received' where id = p_purchase_order_id;
  end if;

  return jsonb_build_object('ok', true, 'intake_id', v_intake_id, 'stock_ids', to_jsonb(v_stock_ids), 'total_amount', v_total);
end;
$$;

revoke execute on function public.receive_intake(uuid, jsonb, uuid, date, text) from public, anon, authenticated;
