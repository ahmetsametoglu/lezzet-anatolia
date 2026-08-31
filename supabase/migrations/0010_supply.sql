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

-- ── "VARYANT BAŞINA TEK TERCİHLİ TEDARİKÇİ" KURALI VERİDE (02.15) ───────────────────────────────
-- `address_one_default_per_customer`ın kardeşi ve gerekçesi aynı: kural uygulamada (`setExclusiveFlag`)
-- duruyordu, o koddan geçmeyen her yazım onu kırabilirdi. Burada bedeli para: otomatik alış önerisi
-- "tercihli" tedarikçiden fiyat okur; iki tercihli satır varsa okuduğu fiyat sıralamaya kalır ve
-- sipariş yanlış maliyetle açılır.
create unique index supplier_product_one_preferred_per_variant
  on public.supplier_product (variant_id)
  where is_preferred;

-- `partially_received` (DOMAIN §17): tek PO birden çok depoda parça parça kabul edilebilir —
-- ilk kabul siparişi KAPATMAZ. Durum saklanan bir sayaçtan değil, kabullerden TÜRETİLİR
-- (`purchase_order_progress`, 0042): kalem miktarı ↔ o kaleme giren partilerin `initial_qty`
-- toplamı. `physical_qty` satışla eridiği için "ne kadar geldi" sorusuna yalnız `initial_qty`
-- doğru cevap verir.
create type purchase_order_status as enum ('draft', 'sent', 'partially_received', 'received', 'cancelled');

create table public.purchase_order (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.supplier (id) on delete restrict,
  status purchase_order_status not null default 'draft',
  -- İNSAN-OKUR NUMARA (`TS-26-4K2M9P`) — bu belge DIŞARI çıkıyor: liste tedarikçiye WhatsApp'tan ya
  -- da PDF olarak gidiyor (`printableList`). Numarasız belge, karşı tarafın referans veremediği
  -- belgedir; fatura eşleştirmede de siparişi faturayla bağlayan tek şey bu numara olacak.
  --
  -- **Rastgele, sıralı DEĞİL** (`Order.reference_no` ile aynı gerekçe): sıralı numara dışarıya iş
  -- hacmimizi söyler — tedarikçi iki siparişin numarasına bakıp aradaki farkı okur.
  --
  -- **GÖNDERİMDE üretilir, açılışta değil.** Taslak bizim içimizde bir hazırlıktır; numara karşı
  -- tarafa verilen sözdür. Siparişteki "ilk kalıcı durum" kuralının buradaki karşılığı `sent`:
  -- açılıp vazgeçilen taslaklar numara tüketmez.
  reference_no text unique,
  sent_at timestamptz,                               -- İNSAN gönderdikten sonra işaretlenir
  note text,
  created_at timestamptz not null default now(),
  -- Gönderilmiş siparişin numarası OLMAK ZORUNDA: numarasız gönderilmiş bir kayıt, tedarikçinin
  -- elindeki kâğıtla eşleşmeyen bir kayıttır. Kural veride durur, uygulama unutsa da geçmez.
  --
  -- **Ölçüt `sent_at`, `status` DEĞİL** — ilk yazımda durum eksenine bağlanmıştı ve yanlıştı:
  -- `receive_intake` bir siparişi `draft`tan doğrudan `received`a taşıyabiliyor (mal geldi, kimse
  -- "gönderdim" demedi) ve o kayıtta numara YOKTUR — olmamalı da, çünkü numara tedarikçiye
  -- söylediğimiz şeydir ve söylemedik. Aynı şekilde iptal edilen taslak da numara tüketmez.
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
  -- İSTEĞE BAĞLI hedef depo (DOMAIN §17): "20 koli STR'ye, 10 koli KEHL'e" — tedarikçi listesine
  -- yazılabilir, kabul eden depocu kendi payını listeden okur. Boşsa hedefi kabul eden depo söyler:
  -- niyet beyanıdır, kısıt değil — mal fiilen nereye indiyse oraya girer.
  -- FK YOK: `warehouse` 0031'de açılır.
  target_warehouse_id uuid
);
create index purchase_order_item_order_idx on public.purchase_order_item (purchase_order_id);

