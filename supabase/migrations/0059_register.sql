-- Sertifikalı kasa entegrasyonu (docs/feature/kasa-muhasebe.md §7): kasaya ne yazıldığının bizdeki aynası ve yazım kuyruğu.
-- Kasaya sipariş başına durum farkı yazılır; ayna farkın tabanıdır, kuyruk yazılacak siparişi ve kasa hareketini taşır.

create type register_line_kind as enum ('item', 'shipping');
-- `writing`: kasaya çağrı başladı ama sonucu aynaya geçmedi; yarıda kalan yazım bu satırdan tamamlanır.
create type register_write_status as enum ('writing', 'written');

-- ── Mağaza eşlemesi ─────────────────────────────────────────────────────────
-- Mağaza kasa yazılımında elle açılır, API'den açılmaz; tesis deposu ona ve fiziksel çekmecesinin nakit hesabına bağlanır.
create table public.register_store (
  warehouse_id uuid primary key references public.warehouse (id) on delete restrict,
  external_store_id int not null unique,
  -- Bu hesabın fiş dışı nakit hareketleri kasaya giriş/çıkış olarak yazılır ki kasa sayımı çekmeceyle tutsun.
  cash_account_id uuid not null unique references public.account (id) on delete restrict,
  created_at timestamptz not null default now()
);

