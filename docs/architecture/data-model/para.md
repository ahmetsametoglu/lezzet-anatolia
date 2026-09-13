# Veri Modeli — Para ve Ön Muhasebe

Hesaplar, para hareketleri, tür · etiket · cari sözlükleri, belgeler ve belge bağları, banka import şablonu.

> Bu dosya `../DATA_MODEL.md`'nin parçasıdır. Ortak ilkeler (çok dilli alanlar, türetme ilkesi, enum listesi, kalıcı kararlar) ana dosyadadır; **karar oraya, alan buraya** yazılır.

> **BİÇİM (02.18 · 26.08):** her varlık iki parçadır — **alan listesi TÜRETİLİR**
> (`<!-- alanlar:… -->` bloğu; `pnpm docs:sync` migration'lardan üretir, arasına elle yazılan her
> şey silinir) ve **kararlar İNSANIN** (yalnız söyleyecek şeyi olan alan). Kolon adını, tipini,
> varsayılanını aramak için listeye bak; *neden öyle* sorusunun cevabı kararlardadır.
> Doküman bilerek EKSİKTİR — her alanın kararı olmaz — ama **yalan söyleyemez**: anlatılan alan
> gerçekten var olmalı, denetim bunu zorluyor.

---

## Account (hesap)

Paranın durduğu yer. Kasa (nakit), bankalar (Revolut, Crédit Mutuel), Stripe — hepsi birer hesap. "Online havuz" ayrı değil = Stripe hesabı.

<!-- alanlar:account -->
| Kolon | Tip | Null | Varsayılan |
| --- | --- | --- | --- |
| `id` | uuid |  | `gen_random_uuid()` |
| `name` | text |  |  |
| `type` | account_type |  |  |
| `currency` | currency |  | `'EUR'` |
| `is_active` | boolean |  | `true` |
| `created_at` | timestamptz |  | `now()` |
<!-- /alanlar -->

## MoneyMovement (para hareketi)

Tüm para hareketleri **tek tablo**; kasa/banka ayrımı yok — hareketin **hesabı** (yer) ve **tipi** var.

<!-- alanlar:money_movement -->
| Kolon | Tip | Null | Varsayılan |
| --- | --- | --- | --- |
| `id` | uuid |  | `gen_random_uuid()` |
| `account_id` | uuid |  |  |
| `direction` | movement_direction |  |  |
| `amount` | numeric(12, 2) |  |  |
| `type` | movement_type |  |  |
| `nature` | text | • |  |
| `counterparty_id` | uuid | • |  |
| `tags` | text[] |  | `'{}'` |
| `meta` | jsonb | • |  |
| `counter_account_id` | uuid | • |  |
| `order_id` | uuid | • |  |
| `stock_intake_id` | uuid | • |  |
| `supplier_id` | uuid | • |  |
| `value_date` | date |  | `current_date` |
| `description` | text | • |  |
| `source` | movement_source |  | `'manual'` |
| `reconciled` | boolean |  | `false` |
| `idempotency_key` | text | • |  |
| `import_fingerprint` | text | • |  |
| `bank_import_id` | uuid | • |  |
| `counterpart_movement_id` | uuid | • |  |
| `created_at` | timestamptz |  | `now()` |
| `explained` | boolean |  | `false` |
<!-- /alanlar -->

**Kararlar**

