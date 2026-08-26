# Veri Modeli — Para ve Ön Muhasebe

Hesaplar, para hareketleri, banka import şablonu.

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
| `category` | text | • |  |
| `meta` | jsonb | • |  |
| `counter_account_id` | uuid | • |  |
| `order_id` | uuid | • |  |
| `stock_intake_id` | uuid | • |  |
| `supplier_id` | uuid | • |  |
| `value_date` | date |  | `current_date` |
| `description` | text | • |  |
| `source` | movement_source |  | `'manual'` |
| `reconciled` | boolean |  | `false` |
| `import_fingerprint` | text | • |  |
| `bank_import_id` | uuid | • |  |
| `created_at` | timestamptz |  | `now()` |
<!-- /alanlar -->

**Kararlar**

- **`amount`** — İŞARETSİZ tutulur, yön `direction`tadır. Uygulamadaki adı `amountCents` ve birimi **cent** (`STACK §8`); `account_movement` görünümü işaretli hâlini `signed_amount` diye türetir (app: `signedAmountCents`).
- **`meta`** — ek etiket. Reklam giderinde `{campaign}` taşır: kampanya gideri ↔ ciro eşleşmesi (gerçek ROI) bu alandan çıkar.
- **`counter_account_id`** — transferde karşı hesap (nakit→banka, Stripe→banka).
- **`import_fingerprint`** — mükerrer koruması; aşağıdaki bölüme bak.

### Mükerrer koruması (`import_fingerprint`)

Bankalar satır kimliği vermez, kimlik ÜRETİLİR: hesap + değer tarihi + tutar + yön + sadeleşmiş açıklama + **tekrar sırası**.

Sıra şart: aynı gün çekilen iki ayrı 20 € gerçekten iki harekettir ve naif bir özet birini yutardı; dosya yeniden yüklendiğinde ise her satır kendi eşiyle çakışır ve hiçbiri tekrar yazılmaz.

Tekil indeks kısmi DEĞİLDİR (`on conflict` kısmi indeksi hedefleyemez); NULL'lar tekil karşılaştırmada eşit sayılmadığı için elle girilen hareketler kısıta hiç takılmaz.

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
