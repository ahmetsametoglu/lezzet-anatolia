# Veri modeli — Sertifikalı kasa

> Sertifikalı kasa (Hiboutik) entegrasyonunun bizdeki tabloları; akış ve kararlar
> [`docs/feature/kasa-muhasebe.md`](../../feature/kasa-muhasebe.md) §7'de. Alan listeleri
> (`<!-- alanlar:… -->` bloğu) `pnpm docs:sync` ile migration'lardan üretilir, elle yazılmaz.

Kasaya sipariş başına **durum farkı** yazılır: siparişin ücretlenen kalemleri ve yönteme göre parası kasaya yazılmış olanla
karşılaştırılır, yalnız fark gider. Bu tablolar o karşılaştırmanın tabanıdır (kasa aynası) ve yazılacak işi taşır (kuyruk).

## RegisterStore (mağaza eşlemesi)

Kasa yazılımında mağaza elle açılır; tesis deposu o mağazaya ve fiziksel çekmecesinin nakit hesabına bağlanır.

<!-- alanlar:register_store -->
| Kolon | Tip | Null | Varsayılan |
| --- | --- | --- | --- |
| `warehouse_id` | uuid |  |  |
| `external_store_id` | int |  |  |
| `cash_account_id` | uuid |  |  |
| `created_at` | timestamptz |  | `now()` |
<!-- /alanlar -->

**Kararlar**

- **`warehouse_id`** — yalnız tesis eşlenir; araç satışı aracın ana deposunun mağazasına yazılır.
- **`cash_account_id`** — bu hesabın fiş dışı nakit hareketleri (bankaya yatırma, kasadan gider, kurye farkı) kasaya giriş/çıkış olarak yazılır ki kasa sayımı çekmeceyle tutsun.

## RegisterProduct (ürün eşlemesi)

Kasanın dış referansı 20 karakterde kesildiği için varyant kimliği orada taşınamaz; eşleme burada durur.

<!-- alanlar:register_product -->
| Kolon | Tip | Null | Varsayılan |
| --- | --- | --- | --- |
| `id` | uuid |  | `gen_random_uuid()` |
| `kind` | register_line_kind |  |  |
| `variant_id` | uuid | • |  |
| `external_product_id` | int |  |  |
| `name` | text |  |  |
| `vat_rate` | numeric(4, 2) |  |  |
| `price` | numeric(10, 2) |  |  |
| `created_at` | timestamptz |  | `now()` |
| `updated_at` | timestamptz |  | `now()` |
<!-- /alanlar -->

**Kararlar**

- **`kind`** — varyant kalemi ya da kargo. Kargo oran başına ayrı üründür; kalemde oran değiştirmek her satıra bir çağrı eklerdi.
- **`name` · `vat_rate` · `price`** — kasaya son yazılan değerler; değişince kasadaki ürün güncellenir. Katalog fiyatı B2C liste fiyatıdır, çünkü kasa kalem indirimini "katalog fiyatı − satış fiyatı" olarak kendisi hesaplıyor.

## RegisterTicket (fiş)

Siparişin kasadaki bir satışı. Kalem farkı doğduğunda yeni fiş açılır; iade eksi kalemli fiştir.

<!-- alanlar:register_ticket -->
| Kolon | Tip | Null | Varsayılan |
| --- | --- | --- | --- |
| `id` | uuid |  | `gen_random_uuid()` |
| `order_id` | uuid |  |  |
| `seq` | int |  |  |
| `warehouse_id` | uuid |  |  |
| `ext_ref` | text |  |  |
| `external_sale_id` | int | • |  |
| `unique_sale_id` | text | • |  |
| `receipt_url` | text | • |  |
| `status` | register_write_status |  | `'writing'` |
| `written_at` | timestamptz | • |  |
| `created_at` | timestamptz |  | `now()` |
<!-- /alanlar -->

**Kararlar**

- **`ext_ref`** — `<sipariş referansı>-<sıra>`, kasanın 25 karakter sınırında. Kasa aramayı "içerir" biçiminde yaptığı için eşleşme okunarak doğrulanır.
- **`status`** — `writing` kasaya çağrı başladı ama sonucu aynaya geçmedi demektir; yarıda kalan fiş bu satırdan tamamlanır.
- **`unique_sale_id` · `receipt_url`** — kasanın günlük sıra numarası ve dijital fiş bağlantısı; sipariş detayı bunları gösterir.

## RegisterTicketLine (fiş kalemi)

