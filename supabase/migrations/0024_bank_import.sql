-- Modül 12 — Banka ekstresi import'u (12.4). DOMAIN §9, data-model/para.md.
--
-- Banka dosyası bir GERÇEK KAYNAĞIDIR: satırları para hareketine dönüşür ve hesabın bakiyesi
-- oradan türer. Zor olan yükleme değil, iki şeydir:
--   1. **Aynı satır iki kez yazılmasın** — `money_movement.import_fingerprint` + tekil indeks (0021).
--   2. **Eşleştirme onaya düşsün** — yanlış eşleşen satır parayı başka siparişin ödemesi yapar.
--
-- Sütun eşlemesini yapay zekâ çıkarır; **cevabı burada saklanır** ki her ay aynı soru sorulmasın.

-- ── Import şablonu ───────────────────────────────────────────────────────────
-- HESABA ÖZELDİR: her bankanın dosya düzeni farklıdır (işaretli tek sütun / ayrı borç-alacak,
-- virgüllü ondalık, gün-ay sırası). Bir kez çıkarılır, sonraki dosyalarda otomatik uygulanır.
create table public.bank_import_profile (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.account (id) on delete cascade,
  name text not null,
  -- Tutar geleneği: tek işaretli sütun (−45,90) ya da ayrı borç/alacak sütunları. Üçüncüsü yok.
  amount_mode text not null check (amount_mode in ('signed', 'debit_credit')),
  -- Hangi sütun hangi alan — sütun BAŞLIĞIYLA tutulur, sırasıyla değil: banka dosyaya bir sütun
  -- eklediğinde sıra kayar, başlık kalır.
  mapping jsonb not null,
  decimal_separator text not null default ',' check (decimal_separator in (',', '.')),
  date_format text not null default 'dmy' check (date_format in ('dmy', 'ymd', 'mdy')),
  created_at timestamptz not null default now()
);
-- Aynı hesapta aynı adlı iki şablon olmaz — hangisinin uygulandığı belirsiz kalırdı.
create unique index bank_import_profile_name_key on public.bank_import_profile (account_id, lower(name));

-- ── Yükleme kaydı ────────────────────────────────────────────────────────────
-- "Bu satır nereden geldi" sorusunun cevabı. Denetlenemeyen bir import korkutucudur: yanlış dosya
-- yüklendiğinde neyin geri alınacağı bilinmelidir.
create table public.bank_import (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.account (id) on delete restrict,
  -- Şablon silinse de yükleme kaydı kalır: geçmiş, şablonun ömrüne bağlı değildir.
  profile_id uuid references public.bank_import_profile (id) on delete set null,
  file_name text not null,
  row_count int not null default 0,
  inserted_count int not null default 0,
  -- Zaten var olduğu için atlanan satırlar — mükerrer korumasının GÖRÜNÜR yüzü. Sessiz atlasaydık
  -- operatör "dosyam neden eksik girdi" sorusunu hiç soramazdı.
  duplicate_count int not null default 0,
  created_at timestamptz not null default now()
);
create index bank_import_account_idx on public.bank_import (account_id, created_at desc);

-- Hareketin hangi yüklemeden geldiği (kolon 0021'de tanımlı; FK burada, tablo şimdi doğdu).
alter table public.money_movement
  add constraint money_movement_bank_import_fk
  foreign key (bank_import_id) references public.bank_import (id) on delete set null;

alter table public.bank_import_profile enable row level security;
alter table public.bank_import enable row level security;
