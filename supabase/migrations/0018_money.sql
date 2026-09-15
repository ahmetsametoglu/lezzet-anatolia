-- Modül 12 — Para: hesaplar + hareketler (12.1). DOMAIN §9, data-model/para.md.
--
-- TEK MANTIK: para bir hesapta durur, hareketlerle girer/çıkar. Kasa hareketi ile banka hareketi
-- AYNI ŞEYDİR, yalnız hesabı farklıdır — bu yüzden tek tablo, "kasa defteri / banka defteri" ayrımı
-- yok. "Online havuz" da ayrı bir kavram değil: Stripe bir hesaptır.
--
-- BAKİYE KOLONU YOKTUR. Bakiye hareketlerden türetilir (DATA_MODEL kalıcı kararlar: sayaç tutulmaz;
-- saklanan bakiye bir gün kayar ve hangi hareketin kaydırdığı bulunamaz). Türetim tek yerde:
-- `account_movement` görünümü.

-- `partner` (13.09 · kullanıcı kararı): ORTAK CARİ HESABI. Ortağın cebinden ödenen şirket gideri ile
-- şirketin ortak adına yaptığı ödeme, şirket hesaplarından geçmediği için tutunacak bir hesap
-- ister; yeni bir varlık değil, yeni bir hesap türü. Bakiye işareti anlatır: eksi = şirket ortağa
-- borçlu, artı = ortak şirkete borçlu.
--
-- ORTAĞIN KAYDI BU HESAPTIR (13.09 · ikinci karar, muhasebeci karşılaştırması): ortakla şirket
-- arasındaki her para — koyduğu, çektiği, cebinden ödediği, şirketin onun yerine ödediği — carisinden
-- geçer; ayrı bir "ortak etiketi" yoktur (vardı ve aynı kişiyi iki yerde tutuyordu). Fransa'da ortağın
-- sermaye artırımı DIŞINDA koyduğu para ortak cari hesabıdır (compte courant d'associé, 455): şirket
-- onu ortağa borçludur. Sermaye artırımı statü değişikliği ister; bankaya `capital` + tür `sermaye`.
create type account_type as enum ('cash', 'bank', 'provider', 'partner');
create type movement_direction as enum ('in', 'out');
create type movement_type as enum (
  'order_payment', 'order_refund', 'purchase', 'expense', 'transfer', 'capital', 'misc'
);
-- `system` (13.09): sistemin kendi yazdığı hareket — Stripe webhook'u, kurye kapıda tahsilat, hızlı
-- satış, payout. Eskiden `manual` yazılıyordu ve Stripe tahsilatı operatörün elle girdiği bir
-- satırdan ayırt edilemiyordu.
create type movement_source as enum ('manual', 'bank_import', 'system');
-- Belge türü (13.09): resmî muhasebe sorduğunda hareketin dayanağı. `statement` banka/sağlayıcı
-- dekontu (payout dökümü), `other` kalan her şey — küme kapalıdır, "sair" bir kaçış kutusu değil.
create type document_kind as enum ('invoice', 'receipt', 'payslip', 'contract', 'statement', 'other');
-- Belgenin KDV REJİMİ (12.26 · kullanıcı sorusu 14.09: "ters KDV etiket üzerinden mi belirlenmeli?").
-- Etiket değil, ALAN: "KDV 0" iki ayrı şeyi anlatıyordu ve ayırt edilemiyordu. `standard` = belge KDV'yi
-- kendisi taşır (sıfır oranlı ürün de buradadır); `reverse_charge` = ters yükleme (autoliquidation:
-- AB içi alım ya da ithalat — belgede KDV yok, Fransız KDV'si bizim beyanımızda hesaplanır ve indirilir);
-- `exempt` = muaf (sigorta primi, banka masrafı). Satış tarafının `VatTreatment`ı ayrı bir sorudur
-- (müşteriye kestiğimiz fatura), bu sözlük gelen belgenin — o yüzden ayrı küme.
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
-- (13.09 · ikinci karar, muhasebeci karşılaştırması) Hareketin SINIFLANDIRMASI TEK bir türdür:
-- "bu para neyin parası" sorusunun cevabı — kira, maaş, sosyal güvenlik, banka masrafı. Bir tur
-- sınıflandırma çoklu ETİKETLE yapılıyordu (`maas` + `ortak:ahmet`) ve iki şey kayboluyordu: çok
-- etiketli satırda hangisinin tür olduğu yazmıyordu, muhasebeciye giden dökümde hesap kodu yoktu.
-- Muhasebe programlarının kurduğu düzen budur (tek tür + serbest etiket); 12.12'de "kategori
-- kalsın, etiket eklensin" şıkkı olarak sorulmuş, "iki alan, iki bakım" diye elenmişti — yanlıştı.
--
-- `direction`: türün hangi yöndeki parada anlamlı olduğu (`out` gider, `in` gelir; NULL iki yön) —
-- ekran seçiciyi satırın yönüyle süzer, kapı ters yönlü türü reddeder.
-- `account_code`: Fransız hesap planındaki (PCG) karşılığı, İSTEĞE BAĞLI. Yalnız karşılığı tek olan
-- türde doludur (kira 613, maaş 641…); ambalaj ya da yazılım gibi işletmeye göre değişende boştur —
-- uydurulmuş bir kod, muhasebecinin düzeltmesi gereken yanlış bir kayıttır. Varsayılan satırlar
-- referans veridir (0013/0028 deseni), seed değil — taze veritabanı da bilir.
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
-- (13.09 · ikinci karar) SERBEST İŞARET, sınıflandırma değil: işletmenin kendi gruplaması ("Ortak A
-- aracı", "Bayram hazırlığı"). İsteğe bağlıdır ve bir hareketi İZAHLI YAPMAZ — izah bir bağ ya da
-- türdür. Birden çok olabilir. Sözlük yine yönetilir (yazım tek kalsın: "Kira" ile "kira" iki kalem
-- oluyordu) ama ekrandan tek dokunuşla büyür; varsayılan satırı YOKTUR, sözlük işletmenindir.
create table public.movement_tag (
  -- ASCII slug: süzgeç ve URL'de olduğu gibi geçer; okunur ad `label`tadır.
  slug text primary key check (slug ~ '^[a-z0-9][a-z0-9-]*$'),
  label text not null,
  -- Pasif etiket yeni harekete verilmez, eski hareketlerde kalır (hesabın pasifleşmesiyle aynı).
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ── Cari ─────────────────────────────────────────────────────────────────────
-- (13.09 · ikinci karar) Paranın KİME gittiği ya da KİMDEN geldiği: kurum (URSSAF, vergi dairesi),
-- hizmet veren (muhasebeci, telefon, kiraya veren), çalışan. TEDARİKÇİ burada DEĞİL — o stok
-- modülünün kaydıdır (`supplier`) ve ekranın seçicisi ikisini aynı listede gösterir; kopyası
-- tutulsaydı aynı firma iki yerde iki adla yaşardı. ORTAK da burada değil: ortağın kaydı cari
-- HESABIDIR (`account.type = partner`), para onun üstünden geçer.
--
-- `keywords`: banka satırında bu kelimelerden biri geçerse cari (ve varsayılan türü) önerilir —
-- "PRLV SEPA URSSAF COTISATIONS" → URSSAF · Sosyal güvenlik. Muhasebe programlarının "eşleşme
-- etiketi"; öneri yine öneridir, onayı insan verir.
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
-- (13.09) Resmî muhasebe sorduğunda hareketin dayanağı: fatura, fiş, bordro, sözleşme, dekont.
-- Belge PARA DEĞİLDİR: fatura geldiğinde para henüz çıkmamıştır ama BORÇ doğmuştur; ödeme sonra
-- bir hareket olarak gelir ve bir BAĞLA (`money_allocation`, tutarıyla) belgeye bağlanır. Açık kalan
-- SAKLANMAZ, `money_document_balance` görünümünden türetilir (bakiye kararıyla aynı gerekçe).
--
-- Satış faturaları BURADA DEĞİL: bizim kestiğimiz fatura numarası siparişin üstünde durur
-- (`order.invoice_no`, 12.7). Stok alımının faturası mal kabule bağlanır (`stock_intake_id`) ve
-- ikinci bir borç DOĞURMAZ — tedarikçi borcu mal kabulden türemeye devam eder (12.3).
create table public.money_document (
  id uuid primary key default gen_random_uuid(),
  kind document_kind not null,
  -- Belge numarası: faturada var, fiş ve bordroda olmayabilir.
  number text,
  issued_on date not null,
  -- VADE (12.26): ödemenin son günü — belgede yazmıyorsa NULL. Tedarikçi faturasında form, kartın
  -- vadesinden önerir (`dueDateOf`); belge gününden önce olamaz (`money_document_due`).
  due_on date,
  -- Karşı taraf (13.09 · ikinci karar): CARİ (kiraya veren, çalışan, kurum) ya da TEDARİKÇİ — ikisinden
  -- en çok biri. Bir tur serbest metindi ve aynı kurum iki yazımla iki kişi oluyordu.
  counterparty_id uuid references public.counterparty (id) on delete set null,
  supplier_id uuid references public.supplier (id) on delete set null,
  -- STOK ALIMININ BAĞI (12.26 · kullanıcı kararı 14.09) — fatura ya MAL KABULE ya da mal gelmeden
  -- kesildiyse TEDARİK SİPARİŞİNE bağlanır; ikisi birden olmaz (`money_document_stock_link`), ikisi de
  -- tedarikçi ister (`money_document_supply_party`). **Borç bu belgeden türer:** kabulün satır toplamı
  -- KDV hariçtir, nakliye ve iskontoyu bilmez — ödenecek tutar faturanın toplamıdır. Belgeli kabul
  -- `stock_intake_balance.has_document` taşır ve borca ikinci kez girmez.
  stock_intake_id uuid references public.stock_intake (id) on delete set null,
  purchase_order_id uuid references public.purchase_order (id) on delete set null,
  -- Belgenin YÖNÜ hareketinkiyle aynı dilde: `out` = bizim ödeyeceğimiz (gelen fatura, bordro),
  -- `in` = bize ödenecek (tedarikçi iadesi, ortağa kesilen dekont).
  direction movement_direction not null,
  -- Belgenin TÜRÜ (13.09): ödemesi bağlanınca harekete de geçer (hareketin türü boşsa).
  nature text references public.movement_nature (slug) on update cascade,
  amount numeric(12, 2) not null check (amount > 0),
  -- KDV tutarı; belgede yoksa NULL — sıfır "KDV yok" demektir, "bilinmiyor" değil (CLAUDE §1).
  vat_amount numeric(12, 2) check (vat_amount >= 0),
  -- KDV REJİMİ (12.26) — `document_vat_regime` künyesi. Standart dışındaki rejimde belgede KDV
  -- olamaz (`money_document_vat_regime`): ters yüklemeli faturada KDV'yi karşı taraf değil biz beyan ederiz.
  vat_regime document_vat_regime not null default 'standard',
  currency currency not null default 'EUR',
  -- Dosyanın ÖZEL kovadaki anahtarı (`r2Keys.financeDocument`); yoksa belge yalnız künyedir.
  file_key text,
  -- Serbest etiketler (13.09) — sınıflandırma türdedir.
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
  -- TÜR (13.09 · ikinci karar) — "bu para neyin parası", TEK: `movement_nature`. Sipariş parası, stok
  -- alımı ve transferde boştur (bağın kendisi söyler). Reklam gideri `reklam` türü + `meta.campaign`.
  nature text references public.movement_nature (slug) on update cascade,
  -- CARİ (13.09) — paranın kime gittiği / kimden geldiği; tedarikçiyse `supplier_id` dolar, bu değil.
  counterparty_id uuid references public.counterparty (id) on delete set null,
  -- ETİKETLER — serbest işaret (`movement_tag`), birden çok; izah DEĞİLDİR. Tetikleyici sözlükte
  -- olmayanı reddeder (yazım tek kalsın). Belge bağı burada değil: `money_allocation` (tutarıyla).
  tags text[] not null default '{}',
  -- Ek künye. Reklam giderinde `{"campaign": "..."}` — kampanya gideri ile cirosu yan yana
  -- konabilsin diye (gerçek ROI, 12.5/13); Excel'e taşınmaz. Stripe tahsilatında `{"providerRef"}`.
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
  -- Banka ekstresiyle eşleşti mi (12.4). YALNIZ banka satırında anlamlıdır (`source = bank_import`):
  -- elle ya da sistemce yazılan hareketin karşısında bir ekstre satırı henüz yoktur, bayrak orada
  -- bir şey söylemez. Ekranın "izah edildi mi" sorusunun cevabı bu bayrak DEĞİL `explained`tir
  -- (13.09) — ikisini tek noktada okumak, sistemin kendi yazdığı her tahsilatı "eşleşmedi" diye
  -- gösteriyordu (yerelde 28 satırın 5'i banka satırıydı).
  reconciled boolean not null default false,
  /*
    YAZIMIN KİMLİĞİ (21.263 · kullanıcı kararı 04.09) — "bu isteği zaten yazdım mı?"

    İstemcide üretilir ve İSTEĞİN kimliğidir, hareketin değil: cevabı kaybolan bir tahsilat isteği
    tekrarlandığında aynı anahtarla gelir, aşağıdaki tekil indeks ikinci yazımı reddeder ve
    `record_order_movement` var olan satırın sonucunu döndürür — kapı için tekrar bir arıza değil,
    *"zaten yazılmıştı"* cevabıdır.

    ── NEDEN `import_fingerprint`E BİNMİYOR ──────────────────────────────────
    İkisi farklı şey söylüyor. Parmak izi *"bu banka ekstresindeki bu satır"*tır ve tekilliği HESAP
    BAŞINADIR (`unique (account_id, import_fingerprint)`) — aynı parmak izi iki hesapta meşru olarak
    doğabilir. Yazım kimliği ise isteğin kendisidir ve tekilliği KÜRESELDİR. Tek kolona sıkıştırmak,
    banka parmak izlerini küresel benzersiz olmaya zorlardı; değiller ve olmaları da gerekmiyor.
    İki kolon, iki anlam, TEK şekil — aynı kalıp `warehouse_transfer.idempotency_key`te de var.

    ── BU KOLON 12.11'İN BORCUNU KAPATIYOR ───────────────────────────────────
    `application/src/order/payment.ts` bugüne dek OKU-SONRA-YAZ ile koruyordu (`meta.idempotencyKey`
    aranıyordu) ve künyesi kendi sınırını yazıyordu: *"aynı anda gelen iki eş-anahtarlı istek ikisi
    de 'yok' okuyup ikisi de yazabilir."* Kararı artık veritabanı veriyor, o pencere kapandı.
  */
  idempotency_key text,
  -- Banka satırının KİMLİĞİ (12.4). Bankalar satır kimliği vermez; hesap+tarih+tutar+yön+açıklama
  -- ve tekrar sırasından ÜRETİLİR (`domain-core/bank/fingerprint`). Aşağıdaki tekil indeks, aynı
  -- ekstre iki kez yüklendiğinde ya da dönemler çakıştığında paranın iki kez yazılmasını engeller —
  -- mükerrer yazım her bakiyeyi ve her kâr raporunu yalancı yapardı.
  import_fingerprint text,
  bank_import_id uuid,
  /*
    KARŞI UÇ (12.13 · kullanıcı kararı 13.09) — "bu ekstre satırı, şu transferin öteki yakasıdır."

    Transfer TEK satırdır ve görünüm onu karşı hesaba aynalar. Karşı hesap ekstreyle beslenen bir
    bankaysa ekstre o yakayı bir kez daha getirir: kasadan yatırılan 600 € bankada hem ayna hem ekstre
    satırı olarak durur ve iki kez sayılır. Ekstre satırı buradan transfer ucuna bağlanınca ayna SUSAR
    (`account_movement`): iki gerçek satır kendi hesaplarında durur, hiçbiri aynalanmaz. Stripe
    payout'unun banka tarafı da böyle kapanır (12.14).

    Yalnız ekstre satırı taşır ve ancak transferse (kısıt aşağıda). Uç silinirse bağ düşer ve satır
    kendi başına aynalanan bir transfer olarak kalır — para yine tek kez sayılır.
  */
  counterpart_movement_id uuid references public.money_movement (id) on delete set null,
  created_at timestamptz not null default now(),
  -- İZAH (13.09 · kullanıcı kararı, ikinci karar): hareket şunlardan biriyle açıklanır — bir işe bağ
  -- (sipariş, mal kabul, tedarikçi), transfer (karşı hesap), bir TÜR ya da en az bir BELGE BAĞI. Etiket
  -- izah DEĞİLDİR (serbest işarettir). Hiçbiri yoksa "izah edilmemiş" kuyruğuna düşer; kaydı
  -- ENGELLEMEZ (banka satırı ham gelir, sonra izah edilir).
  --
  -- Türetilir, elle yazılmaz — ama ÜRETİLMİŞ KOLON DEĞİL: belge bağı başka bir tabloda
  -- (`money_allocation`) ve üretilmiş kolon başka tabloya bakamaz. Tetikleyici kurar: satır her
  -- yazıldığında (`money_movement_explain`) ve bağ eklenip silindiğinde (`money_allocation_touch`) kural
  -- baştan hesaplanır; uygulamanın gönderdiği değer EZİLİR. Kuralın tek yeri `money_movement_explain`.
  explained boolean not null default false,

  -- Transferin karşı ucu ZORUNLU ve kendisi olamaz; transfer olmayan harekette karşı hesap ANLAMSIZ.
  -- Veritabanı burada duruyor çünkü ihlali veri bozukluğudur: karşı ucu olmayan transfer, bakiyeyi
  -- sessizce kaydırır. Zenginleştirilmiş kurallar (tipten yön türetimi) motordadır.
  constraint money_movement_transfer_shape check (
    (type = 'transfer' and counter_account_id is not null and counter_account_id <> account_id)
    or (type <> 'transfer' and counter_account_id is null)
  ),
  -- Karşı ucu yalnız EKSTRE satırı ve yalnız TRANSFER taşır (12.13): elle yazılan satırın karşısında
  -- bir ekstre yoktur, transfer olmayan satırın "öteki yakası" olmaz.
  constraint money_movement_counterpart_shape check (
    counterpart_movement_id is null or (source = 'bank_import' and type = 'transfer')
  ),
  -- Karşı taraf TEK (13.09): tedarikçi ya da cari — ikisi birden aynı soruyu iki ayrı cevapla yanıtlardı.
  constraint money_movement_party check (supplier_id is null or counterparty_id is null)
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
-- İzah kuyruğu (13.09): izah edilmemiş satır azınlıktır → kısmi indeks; sayaç da buradan sayar.
create index money_movement_unexplained_idx on public.money_movement (value_date desc) where not explained;
-- Tür süzgeci (13.09): kampanya gideri `nature = 'reklam'`, dökümün ve raporların tür kırılımı.
create index money_movement_nature_idx on public.money_movement (nature, value_date desc) where nature is not null;
-- Carinin hareketleri — "URSSAF'a bu yıl ne ödedik" sorusu buradan cevaplanır.
create index money_movement_counterparty_idx on public.money_movement (counterparty_id) where counterparty_id is not null;
-- Serbest etiket süzgeci (`tags @> '{ortak-a-araci}'`).
create index money_movement_tags_idx on public.money_movement using gin (tags);
-- Mükerrer koruması (12.4): aynı hesapta aynı banka satırı İKİ KEZ yazılamaz.
-- KISMİ İNDEKS DEĞİL, bilerek: `on conflict` kısmi indeksi hedefleyemez ve import yazımı ona
-- dayanıyor. Gereği de yok — NULL'lar tekil karşılaştırmada birbirine EŞİT SAYILMAZ, dolayısıyla
-- parmak izi olmayan (elle girilen) hareketler bu indeksin kısıtına hiç takılmaz; elle iki kez
-- 20 € girmek meşrudur ve meşru kalır.
create unique index money_movement_import_key on public.money_movement (account_id, import_fingerprint);
-- Yazım kimliği (21.263): aynı istek İKİ KEZ para yazamaz. Kısmi indeks DEĞİL — üstteki künyenin
-- birebir gerekçesi: anahtarsız hareket (elle giriş, besleme, banka içe aktarma) `null` taşır ve
-- `null`'lar tekil karşılaştırmada birbirine eşit sayılmaz, yani bu kısıta hiç takılmazlar.
-- `on conflict (idempotency_key)` de böylece çıkarım inceliği olmadan hedefleyebiliyor.
create unique index money_movement_idempotency_key on public.money_movement (idempotency_key);
-- Transfer ucunun karşı satırı TEK olur (12.13): iki ekstre satırı aynı ucu sahiplenemez — ikisi de
-- sahiplenseydi bir para iki ekstre satırında yaşardı.
create unique index money_movement_counterpart_key on public.money_movement (counterpart_movement_id)
  where counterpart_movement_id is not null;

-- ── Belge bağı ───────────────────────────────────────────────────────────────
-- (13.09 · ikinci karar, muhasebeci karşılaştırması) Hareket ↔ belge, TUTARIYLA. Bir tur hareketin
-- tek bir `document_id`si vardı: tedarikçinin üç faturası tek havalede ödendiğinde o havale üç
-- faturaya bağlanamıyordu. Bağ artık ayrı satırdır ve kendi tutarını taşır — bir havale birkaç
-- faturayı, bir fatura birkaç ödemeyi kapatır. İki uçtan `cascade`: hareket ya da belge silinirse
-- bağ gider, öteki kalır.
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

-- Bir hareketin bağları toplamı kendi tutarını AŞAMAZ: 100 €'luk havale 150 €'luk borç kapatamaz.
-- Hareket satırı KİLİTLENİR — aynı anda iki bağ yazılırsa ikisi de "yer var" görmesin. Belgenin
-- tarafı serbesttir: fazla ödeme bir olgudur, açık kalan eksiye düşer ve gizlenmez.
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

-- İZAH kuralının TEK yeri (13.09 · ikinci karar) — `explained` kolonunun künyesi. Satır her
-- yazıldığında baştan hesaplanır; uygulamanın gönderdiği değer ezilir.
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
--
-- AYNA SUSAR (12.13) — karşı yaka ekstreden gelmişse. Ucu bir ekstre satırı sahiplenmişse
-- (`counterpart_movement_id` ona bakıyor) ya da satırın kendisi bir ucun karşı satırıysa, iki
-- gerçek satır kendi hesaplarında durur; aynalamak aynı parayı iki kez sayardı.
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
create or replace view public.account_balance as
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
-- Fatura geldi, borç doğdu; ödeme(ler) belgeye BAĞLANINCA kapanır. Kapanan tutar bağların toplamıdır
-- (13.09 · ikinci karar: bağ tutarıyla, `money_allocation`): belgeyle aynı yöndeki hareketin bağı
-- kapatır, ters yöndekinin bağı (iade, dekont) yeniden açar. `open_amount` eksiye düşebilir (fazla
-- ödeme) ve bu gizlenmez — fazla ödeme de bir olgudur.
create or replace view public.money_document_balance as
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
-- Faturası girilmemiş kabulün borcu (12.3 · 12.13): kabulün tutarı − kabule bağlı alım ödemeleri.
-- Banka eşleştirmesi (12.13) "bu çıkış hangi mal kabulün parası" sorusunu buradan yanıtlar.
-- Faturası belge olarak girilmiş kabul — belge kabulün kendisine (`money_document.stock_intake_id`) ya
-- da kabulün SİPARİŞİNE (`purchase_order_id`, 12.26: fatura mal gelmeden kesildi) bağlı —
-- `has_document = true` taşır: borcu belgenin açık kalanındadır (12.26 · borç belgeden türer), aday
-- listesine belge üzerinden girer ve tedarikçi borcunda ikinci kez sayılmaz. `note` kabulün
-- irsaliye/fatura numarasıdır (12.26): banka satırı onu anarsa referans eşleşmesi kurulur.
create or replace view public.stock_intake_balance as
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
  p_meta jsonb default null,
  -- Yazımın kimliği (21.263) — künyesi kolonun kendisinde. `null` = korumasız yazım (elle giriş,
  -- besleme); kolonun `null`'ları tekil indekste çakışmadığı için o yol aynen çalışır.
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

  /*
    ÇAKIŞMA BİR ARIZA DEĞİL, CEVAPTIR (21.263). Aynı anahtarla ikinci kez gelen istek yazmaz ama
    REDDEDİLMEZ de: var olan hareketin kimliğiyle ve `deduped: true` ile döner. Sebebi kuryenin ve
    kapıdaki tahsilatın gerçeğidir — cevabı kaybolan bir isteği tekrarlayan kişi bir şey yapmıyor,
    aynı şeyi soruyor. Hata dönseydi ekran ona "olmadı" derdi ve para iki kez tahsil edilirdi.

    Hedef AÇIKÇA `(idempotency_key)`: çıkarım yalnız o indekse bakar, `money_movement_import_key`
    ihlali eskisi gibi fırlar (banka içe aktarmasının kendi koruması bozulmaz).
  */
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

-- Sağlayıcı künyesinden harekete (07.11): `charge.refunded` bize yalnız `pi_...` ile gelir, sipariş
-- kimliğiyle değil. Kısmi indeks — künyeyi yalnız sağlayıcı üzerinden geçen ödemeler taşır.
create index money_movement_provider_ref_idx on public.money_movement ((meta ->> 'providerRef'))
  where meta ? 'providerRef';

-- ── Ekstre satırı, elle yazılmış hareketi yutar ──────────────────────────────
-- 12.13 · kullanıcı kararı 13.09: banka hesabına ELLE de yazılır ("kira ödendi" o gün girilir) ve
-- ekstre gelince aynı para bir kez daha düşer. İki satır tek satıra iner: EKSTRE SATIRI kalır (parmak
-- izi mükerrer korumasının dayanağıdır — ekstre yeniden yüklense de satır tekrar girmez), elle
-- yazılanın bağları ona geçer (tip, tür, cari, etiketler, belge bağları, sipariş, mal kabul, tedarikçi,
-- karşı hesap, yazım kimliği, künye) ve elle yazılan SİLİNİR. İzi ekstre satırının künyesinde durur
-- (`meta.absorbed`: kimlik, kaynak, tutar, tarih, açıklama) — geri alma (`unmatch_bank_movement`)
-- elle yazılanı bu izden yeniden kurar.
--
-- NEDEN RPC (STACK §13 (b)): silme + devralma bölünemez. Silinip devralınmasa bağlar kaybolur;
-- devralınıp silinmese para iki kez sayılır. Tekil `idempotency_key` de ancak bu sırayla taşınır:
-- önce eski satır düşer, sonra yenisi anahtarı alır.
--
-- Elle yazılanı başka bir bankanın ekstre satırı "karşı uç" diye sahiplenmişse (iki banka arası
-- transfer) o bağ ekstre satırına taşınır — silme onu NULL'a düşürüp aynayı yeniden açardı. Belge
-- bağları da taşınır; silme onları `cascade` ile götürürdü.
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
  -- Ekstre satırının KENDİ belge bağı varsa yutma yapılmaz (13.09): iki bağ kümesi tek satırda
  -- birleşseydi toplamları tutarı aşabilirdi ve hangisinin doğru olduğu bilinemezdi.
  if exists (select 1 from public.money_allocation a where a.movement_id = p_statement_id) then
    raise exception 'absorb: ekstre satırının belge bağı var — önce onu kaldırın (%)', p_statement_id;
  end if;

  -- Başka bir ekstre satırı elle yazılanı karşı uç diye sahiplenmişse bağ ekstre satırına geçer.
  update public.money_movement
     set counterpart_movement_id = p_statement_id
   where counterpart_movement_id = p_provisional_id;
  -- Belge bağları ekstre satırına geçer (13.09) — silme onları `cascade` ile götürürdü.
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
-- 13.09 · ikinci karar (kullanıcı bulgusu: "eşleştirmeyle ilgili düzenleme yapamıyorum"): bağlanan,
-- sınıflanan ya da atlanan ekstre satırı ekstreden geldiği hâle döner — tip `misc`, tür, cari ve
-- bağlar boş, belge bağları silinir, eşleşmemiş. Serbest etiketler kalır: onlar bir eşleşme değil.
--
-- "ZATEN YAZMIŞTIM" BİRLEŞMESİ GERİ ALINIRSA elle yazılan satır `meta.absorbed` izinden yeniden
-- kurulur (tutar, tarih, açıklama, kaynak, kayıt anı) ve birleşmeyle gelen her şey ona döner: tip,
-- tür, cari, etiketler, bağlar, yazım kimliği, künye, belge bağları, karşı uç sahiplikleri. Ekstre
-- satırı ham hâline iner. Dönüş yeniden kurulan satırın kimliği (eski kimlik silinmişti); öteki
-- hâlde `null`.
--
-- Satırı başka bir ekstre satırı "karşı uç" diye sahiplenmişse (satır transfer olarak eşleşmiş,
-- öteki bankanın ekstresi onu uç diye almış) önce o geri alınır — yoksa öteki satır olmayan bir
-- transferin ucuna bağlı kalırdı.
--
-- NEDEN RPC: silme/yeniden kurma + bağ taşıma bölünemez (absorb'un gerekçesi).
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
