-- Para (DOMAIN §9): para bir hesapta durur, hareketlerle girer ve çıkar; kasa, banka ve Stripe yalnız hesap türüdür.
-- Bakiye kolonu yok, çünkü saklanan bakiye kayar ve kaydıranı bulunamaz; türetim tek yerde, `account_movement`.

-- `partner` ortak cari hesabıdır (compte courant d'associé, 455): ortakla şirket arasındaki her para buradan geçer.
-- Bakiye işareti borcu anlatır: eksi şirket ortağa, artı ortak şirkete borçlu.
create type account_type as enum ('cash', 'bank', 'provider', 'partner');
create type movement_direction as enum ('in', 'out');
create type movement_type as enum (
  'order_payment', 'order_refund', 'purchase', 'expense', 'transfer', 'capital', 'misc'
);
-- `system` sistemin kendi yazdığı harekettir (Stripe, kapıda tahsilat, hızlı satış, payout); elle girilenden ayırt edilsin diye ayrı.
create type movement_source as enum ('manual', 'bank_import', 'system');
-- Hareketin resmî dayanağının türü; küme kapalıdır, `other` bir kaçış kutusu değil.
create type document_kind as enum ('invoice', 'receipt', 'payslip', 'contract', 'statement', 'other');
-- Gelen belgenin KDV rejimi, çünkü "KDV 0" sıfır oranlı ürün, ters yükleme (autoliquidation) ve muafiyeti ayırt edemez.
-- Satış tarafının `VatTreatment`ı kestiğimiz faturanın sorusudur, bu küme ondan ayrıdır.
create type document_vat_regime as enum ('standard', 'reverse_charge', 'exempt');

create table public.account (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type account_type not null,
  currency currency not null default 'EUR',
  -- Hesap SİLİNMEZ, pasifleşir: geçmiş hareketleri ona bağlıdır (kapanan banka hesabı da tarihtir).
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index account_name_key on public.account (lower(name));

-- ── Tür sözlüğü ─────────────────────────────────────────────────────────────
-- Hareketin sınıflandırması tek türdür ("bu para neyin parası"); çoklu etikette hangisinin tür olduğu ve hesap kodu kayboluyordu.
-- `account_code` yalnız PCG karşılığı tek olan türde dolu, çünkü uydurulmuş kod muhasebecinin düzelteceği yanlış kayıttır.
create table public.movement_nature (
  slug text primary key check (slug ~ '^[a-z0-9][a-z0-9-]*$'),
  label text not null,
  direction movement_direction,
  account_code text check (account_code ~ '^[0-9]{2,8}$'),
  -- Tür SİLİNMEZ, pasifleşir: eski hareketler onu taşımaya devam eder (hesabın kapanmasıyla aynı).
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
insert into public.movement_nature (slug, label, direction, account_code) values
  ('kira', 'Kira', 'out', '613'),
  ('maas', 'Maaş', 'out', '641'),
  ('sosyal-guvenlik', 'Sosyal güvenlik', 'out', '645'),
  ('vergi', 'Vergi', 'out', '635'),
  ('akaryakit', 'Akaryakıt', 'out', '606'),
  ('ambalaj', 'Ambalaj', 'out', null),
  ('yazilim', 'Yazılım', 'out', null),
  ('telefon-internet', 'Telefon ve internet', 'out', '626'),
  ('sigorta', 'Sigorta', 'out', '616'),
  ('muhasebe-ucreti', 'Muhasebe ücreti', 'out', '622'),
  ('reklam', 'Reklam', 'out', '623'),
  ('banka-masrafi', 'Banka masrafı', 'out', '627'),
  ('stripe-ucreti', 'Stripe ücreti', 'out', '627'),
  ('sermaye', 'Sermaye', 'in', '101');

-- ── Etiket ───────────────────────────────────────────────────────────────────
-- İşletmenin serbest gruplamasıdır, izah değil; sözlük yazım tek kalsın diye yönetilir ve varsayılan satırı yoktur.
create table public.movement_tag (
  -- ASCII slug: süzgeç ve URL'de olduğu gibi geçer; okunur ad `label`tadır.
  slug text primary key check (slug ~ '^[a-z0-9][a-z0-9-]*$'),
  label text not null,
  -- Pasif etiket yeni harekete verilmez, eski hareketlerde kalır (hesabın pasifleşmesiyle aynı).
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ── Cari ─────────────────────────────────────────────────────────────────────
-- Paranın karşı tarafı; tedarikçi (`supplier`) ve ortak (`account.type = partner`) burada değil, kopyası aynı firmayı iki adla yaşatırdı.
-- `keywords` banka satırında geçince cari ve varsayılan türü önerir; onayı insan verir.
create type counterparty_kind as enum ('institution', 'service', 'employee', 'other');
create table public.counterparty (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind counterparty_kind not null default 'other',
  keywords text[] not null default '{}',
  default_nature text references public.movement_nature (slug) on update cascade,
  note text,
  -- Cari SİLİNMEZ, pasifleşir: geçmiş hareketleri ve belgeleri ona bağlıdır.
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index counterparty_name_key on public.counterparty (lower(name));

-- ── Belge ────────────────────────────────────────────────────────────────────
-- Belge para değil borçtur: ödeme sonra hareket olarak gelir ve tutarıyla bağlanır (`money_allocation`), açık kalan türetilir.
-- Satış faturası siparişte (`order.invoice_no`) durur, burada değil.
create table public.money_document (
  id uuid primary key default gen_random_uuid(),
  kind document_kind not null,
  -- Belge numarası: faturada var, fiş ve bordroda olmayabilir.
  number text,
  issued_on date not null,
  -- Ödemenin son günü; belgede yoksa NULL, belge gününden önce olamaz (`money_document_due`).
  due_on date,
  -- Karşı taraf cari ya da tedarikçi, en çok biri; serbest metin aynı kurumu iki yazımla iki kişi yapardı.
  counterparty_id uuid references public.counterparty (id) on delete set null,
  supplier_id uuid references public.supplier (id) on delete set null,
  -- Stok alımının faturası mal kabule ya da mal gelmeden kesildiyse tedarik siparişine bağlanır, ikisine birden değil.
  -- Borç bu belgeden türer, çünkü kabulün satır toplamı KDV hariçtir ve nakliyeyle iskontoyu bilmez.
  stock_intake_id uuid references public.stock_intake (id) on delete set null,
  purchase_order_id uuid references public.purchase_order (id) on delete set null,
  -- Belgenin YÖNÜ hareketinkiyle aynı dilde: `out` = bizim ödeyeceğimiz (gelen fatura, bordro),
  -- `in` = bize ödenecek (tedarikçi iadesi, ortağa kesilen dekont).
  direction movement_direction not null,
  -- Ödemesi bağlanınca türü boş harekete de geçer.
  nature text references public.movement_nature (slug) on update cascade,
  amount numeric(12, 2) not null check (amount > 0),
  -- KDV tutarı; belgede yoksa NULL — sıfır "KDV yok" demektir, "bilinmiyor" değil (CLAUDE §1).
  vat_amount numeric(12, 2) check (vat_amount >= 0),
  -- Standart dışı rejimde belgede KDV olamaz (`money_document_vat_regime`): ters yüklemede KDV'yi biz beyan ederiz.
  vat_regime document_vat_regime not null default 'standard',
  currency currency not null default 'EUR',
  -- Dosyanın ÖZEL kovadaki anahtarı (`r2Keys.financeDocument`); yoksa belge yalnız künyedir.
  file_key text,
  -- Serbest etiketler; sınıflandırma türdedir.
  tags text[] not null default '{}',
  note text,
  created_at timestamptz not null default now(),

  constraint money_document_party check (counterparty_id is null or supplier_id is null),
  constraint money_document_stock_link check (stock_intake_id is null or purchase_order_id is null),
  constraint money_document_supply_party check ((stock_intake_id is null and purchase_order_id is null) or supplier_id is not null),
  constraint money_document_vat_regime check (vat_regime = 'standard' or coalesce(vat_amount, 0) = 0),
  constraint money_document_due check (due_on is null or due_on >= issued_on)
);
create index money_document_issued_idx on public.money_document (issued_on desc);
create index money_document_counterparty_idx on public.money_document (counterparty_id) where counterparty_id is not null;
create index money_document_supplier_idx on public.money_document (supplier_id) where supplier_id is not null;
create index money_document_intake_idx on public.money_document (stock_intake_id) where stock_intake_id is not null;
create index money_document_purchase_order_idx on public.money_document (purchase_order_id) where purchase_order_id is not null;

create table public.money_movement (
  id uuid primary key default gen_random_uuid(),
  -- Hesap silinemez (restrict): hareketi olan hesap yok edilirse para izi kopar.
  account_id uuid not null references public.account (id) on delete restrict,
  direction movement_direction not null,
  amount numeric(12, 2) not null check (amount > 0),
  -- Sıfır tutarlı hareket bilgi taşımaz; YÖN ayrı alandır, işaret tutara gömülmez (raporda
  -- "− yazılmış giriş" gibi çift-anlamlı satır doğmasın).
  type movement_type not null,
  -- "Bu para neyin parası"; sipariş, stok alımı ve transferde boştur, çünkü bağın kendisi söyler.
  nature text references public.movement_nature (slug) on update cascade,
  -- Paranın kime gittiği ya da kimden geldiği; tedarikçiyse `supplier_id` dolar, bu değil.
  counterparty_id uuid references public.counterparty (id) on delete set null,
  -- Serbest işaretler, izah değildir; tetikleyici sözlükte olmayanı reddeder ki yazım tek kalsın.
  tags text[] not null default '{}',
  -- Ek künye: reklam giderinde `{"campaign"}` ciroyla yan yana konsun diye, Stripe tahsilatında `{"providerRef"}`.
  meta jsonb,
  -- Transfer tek satırdır ve karşı hesaba ters işaretle yansır (`account_movement`), çünkü iki satırın bağı kopunca
  -- yarım transfer hiçbir yerde görünmezdi.
  counter_account_id uuid references public.account (id) on delete restrict,
  order_id uuid references public.order (id) on delete set null,
  stock_intake_id uuid references public.stock_intake (id) on delete set null,
  supplier_id uuid references public.supplier (id) on delete set null,
  -- Paranın gerçekten hareket ettiği gün; kayıt günü farklı olabilir ve raporlar bu tarihi okur.
  value_date date not null default current_date,
  description text,
  source movement_source not null default 'manual',
  -- Ekstreyle eşleşti mi; yalnız `bank_import` satırında anlamlıdır. "İzah edildi mi" sorusu `explained`tir,
  -- bu bayrak değil, yoksa sistemin yazdığı her tahsilat "eşleşmedi" görünürdü.
  reconciled boolean not null default false,
  -- İsteğin kimliği, hareketin değil: tekrarlanan istek aynı anahtarla gelir ve tekil indeks ikinci yazımı engeller.
  -- `import_fingerprint`e binmez, çünkü parmak izinin tekilliği hesap başına, bunun küreseldir.
  idempotency_key text,
  -- Banka satırının kimliği; bankalar vermediği için alanlardan üretilir (`domain-core/bank/fingerprint`).
  -- Tekil indeks aynı ekstre iki kez yüklenince paranın iki kez yazılmasını engeller.
  import_fingerprint text,
  bank_import_id uuid,
  -- Ekstre satırının karşıladığı transfer ucu: bağlanınca ayna susar, yoksa kasadan yatırılan para bankada hem ayna hem
  -- ekstre olarak iki kez sayılırdı. Uç silinirse bağ düşer ve para yine tek kez sayılır.
  counterpart_movement_id uuid references public.money_movement (id) on delete set null,
  created_at timestamptz not null default now(),
  -- Bağ, transfer, tür ya da belge bağından biri hareketi açıklar; etiket açıklamaz ve eksik izah kaydı engellemez.
  -- Tetikleyici kurar (`money_movement_explain`), çünkü belge bağı başka tabloda ve üretilmiş kolon oraya bakamaz.
  explained boolean not null default false,

  -- Karşı ucu olmayan transfer bakiyeyi sessizce kaydırır, bu yüzden şekil veride zorlanır; yön kuralları motordadır.
  constraint money_movement_transfer_shape check (
    (type = 'transfer' and counter_account_id is not null and counter_account_id <> account_id)
    or (type <> 'transfer' and counter_account_id is null)
  ),
  -- Elle yazılan satırın karşısında ekstre, transfer olmayan satırın öteki yakası yoktur.
  constraint money_movement_counterpart_shape check (
    counterpart_movement_id is null or (source = 'bank_import' and type = 'transfer')
  ),
  -- Karşı taraf tek: ikisi birden aynı soruyu iki cevapla yanıtlardı.
  constraint money_movement_party check (supplier_id is null or counterparty_id is null)
);

-- Hesap ekstresi: "bu hesapta ne oldu", en yeni önce (sonsuz kaydırma).
create index money_movement_account_idx on public.money_movement (account_id, value_date desc);
-- Transferin karşı ucu da o hesabın ekstresine düşer.
create index money_movement_counter_idx on public.money_movement (counter_account_id, value_date desc)
  where counter_account_id is not null;
-- Siparişin tahsilat/iade toplamı (`amount_*` önbelleğinin kaynağı).
create index money_movement_order_idx on public.money_movement (order_id) where order_id is not null;
-- Tedarikçi borcu türetimi: Σ giriş − Σ ödeme.
create index money_movement_supplier_idx on public.money_movement (supplier_id) where supplier_id is not null;
-- Dönem raporları ve muhasebe export'u tarihe göre tarar.
create index money_movement_period_idx on public.money_movement (value_date desc, type);
-- Eşleşme kuyruğu: eşleşmemiş satırlar azınlıktır → kısmi indeks.
create index money_movement_unreconciled_idx on public.money_movement (account_id, value_date)
  where not reconciled;
-- İzah edilmemiş satır azınlıktır, kuyruk ve sayaç bu kısmi indeksi okur.
create index money_movement_unexplained_idx on public.money_movement (value_date desc) where not explained;
-- Tür kırılımı ve kampanya gideri (`nature = 'reklam'`) süzgeci.
create index money_movement_nature_idx on public.money_movement (nature, value_date desc) where nature is not null;
-- Carinin hareketleri — "URSSAF'a bu yıl ne ödedik" sorusu buradan cevaplanır.
create index money_movement_counterparty_idx on public.money_movement (counterparty_id) where counterparty_id is not null;
-- Serbest etiket süzgeci (`tags @> '{ortak-a-araci}'`).
create index money_movement_tags_idx on public.money_movement using gin (tags);
-- Aynı banka satırı iki kez yazılamaz. Kısmi değil, çünkü `on conflict` kısmi indeksi hedefleyemez ve NULL parmak izleri
-- zaten çakışmaz.
create unique index money_movement_import_key on public.money_movement (account_id, import_fingerprint);
-- Aynı istek iki kez para yazamaz; kısmi değil, çünkü anahtarsız hareketlerin NULL'ları çakışmaz ve `on conflict` hedefleyebilir.
create unique index money_movement_idempotency_key on public.money_movement (idempotency_key);
-- İki ekstre satırı aynı transfer ucunu sahiplenemez, yoksa bir para iki satırda yaşardı.
create unique index money_movement_counterpart_key on public.money_movement (counterpart_movement_id)
  where counterpart_movement_id is not null;

-- ── Belge bağı ───────────────────────────────────────────────────────────────
-- Hareket ile belge tutarıyla bağlanır, çünkü bir havale birkaç faturayı, bir fatura birkaç ödemeyi kapatabilir.
create table public.money_allocation (
  id uuid primary key default gen_random_uuid(),
  movement_id uuid not null references public.money_movement (id) on delete cascade,
  document_id uuid not null references public.money_document (id) on delete cascade,
  amount numeric(12, 2) not null check (amount > 0),
  created_at timestamptz not null default now(),
  -- Aynı hareket aynı belgeye iki kez bağlanmaz: ikinci bağ, birincinin tutarını değiştirmek olurdu.
  unique (movement_id, document_id)
);
-- Belgenin ödemeleri — açık kalanı türeten görünüm buradan toplar.
create index money_allocation_document_idx on public.money_allocation (document_id);

-- Bağlar toplamı hareketin tutarını aşamaz; satır kilitlenir ki eşzamanlı iki bağ "yer var" görmesin.
-- Belge tarafı serbesttir, çünkü fazla ödeme gizlenmemesi gereken bir olgudur.
create or replace function public.check_allocation_within_movement()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_amount numeric(12, 2);
  v_allocated numeric(12, 2);
begin
  select amount into v_amount from public.money_movement where id = new.movement_id for update;
  select coalesce(sum(amount), 0) into v_allocated
    from public.money_allocation
   where movement_id = new.movement_id and id <> new.id;
  if v_allocated + new.amount > v_amount then
    raise exception 'money_allocation: bağların toplamı hareketin tutarını aşamaz (% > %)', v_allocated + new.amount, v_amount;
  end if;
  return new;
end;
$$;
create trigger money_allocation_within_movement
  before insert or update of movement_id, amount on public.money_allocation
  for each row execute function public.check_allocation_within_movement();

-- `explained` kuralının tek yeri; uygulamanın gönderdiği değer ezilir.
create or replace function public.money_movement_explain()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.explained := new.order_id is not null or new.stock_intake_id is not null or new.supplier_id is not null
    or new.counter_account_id is not null or new.nature is not null
    or exists (select 1 from public.money_allocation a where a.movement_id = new.id);
  return new;
end;
$$;
create trigger money_movement_explained
  before insert or update on public.money_movement
  for each row execute function public.money_movement_explain();

-- Bağ eklenip silinince hareketin izahı yeniden kurulur: satıra "kendini yeniden yaz" denir ve
-- yukarıdaki kural koşar — kural burada ikinci kez yazılmaz.
create or replace function public.money_allocation_touch()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    update public.money_movement set explained = explained where id = old.movement_id;
  end if;
  if tg_op in ('INSERT', 'UPDATE') then
    update public.money_movement set explained = explained where id = new.movement_id;
  end if;
  return null;
end;
$$;
create trigger money_allocation_explains
  after insert or update or delete on public.money_allocation
  for each row execute function public.money_allocation_touch();

-- ── Defter satırı ────────────────────────────────────────────────────────────
-- Hareket dokunduğu her hesapta bir satır üretir, transfer iki. Aynı kural form önizlemesi için `signedAmountCentsFor`ta
-- da var, çünkü DB motoru çağıramaz; eşitliği `apps/web/lib/money/movement.test.ts` sınar.
create or replace view public.account_movement with (security_invoker = true) as
select m.*,
       m.account_id as ledger_account_id,
       case when m.direction = 'in' then m.amount else -m.amount end as signed_amount
  from public.money_movement m
union all
-- Transferin karşı ucunda işaret terstir. Karşı yaka ekstreden gelmişse ayna susar, yoksa aynı para iki kez sayılırdı.
select m.*,
       m.counter_account_id as ledger_account_id,
       case when m.direction = 'in' then -m.amount else m.amount end as signed_amount
  from public.money_movement m
 where m.counter_account_id is not null
   and m.counterpart_movement_id is null
   and not exists (select 1 from public.money_movement c where c.counterpart_movement_id = m.id);

-- ── Bakiye ───────────────────────────────────────────────────────────────────
-- Hiç hareketi olmayan hesap da listede görünür (0 bakiyeyle) — `left join`; aksi halde yeni açılan
-- hesap ekranda hiç çıkmazdı.
create or replace view public.account_balance with (security_invoker = true) as
select a.id                                        as account_id,
       coalesce(sum(l.signed_amount), 0)::numeric(14, 2) as balance,
       count(l.id)                                 as movement_count
  from public.account a
  left join public.account_movement l on l.ledger_account_id = a.id
 group by a.id;

-- ── Etiket sözlüğü tetikleyicisi ─────────────────────────────────────────────
-- Dizi kolonuna FK yazılamaz; kural yine de VERİDE durur (CLAUDE §1): tanınmayan etiket reddedilir.
-- Uygulama katmanı aynı soruyu önce sorar (okunur ret için); burası son savunmadır.
create or replace function public.check_tags_known()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_unknown text;
begin
  select t into v_unknown
    from unnest(new.tags) as t
   where not exists (select 1 from public.movement_tag mt where mt.slug = t)
   limit 1;
  if v_unknown is not null then
    raise exception 'tags: tanınmayan etiket (%) — önce sözlüğe ekleyin', v_unknown;
  end if;
  return new;
end;
$$;
create trigger money_movement_tags_known
  before insert or update of tags on public.money_movement
  for each row execute function public.check_tags_known();
create trigger money_document_tags_known
  before insert or update of tags on public.money_document
  for each row execute function public.check_tags_known();

-- ── Belgenin açık kalanı ─────────────────────────────────────────────────────
-- Aynı yöndeki hareketin bağı kapatır, ters yöndekinin bağı yeniden açar; eksiye düşen `open_amount` fazla ödemedir ve gizlenmez.
create or replace view public.money_document_balance with (security_invoker = true) as
select d.id                                                       as document_id,
       d.amount,
       coalesce(sum(case when m.direction = d.direction then a.amount else -a.amount end), 0)::numeric(12, 2) as settled,
       (d.amount - coalesce(sum(case when m.direction = d.direction then a.amount else -a.amount end), 0))::numeric(12, 2)
                                                                  as open_amount
  from public.money_document d
  left join public.money_allocation a on a.document_id = d.id
  left join public.money_movement m on m.id = a.movement_id
 group by d.id;

-- ── Mal kabulün açık kalanı ──────────────────────────────────────────────────
-- Faturası girilmemiş kabulün borcu: tutar − bağlı ödemeler. Faturası kabule ya da siparişine girilmişse `has_document`
-- taşır ve borç belgeden okunur, böylece iki kez sayılmaz; `note` banka satırıyla referans eşleşmesinin anahtarıdır.
create or replace view public.stock_intake_balance with (security_invoker = true) as
select i.id                                                       as stock_intake_id,
       i.supplier_id,
       i.date,
       i.total_amount                                             as amount,
       coalesce(sum(case when m.direction = 'out' then m.amount else -m.amount end), 0)::numeric(12, 2) as paid,
       (i.total_amount - coalesce(sum(case when m.direction = 'out' then m.amount else -m.amount end), 0))::numeric(12, 2)
                                                                  as open_amount,
       exists (
         select 1 from public.money_document d
          where d.stock_intake_id = i.id
             or (i.purchase_order_id is not null and d.purchase_order_id = i.purchase_order_id)
       )                                                          as has_document,
       i.note
  from public.stock_intake i
  left join public.money_movement m on m.stock_intake_id = i.id and m.type = 'purchase'
 group by i.id;

alter table public.account enable row level security;
alter table public.movement_nature enable row level security;
alter table public.movement_tag enable row level security;
alter table public.counterparty enable row level security;
alter table public.money_document enable row level security;
alter table public.money_movement enable row level security;
alter table public.money_allocation enable row level security;


-- ═══ SİPARİŞ PARASI ═══

-- `amount_collected`/`amount_refunded` para hareketlerinin önbelleğidir ve artırılmaz, her yazımda yeniden hesaplanır:
-- kaçan ya da tekrarlanan çağrı böylece kalıcı sapma bırakmaz. Hareket ve önbellek bölünemez, bu yüzden RPC (STACK §13).

-- ── Cache'i kaynaktan yeniden kur ────────────────────────────────────────────
-- Ayrı fonksiyon: hareket silinir/düzeltilirse ya da elle bir kayma şüphesi olursa tek çağrıyla
-- gerçeğe dönülür. Toplama SQL'i tek yerde durur (aşağıdaki yazım da bunu çağırır).
create or replace function public.resync_order_amounts(p_order_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_collected numeric(10, 2);
  v_refunded numeric(10, 2);
begin
  select
    coalesce(sum(amount) filter (where type = 'order_payment'), 0),
    coalesce(sum(amount) filter (where type = 'order_refund'), 0)
    into v_collected, v_refunded
    from public.money_movement
   where order_id = p_order_id;

  update public.order
     set amount_collected = v_collected,
         amount_refunded  = v_refunded
   where id = p_order_id;

  if not found then
    raise exception 'resync_order_amounts: sipariş bulunamadı (%)', p_order_id;
  end if;

  return jsonb_build_object('ok', true, 'amount_collected', v_collected, 'amount_refunded', v_refunded);
end;
$$;

-- ── Sipariş tahsilatı / iadesi ───────────────────────────────────────────────
-- Yön SEBEPTEN türer (motorun kuralı): tahsilat içeri, iade dışarı. Burada yalnız uygulanır —
-- fonksiyon kural bilmez, ama para tablosunun kısıtları da tutarsız satır yazılmasına izin vermez.
create or replace function public.record_order_movement(
  p_order_id uuid,
  p_account_id uuid,
  p_amount numeric,
  p_type movement_type,                              -- order_payment | order_refund
  p_value_date date default current_date,
  p_description text default null,
  p_source movement_source default 'manual',
  -- Kartla ödenmiş siparişin iadesi ödeme niyeti üzerinden yapılır (`{"providerRef": "pi_..."}`); siparişte değil
  -- harekette, çünkü bir siparişin birden çok tahsilatı olabilir.
  p_meta jsonb default null,
  -- `null` korumasız yazımdır (elle giriş, besleme); NULL'lar tekil indekste çakışmaz.
  p_idempotency_key text default null
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_movement_id uuid;
  v_direction movement_direction;
  v_amounts jsonb;
  v_deduped boolean := false;
begin
  if p_type not in ('order_payment', 'order_refund') then
    raise exception 'record_order_movement: sipariş parası yalnız order_payment/order_refund olur (%)', p_type;
  end if;
  v_direction := case when p_type = 'order_payment' then 'in' else 'out' end;

  -- Sipariş satırı kilitli okunur: aynı anda iki tahsilat girilirse cache'i ikisi de
  -- yeniden hesaplar; kilit olmadan biri diğerinin toplamını görmeden yazabilirdi.
  perform 1 from public.order where id = p_order_id for update;
  if not found then
    raise exception 'record_order_movement: sipariş bulunamadı (%)', p_order_id;
  end if;

  -- Aynı anahtarla gelen istek yazmaz ama reddedilmez de, var olan hareketi `deduped: true` ile döner: hata dönse kurye
  -- "olmadı" görür ve para iki kez tahsil edilirdi. Hedef yalnız `(idempotency_key)`, banka içe aktarma koruması bozulmaz.
  insert into public.money_movement (account_id, direction, amount, type, order_id, value_date, description, source, meta, idempotency_key)
  values (p_account_id, v_direction, p_amount, p_type, p_order_id, p_value_date, p_description, p_source, p_meta, p_idempotency_key)
  on conflict (idempotency_key) do nothing
  returning id into v_movement_id;

  if v_movement_id is null then
    -- Buraya YALNIZ anahtarlı çakışmada düşülür (anahtarsız yazımda `null`'lar çakışmaz).
    select id into v_movement_id from public.money_movement where idempotency_key = p_idempotency_key;
    v_deduped := true;
  end if;

  -- Tekrar eden istekte de çalışır ve YENİ satır üretmez: defteri yeniden toplar, yani dönen
  -- tutarlar her iki yolda da defterin O ANKİ hâlidir.
  v_amounts := public.resync_order_amounts(p_order_id);

  return jsonb_build_object(
    'ok', true,
    'movement_id', v_movement_id,
    'deduped', v_deduped,
    'amount_collected', v_amounts ->> 'amount_collected',
    'amount_refunded', v_amounts ->> 'amount_refunded'
  );
end;
$$;

revoke execute on function public.resync_order_amounts(uuid) from public, anon, authenticated;
revoke execute on function public.record_order_movement(uuid, uuid, numeric, movement_type, date, text, movement_source, jsonb, text)
  from public, anon, authenticated;

-- `charge.refunded` yalnız `pi_...` ile gelir, sipariş kimliğiyle değil; künyeyi yalnız sağlayıcı ödemeleri taşır.
create index money_movement_provider_ref_idx on public.money_movement ((meta ->> 'providerRef'))
  where meta ? 'providerRef';

-- ── Ekstre satırı, elle yazılmış hareketi yutar ──────────────────────────────
-- Ekstre satırı kalır (mükerrer korumasının dayanağıdır), elle yazılanın bağları ona geçer ve elle yazılan silinir;
-- izi `meta.absorbed`ta durur ki geri alma yeniden kurabilsin. Silme ile devralma bölünemez, bu yüzden RPC.
create or replace function public.absorb_provisional_movement(p_statement_id uuid, p_provisional_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  s public.money_movement%rowtype;
  p public.money_movement%rowtype;
begin
  select * into s from public.money_movement where id = p_statement_id for update;
  if not found then
    raise exception 'absorb: ekstre satırı bulunamadı (%)', p_statement_id;
  end if;
  if s.source <> 'bank_import' then
    raise exception 'absorb: yutan satır ekstreden gelmiyor (%)', p_statement_id;
  end if;
  if s.reconciled then
    raise exception 'absorb: ekstre satırı zaten eşleştirilmiş (%)', p_statement_id;
  end if;

  select * into p from public.money_movement where id = p_provisional_id for update;
  if not found then
    raise exception 'absorb: elle yazılan hareket bulunamadı (%)', p_provisional_id;
  end if;
  if p.source = 'bank_import' then
    raise exception 'absorb: ekstre satırı ekstre satırını yutamaz (%)', p_provisional_id;
  end if;
  if p.account_id <> s.account_id then
    raise exception 'absorb: iki hareket aynı hesapta değil';
  end if;
  if p.direction <> s.direction then
    raise exception 'absorb: iki hareketin yönü farklı';
  end if;
  -- Ekstre satırının kendi belge bağı varsa yutulmaz: iki bağ kümesinin toplamı tutarı aşabilirdi.
  if exists (select 1 from public.money_allocation a where a.movement_id = p_statement_id) then
    raise exception 'absorb: ekstre satırının belge bağı var — önce onu kaldırın (%)', p_statement_id;
  end if;

  -- Başka bir ekstre satırı elle yazılanı karşı uç diye sahiplenmişse bağ ekstre satırına geçer.
  update public.money_movement
     set counterpart_movement_id = p_statement_id
   where counterpart_movement_id = p_provisional_id;
  -- Belge bağları ekstre satırına geçer, yoksa silme onları `cascade` ile götürürdü.
  update public.money_allocation
     set movement_id = p_statement_id
   where movement_id = p_provisional_id;

  delete from public.money_movement where id = p_provisional_id;

  update public.money_movement
     set type = p.type,
         nature = p.nature,
         counterparty_id = p.counterparty_id,
         tags = p.tags,
         counter_account_id = p.counter_account_id,
         order_id = p.order_id,
         stock_intake_id = p.stock_intake_id,
         supplier_id = p.supplier_id,
         idempotency_key = p.idempotency_key,
         meta = coalesce(s.meta, '{}'::jsonb) || coalesce(p.meta, '{}'::jsonb)
                || jsonb_build_object('absorbed', jsonb_build_object(
                     'movementId', p.id, 'source', p.source, 'amount', p.amount, 'valueDate', p.value_date,
                     'description', p.description, 'createdAt', p.created_at)),
         reconciled = true
   where id = p_statement_id;

  -- Sipariş parasıysa cache kaynaktan yeniden kurulur: tutar farklıysa (ekstre haklıdır) toplam değişir.
  if p.order_id is not null then
    perform public.resync_order_amounts(p.order_id);
  end if;
end;
$$;

revoke execute on function public.absorb_provisional_movement(uuid, uuid) from public, anon, authenticated;

-- ── Eşleşmeyi geri al ────────────────────────────────────────────────────────
-- Ekstre satırı ekstreden geldiği hâle döner, serbest etiketler kalır; yutulmuş elle kayıt `meta.absorbed`tan yeniden kurulur.
-- Satırı başka ekstre satırı karşı uç diye sahiplenmişse önce o geri alınır, yoksa olmayan transfere bağlı kalırdı.
create or replace function public.unmatch_bank_movement(p_movement_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  s public.money_movement%rowtype;
  v_absorbed jsonb;
  v_restored uuid;
begin
  select * into s from public.money_movement where id = p_movement_id for update;
  if not found then
    raise exception 'unmatch: hareket bulunamadı (%)', p_movement_id;
  end if;
  if s.source <> 'bank_import' then
    raise exception 'unmatch: yalnız ekstre satırının eşleşmesi geri alınır (%)', p_movement_id;
  end if;
  v_absorbed := s.meta -> 'absorbed';

  if v_absorbed is null then
    if exists (select 1 from public.money_movement c where c.counterpart_movement_id = s.id) then
      raise exception 'unmatch: bu satırı başka bir ekstre satırı transferin öteki yakası olarak sahiplenmiş — önce onu geri alın';
    end if;
    delete from public.money_allocation where movement_id = s.id;
    update public.money_movement
       set type = 'misc', nature = null, counterparty_id = null, counter_account_id = null,
           counterpart_movement_id = null, order_id = null, stock_intake_id = null, supplier_id = null,
           reconciled = false
     where id = s.id;
  else
    -- Önce ekstre satırı ham hâline iner: yazım kimliği tekildir ve yeniden kurulan satır onu alacak.
    update public.money_movement
       set type = 'misc', nature = null, counterparty_id = null, tags = '{}', counter_account_id = null,
           counterpart_movement_id = null, order_id = null, stock_intake_id = null, supplier_id = null,
           idempotency_key = null, meta = null, reconciled = false
     where id = s.id;
    insert into public.money_movement (
      account_id, direction, amount, type, nature, counterparty_id, tags, meta, counter_account_id,
      order_id, stock_intake_id, supplier_id, value_date, description, source, idempotency_key, created_at
    ) values (
      s.account_id, s.direction, (v_absorbed ->> 'amount')::numeric, s.type, s.nature, s.counterparty_id,
      s.tags, nullif(s.meta - 'absorbed', '{}'::jsonb), s.counter_account_id, s.order_id,
      s.stock_intake_id, s.supplier_id, (v_absorbed ->> 'valueDate')::date, v_absorbed ->> 'description',
      (v_absorbed ->> 'source')::movement_source, s.idempotency_key,
      coalesce((v_absorbed ->> 'createdAt')::timestamptz, now())
    )
    returning id into v_restored;
    update public.money_allocation set movement_id = v_restored where movement_id = s.id;
    update public.money_movement set counterpart_movement_id = v_restored where counterpart_movement_id = s.id;
  end if;

  -- Sipariş parasıysa cache kaynaktan yeniden kurulur (birleşme geri alındıysa sipariş yeni satırda).
  if s.order_id is not null then
    perform public.resync_order_amounts(s.order_id);
  end if;
  return v_restored;
end;
$$;

revoke execute on function public.unmatch_bank_movement(uuid) from public, anon, authenticated;


-- ═══ MUHASEBE ═══

-- Muhasebe sipariş değil satış ister: satış gerçekleştiği anda gelirdir ve o an `order_status_log`tan türer.
-- Bu görünüm o türetimin tek yeridir ki export ile kârlılık aynı satış gününü okusun.

-- `sale_date` ilk gerçekleşme anıdır (`min`), çünkü `delivered` ile `completed` farklı aya düşebilir. Hediye sipariş burada
-- dışlanmaz (yalnız export süzer), `returned` dışarıdadır.

-- `o.*` görünüm kurulduğu an donar: `order`a eklenen kolon için görünüm drop edilip yeniden kurulmalıdır.
create or replace view public.order_sale with (security_invoker = true) as
select o.*,
       s.sale_date
  from public."order" o
  join (
    select order_id, min(created_at)::date as sale_date
      from public.order_status_log
     where to_status in ('delivered', 'completed')
     group by order_id
  ) s on s.order_id = o.id
 where o.status in ('delivered', 'completed');


-- ═══ BANKA İÇE AKTARIMI ═══

-- Banka dosyası bir gerçek kaynağıdır: aynı satır iki kez yazılmaz (`import_fingerprint`) ve eşleştirme onaya düşer.
-- Yapay zekânın çıkardığı sütun eşlemesi saklanır ki her ay aynı soru sorulmasın.

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

-- Hareketin hangi yüklemeden geldiği (kolon 0018'de tanımlı; FK burada, tablo şimdi doğdu).
alter table public.money_movement
  add constraint money_movement_bank_import_fk
  foreign key (bank_import_id) references public.bank_import (id) on delete set null;

alter table public.bank_import_profile enable row level security;
alter table public.bank_import enable row level security;
