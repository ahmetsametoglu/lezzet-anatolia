-- Depo ağı (DOMAIN §17): `warehouse_id` kolonları kendi tablolarının dosyasında FK'siz doğar, bu dosya tabloyu kurar ve
-- bağları birden bağlar. `available_stock` da burada, çünkü görünüm kolondan farklı olarak tabloyu beklemek zorunda.

-- ── Depo ────────────────────────────────────────────────────────────────────
-- Kurye aracı da bir depodur: yükleme ve dönüş transferdir, araçtaki mal gerçek partidir. Tür üç sorgunun süzgecidir
-- (araç bölgeye bağlanamaz, kargo deposu olamaz, katalog sözüne giremez), tek alan olmasa her yer ayrı hatırlardı.
create type public.warehouse_kind as enum ('facility', 'vehicle');

create table public.warehouse (
  id uuid primary key default gen_random_uuid(),
  -- Belge numarasına ve ekrana giren kısa kod ('STR', 'KEHL'). Kısa çünkü `IMH-STR-26-0012` gibi
  -- bir numarayı denetmen ve tedarikçi elle yazacak (0033'ün gerekçesi).
  code text not null unique,
  name text not null,
  -- Varsayılan `facility`: bugüne kadarki her satır bir tesistir ve araç İSTİSNADIR.
  kind warehouse_kind not null default 'facility',
  -- Fiziksel tesisin ülkesi; bölge sınır ötesi olabilir (ADR-002), depo olamaz. KDV buna bağlıdır: DE'de depo uzaktan
  -- satışı yerel satışa çevirir (DOMAIN §5/§17).
  country_code country_code not null default 'FR',
  address jsonb,
  -- Rotanın başlangıç ve bitiş noktası; jsonb içinde olsa kısıt taşıyamazdı. Hassasiyet kolonu yok, çünkü nokta
  -- operatörün haritada onayladığı konumdur; boşsa sıralama motoru varsayılan uydurmaz, `no_start` ile reddeder.
  lat numeric(9, 6),
  lng numeric(9, 6),
  -- Kargo çıkış deposu: bölge dışı müşteriler ve rota müşterilerinin kargo dolgusu buradan gider.
  ships_online boolean not null default false,
  is_active boolean not null default true,
  sort_order int not null default 0,
  -- Aracın sabah çıkıp akşam döndüğü tesis: transferden, kuryeden ya da seferden türetmek "genelde doğru" olurdu, yetmez.
  -- Yalnız araçta dolu ve ev bir tesis olmak zorunda; satır arası kural olduğu için tetikleyicide.
  home_warehouse_id uuid references public.warehouse (id) on delete restrict,
  created_at timestamptz not null default now(),
  -- Araçtan kargo çıkmaz: kargo çıkış deposu bir adrestir, taşıyıcı oraya gelir. Kısıt aynı
  -- tabloda durabildiği için tetikleyiciye gerek yok — en ucuz yerde.
  constraint warehouse_vehicle_never_ships check (kind = 'facility' or not ships_online),
  -- Ev YALNIZ aracın alanıdır. Tesise ev yazılabilseydi ağaç iki anlama gelirdi.
  constraint warehouse_home_only_vehicle check (kind = 'vehicle' or home_warehouse_id is null),
  -- `postal_code_place_point` / `address_geo_point` ile aynı kural, aynı gerekçe.
  constraint warehouse_geo_point check ((lat is null) = (lng is null))
);

-- Ülke başına en fazla bir aktif kargo deposu; kısmi tekil indeks kuralı uygulama unutsa da tutar.
create unique index warehouse_single_online on public.warehouse (country_code)
  where ships_online and is_active;

-- Depo seçici ve liste: operatörün verdiği sıra, eşitlikte kod.
create index warehouse_active_idx on public.warehouse (is_active, sort_order, code);

alter table public.warehouse enable row level security;

-- ── Depo bazlı asgari stok eşiği ─────────────────────────────────────────────
-- Varyanttaki `min_stock_qty` varsayılandır, burası yalnız istisna yazar; küresel tek eşik çok depoda yanlış cevap verir.
create table public.warehouse_variant_threshold (
  warehouse_id uuid not null references public.warehouse (id) on delete cascade,
  variant_id uuid not null references public.product_variant (id) on delete cascade,
  min_stock_qty int not null check (min_stock_qty >= 0),
  primary key (warehouse_id, variant_id)
);
alter table public.warehouse_variant_threshold enable row level security;

-- ── Depolar arası transfer ───────────────────────────────────────────────────
-- `draft` yok, sevk ilk kalıcı andır. `cancelled` yalnız "sevk kaydı hatalıydı, mal hiç çıkmadı" demektir; mal çıkıp döndüyse ters yönlü yeni transfer yazılır.
create type transfer_status as enum ('in_transit', 'received', 'cancelled');

create table public.warehouse_transfer (
  id uuid primary key default gen_random_uuid(),
  from_warehouse_id uuid not null references public.warehouse (id) on delete restrict,
  to_warehouse_id uuid not null references public.warehouse (id) on delete restrict,
  constraint warehouse_transfer_distinct check (from_warehouse_id <> to_warehouse_id),
  status transfer_status not null default 'in_transit',
  reference_no text not null unique,                 -- TRF-STR-26-0007 (kaynak deponun kodu)
  dispatched_by uuid,                                -- FK yok: personel kimliği auth şemasında
  dispatched_at timestamptz not null default now(),
  received_by uuid,
  received_at timestamptz,
  -- Sevk kaydının GERİ ALINMASI (19.6). Ayrı alanlar, `received_*`'a bindirilmedi: "kabul edildi"
  -- ile "hiç çıkmamış" birbirinin yerine geçemez; tek çift alanda tutulsaydı geçmiş okunamazdı.
  cancelled_by uuid,
  cancelled_at timestamptz,
  -- Gerekçe ZORUNLU değil ama istenen alan: "neden geri alındı" sorusunun cevabı `note`'a
  -- karışmamalı — `note` sevk anının notudur, bu ise onu iptal eden kararın.
  cancel_reason text,
  note text,
  -- İsteğin kimliği: tekrarlanan "araca al" isteği aynı anahtarla gelir ve tekil indeks malın araca ikinci kez binmesini
  -- engeller. `money_movement.idempotency_key` ile aynı desen; `note` ve `reference_no` başka iş görür.
  idempotency_key text,
  created_at timestamptz not null default now(),
  -- Durum ile izler birbirini tutar: `cancelled` damgasız olamaz, damga da başka durumda duramaz.
  -- Kural veride durur (CLAUDE §1) — RPC'yi atlayan bir `update` bunu delemesin.
  constraint warehouse_transfer_cancel_stamp check (
    (status = 'cancelled') = (cancelled_at is not null)
  )
);
-- "Yolda ne var" — sanal transit depo AÇILMADI (T4), bu sorunun kaynağı transfer kaydının kendisi.
create index warehouse_transfer_status_idx on public.warehouse_transfer (status, dispatched_at desc);
create index warehouse_transfer_to_idx on public.warehouse_transfer (to_warehouse_id, status);
-- Aynı istek iki kez sevk yazamaz; kısmi değil, çünkü anahtarsız sevklerin NULL'ları çakışmaz ve `on conflict` hedefleyebilir.
create unique index warehouse_transfer_idempotency_key on public.warehouse_transfer (idempotency_key);

create table public.warehouse_transfer_line (
  id uuid primary key default gen_random_uuid(),
  transfer_id uuid not null references public.warehouse_transfer (id) on delete cascade,
  -- Kaynak parti: sevkte fiilen düşülen satır. `restrict` — transfer kaydı partinin geçmişidir.
  source_stock_id uuid not null references public.stock (id) on delete restrict,
  qty int not null check (qty > 0),
  -- Kabulde doğan hedef parti (T4: parti kimliği KORUNUR, birleşmez — tarih/lot/alış kopyalanır).
  -- Birleştirseydik `initial_qty` ve geri çağırma izi bozulurdu.
  target_stock_id uuid references public.stock (id) on delete restrict,
  received_qty int check (received_qty >= 0)         -- null = henüz kabul edilmedi
);
create index warehouse_transfer_line_transfer_idx on public.warehouse_transfer_line (transfer_id);
create index warehouse_transfer_line_source_idx on public.warehouse_transfer_line (source_stock_id);

alter table public.warehouse_transfer enable row level security;
alter table public.warehouse_transfer_line enable row level security;

-- ── FK bağlama: kolonlar doğdukları dosyalarda açıldı, bağlar burada ─────────
-- Hepsi `restrict`: deposu olan hiçbir kayıt varken depo silinemez. Depo kapatılır (`is_active`),
-- silinmez — geçmiş sipariş ve parti hangi tesisten çıktığını bilmek zorundadır.
alter table public.stock add constraint stock_warehouse_fk
  foreign key (warehouse_id) references public.warehouse (id) on delete restrict;

-- ── Parti numarası tetikleyicisi ─────────────────────────────────────────────
-- Numara depo kodunu taşıdığı için burada üretilir; parti birden çok yoldan doğduğundan tetikleyici hiçbir yolun unutmasına
-- izin vermez. Elle verilen numara ezilmez.
create or replace function public.stock_set_batch_no() returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_code text;
begin
  if new.batch_no is not null and length(new.batch_no) > 0 then
    return new;
  end if;
  select w.code into v_code from public.warehouse w where w.id = new.warehouse_id;
  if v_code is null then
    raise exception 'stock_set_batch_no: depo bulunamadı (%)', new.warehouse_id;
  end if;
  new.batch_no := public.next_document_no('PRT-' || v_code, extract(year from now())::int);
  return new;
end;
$$;

create trigger stock_batch_no_trg
  before insert on public.stock
  for each row execute function public.stock_set_batch_no();

alter table public.reservation add constraint reservation_warehouse_fk
  foreign key (warehouse_id) references public.warehouse (id) on delete restrict;
alter table public.order add constraint order_warehouse_fk
  foreign key (warehouse_id) references public.warehouse (id) on delete restrict;
alter table public.stock_intake add constraint stock_intake_warehouse_fk
  foreign key (warehouse_id) references public.warehouse (id) on delete restrict;
alter table public.purchase_order_item add constraint purchase_order_item_warehouse_fk
  foreign key (target_warehouse_id) references public.warehouse (id) on delete set null;
alter table public.temperature_log add constraint temperature_log_warehouse_fk
  foreign key (warehouse_id) references public.warehouse (id) on delete restrict;
alter table public.delivery_zone add constraint delivery_zone_warehouse_fk
  foreign key (warehouse_id) references public.warehouse (id) on delete restrict;

-- Hareket defterinin bağları; hepsi `restrict`, çünkü append-only defterin dayandığı belge yok olamaz.
alter table public.stock_movement add constraint stock_movement_warehouse_fk
  foreign key (warehouse_id) references public.warehouse (id) on delete restrict;
alter table public.stock_movement add constraint stock_movement_order_fk
  foreign key (order_id) references public.order (id) on delete restrict;
alter table public.stock_movement add constraint stock_movement_transfer_fk
  foreign key (transfer_id) references public.warehouse_transfer (id) on delete restrict;
alter table public.stock_movement add constraint stock_movement_intake_fk
  foreign key (intake_id) references public.stock_intake (id) on delete restrict;

-- ── Bölge bir araca bağlanamaz ───────────────────────────────────────────────
-- Posta kodu zincirinin sonu bir adres olmalı, yoksa sipariş hareket hâlindeki bir yere yazılırdı. FK türü ayırt edemediği
-- için tetikleyici; hata kayıt anında verilir.
create or replace function public.assert_zone_warehouse_is_facility() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.warehouse w
     where w.id = new.warehouse_id and w.kind = 'facility'
  ) then
    raise exception 'delivery_zone.warehouse_id bir tesis olmalı (araç bölgeye bağlanamaz): %', new.warehouse_id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger delivery_zone_warehouse_is_facility
  before insert or update of warehouse_id on public.delivery_zone
  for each row execute function public.assert_zone_warehouse_is_facility();

