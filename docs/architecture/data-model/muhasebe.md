# Veri modeli — Muhasebe yazılımı

> Muhasebe yazılımı (Pennylane) entegrasyonunun bizdeki tabloları; akış ve kararlar
> [`docs/feature/kasa-muhasebe.md`](../../feature/kasa-muhasebe.md) §8'de. Alan listeleri
> (`<!-- alanlar:… -->` bloğu) `pnpm docs:sync` ile migration'lardan üretilir, elle yazılmaz.

Banka hareketi Pennylane'den gelir, bizde izah edilir; alış belgesi bizde girilir, Pennylane'e bizden yüklenir. Bu tablolar
Pennylane'deki banka hesaplarını ve eşlemesini, okunan her hareketin son hâlini, değişiklik akışının kaldığı yeri, belgenin karşı
tarafının Pennylane'deki tedarikçisini, yazım kuyruğunu, yüklenen belgenin aynasını ve Pennylane'de çözülen bağlarımızı tutar.

## PennylaneBankAccount (Pennylane banka hesabı ve eşleme)

Pennylane'deki banka hesabı; banka hesabımız en fazla birine eşlenir ve eşlenen hesabın hareketi Pennylane'den okunur.

<!-- alanlar:pennylane_bank_account -->
| Kolon | Tip | Null | Varsayılan |
| --- | --- | --- | --- |
| `pennylane_id` | bigint |  |  |
| `name` | text |  |  |
| `seen_at` | timestamptz |  |  |
| `account_id` | uuid | • |  |
| `mapped_at` | timestamptz | • |  |
| `listed_at` | timestamptz | • |  |
<!-- /alanlar -->

**Kararlar**

- **Liste backend'den** — Pennylane anahtarı yalnız backend'dedir; eşitleme turu şirketi ve banka hesaplarını okuma kapalıyken de
  okur, kurulum kartı eşleme seçeneklerini bu tablodan alır.
- **`seen_at`** — son okunan listede görüldüğü an. Listeden düşen hesap eşleme seçeneklerinden çıkar; eşlenmişse okunmaz, çünkü boş
  gelen hareket listesi bütün satırlarını Pennylane'de silinmiş sayardı. Kart onu işaretler.
- **`account_id`, `mapped_at`** — eşleme; ikisi birlikte dolu ya da boştur. Hareket gelmiyor sayacı eşleme gününden başlar. Başka
  hesabımıza eşli Pennylane hesabı eşlenmez; hesabımızın eşlemesi taşınınca eskisi boşalır.
- **`listed_at`** — canlıya geçiş gününden itibaren liste okundu mu; boşsa sonraki tur listeyi baştan okur (ilk eşleme, gün değişikliği,
  akışın kapsamadığı kesinti). Eşlenmemiş satırda boştur.
- **Dosya satırıyla çakışma** — hesaba dosyadan yüklenen son satır canlıya geçiş gününe ya da sonrasına düşüyorsa hesap eşlenmez ve gün o
  satıra ya da öncesine alınmaz; Pennylane aynı banka satırını ikinci kez yazardı. Eşlenen hesaba o günden sonrası için dosya da yüklenmez.

## PennylaneTransaction (hareket aynası)

Pennylane hareketinin son okunan hâli ve bizdeki banka satırı. Değişikliği ayırt eden taban budur, çünkü izahlı satırı operatör
değiştirmiş olabilir.

<!-- alanlar:pennylane_transaction -->
| Kolon | Tip | Null | Varsayılan |
| --- | --- | --- | --- |
| `pennylane_id` | bigint |  |  |
| `account_id` | uuid |  |  |
| `movement_id` | uuid | • |  |
| `value_date` | date |  |  |
| `direction` | movement_direction |  |  |
| `amount` | numeric(12, 2) |  |  |
| `label` | text | • |  |
| `removed` | boolean |  | `false` |
| `category_business` | business | • |  |
| `read_at` | timestamptz |  | `now()` |
<!-- /alanlar -->

