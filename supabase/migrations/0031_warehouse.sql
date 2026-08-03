-- Modül 19 — Depo ağı (19.1). Kurallar: DOMAIN §17; teknik kararlar DATA_MODEL "Kalıcı kararlar" 01.08.
--
-- Sistem tek depo varsayımıyla kuruldu: stok bir yerdeydi, "kullanılabilir" tek bir sayıydı, posta
-- kodu yalnız rota gününü belirlerdi. Bu dosya o varsayımı kaldırır.
--
-- ── NEDEN KOLONLAR BAŞKA DOSYALARDA, TABLO BURADA ────────────────────────────
-- `warehouse_id` kolonları doğdukları tablonun dosyasında FK'siz açıldı (0007 stok, 0012 tedarik,
-- 0015 sipariş, …); bu dosya tabloyu kurar ve TÜM bağları birden bağlar. Emsal `stock.intake_id`:
-- 0006'da FK'siz doğdu, tablosu gelince 0010'da bağlandı. Böylece "depo tablosu stoktan önce yok"
-- sıralama sorunu hiç doğmaz ve ara numaralı dosya (0006_1 gibi) açmak gerekmez.
--
-- Aynı gerekçenin GÖRÜNÜM tarafı da var ve daha katı: kolon FK'siz doğabilir ama görünüm tabloyu
-- BEKLEMEK zorundadır — SQL'de "sonra bağlanacak join" yoktur. Bu yüzden `available_stock` bu
-- dosyada kurulur, doğduğu 0006'da değil.