-- Aracın evi bir tesistir; kolon kısıtı işaret ettiği satırı göremez ve araç aracın evi olsaydı zincir kapanırdı.
create or replace function public.assert_home_warehouse_is_facility() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.home_warehouse_id is null then return new; end if;
  if not exists (
    select 1 from public.warehouse w
     where w.id = new.home_warehouse_id and w.kind = 'facility'
  ) then
    raise exception 'warehouse.home_warehouse_id bir tesis olmalı (aracın evi araç olamaz): %', new.home_warehouse_id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger warehouse_home_is_facility
  before insert or update of home_warehouse_id on public.warehouse
  for each row execute function public.assert_home_warehouse_is_facility();

-- Evine göre araç okuması: panelin ve depo kartının sorgusu ("bu tesisin araçları").
create index warehouse_home_idx on public.warehouse (home_warehouse_id) where home_warehouse_id is not null;
-- Parti ↔ tedarik kalemi (T5): parçalı kabulde fark raporunun bağı.
alter table public.stock add constraint stock_purchase_order_item_fk
  foreign key (purchase_order_item_id) references public.purchase_order_item (id) on delete set null;

-- ── Personel depo kapsamı (T2) ──────────────────────────────────────────────
-- Depocu ve kurye kapsamsız OLAMAZ: `roles` kısıtıyla aynı yerde, aynı gerekçeyle — uygulama
-- unutsa da geçmez. Admin/muhasebe depo-üstüdür, kapsamı hiç okunmaz (boş olması normaldir).
alter table public.user_profiles add constraint user_profiles_warehouse_scope
  check (
    not (roles && array['warehouse', 'courier']::user_role[])
    or cardinality(warehouse_ids) >= 1
  );

