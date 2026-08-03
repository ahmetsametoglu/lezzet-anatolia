-- Modül 11 — Kurye gün kapanışı ve kasa mutabakatı (11.6). DOMAIN §7, data-model/musteri-siparis.md.
--
-- Kapanış bir MUTABAKATTIR, bir para hareketi değil: para zaten kapıda tahsil edilirken yazıldı
-- (12.2). Burada yapılan tek şey **beklenen ile sayılanı yan yana koymak** ve farkı AYNI GÜN
-- görünür kılmak. Fark ertesi güne sarkarsa iz soğur — ekranın varlık sebebi budur.
--
-- NEDEN RPC (STACK §13): (a) eşzamanlılık — aynı gün iki kez kapatılamaz, ikinci çağrı sessizce
-- ezmek yerine "zaten kapalı" der; (b) bölünemez okuma+yazım — beklenen toplamlar, günün sipariş
-- listeleri ve kapanış satırı tek anın fotoğrafıdır. Araya bir teslim girerse yarım resim kalırdı.

-- ── Beklenen tahsilat (türetim) ──────────────────────────────────────────────
-- Beklenen toplamlar SAKLANMAZ, hareketlerden türer. Görünüm tek tanım yeridir: hem kapanış öncesi
-- ekran hem RPC buradan okur — aynı toplama iki kez yazılmaz.
--
-- Yalnız KAPIDA toplanan üç yöntem sayılır. Online (Stripe) ve havale kuryenin eline hiç girmez;
-- yöntem süzgeci bu ayrımın kendisidir, ayrıca bir "kurye tahsil etti mi" bayrağı tutulmaz.
create or replace view public.courier_day_collection as
select o.courier_id,
       o.delivery_date                                                                  as date,
       coalesce(sum(m.amount) filter (where o.payment_method = 'cash'), 0)::numeric(12, 2)   as expected_cash,
       coalesce(sum(m.amount) filter (where o.payment_method = 'card'), 0)::numeric(12, 2)   as expected_card,
       coalesce(sum(m.amount) filter (where o.payment_method = 'cheque'), 0)::numeric(12, 2) as expected_cheque
  from public.order o
  join public.money_movement m on m.order_id = o.id and m.type = 'order_payment'
 where o.courier_id is not null
   and o.delivery_date is not null
   and o.payment_method in ('cash', 'card', 'cheque')
 group by o.courier_id, o.delivery_date;

-- ── Kapanış kaydı ────────────────────────────────────────────────────────────
create table public.courier_day_close (
  id uuid primary key default gen_random_uuid(),
  -- Kurye SİLİNEMEZ (restrict): kapanışı olan kişi yok edilirse gün kimin diye sorulamaz.
  courier_id uuid not null references public.user_profiles (id) on delete restrict,
  date date not null,

  -- Sistemin hesabı (kapanış anındaki fotoğraf). Görünümden türer ama BURAYA DONDURULUR: sonradan
  -- bir hareket düzeltilirse geçmiş mutabakat değişmemeli — "o gün ne konuşuldu" sabit kalır.
  expected_cash numeric(12, 2) not null default 0,
  expected_card numeric(12, 2) not null default 0,
  expected_cheque numeric(12, 2) not null default 0,
  -- Kuryenin fiilen teslim ettiği: nakit sayımı, kart cihaz raporu, çek yaprakları.
  counted_cash numeric(12, 2) not null default 0,
  counted_card numeric(12, 2) not null default 0,
  counted_cheque numeric(12, 2) not null default 0,

  -- Günün resmi — üç ayrı akıbet, üç ayrı liste. Sayı değil KİMLİK tutulur: kapanıştan sonra
  -- "hangi sipariş" sorusu cevapsız kalmasın (sipariş sonradan başka kuryeye atansa bile).
  delivered_orders uuid[] not null default '{}',
  -- Reddedilenler — mal araçta, depoya fiziksel teslim edilecek.
  returned_orders uuid[] not null default '{}',
  -- Sonuçlanmamışlar (ulaşılamadı / hiç denenmedi) — yarının işine devrolur, kapanışta kaybolmaz.
  pending_orders uuid[] not null default '{}',

  -- Fark çıktığında kuryenin kısa açıklaması. Fark gizlenmez, AÇIKLANIR (tasarım §3).
  note text,
  closed_by uuid references public.user_profiles (id) on delete set null,
  closed_at timestamptz not null default now(),

  -- TÜRETİLİR, yazılmaz: "fark var/yok" iki kolondan hesaplanabilirken saklansaydı bir gün ikisi
  -- çelişirdi. Generated kolon hem sorgulanabilir (mutabık olmayan günler listesi) hem kaymaz.
  reconciled boolean generated always as (
    expected_cash = counted_cash and expected_card = counted_card and expected_cheque = counted_cheque
  ) stored
);

