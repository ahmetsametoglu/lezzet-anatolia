-- Muhasebe yazılımı (Pennylane) entegrasyonu (docs/feature/kasa-muhasebe.md §8): Pennylane'deki banka hesapları ve eşlemesi,
-- okunan hareketlerin aynası, değişiklik akışının kaldığı yer, tedarikçi aynası ve alış belgesinin yazım kuyruğuyla aynası. Banka hareketi Pennylane'den gelir, bizde izah edilir.

-- ── Banka hesapları ve eşleme ───────────────────────────────────────────────
-- Pennylane'deki banka hesapları her eşitleme turunda yazılır; anahtar yalnız backend'de olduğu için kart listeyi buradan okur.
-- Eşlenen hesabın hareketi Pennylane'den okunur, eşlenmemiş hesapta Excel yüklemesi sürer.
create table public.pennylane_bank_account (
  pennylane_id bigint primary key,
  name text not null,
  -- Son okunan listede görüldüğü an; listeden düşen hesap eşleme seçeneklerinden çıkar, eşlenmişse okunmaz ve kartta işaretlenir.
  seen_at timestamptz not null,
  account_id uuid unique references public.account (id) on delete restrict,
  -- Hareket gelmiyor sayacı eşleme gününden başlar.
  mapped_at timestamptz,
  -- Canlıya geçiş gününden itibaren liste okundu mu; boşsa sonraki tur listeyi baştan okur.
  listed_at timestamptz,
  constraint pennylane_bank_account_mapping check (
    (account_id is null) = (mapped_at is null) and (account_id is not null or listed_at is null)
  )
);

-- ── Hareket aynası ──────────────────────────────────────────────────────────
-- Pennylane hareketinin son okunan hâli ve bizdeki banka satırı; değişikliği ayırt eden taban budur, çünkü izahlı satırı
-- operatör değiştirmiş olabilir.
create table public.pennylane_transaction (
  pennylane_id bigint primary key,
  account_id uuid not null references public.account (id) on delete restrict,
  -- Sıfır tutarlı hareket yazılmaz, Pennylane'de silinen izahsız satır silinir; ikisinde de boş.
  movement_id uuid unique references public.money_movement (id) on delete set null,
  value_date date not null,
  direction movement_direction not null,
  amount numeric(12, 2) not null check (amount >= 0),
  label text,
  -- Pennylane'de silindi ya da arşivlendi.
  removed boolean not null default false,
  read_at timestamptz not null default now()
);
create index pennylane_transaction_account_idx on public.pennylane_transaction (account_id, value_date desc);

-- ── Değişiklik akışı ────────────────────────────────────────────────────────
-- Akışın son işlenen olayının anı: imleç tur bitince düşer, sonraki tur bu andan sorar; aynı an iki kez okunsa da sonuç değişmez.
-- Hareket akışı banka satırını, fatura akışı faturalarımızın Pennylane'deki açık kalanını tazeler.
create table public.pennylane_cursor (
  stream text primary key,
  processed_at timestamptz not null,
  updated_at timestamptz not null default now(),
  constraint pennylane_cursor_stream check (stream in ('transactions', 'supplier_invoices'))
);