-- Dizi kolonda FK kurulamaz; yanlış kimlik fail-closed olsa da sessiz kalırdı, bu yüzden hata kayıt anında verilir.
create or replace function public.assert_warehouse_ids_exist() returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_missing uuid;
begin
  if cardinality(new.warehouse_ids) = 0 then
    return new;
  end if;
  -- Alias AÇIKÇA `t(wid)`: `unnest(...) as id` yazılsaydı alt sorgudaki çıplak `id`, en içteki
  -- kapsam kazandığı için `w.id`'ye çözülür ve koşul `w.id = w.id` olurdu — her zaman doğru,
  -- yani kontrol sessizce hiçbir şey yapmaz. (Bu tuzağa bir kez düşüldü, testte yakalandı.)
  select t.wid into v_missing
    from unnest(new.warehouse_ids) as t(wid)
   where not exists (select 1 from public.warehouse w where w.id = t.wid);
  if v_missing is not null then
    raise exception 'user_profiles.warehouse_ids: % diye bir depo yok', v_missing
      using errcode = 'foreign_key_violation';
  end if;
  return new;
end;
$$;

create trigger user_profiles_warehouse_ids_trg
  before insert or update of warehouse_ids on public.user_profiles
  for each row execute function public.assert_warehouse_ids_exist();

-- Ters yön: kapsamda geçen depo silinemez, yoksa personelin `warehouse_ids`inde sessizce yok bir kimlik kalırdı.
-- Depo kapatılır, silinecekse önce kapsamlardan çıkarılır.
create or replace function public.assert_warehouse_unscoped() returns trigger
language plpgsql
set search_path = public
as $$
begin
  if exists (select 1 from public.user_profiles up where old.id = any (up.warehouse_ids)) then
    raise exception 'depo % personel kapsamında — önce kapsamlardan çıkarılmalı', old.id
      using errcode = 'foreign_key_violation';
  end if;
  return old;
end;
$$;

create trigger warehouse_scope_guard_trg
  before delete on public.warehouse
  for each row execute function public.assert_warehouse_unscoped();

-- Kapsam sorgusu ("bu deponun personeli") — dizi araması GIN ister, `roles` deseniyle aynı.
create index user_profiles_warehouse_ids_idx on public.user_profiles using gin (warehouse_ids);