-- ── Depo ────────────────────────────────────────────────────────────────────
create table public.warehouse (
  id uuid primary key default gen_random_uuid(),
  -- Belge numarasına ve ekrana giren kısa kod ('STR', 'KEHL'). Kısa çünkü `IMH-STR-26-0012` gibi
  -- bir numarayı denetmen ve tedarikçi elle yazacak (0033'ün gerekçesi).
  code text not null unique,
  name text not null,
  -- Deponun ülkesi — FİZİKSEL tesis nerede duruyor. Bölgenin ülkesiyle karıştırılmamalı: bir bölge
  -- sınır ötesi olabilir (ADR-002), depo olamaz. KDV'nin de bağlı olduğu alan budur:
  -- ⚠ DE'de depo açmak "uzaktan satış"ı "yerel satış"a çevirir (DOMAIN §5/§17) — mali danışman şart.
  country_code country_code not null default 'FR',
  address jsonb,
  -- Kargo çıkış deposu: bölge dışı müşteriler ve rota müşterilerinin kargo dolgusu buradan gider.
  ships_online boolean not null default false,
  is_active boolean not null default true,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- **ÜLKE BAŞINA EN FAZLA BİR AKTİF KARGO DEPOSU** — kural kayıt kapısında değil BURADA duruyor.
-- Karar dokümanı "tablo-geneli kısıt DB'de zorlanamaz" diyordu; kısmi unique indeks tam olarak bunu
-- yapar ve uygulama unutsa da geçmez. Anahtarın ülke olması bugünü de yarını da karşılar: bugün tek
-- ülke var (tek kargo deposu), DE açıldığında onun kendi kargo deposu olur — kod değişmeden.
create unique index warehouse_single_online on public.warehouse (country_code)
  where ships_online and is_active;

-- Depo seçici ve liste: operatörün verdiği sıra, eşitlikte kod.
create index warehouse_active_idx on public.warehouse (is_active, sort_order, code);

alter table public.warehouse enable row level security;

-- ── Araç (K8) — TABLO DÜŞÜRÜLDÜ (02.11, 03.08) ──────────────────────────────
-- `vehicle` burada tanımlıydı: plaka, etiket, aktiflik. Servisi yoktu, `from('vehicle')` hiçbir
-- yerde geçmiyordu, sıfır satır taşıyordu ve hiçbir tasarım sayfası aracı bir VARLIK olarak
-- kullanmıyordu — tasarımlarda "araç" yalnız fiziksel bağlam ("araca yükle").
--
-- Tüketilmeyen tablo, kullanılmayan enum değeriyle aynı sınıftır: okuyan, var olmayan bir
-- kabiliyeti varsayar. Üstelik `knip` bunu YAKALAYAMAZ (SQL ve Zod onun kapsamı dışında), yani
-- ölü şema kendiliğinden hiç görünmez.
--
-- Gerçekten gerekince geri gelir ve o gün doğru soruyu sorarız: araç bir depoya mı, bir güne mi,
-- bir kuryeye mi bağlanır. Bugün cevabı olmayan bir soruyu veride donduruyorduk.
-- Gerekçe: `data-model/depo.md` › Vehicle.

-- ── Depo bazlı asgari stok eşiği (C6) ───────────────────────────────────────
-- Varyanttaki `min_stock_qty` VARSAYILAN kalır; bu tablo yalnız İSTİSNA yazar. Fiyatın
-- müşteriye-özel satır deseniyle aynı: satır yoksa genel kural işler. Küresel tek eşik çok depoda
-- yapısal olarak yanlış cevap verir — 20 adet STR'de bol, KEHL'de kritik olabilir.
create table public.warehouse_variant_threshold (
  warehouse_id uuid not null references public.warehouse (id) on delete cascade,
  variant_id uuid not null references public.product_variant (id) on delete cascade,
  min_stock_qty int not null check (min_stock_qty >= 0),
  primary key (warehouse_id, variant_id)
);
alter table public.warehouse_variant_threshold enable row level security;

-- ── Depolar arası transfer (K11, T4) ────────────────────────────────────────
-- `draft` YOK: hazırlık ekranı henüz yok ve kullanılmayan enum değeri yalan söyler — sevk anı ilk
-- kalıcı andır (`quick_sale`'in `reference_no`'yu sevk anında üretmesiyle aynı mantık).
-- Bu yüzden `cancelled`'ın anlamı da DARDIR (19.6, `cancel_transfer`): iptal edilen şey her zaman
-- zaten sevk edilmiş bir kayıttır ve yalnız "sevk kaydı hatalıydı, mal hiç çıkmadı" hâlini kapsar.
-- Mal çıkıp geri döndüyse cevap ters yönlü YENİ transferdir — gerekçe fonksiyonun künyesinde.
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

-- Dizi kolonda FK kurulamaz — geçerlilik tetikleyiciyle tutulur. Yazılmayan bir uuid fail-closed
-- davranır (personel hiçbir depo göremez) ama SESSİZ kalırdı: kapsam ataması yapan operatör
-- "kaydettim" der, ertesi gün depocu boş ekrana bakar. Hata kayıt anında verilir.
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

-- Ters yön: kapsamda geçen depo silinemez. FK'ler (`restrict`) malı/siparişi olan depoyu zaten
-- korur ama dizi kolonda FK yoktur — boş bir depo silinseydi personelin `warehouse_ids`'inde
-- var olmayan bir kimlik kalırdı. Davranış fail-closed olurdu (kimse bir şey göremez) ama SESSİZ:
-- yukarıdaki tetikleyicinin varlık gerekçesiyle aynı sessizlik, ters yönden. Depo kapatılır
-- (`is_active`), silinmez; silinecekse önce kapsamlardan çıkarılır.
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
-- 0006'dan taşındı (dosya başındaki gerekçe). Denklem aynı: KULLANILABİLİR = FİİLİ − AKTİF
-- REZERVASYON; değişen tek şey hesabın DEPO İÇİNDE yapılması. Birleştirilmiş stok kimsenin stoğu
-- değildir: 3 STR'de + 2 KEHL'de duran maldan 5 kişilik sipariş çıkmaz.
--
-- `cross join` bilinçli: "0 da bir cevaptır" sözleşmesi korunuyor — yeni açılan depoda hiç parti
-- olmasa da her varyant için satır döner ve okuyan taraf "bilmiyorum" ile "yok"u ayırt edebilir.
-- Maliyet önemsiz (500 varyant × birkaç depo); depo sayısı büyürse fonksiyona çevrilir.
create or replace view public.available_stock as
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

-- Depo-üstü toplam — AYRI görünüm, bilerek. Satış kararı bunu OKUMAZ (yukarıdaki gerekçe); tedarik
-- önerisi ve "hiçbir depoda yok mu" sorusu (C3: ziyaretçiye 'tükendi' demenin tek meşru dayanağı)
-- buna bakar.
--
-- GERİ ÇAĞIRMA BUNU OKUMAZ: kaynağı `available_stock`, o da yalnız AKTİF depoları sayıyor — kapalı
-- bir depoda duran parti burada görünmez ve rappel'de iz kaybolur. Doğru kaynak `stock` tablosunun
-- kendisidir (parti/lot bazlı, aktiflikten bağımsız); bu görünüm "satılabilir mi / sipariş vermeli
-- miyim" sorusunun cevabıdır ve o sorularda kapalı deponun malı gerçekten sayılmamalıdır.
create or replace view public.available_stock_total as
select
  variant_id,
  sum(physical_qty)    as physical_qty,
  sum(reserved_qty)    as reserved_qty,
  sum(available_qty)   as available_qty,
  sum(expired_dlc_qty) as expired_dlc_qty
from public.available_stock
group by variant_id;

-- ── Tedarik siparişi ilerlemesi (K6, T5) ────────────────────────────────────
-- PO durumu SAKLANAN SAYAÇ DEĞİL, buradan türer: `receive_intake` artık siparişi koşulsuz kapatmaz.
-- Ölçü `initial_qty` — `physical_qty` satışla erir ve "ne kadar geldi" sorusuna yanlış cevap verir.
create or replace view public.purchase_order_progress as
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

-- ── Değişmez: siparişin partileri siparişin deposundan (T10) ────────────────
-- K5 ("bir sipariş tek depodan çıkar") şemada `order.warehouse_id not null` ile yarı yarıya durur;
-- kalan yarısı budur — hazırlıkta yazılan parti başka depodan olamaz. Üç yazım yolu var (hazırlık,
-- hızlı satış, seed) ve kural hepsinde geçerli: uygulamaya bırakılırsa biri unutur, mal bir
-- şehirde sipariş başka şehirde olur.
--
-- ERTELENMİŞ (`order_discount_balance` emsali): sipariş deposu ile partiler AYNI transaction'da
-- yazılabilsin diye — satır sırası kuralı bozmamalı, denetim COMMIT anında yapılır.
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

-- Partinin deposu doğrudan değiştirilirse de aynı denetim koşar. Normal akışta parti depo
-- değiştirmez (transfer hedefte YENİ satır doğurur, T4) — bu tetikleyici onarım betiği ve elle
-- müdahale yolunu kapatır. Değişmezin "veride durması" ancak tüm yollar kapalıyken anlamlıdır.
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

-- Siparişin deposu sonradan değiştirilirse de aynı denetim koşar — kısıt tek yönlü olsaydı
-- "partiler doğru, sipariş kaydı yanlış" hâli açık kalırdı.
--
-- Rezervasyonlar da BURADAN denetlenir: aşağıdaki `reservation_warehouse_matches_order` yalnız
-- rezervasyon tarafını dinliyor, yani siparişin deposu sonradan değişince sessiz kalırdı. O yol
-- teorik değil — K4 (checkout'ta posta kodu yeniden çözülür) ve K3 (posta kodu değişince sepet
-- yeniden değerlendirilir) tam olarak `order.warehouse_id`'yi güncelleyen yollardır. Ayrışsaydı
-- eski depoda mal kimseye hizmet etmeden kilitli kalır, yeni depoda hiç ayrılmamış olurdu.
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

-- ── Değişmez: rezervasyonun deposu siparişin deposu (T1) ────────────────────
-- Rezervasyon depoyu AÇIKÇA taşıyor (türetme ilkesinin gerekçeli istisnası, 0006'daki not);
-- bedeli iki alanın ayrışabilmesi, panzehiri bu kısıt. `order` bulunamazsa denetim atlanır:
-- rezervasyonun `order`'a FK'sı yok ve sipariş kapanınca satırlar zaten silinir.
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

-- ── Sevk (19.1) ─────────────────────────────────────────────────────────────
-- NEDEN RPC (STACK §13 (b)): bölünemez çok-tablolu yazım — transfer kaydı + satırlar + kaynak
-- partilerin düşümü tek gerçektir. Yarısı yazılırsa "mal düştü ama transfer yok" hâli doğar ve
-- stok elle düzeltilir. (a) koşulu da var: aynı partiyi eşzamanlı satış isteyebilir.
--
-- FİZİKSEL GERÇEK: yola çıkan mal kaynaktan O AN düşer. Sanal "transit depo" yok (T4) — yoldaki
-- mal hiçbir depoda satılamaz, çünkü hiçbir deponun stoğunda değildir.
--
-- ÖLÇÜ FİİLİ DEĞİL KULLANILABİLİR: sevk, müşteriye SÖZ VERİLMİŞ malı götüremez. Fiiliye baksaydık
-- 3 adedi rezerve edilmiş bir parti sevk edilebilir görünürdü; mal gider, sipariş STR'ye bağlı
-- kalır (K5) ve hazırlıkta karşılanamaz — üstelik aynı mal hedefte "serbest" görünüp ikinci kez
-- satılabilirdi. `available_stock` bunu gizler bile: `greatest(fiili − rezerve, 0)` eksiyi sıfır
-- gösterir. Bu yüzden kontrol sevkten ÖNCE ve fiili üzerinden değil kullanılabilir üzerinden yapılır.
-- (`adjust_stock` fiiliye bakar ve bu doğrudur — imha FİZİKSEL KAYIPTIR, olan biteni kaydeder;
-- transfer ise bir karardır ve reddedilebilir.)
--
-- p_lines: [{"source_stock_id": uuid, "qty": int}, ...]
create or replace function public.dispatch_transfer(
  p_to_warehouse_id uuid,
  p_lines jsonb,
  p_actor_id uuid default null,
  p_note text default null
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

  insert into public.warehouse_transfer (from_warehouse_id, to_warehouse_id, reference_no, dispatched_by, note)
  values (v_from_warehouse_id, p_to_warehouse_id, v_reference, p_actor_id, p_note)
  returning id into v_transfer_id;

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
  end loop;

  return jsonb_build_object('ok', true, 'transfer_id', v_transfer_id, 'reference_no', v_reference);
end;
$$;

revoke execute on function public.dispatch_transfer(uuid, jsonb, uuid, text) from public, anon, authenticated;

-- ── Kabul (19.1) ────────────────────────────────────────────────────────────
-- İkinci fiziksel gerçek an: mal hedef depoda doğar. Parti kimliği KORUNUR (T4) — tarih, lot ve
-- alış fiyatı kaynaktan kopyalanır ki geri çağırma izi ve gerçek COGS transferden etkilenmesin.
-- Hedefte var olan bir partiyle BİRLEŞTİRİLMEZ: birleştirseydik `initial_qty` iki partinin toplamı
-- olur, "bu partiden ne kadar tüketildi" sorusu cevapsız kalırdı.
--
-- Yeni parti `intake_id` ve `purchase_order_item_id` TAŞIMAZ (T5): transfer bir tedarik girişi
-- değildir; tedarik fark raporu PO kalemi ↔ giriş partileri bağından hesaplanır ve transfer onu
-- bozamaz. Kökeni `warehouse_transfer_line.source_stock_id → target_stock_id` bağında durur.
--
-- Kısmi kabul serbest: eksik gelen mal `received_qty` ile yazılır, fark raporda görünür.
-- BEKLEYEN(19.6): eksik farkının fire kaydına dönüşmesi (bugün rapor, kayıt değil).
--
-- p_lines: [{"line_id": uuid, "received_qty": int}, ...]
create or replace function public.receive_transfer(
  p_transfer_id uuid,
  p_lines jsonb,
  p_actor_id uuid default null
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
    if v_received > v_src.qty then
      raise exception 'receive_transfer: sevk edilen % iken % kabul edilemez', v_src.qty, v_received;
    end if;

    if v_received > 0 then
      insert into public.stock (warehouse_id, variant_id, physical_qty, expiry_date, lot_number, purchase_price)
      values (v_to_warehouse_id, v_src.variant_id, v_received, v_src.expiry_date, v_src.lot_number, v_src.purchase_price)
      returning id into v_target_stock_id;
      v_created := v_created + 1;
    else
      v_target_stock_id := null;
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

  -- KONUŞULMAMIŞ SATIR KALAMAZ. Eksik satır transferi kapatsaydı mal sessizce buharlaşırdı:
  -- kaynaktan düşmüş, hedefte doğmamış, "yolda ne var" listesinde de yok (T4'e göre o listenin tek
  -- kaynağı bu kayıt). "0 geldi" ile "hiç konuşulmadı" ayrı şeylerdir — ilki kayıp beyanıdır ve
  -- `received_qty = 0` ile yazılır, ikincisi bir eksikliktir ve kabulü bloklar.
  if exists (
    select 1 from public.warehouse_transfer_line
     where transfer_id = p_transfer_id and received_qty is null
  ) then
    raise exception 'receive_transfer: kabul edilmemiş satır var — her satır için miktar (kayıpsa 0) gerekli';
  end if;

  update public.warehouse_transfer
     set status = 'received', received_by = p_actor_id, received_at = now()
   where id = p_transfer_id;

  return jsonb_build_object('ok', true, 'transfer_id', p_transfer_id, 'created_batches', v_created);
end;
$$;

revoke execute on function public.receive_transfer(uuid, jsonb, uuid) from public, anon, authenticated;

-- ── Sevk kaydının geri alınması (19.6) ──────────────────────────────────────
-- **İki farklı gerçeği ayırıyoruz, çünkü tek düğmeye sıkıştırılırsa stok yalan söyler:**
--
--   1. Sevk kaydı HATALIYDI, mal hiç çıkmadı  → burası. Mal kaynağa geri yazılır, transfer
--      `cancelled` olur. Bu bir DÜZELTMEDİR ve iz bırakır (kim, ne zaman, neden).
--   2. Mal çıktı, sonra geri döndü            → BURASI DEĞİL, ters yönlü YENİ transfer. Mal fiilen
--      iki kez yol gitti; tek kayda indirmek "hiç gitmedi" demek olur ve soğuk zincir geçmişini
--      siler. Ekranın düğmesi bu yüzden "İptal" değil **"Sevk kaydını geri al"** demeli.
--
-- Neden kayıt SİLİNMEZ: transfer bir olay kaydıdır. Silinseydi `reference_no` (kâğıt klasördeki
-- numara) karşılıksız kalırdı ve depocu elindeki belgeyi sistemde bulamazdı.
--
-- Neden hedef depoya değil KAYNAĞA yazılır: mal hiç çıkmadı iddiası bu yolun tanımı. Hedefe
-- yazmak, olmayan bir kabulü uydururdu.
--
-- Parti KİMLİĞİ korunur: miktar orijinal satıra geri eklenir, yeni parti doğmaz. Yeni parti açmak
-- `initial_qty`'yi ve geri çağırma izini bölerdi (T4 ile aynı gerekçe, ters yönü).
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
  -- `received` geri alınmaz: mal hedefte parti olarak DOĞDU, belki satıldı bile. O yolun cevabı
  -- ters transferdir. `cancelled` de geri alınmaz — ikinci çağrı stoğu iki kez geri yazardı.
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

  update public.warehouse_transfer
     set status = 'cancelled', cancelled_by = p_actor_id, cancelled_at = now(), cancel_reason = p_reason
   where id = p_transfer_id;

  return jsonb_build_object('ok', true, 'transfer_id', p_transfer_id, 'restored_lines', v_restored);
end;
$$;

revoke execute on function public.cancel_transfer(uuid, uuid, text) from public, anon, authenticated;