<!-- alanlar:register_ticket_line -->
| Kolon | Tip | Null | Varsayılan |
| --- | --- | --- | --- |
| `id` | uuid |  | `gen_random_uuid()` |
| `ticket_id` | uuid |  |  |
| `kind` | register_line_kind |  |  |
| `order_item_id` | uuid | • |  |
| `qty` | int |  |  |
| `amount` | numeric(10, 2) |  |  |
| `vat_rate` | numeric(4, 2) |  |  |
| `external_line_ids` | int[] |  | `'{}'` |
| `created_at` | timestamptz |  | `now()` |
<!-- /alanlar -->

**Kararlar**

- **`qty` · `amount`** — işaretli ve kanalın tabanında. Sonraki fişin farkı kaynak başına (sipariş kalemi ya da kargo oranı) bu toplamlardan çıkar.
- **`external_line_ids`** — kasa birim fiyatı kuruşa yuvarladığı için kalem gerekirse iki kasa satırına bölünür.

## RegisterPayment (ödeme satırı)

<!-- alanlar:register_payment -->
| Kolon | Tip | Null | Varsayılan |
| --- | --- | --- | --- |
| `id` | uuid |  | `gen_random_uuid()` |
| `ticket_id` | uuid |  |  |
| `method` | payment_method |  |  |
| `amount` | numeric(10, 2) |  |  |
| `movement_id` | uuid |  |  |
| `external_payment_id` | int | • |  |
| `external_cash_flow_id` | int | • |  |
| `status` | register_write_status |  | `'writing'` |
| `created_at` | timestamptz |  | `now()` |
| `written_at` | timestamptz | • |  |
<!-- /alanlar -->

**Kararlar**

- **`movement_id`** — FK yok: hareket silinse de satır onu anar. Kasadaki satır değişmediği için bir hareketin birden çok satırı olabilir: tutarı, yöntemi ya da siparişi değişen hareketin farkı yeni satırdır, silinen hareketin neti ters satırla geri alınır; eşdeğer yeni hareket gelirse satırlar ona bağlanır.
- **`external_cash_flow_id`** — gün kapanmışsa kasa ödemeyi satışın nakit akışı olarak kaydeder; numara `external_payment_id` yerine burada durur.
- **`written_at`** — gün sonu mutabakatı satırı yazıldığı güne sayar; açılış anı yeniden denemede günler öncesinde kalabilir.

## RegisterCashOp (kasa hareketi)

Fiş olmayan nakit hareketinin kasadaki karşılığı (giriş ya da çıkış).

<!-- alanlar:register_cash_op -->
| Kolon | Tip | Null | Varsayılan |
| --- | --- | --- | --- |
| `id` | uuid |  | `gen_random_uuid()` |
| `warehouse_id` | uuid |  |  |
| `movement_id` | uuid |  |  |
| `reversal_of` | uuid | • |  |
| `direction` | movement_direction |  |  |
| `amount` | numeric(10, 2) |  |  |
| `label` | text |  |  |
| `external_till_id` | int | • |  |
| `status` | register_write_status |  | `'writing'` |
| `created_at` | timestamptz |  | `now()` |
| `written_at` | timestamptz | • |  |
<!-- /alanlar -->

**Kararlar**

- **`label`** — kasa dökümünde görünen açıklama, kayıt başına tekil; yarıda kalan yazım kasadaki satırı bununla bulur.
- **`reversal_of`** — kasadaki kayıt değişmez: etkisi değişen ya da silinen hareketin yürürlükteki kaydı bu sütunla ters çevrilir, yeni etkisi varsa yeni kayıt yazılır. Bir kayıt en çok bir kez ters çevrilir.

## RegisterQueue (kuyruk)

Satır "bu siparişi ya da bu nakit hareketini yeniden eşitle" demektir. `money_movement` tetikleyicisi yazar, para hangi yoldan yazılırsa yazılsın kuyruğa düşer; fişi olan siparişi kalem ve durum değişikliği de işaretler, çünkü iade para doğurmayabilir.

<!-- alanlar:register_queue -->
| Kolon | Tip | Null | Varsayılan |
| --- | --- | --- | --- |
| `id` | uuid |  | `gen_random_uuid()` |
| `order_id` | uuid | • |  |
| `movement_id` | uuid | • |  |
| `marked_at` | timestamptz |  | `now()` |
| `attempts` | int |  | `0` |
| `next_attempt_at` | timestamptz |  | `now()` |
| `last_error` | text | • |  |
<!-- /alanlar -->

**Kararlar**

- **`marked_at`** — işleyen satırı yalnız bu değer değişmediyse siler; işlem sürerken gelen yeni para satırı yeniden işaretler ve kaybolmaz.
- **`movement_id`** — FK yok: silinen hareketin de kasadaki karşılığı geri alınır.