-- ── Kullanılabilir stok — grain (depo, varyant) ─────────────────────────────
-- Kullanılabilir = fiili − aktif rezervasyon, depo içinde; birleştirilmiş stok kimsenin stoğu değildir. `cross join` her
-- aktif depo için satır döndürür ki okuyan "bilmiyorum" ile "yok"u ayırabilsin.
create or replace view public.available_stock with (security_invoker = true) as
select
  w.id                                                as warehouse_id,
  v.id                                                as variant_id,
  coalesce(s.physical_qty, 0)                         as physical_qty,
  coalesce(r.reserved_qty, 0)                         as reserved_qty,
  greatest(coalesce(s.physical_qty, 0) - coalesce(r.reserved_qty, 0), 0) as available_qty,
  coalesce(s.expired_dlc_qty, 0)                      as expired_dlc_qty
from public.product_variant v
cross join public.warehouse w
left join (
  select
    st.warehouse_id,
    st.variant_id,
    sum(st.physical_qty) as physical_qty,
    sum(st.physical_qty) filter (where p.date_type = 'DLC' and st.expiry_date < current_date) as expired_dlc_qty
  from public.stock st
  join public.product_variant pv on pv.id = st.variant_id
  join public.product p on p.id = pv.product_id
  group by st.warehouse_id, st.variant_id
) s on s.variant_id = v.id and s.warehouse_id = w.id
left join (
  select warehouse_id, variant_id, sum(qty) as reserved_qty
  from public.reservation
  where expires_at is null or expires_at > now()
  group by warehouse_id, variant_id
) r on r.variant_id = v.id and r.warehouse_id = w.id
where w.is_active;

-- Depo-üstü toplam yalnız "hiç var mı" sorusunun ve tedarik önerisinin; satış kararı ve geri çağırma bunu okumaz.
-- Araçlar girmez: araçtaki mal siteden alınamaz ve akşam tesise döner, sayılsa söz ya da bolluk yanlış olurdu.
create or replace view public.available_stock_total with (security_invoker = true) as
select
  a.variant_id,
  sum(a.physical_qty)    as physical_qty,
  sum(a.reserved_qty)    as reserved_qty,
  sum(a.available_qty)   as available_qty,
  sum(a.expired_dlc_qty) as expired_dlc_qty
from public.available_stock a
join public.warehouse w on w.id = a.warehouse_id and w.kind = 'facility'
group by a.variant_id;

-- ── Tedarik siparişi ilerlemesi ──────────────────────────────────────────────
-- PO durumu buradan türer; ölçü `initial_qty`, çünkü `physical_qty` satışla erir.
create or replace view public.purchase_order_progress with (security_invoker = true) as
select
  poi.purchase_order_id,
  poi.id                                                as purchase_order_item_id,
  poi.variant_id,
  poi.target_warehouse_id,
  poi.qty                                               as ordered_qty,
  coalesce(g.received_qty, 0)                           as received_qty,
  greatest(poi.qty - coalesce(g.received_qty, 0), 0)    as missing_qty
from public.purchase_order_item poi
left join (
  select purchase_order_item_id, sum(initial_qty) as received_qty
    from public.stock
   where purchase_order_item_id is not null
   group by purchase_order_item_id
) g on g.purchase_order_item_id = poi.id;

-- ── Değişmez: siparişin partileri siparişin deposundan ─────────────────────────
-- Her yazım yolunda geçerli olsun diye veride; ertelenmiş, çünkü sipariş deposu ile partiler aynı işlemde yazılır.
create or replace function public.assert_order_batch_warehouse(p_order_id uuid) returns void
language plpgsql
stable
set search_path = public
as $$
declare
  v_bad record;
begin
  -- Depo KODU okunur (uuid değil): bu hata operatörün ekranına düşecek ve "STR ↔ KEHL" cümlesi
  -- iki uuid'den okunaklıdır — teşhis için kimlik yetmez, hangi tesis olduğu gerekir.
  select oib.stock_id as batch_id, bw.code as batch_code, ow.code as order_code
    into v_bad
    from public.order_item_batch oib
    join public.order_item oi on oi.id = oib.order_item_id
    join public.order o on o.id = oi.order_id
    join public.stock s on s.id = oib.stock_id
    join public.warehouse bw on bw.id = s.warehouse_id
    join public.warehouse ow on ow.id = o.warehouse_id
   where oi.order_id = p_order_id
     and s.warehouse_id <> o.warehouse_id
   limit 1;

  if v_bad is not null then
    raise exception 'sipariş %: % partisi % deposunda, sipariş % deposundan çıkıyor — bir sipariş tek depodan çıkar',
      p_order_id, v_bad.batch_id, v_bad.batch_code, v_bad.order_code
      using errcode = 'check_violation';
  end if;
end;
$$;

create or replace function public.order_batch_warehouse_check() returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_order_id uuid;
begin
  select oi.order_id into v_order_id
    from public.order_item oi
   where oi.id = coalesce(new.order_item_id, old.order_item_id);
  -- Kalem silinmişse (cascade) denetlenecek sipariş de kalmamıştır.
  if v_order_id is not null then
    perform public.assert_order_batch_warehouse(v_order_id);
  end if;
  return null;
end;
$$;

create constraint trigger order_item_batch_warehouse
  after insert or update of stock_id on public.order_item_batch
  deferrable initially deferred
  for each row execute function public.order_batch_warehouse_check();

