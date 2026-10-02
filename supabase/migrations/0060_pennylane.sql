-- Muhasebe yazılımı (Pennylane) entegrasyonu (docs/feature/kasa-muhasebe.md §8): banka hesabı eşlemesi, okunan hareketlerin
-- aynası ve değişiklik akışının kaldığı yer. Banka hareketi Pennylane'den gelir, bizde izah edilir.

-- ── Banka hesabı eşlemesi ───────────────────────────────────────────────────
-- Eşlenen hesabın hareketi Pennylane'den okunur; eşlenmemiş hesapta Excel yüklemesi sürer.
create table public.pennylane_account (
  account_id uuid primary key references public.account (id) on delete restrict,
  pennylane_bank_account_id bigint not null unique,
  -- Pennylane'deki adı; kart her açılışta Pennylane'e sormasın diye eşleme anında yazılır.
  pennylane_name text not null,
  -- Canlıya geçiş gününden itibaren liste okundu mu; boşsa sonraki tur listeyi baştan okur.
  listed_at timestamptz,
  created_at timestamptz not null default now()
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

alter table public.pennylane_account enable row level security;
alter table public.pennylane_transaction enable row level security;
alter table public.pennylane_cursor enable row level security;
