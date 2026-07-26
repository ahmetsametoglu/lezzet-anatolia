# Veri Modeli — Para ve Ön Muhasebe

Hesaplar, para hareketleri, banka import şablonu.

> Bu dosya `../DATA_MODEL.md`'nin parçasıdır. Ortak ilkeler (çok dilli alanlar, türetme ilkesi, enum listesi, kalıcı kararlar) ana dosyadadır; **karar oraya, alan buraya** yazılır.

---

## Account (hesap)

Paranın durduğu yer. Kasa (nakit), bankalar (Revolut, Crédit Mutuel), Stripe — hepsi birer hesap. "Online havuz" ayrı değil = Stripe hesabı.

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| name | string | Kasa / Revolut / Crédit Mutuel / Stripe |
| type | enum(`cash`,`bank`,`provider`) | nakit / banka / ödeme sağlayıcı |
| currency | enum(`EUR`) | |
| is_active | boolean | |

## MoneyMovement (para hareketi)

Tüm para hareketleri **tek tablo**; kasa/banka ayrımı yok — hareketin **hesabı** (yer) ve **tipi** var.

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| account_id | uuid | hangi hesap |
| direction | enum(`in`,`out`) | giriş / çıkış |
| amount | number | |
| type | enum(`order_payment`,`order_refund`,`purchase`,`expense`,`transfer`,`capital`,`misc`) | hareketin sebebi |
| category | string \| null | gider/gelir alt kategorisi (kira, akaryakıt, maaş, `advertising`…) |
| meta | jsonb \| null | ek etiket — reklam giderinde `{campaign}`: kampanya gider↔ciro (gerçek ROI) raporu |
| counter_account_id | uuid \| null | transferde karşı hesap (nakit→banka, Stripe→banka) |
| order_id | uuid \| null | sipariş ödemesiyse |
| stock_intake_id | uuid \| null | stok alımıysa |
| supplier_id | uuid \| null | tedarikçiye ödemeyse — tedarikçi borcu türetimi (bkz. `Supplier`) |
| value_date | date | |
| description | string \| null | |
| source | enum(`manual`,`bank_import`) | elle mi, banka import'undan mı |
| reconciled | boolean | |

## BankImportProfile (banka import şablonu)

AI ajanının banka dosyasından çıkardığı sütun eşlemesi; hesaba özel, sonraki importlar bununla otomatik.

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| account_id | uuid | hangi hesap/banka |
| column_mapping | jsonb | AI eşlemesi (tarih/tutar/açıklama/yön) |
| note | string \| null | |
