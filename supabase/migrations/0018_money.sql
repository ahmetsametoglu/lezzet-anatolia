-- Modül 12 — Para: hesaplar + hareketler (12.1). DOMAIN §9, data-model/para.md.
--
-- TEK MANTIK: para bir hesapta durur, hareketlerle girer/çıkar. Kasa hareketi ile banka hareketi
-- AYNI ŞEYDİR, yalnız hesabı farklıdır — bu yüzden tek tablo, "kasa defteri / banka defteri" ayrımı
-- yok. "Online havuz" da ayrı bir kavram değil: Stripe bir hesaptır.
--
-- BAKİYE KOLONU YOKTUR. Bakiye hareketlerden türetilir (DATA_MODEL kalıcı kararlar: sayaç tutulmaz;
-- saklanan bakiye bir gün kayar ve hangi hareketin kaydırdığı bulunamaz). Türetim tek yerde:
-- `account_movement` görünümü.

create type account_type as enum ('cash', 'bank', 'provider');
create type movement_direction as enum ('in', 'out');
create type movement_type as enum (
  'order_payment', 'order_refund', 'purchase', 'expense', 'transfer', 'capital', 'misc'
);
create type movement_source as enum ('manual', 'bank_import');

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

create table public.money_movement (
  id uuid primary key default gen_random_uuid(),
  -- Hesap silinemez (restrict): hareketi olan hesap yok edilirse para izi kopar.
  account_id uuid not null references public.account (id) on delete restrict,
  direction movement_direction not null,
  amount numeric(12, 2) not null check (amount > 0),
  -- Sıfır tutarlı hareket bilgi taşımaz; YÖN ayrı alandır, işaret tutara gömülmez (raporda
  -- "− yazılmış giriş" gibi çift-anlamlı satır doğmasın).
  type movement_type not null,
  -- Kategori SERBEST METİN, enum değil: gider kalemleri işletmeyle büyür (kira, akaryakıt, maaş,
  -- advertising…); enum olsaydı her yeni kalem migration isterdi.
  category text,
  -- Ek etiket. Reklam giderinde `{"campaign": "..."}` — kampanya gideri ile cirosu yan yana
  -- konabilsin diye (gerçek ROI, 12.5/13); Excel'e taşınmaz.
  meta jsonb,
  -- TRANSFER TEK SATIRDIR. İki satır (çift kayıt) yazmak yerine karşı hesap burada tutulur; hareket
  -- karşı hesaba TERS işaretle yansır (`account_movement`). Sebebi: iki satır arasındaki bağ
  -- kopabilir (biri silinir/düzeltilir) ve "yarım transfer" hiçbir yerde görünmez.
  counter_account_id uuid references public.account (id) on delete restrict,
  order_id uuid references public.order (id) on delete set null,
  stock_intake_id uuid references public.stock_intake (id) on delete set null,
  supplier_id uuid references public.supplier (id) on delete set null,
  -- Paranın gerçekten hareket ettiği gün. Kayıt günü (`created_at`) ondan farklı olabilir: dünkü
  -- nakit bugün girilir, banka satırı üç gün sonra import edilir. Raporlar bu tarihi okur.
  value_date date not null default current_date,
  description text,
  source movement_source not null default 'manual',
  -- Banka ekstresiyle eşleşti mi (12.4). Elle girilen hareket eşleşmeyi bekler.
  reconciled boolean not null default false,
  -- Banka satırının KİMLİĞİ (12.4). Bankalar satır kimliği vermez; hesap+tarih+tutar+yön+açıklama
  -- ve tekrar sırasından ÜRETİLİR (`domain-core/bank/fingerprint`). Aşağıdaki tekil indeks, aynı
  -- ekstre iki kez yüklendiğinde ya da dönemler çakıştığında paranın iki kez yazılmasını engeller —
  -- mükerrer yazım her bakiyeyi ve her kâr raporunu yalancı yapardı.
  import_fingerprint text,
  bank_import_id uuid,
  created_at timestamptz not null default now(),

  -- Transferin karşı ucu ZORUNLU ve kendisi olamaz; transfer olmayan harekette karşı hesap ANLAMSIZ.
  -- Veritabanı burada duruyor çünkü ihlali veri bozukluğudur: karşı ucu olmayan transfer, bakiyeyi
  -- sessizce kaydırır. Zenginleştirilmiş kurallar (tipten yön türetimi) motordadır.
  constraint money_movement_transfer_shape check (
    (type = 'transfer' and counter_account_id is not null and counter_account_id <> account_id)
    or (type <> 'transfer' and counter_account_id is null)
  )
);