**Kararlar**

- **`movement_id`** — banka satırı `source = bank_import`, tip `misc` olarak yazılır, kimliği `import_fingerprint = pennylane:<kimlik>`.
  Sıfır tutarlı hareket yazılmaz; Pennylane'de silinen izahsız satır silinir ve bu alan boşalır.
- **`removed`** — Pennylane'de silindi ya da arşivlendi. Hareket geri gelirse silinmiş satır yeniden yazılır.
- **`category_business`** — işleme kategorisi en son yazılan iş; boşsa tur işlemin kategorisini hareketin işinden yazar. Hareketin işi
  değişince ya da ayna başka harekete bağlanınca boşalır; Pennylane'de elle konan kategori, hareketin işi değişmedikçe ezilmez. Yazım
  eşleşme kuyruğundan ayrıdır, çünkü yeni satırı kuyruğa düşürmek Pennylane'deki eşleşmenin benimsenmesini atlatırdı.
- Planı motor verir (`planBankFeed`): izahsız satır Pennylane'in hâline çekilir; izahlı satıra dokunulmaz, parası (tutar, gün, yön)
  değişirse ya da hareket silinirse muhasebe uyarılır (`bank_feed_changed`), yalnız açıklaması değişirse ayna tazelenir.

## PennylaneCursor (değişiklik akışı)

Akışın son işlenen olayının anı; imleç tur bitince düşer, sonraki tur bu andan sorar.

<!-- alanlar:pennylane_cursor -->
| Kolon | Tip | Null | Varsayılan |
| --- | --- | --- | --- |
| `stream` | text |  |  |
| `processed_at` | timestamptz |  |  |
| `updated_at` | timestamptz |  | `now()` |
<!-- /alanlar -->

**Kararlar**

- **`processed_at`** — aynı an iki kez okunsa da sonuç değişmez, çünkü her olayda kaydın son hâli Pennylane'den okunur. Akış dört
  haftayı tutar; bu an 27 günden eskiyse liste baştan okunur ve listede olmayan ama aynada duran hareket silinmiş sayılır.
- **`stream`** — `transactions` banka satırını, `supplier_invoices` faturalarımızın Pennylane'deki açık kalanını tazeler; fatura akışının
  kapsamadığı boşlukta bütün faturalarımızın kalanı yeniden okunur.

## PennylaneSupplier (tedarikçi aynası)

Belgenin karşı tarafının (tedarikçi ya da cari) Pennylane'deki tedarikçisi.

<!-- alanlar:pennylane_supplier -->
| Kolon | Tip | Null | Varsayılan |
| --- | --- | --- | --- |
| `pennylane_id` | bigint |  |  |
| `supplier_id` | uuid | • |  |
| `counterparty_id` | uuid | • |  |
| `created_at` | timestamptz |  | `now()` |
<!-- /alanlar -->

**Kararlar**

- **Dış referans** — `sup:<kimlik>` ya da `cp:<kimlik>`; Pennylane'de tekil olduğu için ayna kaybolsa da tedarikçi ikinci kez açılmaz,
  aramayla bulunur.
- **Aynı firmanın elle açılmış kaydı** — Pennylane şirketi toptan operasyonuyla ortaktır ve Pennylane aynı firmanın ikinci kaydını
  reddetmez; tedarikçi açılmadan önce KDV numarası, yoksa adı tutan kayıt aranır ve bağlanır. Bir Pennylane tedarikçisi bizde tek
  karşı tarafa bağlıdır.

## PennylaneQueue (yazım kuyruğu)

Pennylane'e yazılacak alış belgesi ya da eşleşmesi yazılacak banka satırı; satırın tek hedefi vardır. Ortak kuyruk satırıdır (kasa
kuyruğuyla aynı yeniden deneme kuralı).

