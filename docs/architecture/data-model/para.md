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

## BankImportProfile (banka import şablonu)

Hesaba özeldir: her bankanın dosya düzeni farklıdır (işaretli tek tutar sütunu / ayrı borç-alacak, virgüllü ondalık, gün-ay sırası). Bir kez çıkarılır (yapay zekâ önerir, insan onaylar), sonraki dosyalarda otomatik uygulanır.

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| account_id | uuid | hangi hesabın ekstresi |
| name | string | hesap içinde benzersiz |
| amount_mode | enum(`signed`,`debit_credit`) | tutar geleneği |
| mapping | jsonb | hangi sütun hangi alan — **sütun başlığıyla** tutulur, sırasıyla değil: banka dosyaya sütun eklediğinde sıra kayar, başlık kalır |
| decimal_separator | enum(`,`,`.`) | |
| date_format | enum(`dmy`,`ymd`,`mdy`) | |
| created_at | timestamptz | |

## BankImport (yükleme kaydı)

"Bu satır nereden geldi" sorusunun cevabı. Denetlenemeyen bir import korkutucudur: yanlış dosya yüklendiğinde neyin geri alınacağı bilinmelidir.

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| account_id | uuid | |
| profile_id | uuid \| null | şablon silinse de yükleme kaydı kalır |
| file_name | string | |
| row_count | number | dosyadaki satır |
| inserted_count | number | gerçekten yazılan |
| duplicate_count | number | zaten var olduğu için atlanan — **mükerrer korumasının görünür yüzü**; sessiz atlasaydık operatör "dosyam neden eksik girdi" diye soramazdı |
| created_at | timestamptz | |

**Mükerrer koruması (`MoneyMovement.import_fingerprint`):** bankalar satır kimliği vermez, kimlik üretilir — hesap + değer tarihi + tutar + yön + sadeleşmiş açıklama + **tekrar sırası**. Sıra şart: aynı gün çekilen iki ayrı 20 € gerçekten iki harekettir, naif bir özet birini yutardı; dosya yeniden yüklendiğinde ise her satır kendi eşiyle çakışır ve hiçbiri tekrar yazılmaz. Tekil indeks kısmi DEĞİLDİR (`on conflict` kısmi indeksi hedefleyemez); NULL'lar tekil karşılaştırmada eşit sayılmadığı için elle girilen hareketler kısıta takılmaz.
