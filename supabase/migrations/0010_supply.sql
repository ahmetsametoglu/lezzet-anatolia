-- Tedarik zinciri: tedarikçi, ürün-kod eşlemesi, tedarik siparişi ve mal kabul (DOMAIN §16).
-- Sistem önerir, siparişi insan verir; tedarikçiye sistemden hiçbir şey gitmez.

-- İki iş aynı tüzel kişiliğin iç ayrımıdır (docs/feature/iki-is.md); tür burada açılır, çünkü onu ilk kullanan tablo tedarikçidir.
create type public.business as enum ('qualite', 'lezzet');

create table public.supplier (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact jsonb,                                     -- telefon/e-posta/adres
  vat_number text,                                   -- muhasebe eşleşmesi
  -- ISO 3166-1 alfa-2; faturanın KDV rejimi buradan önerilir, çünkü Fransa dışındaki tedarikçinin KDV'siz faturası ters
  -- yüklemedir. Bilinmiyorsa NULL kalır, çünkü varsayılan ülke olmayan bir bilgiyi yazmak olurdu.
  country text,
  payment_term_days int,                             -- BİZE tanıdığı vade; null = peşin
  -- Belgelerinin varsayılan işi; iki işe birden satan tedarikçide boş kalır ve belge girişi seçim ister.
  default_business business,
  note text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),

  constraint supplier_country_iso check (country ~ '^[A-Z]{2}$')
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
-- Kod tedarikçi başına tekildir, çünkü aynı kod iki varyanta giderse faturadan çözüm belirsiz kalır. Kod yoksa anahtar
-- tedarikçideki adın slug'ıdır (`supplierItemKeyOf`); `lower` büyük-küçük harf farkının ikinci kayıt doğurmasını önler.
create unique index supplier_product_code_key on public.supplier_product (supplier_id, lower(supplier_code));
-- "Bu varyantı kimden alıyorum" — alternatif kaynak listesi.
create index supplier_product_variant_idx on public.supplier_product (variant_id);

-- Varyant başına tek tercihli tedarikçi veride zorlanır, çünkü alış önerisi fiyatı tercihli satırdan okur ve iki tercihli
-- satırda sipariş yanlış maliyetle açılırdı.
create unique index supplier_product_one_preferred_per_variant
  on public.supplier_product (variant_id)
  where is_preferred;

-- Durum saklanan bir sayaçtan değil kabullerden türer (`purchase_order_progress`), çünkü tek sipariş birden çok depoda parça
-- parça kabul edilebilir. Ölçü `initial_qty`'dir, çünkü `physical_qty` satışla erir.
create type purchase_order_status as enum ('draft', 'sent', 'partially_received', 'received', 'cancelled');

create table public.purchase_order (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.supplier (id) on delete restrict,
  status purchase_order_status not null default 'draft',
  -- Tedarikçinin referans verebileceği numara (`TS-26-4K2M9P`); rastgeledir, çünkü sıralı numara dışarıya iş hacmimizi
  -- söyler. Gönderimde üretilir, çünkü numara karşı tarafa verilen sözdür ve vazgeçilen taslak numara tüketmez.
  reference_no text unique,
  sent_at timestamptz,                               -- İNSAN gönderdikten sonra işaretlenir
  note text,
  created_at timestamptz not null default now(),
  -- Gönderilmiş siparişin numarası olmak zorunda. Ölçüt `status` değil `sent_at`, çünkü `receive_intake` siparişi `draft`tan
  -- doğrudan `received`a taşıyabilir ve o kayıtta numara yoktur.
  constraint purchase_order_sent_has_reference check (sent_at is null or reference_no is not null)
);
create index purchase_order_supplier_idx on public.purchase_order (supplier_id, created_at desc);

create table public.purchase_order_item (
  id uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references public.purchase_order (id) on delete cascade,
  variant_id uuid not null references public.product_variant (id) on delete restrict,
  -- Kod eşlemesi; tedarikçide tanımlı değilse null (liste bizim adımızla yazılır).
  supplier_product_id uuid references public.supplier_product (id) on delete set null,
  qty int not null check (qty > 0),
  unit_price numeric(10, 2),                         -- beklenen alış (varsa)
  -- İsteğe bağlı hedef depo: tedarikçi listesine yazılır ve depocu kendi payını oradan okur; niyet beyanıdır, mal fiilen
  -- hangi depoya girerse oraya yazılır. FK yok, çünkü `warehouse` 0031'de açılır.
  target_warehouse_id uuid
);
create index purchase_order_item_order_idx on public.purchase_order_item (purchase_order_id);

