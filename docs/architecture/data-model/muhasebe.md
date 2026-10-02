# Veri modeli — Muhasebe yazılımı

> Muhasebe yazılımı (Pennylane) entegrasyonunun bizdeki tabloları; akış ve kararlar
> [`docs/feature/kasa-muhasebe.md`](../../feature/kasa-muhasebe.md) §8'de. Alan listeleri
> (`<!-- alanlar:… -->` bloğu) `pnpm docs:sync` ile migration'lardan üretilir, elle yazılmaz.

Banka hareketi Pennylane'den gelir, bizde izah edilir. Bu tablolar hangi hesabın Pennylane'den okunduğunu, okunan her hareketin son
hâlini ve değişiklik akışının kaldığı yeri tutar.

## PennylaneAccount (banka hesabı eşlemesi)

Banka hesabımız Pennylane'deki banka hesabına bağlanır; eşlenen hesabın hareketi Pennylane'den okunur.

<!-- alanlar:pennylane_account -->
| Kolon | Tip | Null | Varsayılan |
| --- | --- | --- | --- |
| `account_id` | uuid |  |  |
| `pennylane_bank_account_id` | bigint |  |  |
| `pennylane_name` | text |  |  |
| `listed_at` | timestamptz | • |  |
| `created_at` | timestamptz |  | `now()` |
<!-- /alanlar -->

**Kararlar**

- **`listed_at`** — canlıya geçiş gününden itibaren liste okundu mu; boşsa sonraki tur listeyi baştan okur (ilk eşleme, gün değişikliği,
  akışın kapsamadığı kesinti).
- **`pennylane_name`** — eşleme anında yazılır ki kart her açılışta Pennylane'e sormasın.

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