-- Partinin deposu doğrudan değişirse de aynı kontrol koşar; onarım betiği ve elle müdahale yolu da kapanır.
create or replace function public.stock_warehouse_check() returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_order_id uuid;
begin
  for v_order_id in
    select distinct oi.order_id
      from public.order_item_batch oib
      join public.order_item oi on oi.id = oib.order_item_id
     where oib.stock_id = new.id
  loop
    perform public.assert_order_batch_warehouse(v_order_id);
  end loop;
  return null;
end;
$$;

create constraint trigger stock_warehouse_batches
  after update of warehouse_id on public.stock
  deferrable initially deferred
  for each row execute function public.stock_warehouse_check();

-- Siparişin deposu değişince partiler ve rezervasyonlar da buradan kontrol edilir: posta kodu yeniden çözülünce
-- depo değişebilir ve eski depoda mal boşuna kilitli kalırdı.
create or replace function public.order_warehouse_check() returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_bad record;
begin
  perform public.assert_order_batch_warehouse(new.id);

  select r.id, rw.code as reservation_code, ow.code as order_code
    into v_bad
    from public.reservation r
    join public.warehouse rw on rw.id = r.warehouse_id
    join public.warehouse ow on ow.id = new.warehouse_id
   where r.order_id = new.id and r.warehouse_id <> new.warehouse_id
   limit 1;

  if v_bad is not null then
    raise exception 'sipariş %: % rezervasyonu % deposunda, sipariş % deposuna taşındı — rezervasyon da taşınmalı',
      new.id, v_bad.id, v_bad.reservation_code, v_bad.order_code
      using errcode = 'check_violation';
  end if;
  return null;
end;
$$;

create constraint trigger order_warehouse_batches
  after update of warehouse_id on public.order
  deferrable initially deferred
  for each row execute function public.order_warehouse_check();

-- ── Değişmez: rezervasyonun deposu siparişin deposu ──────────────────────────
-- Rezervasyon depoyu açıkça taşıdığı için iki alan ayrışabilir, bu kısıt panzehiridir; sipariş kapanınca satırlar silinir.
create or replace function public.reservation_warehouse_check() returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_order_warehouse uuid;
begin
  select warehouse_id into v_order_warehouse from public.order where id = new.order_id;
  if v_order_warehouse is not null and v_order_warehouse <> new.warehouse_id then
    raise exception 'rezervasyon %: deposu (%) siparişin deposundan (%) farklı',
      new.id, new.warehouse_id, v_order_warehouse
      using errcode = 'check_violation';
  end if;
  return null;
end;
$$;

create constraint trigger reservation_warehouse_matches_order
  after insert or update of warehouse_id, order_id on public.reservation
  deferrable initially deferred
  for each row execute function public.reservation_warehouse_check();

-- ── Sevk ────────────────────────────────────────────────────────────────────
-- Transfer, satırlar ve kaynak düşümü bölünemez (STACK §13); mal kaynaktan o an düşer, transit depo yok. Ölçü kullanılabilir
-- miktardır, çünkü sevk müşteriye söz verilmiş malı götüremez.