create table public.stock_intake (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid references public.supplier (id) on delete restrict,
  -- Bağlı tedarik siparişi; PO'suz doğrudan giriş de mümkündür (küçük/plansız alım).
  purchase_order_id uuid references public.purchase_order (id) on delete set null,
  -- Mal kabul depoya yapılır, çünkü sipariş depo-üstüdür ama mal bir kapıdan girer ve aynı siparişin ikinci kabulü başka
  -- depoda olabilir. FK yok, çünkü `warehouse` 0031'de açılır.
  warehouse_id uuid not null,
  date date not null default current_date,
  total_amount numeric(10, 2) not null default 0,
  note text,
  -- Kabulü yapan personel; doğan partilerin hareketleri de aynı kimliği taşır, ama "kim aldı" sorusu belgeden okunur.
  -- `set null`, çünkü geçmiş bir olayın kaydı kişinin bugünkü varlığına bağlı değildir.
  received_by uuid references public.user_profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index stock_intake_supplier_idx on public.stock_intake (supplier_id, date desc);

-- Partinin girişe bağı burada kurulur, çünkü `stock` tablosu bu tablodan önce açılır.
alter table public.stock add constraint stock_intake_fk
  foreign key (intake_id) references public.stock_intake (id) on delete set null;

alter table public.supplier enable row level security;
alter table public.supplier_product enable row level security;
alter table public.purchase_order enable row level security;
alter table public.purchase_order_item enable row level security;
alter table public.stock_intake enable row level security;

-- Mal kabul RPC'dir, çünkü giriş kaydı, partiler, sipariş durumu ve son alış fiyatı bölünemez bir yazımdır (STACK §13).
-- Sipariş durumu bu kabulden değil kabullerden türer, çünkü tek sipariş birden çok depoda kabul edilebilir.
--
-- p_lines: [{"variant_id":…,"qty":…,"expiry_date":…,"lot_number":…,"unit_cost":…,"storage_area_id":…,
--            "purchase_order_item_id":…}]
create or replace function public.receive_intake(
  p_supplier_id uuid,
  p_warehouse_id uuid,
  p_lines jsonb,
  p_purchase_order_id uuid default null,
  p_date date default current_date,
  p_note text default null,
  -- Kabulü yapan personel; seed ve bakım çağrıları aktörsüz yazar ve defter o hâlde "bilinmiyor" der.
  p_actor_id uuid default null
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
  v_po_item uuid;
  v_po_count int;
  v_stock_ids uuid[] := '{}';
  v_stock_id uuid;
  v_open int;
begin
  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    raise exception 'receive_intake: en az bir kalem gerekir';
  end if;
  if p_warehouse_id is null then
    raise exception 'receive_intake: depo zorunlu — mal bir kapıdan girer (DOMAIN §17)';
  end if;

  insert into public.stock_intake
    (supplier_id, warehouse_id, purchase_order_id, date, total_amount, note, received_by)
  values (p_supplier_id, p_warehouse_id, p_purchase_order_id, p_date, 0, p_note, p_actor_id)
  returning id into v_intake_id;

  for v_line in select * from jsonb_array_elements(p_lines)
  loop
    v_variant := (v_line ->> 'variant_id')::uuid;
    v_qty := (v_line ->> 'qty')::int;
    v_cost := nullif(v_line ->> 'unit_cost', '')::numeric;

    if v_qty is null or v_qty <= 0 then
      raise exception 'receive_intake: kalem miktarı pozitif olmalı (varyant %)', v_variant;
    end if;

    -- Hangi sipariş kalemini karşıladığı partinin kendisinde durur, çünkü parçalı kabulde ilerleme bu bağdan hesaplanır.
    v_po_item := nullif(v_line ->> 'purchase_order_item_id', '')::uuid;

    if p_purchase_order_id is not null then
      -- Siparişli kabulde bağ zorunludur, çünkü bağsız mal ilerlemede "0 geldi" görünür ve sipariş hep açık kalırdı. Kalem
      -- depocuya sorulmaz: siparişte o varyanttan tek kalem varsa sistem çözer, birden çoksa varsayılan seçmeden reddeder.
      if v_po_item is null then
        -- `select … into` birden çok satırda sessizce ilkini alırdı, bu yüzden sayı ayrıca okunur. uuid'nin `min()` agregatı
        -- yok; tek satırda `array_agg(...)[1]` aranan kalemdir.
        select count(*), (array_agg(poi.id))[1] into v_po_count, v_po_item
          from public.purchase_order_item poi
         where poi.purchase_order_id = p_purchase_order_id and poi.variant_id = v_variant;

        if v_po_count = 0 then
          raise exception 'receive_intake: varyant % bu tedarik siparişinde yok — kalem kimliği gerekli', v_variant;
        elsif v_po_count > 1 then
          raise exception 'receive_intake: varyant % siparişte % kalemde geçiyor — hangisi olduğu yazılmalı',
            v_variant, v_po_count;
        end if;
      end if;

      -- Başka bir PO'nun kalemi bu kabule yazılamaz: yazılsaydı hiç mal gelmemiş bir sipariş
      -- ilerlemede tamamlanmış görünürdü.
      if not exists (
        select 1 from public.purchase_order_item
         where id = v_po_item and purchase_order_id = p_purchase_order_id
      ) then
        raise exception 'receive_intake: kalem % bu tedarik siparişine ait değil', v_po_item;
      end if;
    end if;

    insert into public.stock (
      warehouse_id, variant_id, physical_qty, expiry_date, lot_number, purchase_price,
      intake_id, purchase_order_item_id, storage_area_id
    )
    values (
      p_warehouse_id,
      v_variant,
      v_qty,
      (v_line ->> 'expiry_date')::date,
      nullif(v_line ->> 'lot_number', ''),
      v_cost,
      v_intake_id,
      v_po_item,
      -- Alan kimliktir; alan ile depo arasında kısıt olmadığı için yanlış tesisin alanını kabul kapısı reddeder.
      nullif(v_line ->> 'storage_area_id', '')::uuid
    )
    returning id into v_stock_id;
    v_stock_ids := v_stock_ids || v_stock_id;

    -- Partinin doğuşu da harekettir, çünkü defterin değişmezi `Σ(in) − Σ(out) = physical_qty`'dir. Aktör verilmezse NULL
    -- kalır: seed ve bakım çağrısında kişi yoktur ve uydurmak defterin bilmediğini yazmak olurdu.
    insert into public.stock_movement
      (stock_id, direction, qty, kind, unit_cost, intake_id, actor_id)
    values
      (v_stock_id, 'in', v_qty, 'intake', v_cost, v_intake_id, p_actor_id);

    v_total := v_total + coalesce(v_cost, 0) * v_qty;

    -- "Geçen sefer kaçtı" — eşleme varsa son alış fiyatı tazelenir.
    if v_cost is not null then
      update public.supplier_product
        set last_purchase_price = v_cost
        where variant_id = v_variant and supplier_id = p_supplier_id;
    end if;
  end loop;

  update public.stock_intake set total_amount = v_total where id = v_intake_id;

  -- Sipariş durumu kabullerden türer (`purchase_order_progress`, 0031), çünkü çok depoda tek kabul siparişi kapatmamalı.
  -- Fonksiyon gövdesi geç bağlanır: görünüm 0031'de doğar ve ilk çağrıya kadar yerindedir.
  if p_purchase_order_id is not null then
    select count(*) into v_open
      from public.purchase_order_progress
     where purchase_order_id = p_purchase_order_id and missing_qty > 0;

    update public.purchase_order
       set status = (case when v_open = 0 then 'received' else 'partially_received' end)::purchase_order_status
     where id = p_purchase_order_id
       -- İptal edilmiş siparişe gelen mal durumu geri diriltmez: iptal bir karardır, kabul olgu.
       and status <> 'cancelled';
  end if;

  return jsonb_build_object('ok', true, 'intake_id', v_intake_id, 'stock_ids', to_jsonb(v_stock_ids), 'total_amount', v_total);
end;
$$;

-- `revoke` fonksiyonu tam imzasıyla arar; parametre eklenince imza burada da güncellenir, yoksa migration durur.
revoke execute on function public.receive_intake(uuid, uuid, jsonb, uuid, date, text, uuid) from public, anon, authenticated;