create table public.stock_intake (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid references public.supplier (id) on delete restrict,
  -- Bağlı tedarik siparişi; PO'suz doğrudan giriş de mümkündür (küçük/plansız alım).
  purchase_order_id uuid references public.purchase_order (id) on delete set null,
  -- **MAL KABUL DEPOYA YAPILIR** (DOMAIN §17) — parçalı kabulün kalbi: satın alma siparişi
  -- depo-üstüdür, ama mal fiziksel olarak bir kapıdan girer. Depo bağı PO'ya değil BURAYA takılır;
  -- aynı PO'nun ikinci kabulü başka depoda olabilir. FK YOK: `warehouse` 0031'de açılır.
  warehouse_id uuid not null,
  date date not null default current_date,
  total_amount numeric(10, 2) not null default 0,
  note text,
  -- **KABULÜ KİM YAPTI** (kullanıcı kararı 31.08, `BEKLEYEN(06.14)` kapandı).
  --
  -- Ölçümle geldi: `stock_movement.actor_id` mal kabulde HİÇ yazılmıyordu (29/29 boş), oysa
  -- satış (32/32), imha (5/5), sayım (2/2) ve iade (2/2) hepsinde doluydu. Yani alan çalışıyordu,
  -- yalnız kabul onu beslemiyordu — "bu malı depoya kim aldı" sorusunun cevabı defterde yoktu.
  --
  -- KİMLİK BELGEDE DE DURUR, yalnız harekette değil: bir kabul birden çok parti doğurur ve
  -- hareketlerin hepsi aynı kişiye aittir. Yalnız harekete yazmak, aynı gerçeği satır sayısı
  -- kadar tekrarlamak ve belgeye "kim" diye sorulduğunda hareketlerden türetmek olurdu.
  --
  -- `on delete set null`: personel kaydı silinse de kabul belgesi durur — geçmiş bir olayın
  -- kaydı, kişinin bugünkü varlığına bağlı değildir.
  received_by uuid references public.user_profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index stock_intake_supplier_idx on public.stock_intake (supplier_id, date desc);

-- Partiler girişe bağlanır (0006'da FK'siz açılmıştı — tablo geldi, bağ kuruldu).
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
-- ── MAL KABUL DEPOYA YAPILIR (DOMAIN §17) ───────────────────────────────────
-- `p_warehouse_id` zorunlu: mal fiziksel olarak bir kapıdan girer. Tek PO birden çok depoda parça
-- parça kabul edilebilir — bu yüzden PO kapanışı artık KOŞULSUZ DEĞİL: eskiden ilk kabul siparişi
-- `received` yapıyordu ve "20 koli STR'ye, 10 koli KEHL'e" senaryosunda ikinci depo malı beklerken
-- sipariş kapanmış görünüyordu. Durum artık `purchase_order_progress`'ten TÜRETİLİR (0031).
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
  -- Kabulü yapan personel (`user_profiles.id`). Varsayılan NULL: seed ve bakım çağrıları aktörsüz
  -- yazar ve o hâlde defter "bilinmiyor" der — uydurma bir kimlik yazmaktansa boş kalır.
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

    -- Hangi PO kalemini karşıladığı partinin KENDİSİNDE durur (T5): parçalı kabulde "sipariş
    -- ettiğim kadar geldi mi" sorusu artık girişten değil bu bağdan hesaplanır.
    v_po_item := nullif(v_line ->> 'purchase_order_item_id', '')::uuid;

    if p_purchase_order_id is not null then
      -- PO'lu kabulde bağ ZORUNLU. Bağsız bırakılsaydı mal depoya girer ama ilerleme "0 geldi"
      -- derdi: sipariş sonsuza dek `partially_received` kalır, fark raporu var olmayan bir eksik
      -- gösterirdi. Bu, ölçülmemiş bir değeri sıfır saymaktır (CLAUDE.md §1) — ölçüm yoksa cevap
      -- "bilinmiyor"dur, sıfır değil; burada da doğru davranış yazmayı reddetmektir.
      --
      -- Ama depocudan kalem seçmesini İSTEMEYİZ: PO'da o varyanttan tek kalem varsa sistem çözer.
      -- Belirsizse (aynı varyant iki kalemde) varsayılan seçmez, sorar — C2'nin aynı ilkesi.
      if v_po_item is null then
        -- `select ... into` tek başına YETMEZ: birden çok satırda sessizce ilkini alır ve
        -- belirsizlik varsayılanla çözülmüş olurdu. Sayıyı ayrıca soruyoruz.
        -- `array_agg(...)[1]`: uuid'nin `min()` agregatı yoktur, ama tek satırlık halde ilk öğe
        -- zaten aradığımız kalemdir; birden çoksa aşağıdaki sayı kontrolü devreye girer.
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
      -- Alan artık KİMLİK (19.29): serbest metin `location` yerine `storage_area` satırı. Yanlış
      -- tesisin alanı gönderilirse FK reddetmez (alan↔depo kısıtı yok) — o doğrulama uygulama
      -- katmanında, kabul kapısında yapılıyor.
      nullif(v_line ->> 'storage_area_id', '')::uuid
    )
    returning id into v_stock_id;
    v_stock_ids := v_stock_ids || v_stock_id;

    -- **PARTİNİN DOĞUŞU DA BİR HAREKETTİR** (06.14). Defterin değişmezi `Σ(in) − Σ(out) =
    -- physical_qty` ve `initial_qty`'den kurulmuyor — parti doğuşu deftere yazılmasaydı denklem her
    -- partide giriş miktarı kadar sapardı ve mutabakat testi hiç yeşile dönmezdi.
    --
    -- **AKTÖR ARTIK YAZILIYOR** (kullanıcı kararı 31.08 — `BEKLEYEN(06.14)` kapandı). Eskiden
    -- burada `actor_id` boş kalıyordu ve künyesi *"bu RPC aktör parametresi almıyor"* diyordu;
    -- ölçüm bunun bir kural değil bir eksik olduğunu gösterdi (öteki hareket türlerinin hepsinde
    -- alan doluydu). Artık parametre var ve belge de aynı kimliği taşıyor (`received_by`).
    --
    -- Aktör VERİLMEZSE hâlâ NULL: seed ve bakım çağrılarında gerçek bir kişi yok ve uydurmak,
    -- defterin bilmediği bir şeyi biliyormuş gibi yazması olurdu (CLAUDE §1).
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

  -- Sipariş durumu KABULLERDEN TÜRER, bu kabulden değil (K6). Eskiden burada koşulsuz `received`
  -- yazılıyordu; çok depoda bu, ikinci depo malı beklerken siparişi kapatmak demekti.
  -- Ölçü `purchase_order_progress` (0031) — `initial_qty` üzerinden kümülatif karşılaştırma.
  -- Fonksiyon gövdesi geç bağlanır: görünüm 0031'de doğar, ilk çağrıya kadar yerindedir.
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

revoke execute on function public.receive_intake(uuid, uuid, jsonb, uuid, date, text) from public, anon, authenticated;