- **`amount`** — İŞARETSİZ tutulur, yön `direction`tadır. Uygulamadaki adı `amountCents` ve birimi **cent** (`STACK §8`); `account_movement` görünümü işaretli hâlini `signed_amount` diye türetir (app: `signedAmountCents`).
- **`nature`** (13.09 · ikinci karar, muhasebeci karşılaştırması) — TÜR: "bu para neyin parası", sözlükten (`movement_nature.slug`) TEK değer. Bir tur (12.12) sınıflandırma çoklu etiketle yapılıyordu ve iki şey kayboluyordu: çok etiketli satırda hangisinin tür olduğu, ve muhasebeciye giden dökümde hesap kodu. Türlü satırın kaba tipi türden türer (motor `classificationTypeOf`: türlü çıkış `expense`, sermaye girişi `capital`, öteki giriş `misc`); sipariş parası, stok alımı ve transfer tür ALMAZ — onları bağları açıklar (`acceptsNature`). Tanınmayan türü FK reddeder.
- **`counterparty_id`** (13.09) — CARİ: kime ödendi / kimden geldi. Tedarikçiyle birlikte olmaz (`money_movement_party`): stok alımının karşı tarafı tedarikçidir. Cari tek başına izah DEĞİLDİR — "URSSAF'a ödendi" doğru ama "neyin parası" sorusunu cevaplamaz; carinin varsayılan türü o soruyu cevaplar ve cari konunca boş türe geçer.
- **`tags`** — SERBEST işaret, çoklu, izah değil (13.09 · ikinci karar): işletmenin kendi gruplaması ("Ortak A aracı"). Sözlükten (`movement_tag.slug`); tanınmayanı tetikleyici reddeder. Ortak ayrımı etiketle YAPILMAZ — ortağın kaydı ortak cari hesabıdır.
- **Belge bağı hareketin kolonu DEĞİL** — `money_allocation` (aşağıda): tutarıyla, çoktan çoğa. Bir tur `document_id` vardı ve tedarikçinin üç faturasını tek havaleyle kapatan ödeme üç faturaya bağlanamıyordu.
- **`explained`** — İZAH: bir işe bağ (sipariş, mal kabul, tedarikçi), transfer, TÜR ya da belge bağı varsa `true`; etiket ve cari saymaz. Uygulama yazmaz, **tetikleyici yazar** (`money_movement_explain`; bağ eklenip silinince `money_allocation_touch` satırı yeniden hesaplatır) — üretilmiş kolon olamazdı, belge bağı başka tablodadır. İzahsız hareket "izah edilmemiş" kuyruğundadır; kayıt **engellenmez** (banka satırı ham gelir, sonra izah edilir). Ekranın sayacı ve noktası bunu okur, `reconciled`i değil.
- **`reconciled`** — banka ekstresiyle eşleşme; **yalnız `source = bank_import` satırında anlamlı.** 13.09'a kadar ekran her satırda bunu "eşleşti/eşleşmedi" diye okuyordu ve sistemin yazdığı her tahsilat eşleşmemiş görünüyordu (yerelde 28 satırın 5'i banka satırıydı). Ekstre satırında tür koymak satırı mutabık yapar; türü kaldırmak, başka açıklaması yoksa satırı kuyruğa döndürür.
- **`source`** — `system` (13.09): webhook, kapıda tahsilat, hızlı satış, payout. Eskiden hepsi `manual` yazılıyor, Stripe tahsilatı elle girilmiş satırdan ayırt edilemiyordu.
- **`meta`** — ek künye. Reklam giderinde `{campaign}` taşır: kampanya gideri ↔ ciro eşleşmesi (gerçek ROI) bu alandan çıkar; Stripe tahsilatında `{providerRef}`.
- **`counter_account_id`** — transferde karşı hesap (nakit→banka, Stripe→banka payout, banka→ortak carisi).
- **`counterpart_movement_id`** (12.13) — "bu ekstre satırı şu transferin öteki yakasıdır". Transfer tek satırdır ve karşı hesaba aynalanır; karşı hesap ekstreyle beslenen bir bankaysa ekstre o yakayı bir kez daha getirir (kasadan yatırılan 600 € bankada hem ayna hem ekstre satırı). Ekstre satırı buradan uca bağlanınca **ayna susar** (`account_movement`): iki gerçek satır kendi hesaplarında durur, hiçbiri aynalanmaz. Yalnız ekstre satırı taşır, yalnız transferde; bir ucu tek satır sahiplenir (tekil indeks). Uç silinirse bağ düşer ve satır kendi başına aynalanan bir transfer olarak kalır.
- **`import_fingerprint`** — mükerrer koruması; aşağıdaki bölüme bak.
- **Türetilmiş görünümler:** `account_movement` (defter satırı, aynalama), `account_balance`, `money_document_balance` (belgenin açık kalanı), `stock_intake_balance` (12.13: mal kabulün açık kalanı = kabul tutarı − kabule bağlı alım ödemeleri; faturası belge olarak girilmiş kabul `has_document` taşır ve borcu belgede görünür, iki kez değil).

### Mükerrer koruması (`import_fingerprint`)

Bankalar satır kimliği vermez, kimlik ÜRETİLİR: hesap + değer tarihi + tutar + yön + sadeleşmiş açıklama + **tekrar sırası**.

Sıra şart: aynı gün çekilen iki ayrı 20 € gerçekten iki harekettir ve naif bir özet birini yutardı; dosya yeniden yüklendiğinde ise her satır kendi eşiyle çakışır ve hiçbiri tekrar yazılmaz.

