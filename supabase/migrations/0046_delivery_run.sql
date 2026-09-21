-- Sefer: aracın fiilen çıktığı tur (sefer etüdü); planlanan sefer `(delivery_zone_id, delivery_date)` olarak türetilir.
-- `order.courier_id` siparişte kalır ama sefer kurulunca seferin kuryesiyle yazılır, çünkü beş sahiplik kapısı ona yaslanıyor.

create table public.delivery_run (
  id uuid primary key default gen_random_uuid(),
  -- Okunabilir sefer kodu (`SF-26-XXXXXX`) — üretim domain-core'da (`deliveryRunReferenceNo`),
  -- benzersizlik burada; çakışmada çağıran yeni kodla dener (sipariş referansının aynı deseni).
  reference_no text not null unique,

  -- SEFERİN KİMLİĞİ: hangi rotanın hangi günü sürüldü.
  -- `restrict`: sefer görmüş rota silinmez, pasife alınır — geçmiş sefer "hangi rota" sorusuna
  -- cevap verebilmeli (courier_day_close'un kurye kuralıyla aynı gerekçe).
  delivery_zone_id uuid not null references public.delivery_zone (id) on delete restrict,
  delivery_date date not null,

  -- SNAPSHOT (0012'nin `delivery_zone_id` deseni): bölge sonradan başka depoya taşınsa da bu
  -- seferin hangi tesisten yüklendiği değişmez. Kaynağı start anındaki `zone.warehouse_id`.
  warehouse_id uuid not null references public.warehouse (id) on delete restrict,

  -- KİM SÜRDÜ. `restrict` — kapanışı olan kişi yok edilirse sefer kimin diye sorulamaz.
  courier_id uuid not null references public.user_profiles (id) on delete restrict,

  -- Araç kaydı olmayan kurulumda kurye kilitlenmesin diye boş olabilir, zorunluluk ayardadır. `restrict`, çünkü soğuk
  -- zincir izi araca bağlıdır.
  vehicle_id uuid references public.vehicle (id) on delete restrict,

  -- Yaşam çizgisi durum makinesi değil üç damgadır: kurulur, yola çıkar, döner (`open` → `depart` → `close_delivery_run`).
  -- Kurulum ile çıkış ayrıdır, çünkü araç bir ara depodur ve birden çok seferin kutusunu taşıyabilir; müşteriye haber çıkışta gider.
  created_at timestamptz not null default now(),
  departed_at timestamptz,
  returned_at timestamptz,
  note text,

  -- Durak sırası turun özelliğidir, siparişin değil: siparişteki `stop_seq` başka güne taşınınca sessizce yalana dönerdi.
  -- Dizi yalnız sıralar, üyelik `order.delivery_run_id`de; dizide olmayan durak düşmez, sona gider.
  stop_order uuid[] not null default '{}',

  -- `manual` bir kilittir: `set_run_stop_order` motor yazımını `p_force` olmadan reddeder.
  stop_order_source text check (stop_order_source in ('engine', 'manual')),
  -- Sıranın ölçüsü; kuş uçuşu bariyerin iki yakasını yakın sayar. Veriye yazılır, çünkü ekrandaki sıraya bakan var, log'a bakan yok.
  stop_order_metric text check (stop_order_metric in ('haversine', 'matrix')),
  -- Sıranın inceliği; aynı seferde iki çözünürlük olabilir ve `postal_centroid` sokak düzeyi olmadığını ekrana söyletir.
  stop_order_precision text check (stop_order_precision in ('address', 'postal_centroid', 'mixed')),
  -- KARARIN anı — sonucu boş olsa bile damgalanır ("hesaplandı, sıralanamadı"). Yoksa düşmüş bir
  -- sağlayıcı her gün ekranı yoklamasında yeniden dövülürdü.
  stop_order_generated_at timestamptz,
  stop_order_by uuid references public.user_profiles (id) on delete set null,

  constraint delivery_run_times check (
    (departed_at is null or departed_at >= created_at)
    and (returned_at is null or departed_at is not null)   -- çıkmadan dönülmez
    and (returned_at is null or returned_at >= departed_at)
  )
);

-- Rota ve gün başına tek sefer; eşzamanlılık kilidi burada, ikinci kurye RPC'den `already_started` alır.
create unique index delivery_run_key on public.delivery_run (delivery_zone_id, delivery_date);

-- Kuryenin seferleri (mobil gün ekranı + kapanış köprüsü) ve geçmiş sefer listesi (keyset).
create index delivery_run_courier_idx on public.delivery_run (courier_id, delivery_date desc);
-- Soğuk zincir raporu: "bu araç hangi seferlerde" — temperature_log zaman-aralığı join'inin girişi.
create index delivery_run_vehicle_idx on public.delivery_run (vehicle_id, delivery_date desc)
  where vehicle_id is not null;

alter table public.delivery_run enable row level security;

-- ── Sipariş sefere bağlanır (kolon 0012'de doğdu, bağ BURADA kurulur) ────────
-- `set null`: sefer kaydı silinse sipariş silinmez (order_delivery_zone_fk deseni). Kısmi indeks:
-- satırların çoğunda (kargo, kapı önü, henüz çıkmamış) alan boş.
alter table public.order add constraint order_delivery_run_fk
  foreign key (delivery_run_id) references public.delivery_run (id) on delete set null;
create index order_delivery_run_idx on public.order (delivery_run_id) where delivery_run_id is not null;

-- ── Beklenen tahsilat — sefer bazında ────────────────────────────────────────
-- Fark hangi seferde doğduysa orada görünsün diye; `delivery_run_id` teslimle donduğu için yeniden atama kaydırmaz.
-- Yalnız kapıda toplanan üç yöntem sayılır, çünkü online ve havale kuryenin eline girmez.
create or replace view public.delivery_run_collection with (security_invoker = true) as
select o.delivery_run_id,
       coalesce(sum(m.amount) filter (where o.payment_method = 'cash'), 0)::numeric(12, 2)   as expected_cash,
       coalesce(sum(m.amount) filter (where o.payment_method = 'card'), 0)::numeric(12, 2)   as expected_card,
       coalesce(sum(m.amount) filter (where o.payment_method = 'cheque'), 0)::numeric(12, 2) as expected_cheque
  from public.order o
  join public.money_movement m on m.order_id = o.id and m.type = 'order_payment'
 where o.delivery_run_id is not null
   and o.payment_method in ('cash', 'card', 'cheque')
 group by o.delivery_run_id;

-- ── Sefer kapanışı — mutabakat kaydı ────────────────────────────────────────
-- Kapanış para hareketi değil mutabakattır: beklenen ile sayılan yan yana konur ve fark aynı gün görünür.
create table public.delivery_run_close (
  id uuid primary key default gen_random_uuid(),
  -- Sefer başına BİR kapanış; kapanışı olan sefer silinemez.
  delivery_run_id uuid not null unique references public.delivery_run (id) on delete restrict,

  -- Sistemin hesabı (kapanış anındaki fotoğraf). Görünümden türer ama BURAYA DONDURULUR: sonradan
  -- bir hareket düzeltilirse geçmiş mutabakat değişmemeli — "o gün ne konuşuldu" sabit kalır.
  expected_cash numeric(12, 2) not null default 0,
  expected_card numeric(12, 2) not null default 0,
  expected_cheque numeric(12, 2) not null default 0,
  -- Kuryenin fiilen teslim ettiği: nakit sayımı, kart cihaz raporu, çek yaprakları.
  counted_cash numeric(12, 2) not null default 0,
  counted_card numeric(12, 2) not null default 0,
  counted_cheque numeric(12, 2) not null default 0,

  -- Kapanış anının resmi, kimlik olarak: sonradan "hangi sipariş" cevapsız kalmasın. Çözümden önce çekilir,
  -- bu yüzden kapanışın `ready`ye düşürdüğü duraklar burada `pending` görünür.
  delivered_orders uuid[] not null default '{}',
  returned_orders uuid[] not null default '{}',
  pending_orders uuid[] not null default '{}',

  -- Fark çıktığında kuryenin kısa açıklaması. Fark gizlenmez, AÇIKLANIR.
  note text,
  closed_by uuid references public.user_profiles (id) on delete set null,
  closed_at timestamptz not null default now(),

  -- TÜRETİLİR, yazılmaz: saklansaydı bir gün kolonlarla çelişirdi.
  reconciled boolean generated always as (
    expected_cash = counted_cash and expected_card = counted_card and expected_cheque = counted_cheque
  ) stored
);

-- Admin'in "mutabık olmayan seferler" listesi — azınlıktır, kısmi indeks.
create index delivery_run_close_open_idx on public.delivery_run_close (closed_at desc) where not reconciled;

alter table public.delivery_run_close enable row level security;

-- ── Seferi kur ───────────────────────────────────────────────────────────────
-- RPC, çünkü eşzamanlı kurulum ve sefer satırı ile sipariş damgası bölünemez (STACK §13); durum geçişi motorun ve uygulamanın
-- işidir. Sefer kurulur ama başlamaz: kutular okutulabilir, müşteriye haber `depart_delivery_run` ile gider.
create or replace function public.open_delivery_run(
  p_zone_id uuid,
  p_date date,
  p_courier_id uuid,
  p_reference_no text,
  p_vehicle_id uuid default null,
  p_actor_id uuid default null
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_zone public.delivery_zone;
  v_existing public.delivery_run;
  v_run public.delivery_run;
  v_other public.delivery_run;
  v_claimed jsonb;
begin
  select * into v_zone from public.delivery_zone where id = p_zone_id;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'zone_not_found');
  end if;

  -- Araç tekelliği: aynı aracı iki kurye seçemez (`vehicle_taken`) ve kuryenin ikinci seferi başka araç taşıyamaz
  -- (`vehicle_mismatch`). Ret adlı döner ki ekran ayrı çare söylesin; kapanmış sefer sayılmaz, yarışı tetikleyici korur.
  if p_vehicle_id is not null then
    select * into v_other from public.delivery_run r
     where r.vehicle_id = p_vehicle_id
       and r.returned_at is null
       and r.courier_id <> p_courier_id
     limit 1;
    if found then
      return jsonb_build_object(
        'ok', false, 'reason', 'vehicle_taken',
        'run_id', v_other.id, 'reference_no', v_other.reference_no, 'courier_id', v_other.courier_id
      );
    end if;
  end if;

  -- Kuryenin ÖTEKİ açık seferleri (bu rota+gün hariç — o satır catch-up'ın kendisidir) aynı aracı
  -- taşımalı. `is distinct from` null'ı da kapsıyor: araçlı yükün yanına araçsız sefer eklemek de
  -- karışıklıktır, çünkü o seferin malı hangi araçta duracaktır sorusunun cevabı olmaz.
  select * into v_other from public.delivery_run r
   where r.courier_id = p_courier_id
     and r.returned_at is null
     and not (r.delivery_zone_id = p_zone_id and r.delivery_date = p_date)
     and r.vehicle_id is distinct from p_vehicle_id
   limit 1;
  if found then
    return jsonb_build_object(
      'ok', false, 'reason', 'vehicle_mismatch',
      'run_id', v_other.id, 'reference_no', v_other.reference_no, 'vehicle_id', v_other.vehicle_id
    );
  end if;

  -- Rota ve gün başına tek sefer: mevcut satır ilk select'te ya da yarışı kaybedenin `unique_violation` dalında bulunur ve
  -- ikisi aynı dala düşer. Aynı kuryenin açık seferi kalan siparişleri de alır, başkasınınki ya da kapanmışı `already_started`.
  select * into v_existing from public.delivery_run
   where delivery_zone_id = p_zone_id and delivery_date = p_date
   for update;

  if not found then
    begin
      insert into public.delivery_run
        (reference_no, delivery_zone_id, delivery_date, warehouse_id, courier_id, vehicle_id)
      values
        (p_reference_no, p_zone_id, p_date, v_zone.warehouse_id, p_courier_id, p_vehicle_id)
      returning * into v_run;
    exception when unique_violation then
      -- Yarışın kaybedeni: kazananın satırını kilitleyip ortak dala taşı. Satır yine yoksa çakışan
      -- şey REFERANS koduydu — çağıran yeni kodla dener (sipariş referansı deseni).
      select * into v_existing from public.delivery_run
       where delivery_zone_id = p_zone_id and delivery_date = p_date
       for update;
      if not found then
        return jsonb_build_object('ok', false, 'reason', 'reference_collision');
      end if;
    end;
  end if;

  if v_run.id is null then
    -- Ortak dal: sefer zaten var (sakin ikinci basış YA DA yarış kaybedeni).
    if v_existing.courier_id = p_courier_id and v_existing.returned_at is null then
      v_run := v_existing;  -- catch-up: claim aşağıda, yeni satırla aynı yoldan koşar
    else
      return jsonb_build_object(
        'ok', false, 'reason', 'already_started',
        'run_id', v_existing.id, 'reference_no', v_existing.reference_no,
        'courier_id', v_existing.courier_id, 'departed_at', v_existing.departed_at
      );
    end if;
  end if;

  -- Seferin siparişleri damgalanır; kurye plan ataması ne derse desin seferden gelir.
  with claimed as (
    update public.order o
       set delivery_run_id = v_run.id, courier_id = p_courier_id
     where o.delivery_zone_id = p_zone_id
       and o.delivery_date = p_date
       and o.delivery_type = 'route'
       and o.status in ('confirmed', 'preparing', 'ready', 'out_for_delivery')
     returning o.id, o.status
  )
  select coalesce(jsonb_agg(jsonb_build_object('order_id', id, 'status', status)), '[]'::jsonb)
    into v_claimed from claimed;

  return jsonb_build_object(
    'ok', true,
    'run_id', v_run.id,
    'reference_no', v_run.reference_no,
    'departed_at', v_run.departed_at,
    'claimed', v_claimed
  );
end;
$$;

revoke execute on function public.open_delivery_run(uuid, date, uuid, text, uuid, uuid)
  from public, anon, authenticated;

-- ── Seferi başlat (yola çık) ─────────────────────────────────────────────────
-- RPC yalnız `departed_at` damgasının atomikliğini taşır, durum geçişi uygulama katmanındadır. İkinci basış hata değildir,
-- `already_departed` döner.
create or replace function public.depart_delivery_run(
  p_run_id uuid,
  p_courier_id uuid
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_run public.delivery_run;
  v_other public.delivery_run;
begin
  select * into v_run from public.delivery_run where id = p_run_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  -- Başkasının seferi başlatılamaz: sefer kimin kurduğunun üstünde durur.
  if v_run.courier_id <> p_courier_id then
    return jsonb_build_object('ok', false, 'reason', 'not_mine');
  end if;

  if v_run.departed_at is not null then
    return jsonb_build_object('ok', true, 'reason', 'already_departed', 'departed_at', v_run.departed_at);
  end if;

  -- Araç birden çok seferi taşır ama kurye aynı anda birini sürer, yoksa durak sırası, ilerleme ve kasa sorusu cevapsız kalır.
  -- Kapı burada, çünkü iki cihazdan gelen isteği ancak satır kilidi ayırır.
  select * into v_other from public.delivery_run r
   where r.courier_id = p_courier_id
     and r.id <> p_run_id
     and r.departed_at is not null
     and not exists (select 1 from public.delivery_run_close c where c.delivery_run_id = r.id)
   order by r.departed_at
   limit 1;
  if found then
    return jsonb_build_object(
      'ok', false, 'reason', 'another_running',
      'run_id', v_other.id, 'reference_no', v_other.reference_no
    );
  end if;

  update public.delivery_run set departed_at = now() where id = p_run_id returning * into v_run;
  return jsonb_build_object('ok', true, 'departed_at', v_run.departed_at);
end;
$$;

revoke execute on function public.depart_delivery_run(uuid, uuid) from public, anon, authenticated;

-- ── Seferi araçtan çıkar ─────────────────────────────────────────────────────
-- `open_delivery_run`ın tersi: kurulmuş sefer bir niyettir, saklansa `delivery_run_key` rotayı kilitlerdi, bu yüzden silinir.
-- Kutuların araç damgası da silinir, yoksa hiçbir sefere ait olmayan bir emanet kalırdı.
create or replace function public.discard_delivery_run(
  p_run_id uuid,
  p_courier_id uuid
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_run public.delivery_run;
  v_orders uuid[];
  v_boxes int;
begin
  select * into v_run from public.delivery_run where id = p_run_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  if v_run.courier_id <> p_courier_id then
    return jsonb_build_object('ok', false, 'reason', 'not_mine');
  end if;

  -- BAŞLAMIŞ SEFER ÇIKARILMAZ: durakları açıldı ve müşterilere haber gitti — geri alınacak bir
  -- niyet kalmadı, dürüst çıkış kapanıştır (`close_delivery_run`).
  if v_run.departed_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'already_departed');
  end if;

  -- Siparişler serbest kalır: kurye ataması da düşer, çünkü atama SEFERDEN geliyordu.
  with released as (
    update public.order o
       set delivery_run_id = null, courier_id = null
     where o.delivery_run_id = p_run_id
     returning o.id
  )
  select coalesce(array_agg(id), '{}') into v_orders from released;

  -- Kutuların araç damgası silinir (mal zaten rampada; damga bir emanet kaydıydı).
  with unloaded as (
    update public.order_box b
       set loaded_at = null, loaded_by = null
     where b.order_id = any(v_orders) and b.loaded_at is not null
     returning b.id
  )
  select count(*) into v_boxes from unloaded;

  delete from public.delivery_run where id = p_run_id;

  return jsonb_build_object(
    'ok', true,
    'released_orders', coalesce(array_length(v_orders, 1), 0),
    'unloaded_boxes', v_boxes
  );
end;
$$;

revoke execute on function public.discard_delivery_run(uuid, uuid) from public, anon, authenticated;

-- ── Seferi kapat ─────────────────────────────────────────────────────────────
-- Dönüş damgası, kapanış resmi ve takılı durakların `ready`ye çözümü tek andır; stok değişmez, yeni gün sevkiyatçının kararıdır.
-- Geçiş koşullu gider: kurye o an teslim yazdıysa onun kaydı kazanır.
create or replace function public.close_delivery_run(
  p_run_id uuid,
  p_counted_cash numeric default 0,
  p_counted_card numeric default 0,
  p_counted_cheque numeric default 0,
  p_note text default null,
  p_actor_id uuid default null
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_run public.delivery_run;
  v_existing public.delivery_run_close;
  v_expected record;
  v_delivered uuid[];
  v_returned uuid[];
  v_pending uuid[];
  v_stuck uuid;
  v_transition jsonb;
  v_released int := 0;
  v_row public.delivery_run_close;
begin
  select * into v_run from public.delivery_run where id = p_run_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  -- Yola çıkmamış sefer araçta bekliyordur ve kapatılmaz; kapı kendi cevabını verir ki ekran bunu söyleyebilsin.
  if v_run.departed_at is null then
    return jsonb_build_object('ok', false, 'reason', 'not_departed');
  end if;

  -- Kapanmış sefer salt-okunur: ikinci çağrı ezmez, mevcut kaydı bildirir.
  select * into v_existing from public.delivery_run_close where delivery_run_id = p_run_id;
  if found then
    return jsonb_build_object('ok', false, 'reason', 'already_closed', 'id', v_existing.id, 'closed_at', v_existing.closed_at);
  end if;

  select coalesce(c.expected_cash, 0)   as cash,
         coalesce(c.expected_card, 0)   as card,
         coalesce(c.expected_cheque, 0) as cheque
    into v_expected
    from (select 1) dummy
    left join public.delivery_run_collection c on c.delivery_run_id = p_run_id;

  -- FOTOĞRAF ÇÖZÜMDEN ÖNCE: kapanış anında durak neydiyse liste onu söyler. `completed` de teslim
  -- edilmiştir (kapanış geciktiyse sipariş çoktan kapanmış olabilir).
  select coalesce(array_agg(o.id) filter (where o.status in ('delivered', 'completed')), '{}'),
         coalesce(array_agg(o.id) filter (where o.status = 'returned'), '{}'),
         coalesce(array_agg(o.id) filter (where o.status not in ('delivered', 'completed', 'returned', 'cancelled')), '{}')
    into v_delivered, v_returned, v_pending
    from public.order o
   where o.delivery_run_id = p_run_id;

  -- Takılı durakların çözümü (K4). Koşullu geçiş: stale dönen sayılmaz — o durağı kurye kazandı.
  for v_stuck in
    select id from public.order where delivery_run_id = p_run_id and status = 'out_for_delivery'
  loop
    v_transition := public.transition_order_status(
      v_stuck, 'out_for_delivery', 'ready', p_actor_id, null,
      'Sefer kapandı, durak sonuçlanmadı — yeniden planlanacak.'
    );
    if (v_transition ->> 'ok')::boolean then
      v_released := v_released + 1;
    end if;
  end loop;

  -- Dönüş damgası: zaten dolu ise (teorik) ezilmez. Not, seferin notuna değil kapanışa yazılır.
  update public.delivery_run
     set returned_at = coalesce(returned_at, now())
   where id = p_run_id;

  insert into public.delivery_run_close (
    delivery_run_id,
    expected_cash, expected_card, expected_cheque,
    counted_cash, counted_card, counted_cheque,
    delivered_orders, returned_orders, pending_orders, note, closed_by
  ) values (
    p_run_id,
    v_expected.cash, v_expected.card, v_expected.cheque,
    coalesce(p_counted_cash, 0), coalesce(p_counted_card, 0), coalesce(p_counted_cheque, 0),
    v_delivered, v_returned, v_pending, p_note, p_actor_id
  )
  returning * into v_row;

  return jsonb_build_object(
    'ok', true,
    'id', v_row.id,
    'run_id', p_run_id,
    'expected_cash', v_row.expected_cash,
    'expected_card', v_row.expected_card,
    'expected_cheque', v_row.expected_cheque,
    'counted_cash', v_row.counted_cash,
    'counted_card', v_row.counted_card,
    'counted_cheque', v_row.counted_cheque,
    -- Fark = sayılan − beklenen. İşaret anlamlıdır: eksi eksik teslim, artı fazla para.
    'difference_cash', v_row.counted_cash - v_row.expected_cash,
    'difference_card', v_row.counted_card - v_row.expected_card,
    'difference_cheque', v_row.counted_cheque - v_row.expected_cheque,
    'reconciled', v_row.reconciled,
    'delivered_count', coalesce(array_length(v_row.delivered_orders, 1), 0),
    'returned_count', coalesce(array_length(v_row.returned_orders, 1), 0),
    'pending_count', coalesce(array_length(v_row.pending_orders, 1), 0),
    'released_count', v_released,
    'returned_at', (select returned_at from public.delivery_run where id = p_run_id)
  );
end;
$$;

revoke execute on function public.close_delivery_run(uuid, numeric, numeric, numeric, text, uuid)
  from public, anon, authenticated;

-- ── Seferi devret ────────────────────────────────────────────────────────────
-- Kurye hem seferde hem açık siparişlerde tek işlemde değişir, yoksa sahiplik kapıları yarım devri reddederdi.
-- Sonuçlanmış duraklara dokunulmaz, teslim edenin kimliği tarihtir.
create or replace function public.reassign_delivery_run(
  p_run_id uuid,
  p_courier_id uuid,
  p_actor_id uuid default null
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_run public.delivery_run;
  v_closed public.delivery_run_close;
  v_moved int;
begin
  select * into v_run from public.delivery_run where id = p_run_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'not_found');
  end if;

  -- Kapanmış sefer devredilemez: mutabakat yapıldı, araç döndü — devredilecek bir yol kalmadı.
  select * into v_closed from public.delivery_run_close where delivery_run_id = p_run_id;
  if found then
    return jsonb_build_object('ok', false, 'reason', 'already_closed');
  end if;

  if v_run.courier_id = p_courier_id then
    return jsonb_build_object('ok', false, 'reason', 'same_courier');
  end if;

  update public.delivery_run set courier_id = p_courier_id where id = p_run_id;

  with moved as (
    update public.order o
       set courier_id = p_courier_id
     where o.delivery_run_id = p_run_id
       and o.status not in ('delivered', 'completed', 'returned', 'cancelled')
     returning o.id
  )
  select count(*) into v_moved from moved;

  return jsonb_build_object('ok', true, 'run_id', p_run_id, 'courier_id', p_courier_id, 'moved_stops', v_moved);
end;
$$;

revoke execute on function public.reassign_delivery_run(uuid, uuid, uuid)
  from public, anon, authenticated;

-- ── Durak sırasını yaz ───────────────────────────────────────────────────────
-- Tek yazım kapısı; `manual` kilidi burada, çünkü oku-sonra-yaz uçuştaki yeniden hesabın elle sırayı ezmesine izin verirdi.
-- İçerik doğrulanmaz: dizide olmayan durak düşmez, yabancı kimlik hiçbir şeye denk gelmez.
create or replace function public.set_run_stop_order(
  p_run_id uuid,
  p_order_ids uuid[],
  p_source text,
  p_metric text,
  p_precision text,
  p_actor_id uuid default null,
  p_force boolean default false
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_run public.delivery_run;
begin
  select * into v_run from public.delivery_run where id = p_run_id for update;
  if not found then
    return jsonb_build_object('ok', false, 'reason', 'run_not_found');
  end if;

  -- Kapanmış seferin sırası DONAR: "o gün hangi sırayla gidildi" sorusu geçmişe dönük değişmemeli
  -- (kapanış fotoğrafının `delivered_orders`la aynı gerekçesi).
  if v_run.returned_at is not null then
    return jsonb_build_object('ok', false, 'reason', 'run_closed');
  end if;

  if v_run.stop_order_source = 'manual' and p_source = 'engine' and not p_force then
    return jsonb_build_object('ok', false, 'reason', 'manual_order_kept');
  end if;

  update public.delivery_run
     set stop_order = p_order_ids,
         stop_order_source = p_source,
         stop_order_metric = p_metric,
         stop_order_precision = p_precision,
         -- Damga sonuç BOŞ olsa da vurulur: "hesaplandı, sıralanamadı" da bir cevaptır ve düşmüş
         -- bir sağlayıcının her okumada yeniden dövülmesini bu engelliyor.
         stop_order_generated_at = now(),
         stop_order_by = p_actor_id
   where id = p_run_id;

  return jsonb_build_object('ok', true, 'run_id', p_run_id, 'stops', coalesce(array_length(p_order_ids, 1), 0));
end;
$$;

revoke execute on function public.set_run_stop_order(uuid, uuid[], text, text, text, uuid, boolean)
  from public, anon, authenticated;

-- ── Seferin aracı tek kuryenindir ───────────────────────────────────────────
-- Soru satırlar arası olduğu için kısıt değil tetikleyici; kapanmış sefer sayılmaz, araç ertesi gün başkasına geçebilir.
create or replace function public.assert_vehicle_single_courier() returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_other public.delivery_run;
begin
  if new.vehicle_id is null then return new; end if;

  select * into v_other from public.delivery_run r
   where r.vehicle_id = new.vehicle_id
     and r.id <> new.id
     and r.returned_at is null
   limit 1;

  if found and v_other.courier_id <> new.courier_id then
    raise exception 'vehicle_taken: araç % başka kuryenin açık seferinde (%)', new.vehicle_id, v_other.reference_no
      using errcode = 'check_violation';
  end if;

  -- Aynı kuryenin ÖTEKİ açık seferleri de aynı aracı taşımalı: araçtaki yük tek araca aittir.
  select * into v_other from public.delivery_run r
   where r.courier_id = new.courier_id
     and r.id <> new.id
     and r.returned_at is null
     and r.vehicle_id is distinct from new.vehicle_id
   limit 1;

  if found then
    raise exception 'vehicle_mismatch: kuryenin açık seferi başka araçta (%)', v_other.reference_no
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger delivery_run_vehicle_single_courier
  before insert or update of vehicle_id, courier_id on public.delivery_run
  for each row execute function public.assert_vehicle_single_courier();
