# Veri modeli — Muhasebe yazılımı

> Muhasebe yazılımı (Pennylane) entegrasyonunun bizdeki tabloları; akış ve kararlar
> [`docs/feature/kasa-muhasebe.md`](../../feature/kasa-muhasebe.md) §8'de. Alan listeleri
> (`<!-- alanlar:… -->` bloğu) `pnpm docs:sync` ile migration'lardan üretilir, elle yazılmaz.

Banka hareketi Pennylane'den gelir, bizde izah edilir. Bu tablolar Pennylane'deki banka hesaplarını ve hangisinin hangi hesabımıza
eşlendiğini, okunan her hareketin son hâlini ve değişiklik akışının kaldığı yeri tutar.

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
| `read_at` | timestamptz |  | `now()` |
<!-- /alanlar -->

**Kararlar**

- **`movement_id`** — banka satırı `source = bank_import`, tip `misc` olarak yazılır, kimliği `import_fingerprint = pennylane:<kimlik>`.
  Sıfır tutarlı hareket yazılmaz; Pennylane'de silinen izahsız satır silinir ve bu alan boşalır.
- **`removed`** — Pennylane'de silindi ya da arşivlendi. Hareket geri gelirse silinmiş satır yeniden yazılır.
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

- **`processed_at`** — aynı an iki kez okunsa da sonuç değişmez, çünkü her olayda hareketin son hâli Pennylane'den okunur. Akış dört
  haftayı tutar; bu an 27 günden eskiyse liste baştan okunur ve listede olmayan ama aynada duran hareket silinmiş sayılır.