Tekil indeks kısmi DEĞİLDİR (`on conflict` kısmi indeksi hedefleyemez); NULL'lar tekil karşılaştırmada eşit sayılmadığı için elle girilen hareketler kısıta hiç takılmaz.

### Ekstre satırının karşılığı (12.13 · kullanıcı kararı 13.09)

Her banka satırının bir karşılığı olmalı. Kuyruk satıra şu hedefleri önerir ya da seçtirir: sipariş tahsilatı (giriş), müşteri iadesi (çıkış; puanlanmaz, listeden seçilir — iade borcu kalem ister), açık belge (belgenin yönü), mal kabul — tedarikçi borcu (çıkış, `stock_intake_balance`), transferin öteki yakası (`counterpart_movement_id`), başka hesaba transfer (uç yok; satırın kendisi transfer olur ve aynalanır), o hesaba **ekstreden önce elle ya da sistemce yazılmış hareket**, cari (eşleşme kelimesi banka açıklamasında geçiyorsa önerilir) ve tür koyma. Satır **yerinde güncellenir**, silinip yeniden yazılmaz: parmak izi mükerrer korumasının dayanağıdır. Belgeye bağ **tutarıyladır** (13.09 · ikinci karar): kısmen bağlanan satır kuyrukta kalanıyla durur.

**Banka hesabına elle de yazılır; ekstre gelince ekstre satırı elle yazılanı yutar** (kullanıcı kararı 13.09, seçenek "elle de yazılır, sonra birleşir"): "kira ödendi" o gün elle girilir, ekstre gelince aynı para bir kez daha düşer ve operatör satırı "zaten yazılmış hareket"e bağlar. `absorb_provisional_movement` tek transaction'da elle yazılanın bağlarını (tip, tür, cari, etiketler, belge bağları, sipariş, mal kabul, tedarikçi, karşı hesap, yazım kimliği, künye) ekstre satırına geçirir ve elle yazılanı **siler**; izi ekstre satırının `meta.absorbed` künyesinde durur (kimlik, kaynak, tutar, tarih, açıklama). Ekstre haklıdır: tutar farklıysa sipariş cache'i yeniden kurulur. Reddedilen seçenek "bankaya elle yazılmaz, ekstre getirir"di — bakiye ekstre yüklenene kadar eski kalırdı.

**Cevap geri alınabilir** (13.09 · kullanıcı bulgusu: "eşleştirmeyle ilgili düzenleme yapamıyorum"): `unmatch_bank_movement` bağlanan, sınıflanan ya da atlanan ekstre satırını ekstreden geldiği hâle döndürür — tip `misc`, tür, cari ve bağlar boş, belge bağları silinir, eşleşmemiş; serbest etiketler kalır. Birleşme geri alınırsa elle yazılan satır `meta.absorbed` izinden yeniden kurulur ve birleşmeyle gelen her şey (tip, tür, cari, etiketler, belge bağları, yazım kimliği, künye) ona döner. Satırı başka bir ekstre satırı transfer ucu diye sahiplenmişse önce o geri alınır.

### Stripe: brüt tahsilat · ücret · payout (12.14 · kullanıcı kararı 13.09)

Stripe bir hesaptır ve üç satır tutar: **tahsilat brüt** (`order_payment`, künye `providerRef`), **ücret ödeme başına** (`expense` + `stripe-ucreti`, yazım kimliği `stripe-fee:<niyet>`; sipariş bağı künyede — `order_id` yazılsaydı siparişin tahsilat toplamı kayardı) ve **payout** (`transfer`, Stripe → banka, tutar payout'un NET'i, değer tarihi varış günü, yazım kimliği `stripe-payout:<payout>`, künyede toplamlar ve kalemler). Ödeme dışı Stripe ücretleri (`stripe_fee`) payout içeriğinden düşer. Banka hesabı `stripe_payout_account_id` ayarıdır. Yazım kimliği tekil olduğu için tekrar gelen olay ikinci satır doğurmaz (`insertOnce`). Ekstre payout'u getirince satır transferin karşı satırı olur (`counterpart_movement_id`).

### Ortak cari hesabı (`account.type = partner`, 13.09)