<!-- alanlar:pennylane_queue -->
| Kolon | Tip | Null | Varsayılan |
| --- | --- | --- | --- |
| `id` | uuid |  | `gen_random_uuid()` |
| `document_id` | uuid | • |  |
| `movement_id` | uuid | • |  |
| `marked_at` | timestamptz |  | `now()` |
| `attempts` | int |  | `0` |
| `next_attempt_at` | timestamptz |  | `now()` |
| `last_error` | text | • |  |
<!-- /alanlar -->

**Kararlar**

- **Tetikleyici** — ödeyeceğimiz fatura ya da fiş yazılınca ya da değişince işaretlenir, değişiklikten önce alış belgesiyse de;
  yüklenmiş belgenin bağı değişince de işaretlenir (ödeme durumu). Yazıp yazmamak işleyenin kararıdır (`pennylaneDocumentScope`).
- **Hareket** — Pennylane'den gelen banka satırının bağı eklenince, silinince ya da "zaten yazmıştım" birleşmesiyle taşınınca, bağlı
  belgesi Pennylane'e yüklenince de işaretlenir; taşınan bağın iki yakası da işaretlenir, aynası olmayan hareket kuyruğa girmez. Kuyrukta bekleyen hareketin Pennylane'deki eşleşmesi okunmaz, önce bizimki yazılır.

## PennylaneDocument (belge aynası)

Pennylane'deki fatura ve ona en son yazılan taslak.

<!-- alanlar:pennylane_document -->
| Kolon | Tip | Null | Varsayılan |
| --- | --- | --- | --- |
| `document_id` | uuid |  |  |
| `pennylane_invoice_id` | bigint |  |  |
| `written` | jsonb |  |  |
| `payment_status` | text | • |  |
| `pennylane_open` | numeric(12, 2) | • |  |
| `category_id` | bigint | • |  |
| `uploaded_at` | timestamptz |  | `now()` |
| `updated_at` | timestamptz |  | `now()` |
<!-- /alanlar -->

**Kararlar**

- **`written`** — Pennylane'e en son yazılan taslak (`PennylaneInvoiceDraft`); belge değişince fark buna göre çıkar ve güncellenir.
- **`payment_status`** — nakitle kapanan belgenin işareti; bankadan ödenen belge Pennylane'de eşleşmeyle kapanır, işaret almaz.
- **`pennylane_open`** — faturanın Pennylane'deki açık kalanı; yüklemeden, güncellemeden, eşleşmeden sonra ve fatura değişiklik akışından
  okunur, okunamazsa `null`.
  Pennylane kısmi ödemeyi faturaların açılma sırasıyla dağıttığı için bizimkinden ayrılabilir; ayrılan belge "Pennylane'de farklı"dır.
- **`category_id`** — faturaya en son yazılan analitik kategori; belgenin işinin ayarından gelir (`pennylane_category_lezzet` ·
  `pennylane_category_qualite`, varsayılanı işin adı). Belgenin işi değişince belge kuyruğa düşer; ayar değişince belge bir sonraki
  yazımında yeni kategoriyi alır. Aynada aynı kategori duruyorsa Pennylane'e gidilmez, orada elle yapılan
  değişiklik ezilmez; faturanın öteki eksenlerdeki kategorisi korunur.
- **Silme** — yüklenmiş belge silinemez (`restrict`), çünkü Pennylane'deki faturası bağını kaybederdi.

## PennylaneMatchRemoved (Pennylane'de çözülen bağ)

Bizde duran ama Pennylane'de çözülen bağ.

<!-- alanlar:pennylane_match_removed -->
| Kolon | Tip | Null | Varsayılan |
| --- | --- | --- | --- |
| `allocation_id` | uuid |  |  |
| `removed_at` | timestamptz |  | `now()` |
<!-- /alanlar -->

**Kararlar**

- **Silinmez, yeniden yazılmaz** — bağ bizde kalır ve Pennylane'e yeniden kurulmaz; muhasebeye bildirim gider (`pennylane_match_removed`),
  karar bizim ekrandan verilir. Bağ Pennylane'de yeniden kurulursa satır silinir, bağ bizde silinince de gider (`cascade`).