-- Bir kurye bir günü BİR KEZ kapatır. Kapanmış gün salt-okunurdur (tasarım §6).
create unique index courier_day_close_key on public.courier_day_close (courier_id, date);
-- Admin'in "mutabık olmayan günler" listesi — azınlıktır, kısmi indeks.
create index courier_day_close_open_idx on public.courier_day_close (date desc) where not reconciled;

alter table public.courier_day_close enable row level security;

-- ── Günü kapat ───────────────────────────────────────────────────────────────
-- Sonuçlanmamış durak varken kapanış ENGELLENMEZ (tasarım §4): ulaşılamayan sipariş yarına kalır,
-- kurye deposuna dönmüşse günü kapatabilmelidir. Açık durak sayısı dönüşte bildirilir — çağıran
-- ekran uyarır, karar kuryenin.
create or replace function public.close_courier_day(
  p_courier_id uuid,
  p_date date,
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
  v_existing public.courier_day_close;
  v_expected record;
  v_delivered uuid[];
  v_returned uuid[];
  v_pending uuid[];
  v_row public.courier_day_close;
begin
  -- Kapanmış gün salt-okunur: ikinci çağrı ezmez, mevcut kaydı bildirir.
  select * into v_existing from public.courier_day_close
   where courier_id = p_courier_id and date = p_date;
  if found then
    return jsonb_build_object('ok', false, 'reason', 'already_closed', 'id', v_existing.id, 'closed_at', v_existing.closed_at);
  end if;

  select coalesce(c.expected_cash, 0)   as cash,
         coalesce(c.expected_card, 0)   as card,
         coalesce(c.expected_cheque, 0) as cheque
    into v_expected
    from (select 1) dummy
    left join public.courier_day_collection c
      on c.courier_id = p_courier_id and c.date = p_date;

  -- Günün üç listesi. `completed` de teslim edilmiştir: kapanış geciktiyse sipariş çoktan
  -- kapanmış olabilir — durum ilerledi diye teslimat kuryenin gününden düşmez.
  select coalesce(array_agg(o.id) filter (where o.status in ('delivered', 'completed')), '{}'),
         coalesce(array_agg(o.id) filter (where o.status = 'returned'), '{}'),
         coalesce(array_agg(o.id) filter (where o.status not in ('delivered', 'completed', 'returned', 'cancelled')), '{}')
    into v_delivered, v_returned, v_pending
    from public.order o
   where o.courier_id = p_courier_id and o.delivery_date = p_date;

  insert into public.courier_day_close (
    courier_id, date,
    expected_cash, expected_card, expected_cheque,
    counted_cash, counted_card, counted_cheque,
    delivered_orders, returned_orders, pending_orders, note, closed_by
  ) values (
    p_courier_id, p_date,
    v_expected.cash, v_expected.card, v_expected.cheque,
    coalesce(p_counted_cash, 0), coalesce(p_counted_card, 0), coalesce(p_counted_cheque, 0),
    v_delivered, v_returned, v_pending, p_note, p_actor_id
  )
  returning * into v_row;

  return jsonb_build_object(
    'ok', true,
    'id', v_row.id,
    'expected_cash', v_row.expected_cash,
    'expected_card', v_row.expected_card,
    'expected_cheque', v_row.expected_cheque,
    'counted_cash', v_row.counted_cash,
    'counted_card', v_row.counted_card,
    'counted_cheque', v_row.counted_cheque,
    -- Fark = sayılan − beklenen. İşaret anlamlıdır: eksi eksik teslim, artı fazla para demektir;
    -- ikisi de açıklanmayı hak eder, mutlak değere indirilmez.
    'difference_cash', v_row.counted_cash - v_row.expected_cash,
    'difference_card', v_row.counted_card - v_row.expected_card,
    'difference_cheque', v_row.counted_cheque - v_row.expected_cheque,
    'reconciled', v_row.reconciled,
    'delivered_count', coalesce(array_length(v_row.delivered_orders, 1), 0),
    'returned_count', coalesce(array_length(v_row.returned_orders, 1), 0),
    'pending_count', coalesce(array_length(v_row.pending_orders, 1), 0)
  );
end;
$$;

revoke execute on function public.close_courier_day(uuid, date, numeric, numeric, numeric, text, uuid)
  from public, anon, authenticated;
