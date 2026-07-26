# Veri Modeli — Stok ve Tedarik

Parti, rezervasyon, düzeltme, sıcaklık; tedarikçi ve satın alma zinciri.

> Bu dosya `../DATA_MODEL.md`'nin parçasıdır. Ortak ilkeler (çok dilli alanlar, türetme ilkesi, enum listesi, kalıcı kararlar) ana dosyadadır; **karar oraya, alan buraya** yazılır.

---

## Stock (stok partisi)

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| variant_id | uuid | stok varyant seviyesinde |
| physical_qty | number | fiili |
| dlc | date | partinin son tarihi (tipi `Product.date_type`) |
| lot_number | string \| null | tedarikçinin lot numarası — geri çağırma (rappel) eşleşmesi; girişte istenir |
| purchase_price | number \| null | **birim (paket) başına** alış maliyeti — kâr/marj için; toptan alınıp paketlenirse giriş paket adediyle yapılır (ör. 1kg → 10×100gr), maliyet pakete bölünür |
| intake_id | uuid \| null | bağlı stok girişi/satın alma (bkz. `StockIntake`) |
| offer_price | number \| null | partiye bağlı indirimli teklif fiyatı; doluysa bu parti indirimli satışta (bkz. `DOMAIN.md §5`) |
| location | string \| null | depo konumu |

Ayrılmış miktar **saklanmaz** — aktif `Reservation` satırlarından türetilir. `available = Σ physical − Σ aktif rezervasyon` (bkz. `DOMAIN.md §4`).
Kalan raf ömrü % = (dlc − bugün) ÷ `Product.shelf_life_days` — türetilir; yaklaşan-son-tarih ve MLOR kararları buna göre.

## Reservation (rezervasyon)

Her ayırma bir satırdır; "ayrılan toplam" bu satırlardan **türetilir** (sayaç tutulmaz — kayarsa izi bulunamaz). Kurallar: `DOMAIN.md §4`.

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| order_id | uuid | |
| variant_id | uuid | rezervasyon varyant-toplamı seviyesinde |
| stock_id | uuid \| null | **yalnız** partiye bağlı teklif satırında dolu (batch-pinned, bkz. `DOMAIN.md §5`); normalde null |
| qty | number | |
| expires_at | timestamptz \| null | online checkout TTL'i; kapıda/vadeli rezervasyonda null (süresiz, sipariş kapatır) |
| created_at | timestamptz | |

Süresi dolan satır cron'la silinir/pasifleşir; teslim/iptalde sipariş kapanışıyla düşer. Atomik "ayır" işlemi tek koşullu sorguda çalışır (`available >= qty` sağlanıyorsa satır yaz).

## StockAdjustment (imha / fire / sayım düzeltmesi)

Stok azalışının satış dışı her sebebi kayıt altına alınır — "bu üründen yılda ne kadar çöpe attım" buradan görünür (bkz. `DOMAIN.md §12`).

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| stock_id | uuid | hangi parti |
| qty | number | düşülen adet |
| reason | enum(`expired`,`damaged`,`count_diff`,`lost`) | DLC imhası / hasar / sayım farkı / kayıp |
| unit_cost | number \| null | partinin alış fiyatı (snapshot) — fire maliyeti |
| note | string \| null | teslim-sonrası iade restoku gibi istisnalarda sebep |
| created_by / created_at | uuid / timestamptz | |

## TemperatureLog (sıcaklık kaydı)

Hijyen denetiminin ilk istediği veri; günde bir-iki **elle** giriş yeter (sensör entegrasyonu yok).

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| location | string | dolap adı / araç |
| temperature_c | number | |
| recorded_by / recorded_at | uuid / timestamptz | |

## Supplier (tedarikçi)

Müşteri kartının simetriği (bkz. `DOMAIN.md §16`). **Tedarikçiye borç türetilir**, saklanmaz: Σ stok girişleri − Σ tedarikçiye ödemeler (`MoneyMovement.supplier_id`).

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| name | string | |
| contact | jsonb \| null | telefon/e-posta/adres |
| vat_number | string \| null | tedarikçinin vergi no'su (muhasebe eşleşmesi) |
| payment_term_days | number \| null | bize tanıdığı vade (gün); null = peşin |
| note | string \| null | |
| is_active | boolean | |

## SupplierProduct (ürün–tedarikçi eşlemesi)

Tedarik siparişi **tedarikçinin diliyle** yazılabilsin diye: bizim varyantımız ↔ onların kodu. Bir varyantın birden çok tedarikçisi olabilir (alternatif kaynak).

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| supplier_id | uuid | |
| variant_id | uuid | |
| supplier_code | string | tedarikçinin ürün/sipariş kodu |
| name_at_supplier | string \| null | üründeki adı (farklıysa) |
| pack_qty | number \| null | koli içi adet (sipariş koliyle verilirse çeviri) |
| last_purchase_price | number \| null | son alış (girişte otomatik güncellenir) — "geçen sefer kaçtı" |
| is_preferred | boolean | varsayılan tedarikçi işareti |

## PurchaseOrder (tedarik siparişi)

Taslak → gönderildi → mal kabulde kapanır (bkz. `DOMAIN.md §16`). Sistem **göndermez** — temiz liste/PDF üretir, gönderim insana aittir.

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| supplier_id | uuid | |
| status | enum(`draft`,`sent`,`received`,`cancelled`) | |
| sent_at | timestamptz \| null | |
| note | string \| null | |
| created_at | timestamptz | |

## PurchaseOrderItem (tedarik siparişi kalemi)

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| purchase_order_id | uuid | |
| variant_id | uuid | |
| supplier_product_id | uuid \| null | kod eşlemesi (liste tedarikçi koduyla yazılır) |
| qty | number | paket adedi |
| unit_price | number \| null | beklenen alış (varsa) |

## StockIntake (stok girişi / satın alma)

Mal alımının envanter tarafı; oluşturduğu partiler buna bağlanır (`Stock.intake_id`), ödemesi bir `MoneyMovement`(out, purchase).

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| supplier_id | uuid \| null | tedarikçi (bkz. `Supplier`) — lot izlenebilirliğinin "bir adım geri" halkası |
| purchase_order_id | uuid \| null | bağlı tedarik siparişi — mal kabul formu PO kalemleriyle önceden dolu gelir; kabulle PO `received` olur |
| date | date | |
| total_amount | number | |
| note | string \| null | |
