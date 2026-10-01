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
  -- FK yok: hareket silinse de satır onu anar, ters satır bir kez yazılsın.
  movement_id uuid unique,
  reversal_of uuid unique,
  external_payment_id int,
  status register_write_status not null default 'writing',
  created_at timestamptz not null default now()
);
create index register_payment_ticket_idx on public.register_payment (ticket_id);

-- ── Kasa hareketi (fiş dışı nakit) ──────────────────────────────────────────
create table public.register_cash_op (
  id uuid primary key default gen_random_uuid(),
  warehouse_id uuid not null references public.warehouse (id) on delete restrict,
  movement_id uuid unique,
  reversal_of uuid unique,
  direction movement_direction not null,
  amount numeric(10, 2) not null check (amount > 0),
  -- Kasa dökümünde görünen açıklama; yarıda kalan yazım kasadaki satırı bununla bulur.
  label text not null,
  external_till_id int,
  status register_write_status not null default 'writing',
  created_at timestamptz not null default now()
);

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
  constraint register_queue_one_target check ((order_id is null) <> (movement_id is null))
);
create index register_queue_due_idx on public.register_queue (next_attempt_at);

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

-- Kurye seferi kapanışındaki nakit farkı; hesap kodu muhasebecinin kararıdır (kasa farkı ya da kurye alacağı).
insert into public.movement_nature (slug, label, direction, account_code) values ('kasa-farki', 'Kasa farkı', null, null);

alter table public.register_store enable row level security;
alter table public.register_product enable row level security;
alter table public.register_ticket enable row level security;
alter table public.register_ticket_line enable row level security;
alter table public.register_payment enable row level security;
alter table public.register_cash_op enable row level security;
alter table public.register_queue enable row level security;