Ortağın cebinden ödenen şirket gideri ve şirketin ortak adına yaptığı ödeme şirket hesaplarından geçmez; tutunacakları yer ortağın cari hesabıdır — yeni bir varlık değil, yeni bir hesap türü. Bakiye işareti anlatır: **eksi = şirket ortağa borçlu** (ortak cebinden ödedi), **artı = ortak şirkete borçlu** (şirket ortak adına ödedi; deftere banka→cari transferi yazılır). Sermaye koyma cari DEĞİLDİR: bankaya `capital` girer (tür `sermaye`, hesap 101); ortağın şirkete borç olarak koyduğu para ise ortak cari hesabından bankaya transferdir. Ortak etiketle ayrılmaz (13.09 · ikinci karar) — bir tur ortak hem `ortak:<ad>` etiketi hem cari hesap olarak iki yerde yaşıyordu ve ikisi ayrışabiliyordu.

## MovementTag (etiket sözlüğü)

SERBEST işaret (13.09 · ikinci karar): işletmenin kendi gruplaması ("Ortak A aracı", "Bayram hazırlığı"). İsteğe bağlıdır, birden çok olabilir ve bir hareketi İZAHLI YAPMAZ — izah bir bağ ya da türdür. Sözlük yine yönetilir (yazım tek kalsın: "Kira" ile "kira" iki kalem oluyordu) ama ekrandan, satırın etiket menüsünden bile, tek dokunuşla büyür; varsayılan satırı YOKTUR.

<!-- alanlar:movement_tag -->
| Kolon | Tip | Null | Varsayılan |
| --- | --- | --- | --- |
| `slug` | text |  |  |
| `label` | text |  |  |
| `is_active` | boolean |  | `true` |
| `created_at` | timestamptz |  | `now()` |
<!-- /alanlar -->

**Kararlar**

- **`slug`** anahtardır, `id` değil: ASCII, küçük harf, tire (`check`); okunur addan üretilir (motor `dictionarySlugOf`). Hareket dizide bu slug'ı taşır; okunur ad `label`. Aynı ad ikinci kez eklenmez — menü var olanın anahtarını döndürür.
- **Etiket SİLİNMEZ, pasifleşir** (`is_active`): eski hareketler onu taşımaya devam eder — hesabın kapanmasıyla aynı gerekçe.

## MovementNature (tür sözlüğü)

"Bu para neyin parası" sorusunun cevabı (13.09 · ikinci karar): kira, maaş, sosyal güvenlik, banka masrafı. Harekete ve belgeye TEK tür konur. Referans satırları migration'da durur (`0013`/`0028` deseni) — taze veritabanı da bilir; operatör Sözlük penceresinden ekler.

<!-- alanlar:movement_nature -->
| Kolon | Tip | Null | Varsayılan |
| --- | --- | --- | --- |
| `slug` | text |  |  |
| `label` | text |  |  |
| `direction` | movement_direction | • |  |
| `account_code` | text | • |  |
| `is_active` | boolean |  | `true` |
| `created_at` | timestamptz |  | `now()` |
<!-- /alanlar -->

**Kararlar**

- **`direction`** — türün hangi paranın türü olduğu: `out` gider, `in` gelir; `NULL` iki yön. Tür kapısı paranın yönüne uymayan türü reddeder (gider türü giren paraya konmaz).
- **`account_code`** — Fransız hesap planındaki (PCG) karşılığı, İSTEĞE BAĞLI: yalnız karşılığı tek olan türde dolu (kira 613, maaş 641, sosyal güvenlik 645…); ambalaj ya da yazılım gibi işletmeye göre değişende boş — uydurulmuş bir kod, muhasebecinin düzeltmesi gereken yanlış kayıttır. Muhasebeci dökümüne "Hesap kodu" sütunu olarak gider.
- **`slug`** `movement_tag` ile aynı kural; hareketler ve belgeler slug'ı taşır, bu yüzden slug DEĞİŞMEZ (ad, yön, kod değişebilir).
- **Tür SİLİNMEZ, pasifleşir** — eski hareketler onu taşımaya devam eder, yeni kayda verilmez.

## Counterparty (cari)

Paranın KİME gittiği ya da KİMDEN geldiği (13.09 · ikinci karar): kurum (URSSAF, vergi dairesi), hizmet veren (muhasebeci, telefon, kiraya veren), çalışan. **Tedarikçi burada değil** — o stok modülünün kaydıdır (`supplier`); kopyası tutulsaydı aynı firma iki yerde iki adla yaşardı. **Ortak da burada değil** — ortağın kaydı ortak cari HESABIDIR (`account.type = partner`).