-- ── Ürün eşlemesi ───────────────────────────────────────────────────────────
-- Kasanın dış referansı 20 karakterde kesildiği için varyant kimliği orada taşınamaz; eşleme burada durur.
create table public.register_product (
  id uuid primary key default gen_random_uuid(),
  kind register_line_kind not null,
  variant_id uuid references public.product_variant (id) on delete restrict,
  external_product_id int not null unique,
  -- Kasaya son yazılan ad, KDV oranı ve katalog fiyatı; değişince kasadaki ürün güncellenir.
  name text not null,
  vat_rate numeric(4, 2) not null,
  price numeric(10, 2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint register_product_kind_variant check ((kind = 'item') = (variant_id is not null))
);
create unique index register_product_variant_key on public.register_product (variant_id) where variant_id is not null;
-- Kargo oran başına ayrı üründür, kalemde oran değiştirmek her satıra bir çağrı eklerdi.
create unique index register_product_shipping_key on public.register_product (vat_rate) where kind = 'shipping';

-- ── Fiş ─────────────────────────────────────────────────────────────────────
create table public.register_ticket (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.order (id) on delete restrict,
  seq int not null check (seq > 0),
  -- Fişin yazıldığı mağazanın deposu; araç satışı aracın ana deposudur.
  warehouse_id uuid not null references public.warehouse (id) on delete restrict,
  -- `<sipariş referansı>-<sıra>`; kasa aramayı "içerir" biçiminde yaptığı için eşleşme okunarak doğrulanır.
  ext_ref text not null unique check (char_length(ext_ref) <= 25),
  external_sale_id int unique,
  -- Kasanın günlük sıra numarası ve dijital fiş bağlantısı; sipariş detayı bunları gösterir.
  unique_sale_id text,
  receipt_url text,
  status register_write_status not null default 'writing',
  written_at timestamptz,
  created_at timestamptz not null default now(),
  unique (order_id, seq)
);
create index register_ticket_written_idx on public.register_ticket (warehouse_id, written_at);

create table public.register_ticket_line (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.register_ticket (id) on delete cascade,
  kind register_line_kind not null,
  order_item_id uuid references public.order_item (id) on delete restrict,
  qty int not null check (qty <> 0),
  -- Kanalın tabanında, işaretli: iade fişinde eksi.
  amount numeric(10, 2) not null,
  vat_rate numeric(4, 2) not null,
  -- Kasadaki kalem numaraları; kuruş için bölünen kalem iki satırdır.
  external_line_ids int[] not null default '{}',
  created_at timestamptz not null default now(),
  constraint register_ticket_line_kind_item check ((kind = 'item') = (order_item_id is not null))
);
create index register_ticket_line_ticket_idx on public.register_ticket_line (ticket_id);

create table public.register_payment (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references public.register_ticket (id) on delete cascade,
  method payment_method not null,
  -- İşaretli: tahsilat artı, iade eksi.
  amount numeric(10, 2) not null check (amount <> 0),
  -- Satırın taşıdığı hareket; FK yok, silinen hareketin satırı da onu anar. Kasadaki satır değişmediği için tutarı, yöntemi ya da
  -- siparişi değişen hareketin farkı yeni satırla yazılır; bir hareketin birden çok satırı olabilir.
  movement_id uuid not null,
  external_payment_id int,
  -- Gün kapanmışsa kasa ödemeyi satışın nakit akışı olarak kaydeder; numarası burada durur.
  external_cash_flow_id int,
  status register_write_status not null default 'writing',
  created_at timestamptz not null default now(),
  -- Kasaya yazıldığı an; gün sonu mutabakatı bunu sayar, satır yeniden denemede günler önce açılmış olabilir.
  written_at timestamptz,
  constraint register_payment_written check ((status = 'written') = (written_at is not null))
);
create index register_payment_ticket_idx on public.register_payment (ticket_id);
create index register_payment_movement_idx on public.register_payment (movement_id);
create index register_payment_written_idx on public.register_payment (written_at);

-- ── Kasa hareketi (fiş dışı nakit) ──────────────────────────────────────────
create table public.register_cash_op (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouse (id) on delete restrict,
  -- Kaydın taşıdığı hareket; FK yok, silinen hareketin kaydı da ters çevrilir. Kasadaki kayıt değişmez: etkisi değişen hareketin eski
  -- kaydı ters çevrilir, yenisi yazılır.
  movement_id uuid not null,
  -- Bu kaydın ters çevirdiği kayıt; bir kayıt en çok bir kez ters çevrilir.
  reversal_of uuid unique references public.register_cash_op (id),
  direction movement_direction not null,
  amount numeric(10, 2) not null check (amount > 0),
  -- Kasa dökümünde görünen açıklama, kayıt başına tekil; yarıda kalan yazım kasadaki satırı bununla bulur.
  label text not null,
  external_till_id int,
  status register_write_status not null default 'writing',
  created_at timestamptz not null default now(),
  -- Kasaya yazıldığı an; gün sonu mutabakatı bunu sayar.
  written_at timestamptz,
  constraint register_cash_op_written check ((status = 'written') = (written_at is not null))
);
create index register_cash_op_movement_idx on public.register_cash_op (movement_id);
create index register_cash_op_written_idx on public.register_cash_op (warehouse_id, written_at);

-- ── Kuyruk ──────────────────────────────────────────────────────────────────
-- Satır "bu siparişi ya da bu nakit hareketini yeniden eşitle" demektir; işleyen satırı yalnız `marked_at` değişmediyse siler.
create table public.register_queue (
  id uuid primary key default gen_random_uuid(),
  order_id uuid unique references public.order (id) on delete cascade,
  -- FK yok: silinen hareketin de kasadaki karşılığı geri alınır.
  movement_id uuid unique,
  marked_at timestamptz not null default now(),
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  -- İşleyenin kilidi; yeniden işaretleme dokunmaz, böylece işlenirken gelen değişiklik ikinci bir yazarı başlatmaz.
  locked_until timestamptz,
  constraint register_queue_one_target check ((order_id is null) <> (movement_id is null))
);
create index register_queue_due_idx on public.register_queue (next_attempt_at);

-- Ödemenin hemen arkasından gelen yazım ile dakikalık iş aynı hedefi birlikte işlemesin: satış kasaya iki kez yazılırsa ancak ters
-- satışla düzelir. Hedefin güncel satırı kilitlenip döner, çünkü işleyenin elindeki satır bu arada işlenip yeniden doğmuş olabilir.
create or replace function public.register_queue_claim(p_order_id uuid, p_movement_id uuid, p_until timestamptz)
returns setof public.register_queue
language sql
security invoker
set search_path = public
as $$
  update public.register_queue set locked_until = p_until
  where (order_id = p_order_id or movement_id = p_movement_id)
    and (locked_until is null or locked_until <= now())
  returning *;
$$;
revoke execute on function public.register_queue_claim(uuid, uuid, timestamptz) from public, anon, authenticated;

-- Para nereden yazılırsa yazılsın (RPC, servis, ekstre birleştirmesi) kuyruğa düşer. Silinen sipariş işaretlenmez, çünkü `set null`
-- zincirinde sipariş artık yoktur ve kuyruk satırı silmeyi kırardı.
create or replace function public.register_queue_mark_movement(
  p_movement_id uuid,
  p_order_id uuid,
  p_type movement_type,
  p_account_id uuid,
  p_counter_account_id uuid
) returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if p_order_id is not null
     and p_type in ('order_payment', 'order_refund')
     and exists (select 1 from public.order where id = p_order_id) then
    insert into public.register_queue (order_id) values (p_order_id)
    on conflict (order_id) do update set marked_at = now(), next_attempt_at = now(), attempts = 0, last_error = null;
  end if;

  if exists (select 1 from public.register_store where cash_account_id in (p_account_id, p_counter_account_id)) then
    insert into public.register_queue (movement_id) values (p_movement_id)
    on conflict (movement_id) do update set marked_at = now(), next_attempt_at = now(), attempts = 0, last_error = null;
  end if;
end;
$$;

create or replace function public.register_queue_mark() returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if tg_op in ('INSERT', 'UPDATE') then
    perform public.register_queue_mark_movement(new.id, new.order_id, new.type, new.account_id, new.counter_account_id);
  end if;
  if tg_op in ('UPDATE', 'DELETE') then
    perform public.register_queue_mark_movement(old.id, old.order_id, old.type, old.account_id, old.counter_account_id);
  end if;
  return null;
end;
$$;

create trigger money_movement_register_queue
  after insert or update or delete on public.money_movement
  for each row execute function public.register_queue_mark();

revoke execute on function public.register_queue_mark_movement(uuid, uuid, movement_type, uuid, uuid) from public, anon, authenticated;
revoke execute on function public.register_queue_mark() from public, anon, authenticated;

-- Nakit, kart ve online sipariş tahsilatının kaydı kasaya yazılana kadar yalnız bizdedir: tutarı, yönü, türü, yöntemi, hesabı, günü ve
-- siparişi değişmez, hareket silinmez; düzeltme ters harekettir. Sipariş silinince bağın boşalması (`set null`) serbesttir.
create or replace function public.money_movement_collection_guard() returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if old.order_id is null
     or old.type not in ('order_payment', 'order_refund')
     or old.payment_method is null
     or old.payment_method = 'bank_transfer' then
    if tg_op = 'DELETE' then
      return old;
    end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    raise exception 'Sipariş tahsilatı silinmez; düzeltme ters harekettir' using errcode = 'check_violation';
  end if;
  if new.amount is distinct from old.amount
     or new.direction is distinct from old.direction
     or new.type is distinct from old.type
     or new.payment_method is distinct from old.payment_method
     or new.account_id is distinct from old.account_id
     or new.value_date is distinct from old.value_date
     or (new.order_id is not null and new.order_id is distinct from old.order_id)
     or (new.order_id is null and exists (select 1 from public.order where id = old.order_id)) then
    raise exception 'Sipariş tahsilatının tutarı, yönü, yöntemi, hesabı, günü ve siparişi değişmez; düzeltme ters harekettir'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;
create trigger money_movement_collection_guard before update or delete on public.money_movement
  for each row execute function public.money_movement_collection_guard();
revoke execute on function public.money_movement_collection_guard() from public, anon, authenticated;

-- Kalem ve durum değişikliği para doğurmayabilir (eksik ödenmiş siparişte iade, borçsuz iptal); fişi olan sipariş kasayla yine
-- karşılaştırılsın diye kuyruğa düşer. Fişi olmayan siparişin ilk fişini para açar.
create or replace function public.register_queue_mark_order() returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_order_id uuid;
begin
  if tg_table_name = 'order' then
    v_order_id := new.id;
  elsif tg_op = 'DELETE' then
    v_order_id := old.order_id;
  else
    v_order_id := new.order_id;
  end if;
  if exists (select 1 from public.register_ticket where order_id = v_order_id) then
    insert into public.register_queue (order_id) values (v_order_id)
    on conflict (order_id) do update set marked_at = now(), next_attempt_at = now(), attempts = 0, last_error = null;
  end if;
  return null;
end;
$$;

create trigger order_item_register_queue
  after insert or delete or update of qty, fulfilled_qty, goodwill_qty, unit_price, line_discount_amount, vat_rate on public.order_item
  for each row execute function public.register_queue_mark_order();

create trigger order_register_queue
  after update of status, shipping_fee, is_gift_order on public.order
  for each row execute function public.register_queue_mark_order();

revoke execute on function public.register_queue_mark_order() from public, anon, authenticated;

-- ── Gün sonu: defter ↔ ayna ─────────────────────────────────────────────────
-- Aralıkta açılmış her hareketin kasada olması gereken etkisi (defter) ve aynada yazılmış olanı, yazımın saatinden bağımsız. B2C
-- sipariş parası fişin ödeme satırıdır; çekmecenin kart dışı öteki nakdi defter görünümünden okunur, karşı yakası susan satır gelmez.
create or replace function public.register_day_movements(
  p_warehouse_id uuid,
  p_cash_account_id uuid,
  p_from timestamptz,
  p_to timestamptz
) returns table (movement_id uuid, kind text, method payment_method, expected numeric, written numeric)
language sql
stable
security invoker
set search_path = public
as $$
  with day_movements as (
    select m.id from public.money_movement m where m.created_at >= p_from and m.created_at < p_to
  ),
  expected as (
    select m.id as movement_id, 'payment'::text as kind, m.payment_method as method,
           case when m.type = 'order_payment' then m.amount else -m.amount end as amount
      from public.money_movement m
      join public.order o on o.id = m.order_id
     where o.warehouse_id = p_warehouse_id
       and o.channel = 'b2c'
       and m.type in ('order_payment', 'order_refund')
       and m.created_at >= p_from and m.created_at < p_to
    union all
    select a.id, 'cash', null, a.signed_amount
      from public.account_movement a
      left join public.order o on o.id = a.order_id
     where a.ledger_account_id = p_cash_account_id
       and (a.payment_method is null or a.payment_method = 'cash')
       and (o.id is null or o.channel <> 'b2c' or a.type not in ('order_payment', 'order_refund'))
       and a.created_at >= p_from and a.created_at < p_to
  ),
  written as (
    select p.movement_id, 'payment'::text as kind, p.method, sum(p.amount) as amount
      from public.register_payment p
      join public.register_ticket t on t.id = p.ticket_id
     where t.warehouse_id = p_warehouse_id
       and p.status = 'written'
       and p.movement_id in (select id from day_movements)
     group by p.movement_id, p.method
    union all
    select c.movement_id, 'cash', null, sum(case when c.direction = 'in' then c.amount else -c.amount end)
      from public.register_cash_op c
     where c.warehouse_id = p_warehouse_id
       and c.status = 'written'
       and c.movement_id in (select id from day_movements)
     group by c.movement_id
  )
  select coalesce(e.movement_id, w.movement_id), coalesce(e.kind, w.kind), coalesce(e.method, w.method),
         coalesce(e.amount, 0), coalesce(w.amount, 0)
    from expected e
    full join written w on w.movement_id = e.movement_id and w.kind = e.kind and w.method is not distinct from e.method;
$$;

revoke execute on function public.register_day_movements(uuid, uuid, timestamptz, timestamptz) from public, anon, authenticated;

-- Kurye seferi kapanışındaki nakit farkı; hesap kodu muhasebecinin kararıdır (kasa farkı ya da kurye alacağı).
insert into public.movement_nature (slug, label, direction, account_code) values ('kasa-farki', 'Kasa farkı', null, null);

alter table public.register_store enable row level security;
alter table public.register_product enable row level security;
alter table public.register_ticket enable row level security;
alter table public.register_ticket_line enable row level security;
alter table public.register_payment enable row level security;
alter table public.register_cash_op enable row level security;
alter table public.register_queue enable row level security;
