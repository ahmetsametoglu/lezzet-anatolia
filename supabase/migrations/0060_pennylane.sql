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
create table public.pennylane_cursor (
  stream text primary key,
  processed_at timestamptz not null,
  updated_at timestamptz not null default now(),
  constraint pennylane_cursor_stream check (stream in ('transactions'))
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

-- ── Belge kuyruğu ───────────────────────────────────────────────────────────
-- Alış belgesi ya da yüklenmiş belgenin bağı değişince işaretlenir; işleyen belgeyi yükler, günceller ya da ödeme durumunu yazar.
create table public.pennylane_queue (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null unique references public.money_document (id) on delete cascade,
  marked_at timestamptz not null default now(),
  attempts int not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error text
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
  uploaded_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pennylane_document_payment_status check (payment_status in ('paid', 'to_be_paid'))
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

-- Bağ yalnız yüklenmiş belgenin ödeme durumunu değiştirir; henüz yüklenmemiş belgenin durumu yüklenirken yazılır.
create or replace function public.pennylane_queue_mark_allocation() returns trigger
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_document_id uuid := case when tg_op = 'DELETE' then old.document_id else new.document_id end;
begin
  if exists (select 1 from public.pennylane_document where document_id = v_document_id) then
    perform public.pennylane_queue_mark_document(v_document_id);
  end if;
  return null;
end;
$$;

create trigger money_allocation_pennylane_queue
  after insert or delete or update of amount on public.money_allocation
  for each row execute function public.pennylane_queue_mark_allocation();

revoke execute on function public.pennylane_queue_mark_document(uuid) from public, anon, authenticated;
revoke execute on function public.pennylane_queue_mark() from public, anon, authenticated;
revoke execute on function public.pennylane_queue_mark_allocation() from public, anon, authenticated;

alter table public.pennylane_bank_account enable row level security;
alter table public.pennylane_transaction enable row level security;
alter table public.pennylane_cursor enable row level security;
alter table public.pennylane_supplier enable row level security;
alter table public.pennylane_queue enable row level security;
alter table public.pennylane_document enable row level security;