<!-- alanlar:counterparty -->
| Kolon | Tip | Null | Varsayılan |
| --- | --- | --- | --- |
| `id` | uuid |  | `gen_random_uuid()` |
| `name` | text |  |  |
| `kind` | counterparty_kind |  | `'other'` |
| `keywords` | text[] |  | `'{}'` |
| `default_nature` | text | • |  |
| `note` | text | • |  |
| `is_active` | boolean |  | `true` |
| `created_at` | timestamptz |  | `now()` |
<!-- /alanlar -->

**Kararlar**

- **`keywords`** — banka satırında bu kelimelerden biri geçerse cari önerilir ("PRLV SEPA URSSAF COTISATIONS" → URSSAF). Muhasebe programlarının "eşleşme etiketi"; öneri yine öneridir, onayı insan verir (motor: cari adayı yalnız kelimeyle puanlanır — tarihi ve tutarı yoktur).
- **`default_nature`** — cari konunca hareketin BOŞ türüne geçer ("URSSAF" → Sosyal güvenlik); konmuş tür ezilmez, paranın yönüne uymayan tür geçmez.
- **`name`** büyük/küçük harf duyarsız tekildir (`counterparty_name_key`).
- **Cari SİLİNMEZ, pasifleşir** — geçmiş hareketleri ve belgeleri ona bağlıdır.

## MoneyDocument (belge)

Resmî muhasebe sorduğunda hareketin dayanağı: fatura, fiş, bordro, sözleşme, dekont. **Belge para değildir:** fatura geldiğinde para henüz çıkmamıştır ama borç doğmuştur; ödeme sonra bir hareket olarak gelir ve bir BAĞLA (`money_allocation`, tutarıyla) belgeye bağlanır. Açık kalan saklanmaz, `money_document_balance` görünümünden türetilir (`amount − Σ aynı yönlü hareketin bağı + Σ ters yönlününki`); fazla ödemede eksiye düşer ve gizlenmez.

<!-- alanlar:money_document -->
| Kolon | Tip | Null | Varsayılan |
| --- | --- | --- | --- |
| `id` | uuid |  | `gen_random_uuid()` |
| `kind` | document_kind |  |  |
| `number` | text | • |  |
| `issued_on` | date |  |  |
| `counterparty_id` | uuid | • |  |
| `supplier_id` | uuid | • |  |
| `stock_intake_id` | uuid | • |  |
| `direction` | movement_direction |  |  |
| `nature` | text | • |  |
| `amount` | numeric(12, 2) |  |  |
| `vat_amount` | numeric(12, 2) | • |  |
| `currency` | currency |  | `'EUR'` |
| `file_key` | text | • |  |
| `tags` | text[] |  | `'{}'` |
| `note` | text | • |  |
| `created_at` | timestamptz |  | `now()` |
<!-- /alanlar -->

**Kararlar**

- **Satış faturaları burada değil:** bizim kestiğimiz fatura numarası siparişin üstünde (`order.invoice_no`, 12.7).
- **Stok alımının faturası mal kabule bağlanır** (`stock_intake_id`) ve ikinci bir borç DOĞURMAZ — tedarikçi borcu mal kabulden türemeye devam eder (12.3).
- **`direction`** hareketinkiyle aynı dilde: `out` = bizim ödeyeceğimiz, `in` = bize ödenecek.
- **`vat_amount`** belgede yoksa NULL; sıfır "KDV yok" demektir, "bilinmiyor" değil (CLAUDE §1).
- **`file_key`** — özel R2 kovası (`r2Keys.financeDocument`), public adresi yok: belgede karşı tarafın adı ve banka bilgisi yazar.
- **Karşı taraf** cari (`counterparty_id`) YA DA tedarikçi (`supplier_id`) — ikisi birden olmaz (`money_document_party`). Serbest metin `counterparty` kalktı (13.09 · ikinci karar): aynı ev sahibi iki yazımla iki kişi oluyordu.
- **`nature`** — belgenin türü. Ekstre satırı belgeye TAMAMEN bağlanınca türü ve karşı tarafı satıra geçer; "Ödemesini yaz" formu belgenin türüyle açılır.

## MoneyAllocation (belge bağı)

Hareket ↔ belge, TUTARIYLA (13.09 · ikinci karar, muhasebeci karşılaştırması). Bir havale birkaç faturayı, bir fatura birkaç ödemeyi kapatır; bir tur hareketin tek bir `document_id`si vardı ve tedarikçinin üç faturası tek havalede ödendiğinde havale üç faturaya bağlanamıyordu.