-- ── Tedarikçi aynası ────────────────────────────────────────────────────────
-- Belgenin karşı tarafının Pennylane'deki tedarikçisi. Dış referans (`sup:<kimlik>`, `cp:<kimlik>`) Pennylane'de tekil olduğu için
-- ayna kaybolsa da tedarikçi ikinci kez açılmaz, aramayla bulunur.
create table public.pennylane_supplier (
  pennylane_id bigint primary key,
  supplier_id uuid unique references public.supplier (id) on delete cascade,
  counterparty_id uuid unique references public.counterparty (id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint pennylane_supplier_party check ((supplier_id is null) <> (counterparty_id is null))
);

-- ── Yazım kuyruğu ───────────────────────────────────────────────────────────
-- Alış belgesi değişince belge, Pennylane'den okunan banka satırının bağı değişince hareket işaretlenir; işleyen belgeyi yükler,
-- günceller, ödeme durumunu ya da hareketin eşleşmesini yazar.
create table public.pennylane_queue (
  id uuid primary key default gen_random_uuid(),
  document_id uuid unique references public.money_document (id) on delete cascade,
  movement_id uuid unique references public.money_movement (id) on delete cascade,
  marked_at timestamptz not null default now(),
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text,
  constraint pennylane_queue_one_target check ((document_id is null) <> (movement_id is null))
);
create index pennylane_queue_due_idx on public.pennylane_queue (next_attempt_at);

-- ── Belge aynası ────────────────────────────────────────────────────────────
-- Pennylane'deki fatura ve ona en son yazılan taslak; sonraki yazımın farkı buna göre çıkar. Yüklenmiş belge silinemez, çünkü
-- Pennylane'deki faturası bağını kaybederdi.
create table public.pennylane_document (
  document_id uuid primary key references public.money_document (id) on delete restrict,
  pennylane_invoice_id bigint not null unique,
  written jsonb not null,
  -- Nakitle kapanan belgenin işareti; bankadan ödenen belge eşleşmeyle kapanır, işaret almaz.
  payment_status text,
  -- Pennylane'deki açık kalan, son okunduğunda; bizimkinden ayrılırsa belge "Pennylane'de farklı"dır.
  pennylane_open numeric(12, 2),
  -- Faturaya en son yazılan analitik kategori (Lezzet); ayardaki kategori değişince yeniden yazılır.
  category_id bigint,
  uploaded_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pennylane_document_payment_status check (payment_status in ('paid', 'to_be_paid'))
);

-- ── Pennylane'de çözülen bağ ────────────────────────────────────────────────
-- Bizde duran ama Pennylane'de çözülen bağ bizde silinmez, yeniden de yazılmaz; karar bizim ekranda verilir. Bağ silinip yeniden
-- kurulursa yeni bağdır ve yazılır.
create table public.pennylane_match_removed (
  allocation_id uuid primary key references public.money_allocation (id) on delete cascade,
  removed_at timestamptz not null default now()
);

create or replace function public.pennylane_queue_mark_document(p_document_id uuid) returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  insert into public.pennylane_queue (document_id) values (p_document_id)
  on conflict (document_id) do update set marked_at = now(), next_attempt_at = now(), attempts = 0, last_error = null;
end;
$$;

-- Yalnız Pennylane'den okunan banka satırının eşleşmesi yazılır; öteki hareketin Pennylane'de karşılığı yok.
create or replace function public.pennylane_queue_mark_movement(p_movement_id uuid) returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if exists (select 1 from public.pennylane_transaction where movement_id = p_movement_id) then
    insert into public.pennylane_queue (movement_id) values (p_movement_id)
    on conflict (movement_id) do update set marked_at = now(), next_attempt_at = now(), attempts = 0, last_error = null;
  end if;
end;
$$;

-- Alış belgesi her değişiklikte işaretlenir, değişiklikten önce alış belgesiyse de: yüklenmiş belgenin türü değişirse
-- Pennylane'deki faturası sahipsiz kalır ve bu haber verilmeli. Yazıp yazmamak işleyenin kararıdır.
create or replace function public.pennylane_queue_mark() returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if (new.kind in ('invoice', 'receipt') and new.direction = 'out')
     or (tg_op = 'UPDATE' and old.kind in ('invoice', 'receipt') and old.direction = 'out') then
    perform public.pennylane_queue_mark_document(new.id);
  end if;
  return null;
end;
$$;

create trigger money_document_pennylane_queue
  after insert or update of kind, direction, number, issued_on, due_on, counterparty_id, supplier_id, amount, vat_lines, vat_regime, file_key
  on public.money_document
  for each row execute function public.pennylane_queue_mark();

-- Bağ yüklenmiş belgenin ödeme durumunu ve hareketin eşleşmesini değiştirir; henüz yüklenmemiş belgenin ikisi yüklenince yazılır.
-- Taşınan bağın iki yakası da işaretlenir, çünkü "zaten yazmıştım" birleşmesi ve geri alınması bağı bir hareketten ötekine geçirir.
create or replace function public.pennylane_queue_mark_allocation() returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_sides public.money_allocation[] := case tg_op when 'INSERT' then array[new] when 'DELETE' then array[old] else array[old, new] end;
  v_side public.money_allocation;
begin
  foreach v_side in array v_sides loop
    if exists (select 1 from public.pennylane_document where document_id = v_side.document_id) then
      perform public.pennylane_queue_mark_document(v_side.document_id);
      perform public.pennylane_queue_mark_movement(v_side.movement_id);
    end if;
  end loop;
  return null;
end;
$$;

create trigger money_allocation_pennylane_queue
  after insert or delete or update of amount, movement_id, document_id on public.money_allocation
  for each row execute function public.pennylane_queue_mark_allocation();

-- Yüklenen belgenin bağları o ana kadar yazılamazdı: Pennylane'de fatura yoktu.
create or replace function public.pennylane_queue_mark_uploaded() returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  perform public.pennylane_queue_mark_movement(a.movement_id) from public.money_allocation a where a.document_id = new.document_id;
  return null;
end;
$$;

create trigger pennylane_document_queue
  after insert on public.pennylane_document
  for each row execute function public.pennylane_queue_mark_uploaded();

revoke execute on function public.pennylane_queue_mark_document(uuid) from public, anon, authenticated;
revoke execute on function public.pennylane_queue_mark_movement(uuid) from public, anon, authenticated;
revoke execute on function public.pennylane_queue_mark() from public, anon, authenticated;
revoke execute on function public.pennylane_queue_mark_allocation() from public, anon, authenticated;
revoke execute on function public.pennylane_queue_mark_uploaded() from public, anon, authenticated;

alter table public.pennylane_bank_account enable row level security;
alter table public.pennylane_transaction enable row level security;
alter table public.pennylane_cursor enable row level security;
alter table public.pennylane_supplier enable row level security;
alter table public.pennylane_queue enable row level security;
alter table public.pennylane_document enable row level security;
alter table public.pennylane_match_removed enable row level security;