-- p_lines: [{"source_stock_id": uuid, "qty": int}, ...]
create or replace function public.dispatch_transfer(
  p_to_warehouse_id uuid,
  p_lines jsonb,
  p_actor_id uuid default null,
  p_note text default null,
  -- `null` korumasız sevktir (elle transfer, besleme); NULL'lar tekil indekste çakışmaz.
  p_idempotency_key text default null
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_transfer_id uuid;
  v_from_warehouse_id uuid;
  v_from_code text;
  v_reference text;
  v_line jsonb;
  v_stock_id uuid;
  v_qty int;
  v_row record;
  v_physical int;
  v_reserved int;
  v_pinned int;
begin
  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    raise exception 'dispatch_transfer: en az bir kalem gerekli';
  end if;

  -- Hızlı yol, koruma değil: bilinen anahtar erken yakalanır ki tekrar belge numarası yakmasın.
  -- Eşzamanlı isteği aşağıdaki `on conflict` yakalar.
  if p_idempotency_key is not null then
    select id, reference_no into v_transfer_id, v_reference
      from public.warehouse_transfer where idempotency_key = p_idempotency_key;
    if v_transfer_id is not null then
      return jsonb_build_object('ok', true, 'transfer_id', v_transfer_id, 'reference_no', v_reference, 'deduped', true);
    end if;
  end if;

  -- Kaynak depo KALEMLERDEN türer, parametre değil: partiler zaten bir depoda duruyor ve ayrıca
  -- sorulan bir kaynak, kalemlerle çelişebilirdi. Tek transferde tek kaynak depo olmak zorunda.
  select distinct s.warehouse_id into v_from_warehouse_id
    from jsonb_array_elements(p_lines) l
    join public.stock s on s.id = (l ->> 'source_stock_id')::uuid;

  if v_from_warehouse_id is null then
    raise exception 'dispatch_transfer: kaynak parti bulunamadı';
  end if;
  if (select count(distinct s.warehouse_id)
        from jsonb_array_elements(p_lines) l
        join public.stock s on s.id = (l ->> 'source_stock_id')::uuid) > 1 then
    raise exception 'dispatch_transfer: tek sevkte tek kaynak depo olur';
  end if;
  if v_from_warehouse_id = p_to_warehouse_id then
    raise exception 'dispatch_transfer: kaynak ve hedef depo aynı olamaz';
  end if;
  -- Hedef KAPALI olamaz: oraya giden mal `available_stock`'a hiç girmez, yani görünmez olur.
  -- Kaynak kapalı OLABİLİR — bir depoyu boşaltmanın yolu tam olarak budur.
  if not exists (select 1 from public.warehouse where id = p_to_warehouse_id and is_active) then
    raise exception 'dispatch_transfer: hedef depo kapalı ya da yok (%)', p_to_warehouse_id;
  end if;

  -- ── ÖNCE KONTROL, SONRA YAZIM (quick_sale deseni) ─────────────────────────
  -- Varyant düzeyi: deponun kullanılabilirini aşan sevk reddedilir. Rezervasyon varyant
  -- seviyesinde tutulur (parti seçimi hazırlıkta), o yüzden ölçü de varyant düzeyindedir.
  for v_row in
    select s.variant_id, sum((l ->> 'qty')::int) as qty
      from jsonb_array_elements(p_lines) l
      join public.stock s on s.id = (l ->> 'source_stock_id')::uuid
     group by s.variant_id
  loop
    select coalesce(sum(st.physical_qty), 0) into v_physical
      from public.stock st
     where st.variant_id = v_row.variant_id and st.warehouse_id = v_from_warehouse_id;
    select coalesce(sum(r.qty), 0) into v_reserved
      from public.reservation r
     where r.variant_id = v_row.variant_id and r.warehouse_id = v_from_warehouse_id
       and (r.expires_at is null or r.expires_at > now());

    if v_row.qty > greatest(v_physical - v_reserved, 0) then
      raise exception 'dispatch_transfer: varyant % için kullanılabilir % (fiili %, ayrılmış %), % sevk edilemez',
        v_row.variant_id, greatest(v_physical - v_reserved, 0), v_physical, v_reserved, v_row.qty;
    end if;
  end loop;

  select code into v_from_code from public.warehouse where id = v_from_warehouse_id;
  -- Belge numarası kaynak deponun koduyla ayrışır (T6): kâğıt klasör o depoda duruyor.
  v_reference := public.next_document_no('TRF-' || v_from_code, extract(year from now())::int);

  insert into public.warehouse_transfer (from_warehouse_id, to_warehouse_id, reference_no, dispatched_by, note, idempotency_key)
  values (v_from_warehouse_id, p_to_warehouse_id, v_reference, p_actor_id, p_note, p_idempotency_key)
  on conflict (idempotency_key) do nothing
  returning id into v_transfer_id;

  -- Asıl koruma: aynı anda gelen ikinci istek burada erken döner, yoksa aşağıdaki döngü stoğu ikinci kez düşerdi.
  -- Yakılan belge numarası seride boşluk bırakır ve bu kabul edilir.
  if v_transfer_id is null then
    select id, reference_no into v_transfer_id, v_reference
      from public.warehouse_transfer where idempotency_key = p_idempotency_key;
    return jsonb_build_object('ok', true, 'transfer_id', v_transfer_id, 'reference_no', v_reference, 'deduped', true);
  end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_stock_id := (v_line ->> 'source_stock_id')::uuid;
    v_qty := (v_line ->> 'qty')::int;

    if v_qty is null or v_qty <= 0 then
      raise exception 'dispatch_transfer: miktar pozitif olmalı (parti %)', v_stock_id;
    end if;

    -- Kilit + koşullu düşüm: eşzamanlı satış aynı partiyi yiyebilir.
    select id, physical_qty into v_row from public.stock where id = v_stock_id for update;
    if v_row is null then
      raise exception 'dispatch_transfer: parti bulunamadı (%)', v_stock_id;
    end if;

    -- Partiye ÇIPALI rezervasyon (near-expiry teklif satırı): o mal tam bu partiden söz verilmiştir,
    -- varyant düzeyi kontrolü onu yakalamaz — teklifin partisi başka şehre gidemez (DOMAIN §5).
    select coalesce(sum(qty), 0) into v_pinned
      from public.reservation
     where stock_id = v_stock_id and (expires_at is null or expires_at > now());

    if v_row.physical_qty - v_pinned < v_qty then
      raise exception 'dispatch_transfer: partide % var (% adedi teklife ayrılmış), % isteniyor',
        v_row.physical_qty, v_pinned, v_qty;
    end if;

    update public.stock set physical_qty = physical_qty - v_qty where id = v_stock_id;

    insert into public.warehouse_transfer_line (transfer_id, source_stock_id, qty)
    values (v_transfer_id, v_stock_id, v_qty);

    -- Sevk kaynakta bir çıkıştır ve deftere yazılır; `warehouse_transfer_line` transferin içeriğidir, defter stoğun hareketi.
    insert into public.stock_movement
      (stock_id, direction, qty, kind, unit_cost, actor_id, reference_no, transfer_id)
    values
      (v_stock_id, 'out', v_qty, 'transfer_out',
       (select purchase_price from public.stock where id = v_stock_id),
       p_actor_id, v_reference, v_transfer_id);
  end loop;

  -- `deduped` iki yolda da yazılır ki okuyan varlığa değil değere baksın.
  return jsonb_build_object('ok', true, 'transfer_id', v_transfer_id, 'reference_no', v_reference, 'deduped', false);
end;
$$;

revoke execute on function public.dispatch_transfer(uuid, jsonb, uuid, text, text) from public, anon, authenticated;

-- ── Kabul ───────────────────────────────────────────────────────────────────
-- Mal hedefte yeni partiyle doğar, tarih, lot ve alış fiyatı kaynaktan kopyalanır; tedarik bağları taşınmaz. Parti daima
-- sevk edilen adetle açılır ki iki deponun defteri tutsun.

-- Eksik aynı işlemde `write_off` (varsayılan `transfer_shortfall`), fazla `count_diff · in` olarak alan depoya yazılır;
-- sorumluluk alan depodadır ve gönderenin defterine dokunulmaz.

-- p_lines: [{"line_id": uuid, "received_qty": int}, ...]
create or replace function public.receive_transfer(
  p_transfer_id uuid,
  p_lines jsonb,
  p_actor_id uuid default null,
  p_reason stock_write_off_reason default 'transfer_shortfall',
  p_note text default null
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_status transfer_status;
  v_to_warehouse_id uuid;
  v_line jsonb;
  v_line_id uuid;
  v_received int;
  v_src record;
  v_target_stock_id uuid;
  v_created int := 0;
  -- Eksik beyanı: hedefte doğan partiden düşülecek satırlar (`adjust_stock_batch` biçiminde).
  v_short jsonb := '[]'::jsonb;
  v_short_qty int := 0;
  v_short_ref text := null;
  -- Hedefte doğan partiye eklenecek fazla satırları.
  v_excess jsonb := '[]'::jsonb;
  v_excess_qty int := 0;
  v_excess_ref text := null;
  v_adjust jsonb;
begin
  select status, to_warehouse_id into v_status, v_to_warehouse_id
    from public.warehouse_transfer where id = p_transfer_id for update;

  if v_status is null then
    raise exception 'receive_transfer: transfer bulunamadı (%)', p_transfer_id;
  end if;
  if v_status <> 'in_transit' then
    raise exception 'receive_transfer: transfer % durumunda, kabul edilemez', v_status;
  end if;
  if p_lines is null or jsonb_array_length(p_lines) = 0 then
    raise exception 'receive_transfer: kabul edilecek satır yok — boş kabul transferi kapatamaz';
  end if;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_line_id := (v_line ->> 'line_id')::uuid;
    v_received := (v_line ->> 'received_qty')::int;

    if v_received is null or v_received < 0 then
      raise exception 'receive_transfer: kabul miktarı negatif olamaz (satır %)', v_line_id;
    end if;

    select tl.id, tl.qty, s.variant_id, s.expiry_date, s.lot_number, s.purchase_price
      into v_src
      from public.warehouse_transfer_line tl
      join public.stock s on s.id = tl.source_stock_id
     where tl.id = v_line_id and tl.transfer_id = p_transfer_id;

    if v_src is null then
      raise exception 'receive_transfer: satır bu transfere ait değil (%)', v_line_id;
    end if;
    -- Sevk edilenden fazlası reddedilmez, rampada sayılan gerçektir; fazlası döngüden sonra partiye eklenir.

    -- Parti sıfır gelende de sevk edilen adetle doğar: kaybın bağlanacağı parti budur ve `initial_qty` tüketimin doğru tabanıdır.
    insert into public.stock (warehouse_id, variant_id, physical_qty, expiry_date, lot_number, purchase_price)
    values (v_to_warehouse_id, v_src.variant_id, v_src.qty, v_src.expiry_date, v_src.lot_number, v_src.purchase_price)
    returning id into v_target_stock_id;
    v_created := v_created + 1;

    -- Kaynaktan çıkan kadar giriş satırı; eksik kısım döngüden sonraki `write_off`a yazılır.
    insert into public.stock_movement
      (stock_id, direction, qty, kind, unit_cost, actor_id, transfer_id)
    values
      (v_target_stock_id, 'in', v_src.qty, 'transfer_in', v_src.purchase_price, p_actor_id, p_transfer_id);

    if v_received < v_src.qty then
      v_short := v_short || jsonb_build_object(
        'stock_id', v_target_stock_id, 'qty', v_src.qty - v_received, 'direction', 'out'
      );
      v_short_qty := v_short_qty + (v_src.qty - v_received);
    elsif v_received > v_src.qty then
      v_excess := v_excess || jsonb_build_object(
        'stock_id', v_target_stock_id, 'qty', v_received - v_src.qty, 'direction', 'in'
      );
      v_excess_qty := v_excess_qty + (v_received - v_src.qty);
    end if;

    -- `received_qty is null` şartı AYNI SATIRIN İKİ KEZ kabulünü kapatır: koşul olmasaydı ikinci
    -- geçiş hedefte İKİNCİ bir parti doğurur (stok yoktan var olur) ve `target_stock_id` yalnız
    -- sonuncuyu tutup ilkini öksüz bırakırdı. Çift tıklama ya da aynı partiyi iki satırda gönderen
    -- bir ekran bunun için yeter — tek çağrı içindeki tekrarı durum kontrolü yakalamaz.
    update public.warehouse_transfer_line
       set received_qty = v_received, target_stock_id = v_target_stock_id
     where id = v_line_id and received_qty is null;

    if not found then
      raise exception 'receive_transfer: satır % zaten kabul edilmiş', v_line_id;
    end if;
  end loop;

  -- Konuşulmamış satır kalamaz, yoksa mal sessizce buharlaşırdı; "0 geldi" kayıp beyanıdır, "hiç konuşulmadı" kabulü bloklar.
  if exists (
    select 1 from public.warehouse_transfer_line
     where transfer_id = p_transfer_id and received_qty is null
  ) then
    raise exception 'receive_transfer: kabul edilmemiş satır var — her satır için miktar (kayıpsa 0) gerekli';
  end if;

  -- Eksik beyanı: tek İMH belgesi, aynı işlemde; sebep boşsa `transfer_shortfall`, çünkü imha sebebi zorunludur.
  if v_short_qty > 0 then
    v_adjust := public.adjust_stock_batch(
      v_short, 'write_off', 'IMH', coalesce(p_reason, 'transfer_shortfall'), p_note, p_actor_id
    );
    v_short_ref := v_adjust ->> 'reference_no';
    update public.stock_movement
       set transfer_id = p_transfer_id
     where reference_no = v_short_ref and kind = 'write_off' and transfer_id is null;
  end if;

  -- Fazla beyanı: tek SAY belgesi; not boşsa sabit cümle. Aynı kabulde eksik ve fazla birlikte iki belge doğurur.
  if v_excess_qty > 0 then
    v_adjust := public.adjust_stock_batch(
      v_excess, 'count_diff', 'SAY', null,
      coalesce(nullif(btrim(p_note), ''), 'Transfer fazla geldi — sevk edilenden fazlası rampada sayıldı'),
      p_actor_id
    );
    v_excess_ref := v_adjust ->> 'reference_no';
    update public.stock_movement
       set transfer_id = p_transfer_id
     where reference_no = v_excess_ref and kind = 'count_diff' and transfer_id is null;
  end if;

  update public.warehouse_transfer
     set status = 'received', received_by = p_actor_id, received_at = now()
   where id = p_transfer_id;

  return jsonb_build_object(
    'ok', true,
    'transfer_id', p_transfer_id,
    'created_batches', v_created,
    'shortfall_qty', v_short_qty,
    'shortfall_reference_no', v_short_ref,
    'excess_qty', v_excess_qty,
    'excess_reference_no', v_excess_ref
  );
end;
$$;

revoke execute on function public.receive_transfer(uuid, jsonb, uuid, stock_write_off_reason, text) from public, anon, authenticated;

-- ── Sevk kaydının geri alınması ──────────────────────────────────────────────
-- Yalnız "sevk kaydı hatalıydı, mal hiç çıkmadı" hâli: mal kaynağa, orijinal partiye geri yazılır ve kayıt silinmez ki belge
-- numarası karşılıksız kalmasın. Mal çıkıp döndüyse ters yönlü yeni transfer yazılır.
create or replace function public.cancel_transfer(
  p_transfer_id uuid,
  p_actor_id uuid default null,
  p_reason text default null
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_status transfer_status;
  v_restored int := 0;
begin
  select status into v_status
    from public.warehouse_transfer where id = p_transfer_id for update;

  if v_status is null then
    raise exception 'cancel_transfer: transfer bulunamadı (%)', p_transfer_id;
  end if;
  -- `received` geri alınmaz, mal hedefte doğdu; `cancelled` de alınmaz, ikinci çağrı stoğu iki kez geri yazardı.
  if v_status <> 'in_transit' then
    raise exception 'cancel_transfer: transfer % durumunda, geri alınamaz', v_status;
  end if;

  -- Emniyet ağı: `in_transit` iken kabul edilmiş satır OLMAMALI (kabul hepsini birden yazar ve
  -- durumu çevirir). Varsa veri bozulmuştur; sessizce stok geri yazmaktansa durmak doğrudur.
  if exists (
    select 1 from public.warehouse_transfer_line
     where transfer_id = p_transfer_id and received_qty is not null
  ) then
    raise exception 'cancel_transfer: kabul edilmiş satır var — geri alma yolu kapalı, ters transfer açın';
  end if;

  -- Mal kaynağa geri: sevkte düşülen miktar, düşüldüğü PARTİYE eklenir.
  with geri as (
    update public.stock s
       set physical_qty = s.physical_qty + tl.qty
      from public.warehouse_transfer_line tl
     where tl.transfer_id = p_transfer_id and s.id = tl.source_stock_id
    returning 1
  )
  select count(*) into v_restored from geri;

  -- İptal ters kayıttır (SAP 551↔552): her sevk satırının karşısına aslını işaret eden giriş doğar.
  -- Yukarıdaki `update`ten sonra, çünkü defter satırı düzeltilmiş fiili miktarı anlatır.
  insert into public.stock_movement
    (stock_id, direction, qty, kind, unit_cost, actor_id, note, reference_no, transfer_id, reverses_id)
  select tl.source_stock_id, 'in', tl.qty, 'transfer_cancel', s.purchase_price, p_actor_id,
         p_reason, t.reference_no, p_transfer_id, m.id
    from public.warehouse_transfer_line tl
    join public.stock s on s.id = tl.source_stock_id
    join public.warehouse_transfer t on t.id = tl.transfer_id
    -- Aslı: aynı transferin aynı partiye yazdığı çıkış satırı. `left join` DEĞİL — sevk satırı
    -- varken çıkış satırının olmaması bir veri bozukluğudur ve sessizce geçilmemeli.
    join public.stock_movement m
      on m.transfer_id = tl.transfer_id
     and m.stock_id = tl.source_stock_id
     and m.kind = 'transfer_out'
   where tl.transfer_id = p_transfer_id;

  update public.warehouse_transfer
     set status = 'cancelled', cancelled_by = p_actor_id, cancelled_at = now(), cancel_reason = p_reason
   where id = p_transfer_id;

  return jsonb_build_object('ok', true, 'transfer_id', p_transfer_id, 'restored_lines', v_restored);
end;
$$;

revoke execute on function public.cancel_transfer(uuid, uuid, text) from public, anon, authenticated;