<!-- alanlar:money_allocation -->
| Kolon | Tip | Null | Varsayılan |
| --- | --- | --- | --- |
| `id` | uuid |  | `gen_random_uuid()` |
| `movement_id` | uuid |  |  |
| `document_id` | uuid |  |  |
| `amount` | numeric(12, 2) |  |  |
| `created_at` | timestamptz |  | `now()` |
<!-- /alanlar -->

**Kararlar**

- **Bağların toplamı hareketin tutarını AŞAMAZ** (`check_allocation_within_movement`; hareket satırı kilitlenir — aynı anda yazılan iki bağ ikisi de "yer var" görmesin). Belgenin tarafı serbesttir: fazla ödeme bir olgudur, açık kalan eksiye düşer.
- **Aynı hareket aynı belgeye bir kez bağlanır** (tekil çift): ikinci bağ, birincinin tutarını değiştirmek olurdu.
- **İki uçtan `cascade`:** hareket ya da belge silinirse bağ gider, öteki kalır. Bağ eklenip silinince hareketin izahı yeniden kurulur (`money_allocation_touch`).
- **Tutar verilmezse** kapı hareketin bağlanmamış kalanıyla belgenin açık kalanının KÜÇÜĞÜNÜ bağlar (`allocateToDocument`): 500 €'luk havale 360 €'luk faturayı kapatır, 140 € kuyrukta kalır.

## BankImportProfile (banka import şablonu)

Hesaba özeldir: her bankanın dosya düzeni farklıdır (işaretli tek tutar sütunu / ayrı borç-alacak, virgüllü ondalık, gün-ay sırası). Bir kez çıkarılır (yapay zekâ önerir, insan onaylar), sonraki dosyalarda otomatik uygulanır.

> **26.08'e kadar bu başlık dosyada İKİ KEZ vardı** — biri eski ve dar, biri güncel; ikisi de kendi
> "Alan" tablosunu taşıyordu ve okuyan hangisinin geçerli olduğunu bilemezdi. Güncel olan tutuldu.

<!-- alanlar:bank_import_profile -->
| Kolon | Tip | Null | Varsayılan |
| --- | --- | --- | --- |
| `id` | uuid |  | `gen_random_uuid()` |
| `account_id` | uuid |  |  |
| `name` | text |  |  |
| `amount_mode` | text |  |  |
| `mapping` | jsonb |  |  |
| `decimal_separator` | text |  | `','` |
| `date_format` | text |  | `'dmy'` |
| `created_at` | timestamptz |  | `now()` |
<!-- /alanlar -->

**Kararlar**

- **`mapping`** — hangi sütun hangi alan. **Sütun BAŞLIĞIYLA** tutulur, sırasıyla değil: banka dosyaya sütun eklediğinde sıra kayar, başlık kalır.
- **`name`** — hesap içinde benzersiz; bir hesabın birden çok dosya düzeni olabilir.
- **`amount_mode`** — dosya geleneği: işaretli tek tutar sütunu mu, ayrı borç–alacak mı. `text` + `check`, enum DEĞİL — küme bankadan bankaya büyür ve her yeni gelenek için migration yazmak istemiyoruz. *(Doküman 26.08'e kadar bunu `enum(...)` diye anlatıyordu; türetilmiş liste yanlışı gösterdi.)*

## BankImport (yükleme kaydı)

"Bu satır nereden geldi" sorusunun cevabı. Denetlenemeyen bir import korkutucudur: yanlış dosya yüklendiğinde neyin geri alınacağı bilinmelidir.

<!-- alanlar:bank_import -->
| Kolon | Tip | Null | Varsayılan |
| --- | --- | --- | --- |
| `id` | uuid |  | `gen_random_uuid()` |
| `account_id` | uuid |  |  |
| `profile_id` | uuid | • |  |
| `file_name` | text |  |  |
| `row_count` | int |  | `0` |
| `inserted_count` | int |  | `0` |
| `duplicate_count` | int |  | `0` |
| `created_at` | timestamptz |  | `now()` |
<!-- /alanlar -->

**Kararlar**

- **`profile_id`** — şablon silinse de yükleme kaydı kalır (`set null`): kaydın işi geçmişi anlatmak, şablonu değil.
- **`duplicate_count`** — zaten var olduğu için atlanan satır sayısı; **mükerrer korumasının görünür yüzü.** Sessizce atlasaydık operatör "dosyam neden eksik girdi" diye soramazdı.
