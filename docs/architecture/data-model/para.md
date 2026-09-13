# Veri Modeli — Para ve Ön Muhasebe

Hesaplar, para hareketleri, etiket sözlüğü, belgeler, banka import şablonu.

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
| `tags` | text[] |  | `'{}'` |
| `document_id` | uuid | • |  |
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
| `explained` | boolean |  | *üretilmiş* |
<!-- /alanlar -->

**Kararlar**

- **`amount`** — İŞARETSİZ tutulur, yön `direction`tadır. Uygulamadaki adı `amountCents` ve birimi **cent** (`STACK §8`); `account_movement` görünümü işaretli hâlini `signed_amount` diye türetir (app: `signedAmountCents`).
- **`tags`** (13.09 · kullanıcı kararı) — sınıflandırmanın TEK mekanizması; eski `category` (serbest metin, tek değer) kalktı. Sözlükten (`movement_tag.slug`) birden çok: `maas` + `ortak:ahmet` aynı hareketin iki gerçeğidir; **ortaklar arası hesap bu etiketten çıkar**, ayrı bir ortak varlığı yoktur. Tanınmayan etiketi tetikleyici reddeder.
- **`document_id`** — dayanak belge (fatura, fiş, bordro…). Belge silinirse bağ düşer, hareket kalır: para hareket etmiştir, belgenin akıbeti onu geri almaz.
- **`explained`** — TÜRETİLMİŞ kolon, yazılmaz: bir işe bağ (sipariş, mal kabul, tedarikçi), belge, etiket ya da transfer varsa `true`. Yoksa hareket "izah edilmemiş" kuyruğundadır; kayıt **engellenmez** (banka satırı ham gelir, sonra izah edilir). Ekranın sayacı ve noktası bunu okur, `reconciled`i değil.
- **`reconciled`** — banka ekstresiyle eşleşme; **yalnız `source = bank_import` satırında anlamlı.** 13.09'a kadar ekran her satırda bunu "eşleşti/eşleşmedi" diye okuyordu ve sistemin yazdığı her tahsilat eşleşmemiş görünüyordu (yerelde 28 satırın 5'i banka satırıydı).
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

Her banka satırının bir karşılığı olmalı. Kuyruk satıra şu hedefleri önerir ya da seçtirir: sipariş tahsilatı (giriş), müşteri iadesi (çıkış; puanlanmaz, listeden seçilir — iade borcu kalem ister), açık belge (belgenin yönü), mal kabul — tedarikçi borcu (çıkış, `stock_intake_balance`), transferin öteki yakası (`counterpart_movement_id`), başka hesaba transfer (uç yok; satırın kendisi transfer olur ve aynalanır), o hesaba **ekstreden önce elle ya da sistemce yazılmış hareket**, ve ad koyma (gider / sermaye, etiketle). Satır **yerinde güncellenir**, silinip yeniden yazılmaz: parmak izi mükerrer korumasının dayanağıdır.

**Banka hesabına elle de yazılır; ekstre gelince ekstre satırı elle yazılanı yutar** (kullanıcı kararı 13.09, seçenek "elle de yazılır, sonra birleşir"): "kira ödendi" o gün elle girilir, ekstre gelince aynı para bir kez daha düşer ve operatör satırı "zaten yazılmış hareket"e bağlar. `absorb_provisional_movement` tek transaction'da elle yazılanın bağlarını (tip, etiketler, belge, sipariş, mal kabul, tedarikçi, karşı hesap, yazım kimliği, künye) ekstre satırına geçirir ve elle yazılanı **siler**; izi ekstre satırının `meta.absorbed` künyesinde durur (kimlik, kaynak, tutar, tarih, açıklama). Ekstre haklıdır: tutar farklıysa sipariş cache'i yeniden kurulur. Reddedilen seçenek "bankaya elle yazılmaz, ekstre getirir"di — bakiye ekstre yüklenene kadar eski kalırdı.

### Stripe: brüt tahsilat · ücret · payout (12.14 · kullanıcı kararı 13.09)

Stripe bir hesaptır ve üç satır tutar: **tahsilat brüt** (`order_payment`, künye `providerRef`), **ücret ödeme başına** (`expense` + `stripe-ucreti`, yazım kimliği `stripe-fee:<niyet>`; sipariş bağı künyede — `order_id` yazılsaydı siparişin tahsilat toplamı kayardı) ve **payout** (`transfer`, Stripe → banka, tutar payout'un NET'i, değer tarihi varış günü, yazım kimliği `stripe-payout:<payout>`, künyede toplamlar ve kalemler). Ödeme dışı Stripe ücretleri (`stripe_fee`) payout içeriğinden düşer. Banka hesabı `stripe_payout_account_id` ayarıdır. Yazım kimliği tekil olduğu için tekrar gelen olay ikinci satır doğurmaz (`insertOnce`). Ekstre payout'u getirince satır transferin karşı satırı olur (`counterpart_movement_id`).

### Ortak cari hesabı (`account.type = partner`, 13.09)

Ortağın cebinden ödenen şirket gideri ve şirketin ortak adına yaptığı ödeme şirket hesaplarından geçmez; tutunacakları yer ortağın cari hesabıdır — yeni bir varlık değil, yeni bir hesap türü. Bakiye işareti anlatır: **eksi = şirket ortağa borçlu** (ortak cebinden ödedi), **artı = ortak şirkete borçlu** (şirket ortak adına ödedi; deftere banka→cari transferi yazılır). Sermaye koyma cari DEĞİLDİR: bankaya `capital` girer ve `ortak:<ad>` etiketini taşır.

## MovementTag (etiket sözlüğü)

Hareketin ve belgenin sınıflandırma kelimeleri; yönetilen liste (operatör ekler, yazım tek kalır). Varsayılan satırlar migration'da referans veri olarak durur (`0013`/`0028` deseni); ortak etiketleri (`ortak:<ad>`) işletmenindir, seed ya da ekran ekler.

<!-- alanlar:movement_tag -->
| Kolon | Tip | Null | Varsayılan |
| --- | --- | --- | --- |
| `slug` | text |  |  |
| `label` | text |  |  |
| `is_active` | boolean |  | `true` |
| `created_at` | timestamptz |  | `now()` |
<!-- /alanlar -->

**Kararlar**

- **`slug`** anahtardır, `id` değil: ASCII, küçük harf, `ortak:ahmet` gibi iki nokta ayracı serbest (`check`). Hareket dizide bu slug'ı taşır; okunur ad `label`.
- **Etiket SİLİNMEZ, pasifleşir** (`is_active`): eski hareketler onu taşımaya devam eder — hesabın kapanmasıyla aynı gerekçe.

## MoneyDocument (belge)

Resmî muhasebe sorduğunda hareketin dayanağı: fatura, fiş, bordro, sözleşme, dekont. **Belge para değildir:** fatura geldiğinde para henüz çıkmamıştır ama borç doğmuştur; ödeme sonra bir hareket olarak gelir ve `money_movement.document_id` ile belgeye bağlanır. Açık kalan saklanmaz, `money_document_balance` görünümünden türetilir (`amount − Σ aynı yönlü bağlı hareket + Σ ters yönlü`).

<!-- alanlar:money_document -->
| Kolon | Tip | Null | Varsayılan |
| --- | --- | --- | --- |
| `id` | uuid |  | `gen_random_uuid()` |
| `kind` | document_kind |  |  |
| `number` | text | • |  |
| `issued_on` | date |  |  |
| `counterparty` | text | • |  |
| `supplier_id` | uuid | • |  |
| `stock_intake_id` | uuid | • |  |
| `direction` | movement_direction |  |  |
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