-- Hesap ekstresi: "bu hesapta ne oldu", en yeni önce (sonsuz kaydırma).
create index money_movement_account_idx on public.money_movement (account_id, value_date desc);
-- Transferin karşı ucu da o hesabın ekstresine düşer.
create index money_movement_counter_idx on public.money_movement (counter_account_id, value_date desc)
  where counter_account_id is not null;
-- Siparişin tahsilat/iade toplamı (12.2 — `amount_*` cache'inin kaynağı).
create index money_movement_order_idx on public.money_movement (order_id) where order_id is not null;
-- Tedarikçi borcu türetimi (12.3): Σ giriş − Σ ödeme.
create index money_movement_supplier_idx on public.money_movement (supplier_id) where supplier_id is not null;
-- Dönem raporları ve muhasebe export'u (12.6/12.7) tarihe göre tarar.
create index money_movement_period_idx on public.money_movement (value_date desc, type);
-- Eşleşme kuyruğu (12.4): eşleşmemiş satırlar azınlıktır → kısmi indeks.
create index money_movement_unreconciled_idx on public.money_movement (account_id, value_date)
  where not reconciled;
-- Mükerrer koruması (12.4): aynı hesapta aynı banka satırı İKİ KEZ yazılamaz.
-- KISMİ İNDEKS DEĞİL, bilerek: `on conflict` kısmi indeksi hedefleyemez ve import yazımı ona
-- dayanıyor. Gereği de yok — NULL'lar tekil karşılaştırmada birbirine EŞİT SAYILMAZ, dolayısıyla
-- parmak izi olmayan (elle girilen) hareketler bu indeksin kısıtına hiç takılmaz; elle iki kez
-- 20 € girmek meşrudur ve meşru kalır.
create unique index money_movement_import_key on public.money_movement (account_id, import_fingerprint);

-- ── Defter satırı ────────────────────────────────────────────────────────────
-- Bir hareket DOKUNDUĞU HER HESAPTA bir satır üretir: normal hareket bir, transfer iki. Bakiye de
-- hesap ekstresi de bunun üstünde durur.
--
-- DÜZELTME (27.08): burada *"kural SQL'de ve TypeScript'te ayrı ayrı yazılmaz"* yazıyordu ve
-- YANLIŞTI — aynı kural `domain-core/money/movement.ts`teki `signedAmountCentsFor`ta da yazılı
-- (form önizlemesi için). Nüsha kaldırılamaz: veritabanı motoru çağıramaz. Kaldırılamayan nüshanın
-- savunması karşılaştıran testtir ve artık var: `apps/web/lib/money/movement.test.ts` defterin her
-- satırını motora sorup eşitliğini sınıyor. İki taraf ayrışırsa orası kırmızıya döner.
create or replace view public.account_movement as
select m.*,
       m.account_id as ledger_account_id,
       case when m.direction = 'in' then m.amount else -m.amount end as signed_amount
  from public.money_movement m
union all
-- Transferin karşı ucu: para gönderenden çıkıp alana girer → işaret ters.
select m.*,
       m.counter_account_id as ledger_account_id,
       case when m.direction = 'in' then -m.amount else m.amount end as signed_amount
  from public.money_movement m
 where m.counter_account_id is not null;

-- ── Bakiye ───────────────────────────────────────────────────────────────────
-- Hiç hareketi olmayan hesap da listede görünür (0 bakiyeyle) — `left join`; aksi halde yeni açılan
-- hesap ekranda hiç çıkmazdı.
create or replace view public.account_balance as
select a.id                                        as account_id,
       coalesce(sum(l.signed_amount), 0)::numeric(14, 2) as balance,
       count(l.id)                                 as movement_count
  from public.account a
  left join public.account_movement l on l.ledger_account_id = a.id
 group by a.id;

alter table public.account enable row level security;
alter table public.money_movement enable row level security;


-- ═══ SİPARİŞ PARASI ═══
-- Buraya AYRI BİR MIGRATION dosyasından taşındı (02.11 · denetim P2 — aile içi
-- birleştirme). İçerik değişmedi; eski dosya numarasıyla anılmıyor, çünkü o numara artık yok.

-- Modül 12 — Siparişin para bağları (12.2). DOMAIN §7 (ödeme), §9 (para hareketleri).
--
-- `Order.amount_collected` / `amount_refunded` bir CACHE'tir; kaynağı para hareketleridir. Bugüne
-- kadar kaynağı yoktu — cache doğrudan yazılıyordu. Bu dosya kaynağı bağlar.
--
-- CACHE ARTIRILMAZ, YENİDEN HESAPLANIR. `set amount_collected = amount_collected + x` yazsaydık her
-- kaçırılan/tekrarlanan çağrı kalıcı bir sapma bırakırdı ve hangi çağrının kaydırdığı bulunamazdı.
-- Toplam her seferinde hareketlerden okunur: cache yanlışsa bile bir sonraki yazımda kendini düzeltir.
--
-- NEDEN RPC (STACK §13 (b)): bölünemez çok-tablolu yazım. Hareket yazılıp cache güncellenmezse
-- "para geldi ama sipariş ödenmemiş görünüyor" hâli doğar; tersi daha kötüdür (karşılığı olmayan
-- tahsilat). İkisi tek transaction'da.

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
  -- Sağlayıcı künyesi (07.11): kartla ödenmiş bir siparişte iade, paranın GELDİĞİ ödeme niyetinin
  -- üzerinden yapılır — `{"providerRef": "pi_..."}`. Sipariş kolonuna değil harekete yazılır:
  -- referans o ödemenin künyesidir, siparişin değil (bir siparişin birden çok tahsilatı olabilir).
  p_meta jsonb default null
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_movement_id uuid;
  v_direction movement_direction;
  v_amounts jsonb;
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

  insert into public.money_movement (account_id, direction, amount, type, order_id, value_date, description, source, meta)
  values (p_account_id, v_direction, p_amount, p_type, p_order_id, p_value_date, p_description, p_source, p_meta)
  returning id into v_movement_id;

  v_amounts := public.resync_order_amounts(p_order_id);

  return jsonb_build_object(
    'ok', true,
    'movement_id', v_movement_id,
    'amount_collected', v_amounts ->> 'amount_collected',
    'amount_refunded', v_amounts ->> 'amount_refunded'
  );
end;
$$;

revoke execute on function public.resync_order_amounts(uuid) from public, anon, authenticated;
revoke execute on function public.record_order_movement(uuid, uuid, numeric, movement_type, date, text, movement_source, jsonb)
  from public, anon, authenticated;

-- Sağlayıcı künyesinden harekete (07.11): `charge.refunded` bize yalnız `pi_...` ile gelir, sipariş
-- kimliğiyle değil. Kısmi indeks — künyeyi yalnız sağlayıcı üzerinden geçen ödemeler taşır.
create index money_movement_provider_ref_idx on public.money_movement ((meta ->> 'providerRef'))
  where meta ? 'providerRef';


-- ═══ MUHASEBE ═══
-- Buraya AYRI BİR MIGRATION dosyasından taşındı (02.11 · denetim P2 — aile içi
-- birleştirme). İçerik değişmedi; eski dosya numarasıyla anılmıyor, çünkü o numara artık yok.

-- Modül 12 — Muhasebe export zemini (12.7). DOMAIN §9, data-model/musteri-siparis.md.
--
-- Muhasebeye giden veri "hangi siparişler" değil "hangi SATIŞLAR" sorusunun cevabıdır: sipariş
-- kayıt anında değil, GERÇEKLEŞTİĞİ anda gelirdir. O an sipariş tablosunda YAZMAZ — `order_status_log`
-- zaten teslim/kapanış anını tutuyor ve 0015 bunu bilerek böyle kurmuştu ("ayrı `delivered_at`
-- kolonu tutulmaz"). Bu görünüm o türetimin TEK yeridir; export da (12.7) dönemsel kârlılık da
-- (12.6) aynı tarihi okusun, iki rapor iki ayrı "satış günü" hesaplamasın.

-- ── Gerçekleşmiş satış ───────────────────────────────────────────────────────
-- `sale_date` = siparişin İLK gerçekleşme anı. `min(...)` şart: tam yolda sipariş önce `delivered`
-- sonra `completed` olur ve ikisi farklı aya düşebilir. Kapanışı esas alsaydık ocakta teslim edilmiş
-- bir satış şubat cirosuna yazılırdı. Hızlı satışta (kapı önü) tek log vardır, `completed`.
--
-- HEDİYE SİPARİŞ BURADA DIŞLANMAZ: patron ikramı gelirdir, kârdır, kasaya girer — yalnız dış
-- muhasebeye gitmez (DOMAIN §9). Süzgeç export kapısındadır; burada dışlansaydı `is_gift_order`
-- "yalnız export filtresini etkiler" kuralı sessizce genişler, hediye siparişler bu görünümü okuyan
-- her rapordan (12.6 kârlılık dahil) düşerdi.
--
-- `returned` DIŞARIDA: mal geri gelmiş, para iadesi süreci açık (07.9). Sipariş `completed`'a
-- dönünce satış yine bu görünüme girer ve `sale_date` ORİJİNAL teslim günüdür — geçmiş dönemin
-- raporu yeniden üretildiğinde satır doğru aya oturur.
-- `o.*`: görünüm siparişin ALANLARINI yeniden yazmaz, yalnız `sale_date`i ekler — şema da öyle
-- türetilir (`OrderSchema.extend({saleDate})`). Alan listesi kopyalasaydık `order`a eklenen her
-- kolon burada da elle eklenmeyi beklerdi ve unutulan kolon sessizce eksik kalırdı.
-- ⚠ **`o.*` GÖRÜNÜM KURULDUĞU AN DONAR.** `order`a yeni bir kolon eklendiğinde bu görünüm onu
-- KENDİLİĞİNDEN almaz; yerel veritabanında görünüm yeniden kurulmalıdır (`drop view` + `create`).
-- `create or replace` yetmez: `o.*` genişlemesi yeni kolonu `sale_date`ten ÖNCE yerleştirir ve
-- Postgres kolon sırası değişen bir görünümü değiştirmeyi reddeder.
--
-- Yaşandı (08.08): `order`a `cancel_reason` + `provider_refunded_at` eklendi, migration doğruydu,
-- ama yerel görünüm eski kolon listesiyle kaldı ve `OrderSale` şeması artık bulunmayan alanları
-- isteyince **22 test birden** düştü — hepsi Zod ayrıştırmasında, hiçbiri kendi konusuyla ilgili
-- değil. `db:reset` atan biri bunu hiç görmez; günü kurtaran şey tam paketin koşmasıydı.
create or replace view public.order_sale as
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
-- Buraya AYRI BİR MIGRATION dosyasından taşındı (02.11 · denetim P2 — aile içi
-- birleştirme). İçerik değişmedi; eski dosya numarasıyla anılmıyor, çünkü o numara artık yok.

-- Modül 12 — Banka ekstresi import'u (12.4). DOMAIN §9, data-model/para.md.
--
-- Banka dosyası bir GERÇEK KAYNAĞIDIR: satırları para hareketine dönüşür ve hesabın bakiyesi
-- oradan türer. Zor olan yükleme değil, iki şeydir:
--   1. **Aynı satır iki kez yazılmasın** — `money_movement.import_fingerprint` + tekil indeks (0018).
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

-- Hareketin hangi yüklemeden geldiği (kolon 0018'de tanımlı; FK burada, tablo şimdi doğdu).
alter table public.money_movement
  add constraint money_movement_bank_import_fk
  foreign key (bank_import_id) references public.bank_import (id) on delete set null;

alter table public.bank_import_profile enable row level security;
alter table public.bank_import enable row level security;
