# İki iş tek sistem — QUALITE ve Lezzet

> **Statü: KARAR ALINDI (03.10.2026), planlama.** Özelliğin tek kaydı bu dosya: kararlar, sonuçları, yol haritası ve açık
> sorular burada tutulur; iş `docs/KALAN.md`'ye satır olarak açılmaz. Muhasebe tarafının kararları
> [`kasa-muhasebe.md`](kasa-muhasebe.md)'dedir; bu dosya onların iki işe genişlemesidir.

**QUALITE** şirketin adıdır ve restoran ile marketlere toptan satış yapan iştir; **Lezzet** markamızdır ve çevrim içi
satış yapan iştir. İkisi aynı tüzel kişilik (QUALITE SAS) altındadır.

## 1. Kararlar (kullanıcı, 03.10)

| # | Karar | Sonucu |
|---|---|---|
| 1 | **İki işin bütün kayıtları bizim sistemde** — müşteri, sipariş, alış, gider, banka, stok | Kayıt doğduğu yerde işini taşır; Pennylane iki işi kategoriyle ayırır ve muhasebeciye giden dosya oradan çıkar (`kasa-muhasebe.md` 2. karar). Toptan ekibi alışı ve gideri Pennylane'e doğrudan girmez, çünkü her kaydın tek giriş yeri olur. |
| 2 | **Gider fişi bizim mobil uygulamadan girilir**, fotoğrafla | Fişten otomatik okuma ayrı bir iştir (§3, F fazı). |
| 3 | **Ayrımın tek alanı "iş"** (`qualite` · `lezzet`), serbest etiket değil | Etiket unutulunca kayıt sessizce yanlış işe yazılırdı; alan zorunludur ve varsayılanı karşı taraftan ya da hesaptan gelir. |
| 4 | **İki işe birden alınan mal ayrı fatura ve ayrı ödemeyle alınır** | Belge bölünmez; bölünemeyen ortak gider için §4, 2. soru. |

**Dayanak (ölçüm ve araştırma, 03.10):** Pennylane'in yerleşik stok modülü yok (yardım merkezi: *"Pennylane ne dispose pas
de module natif dédié à la gestion des stocks"*); stok için önerdiği Stockpit ayrı abonelikli ikinci bir sistemdir.
Bizim sistemde depo, parti ve maliyeti, son kullanma, tedarik siparişi, mal kabul, transfer, sayım ve fire zaten var.
Pennylane'de faturaya ve banka hareketine analitik kategori yazılıyor (test şirketinde ölçüldü).

## 2. Sonuçları

- **Crédit Mutuel de eşlenir.** QUALITE'nin ödemeleri bizde QUALITE belgeleriyle izah edilir; `kasa-muhasebe.md` 15.
  kararın "yalnız Revolut eşlenir" kısmı bununla değişir. Lezzet'in nakdi yine Crédit Mutuel'e yatırılıp Revolut'a
  gönderilir; artık iki uç da eşli hesaptır.
- **Pennylane kategorisi işten yazılır** ("Lezzet", "QUALITE"; "Activité" grubunda); `kasa-muhasebe.md` 16. karar
  genişler. Banka hareketine de bağının işinden kategori yazılır.
- **E-fatura okuyucusu** (`kasa-muhasebe.md` 7. adım) iki işi de kapsar; işi tedarikçinin varsayılan işinden okur.
- **Muhasebe düzeni** değişir: toptan ekibinin "Pennylane'e doğrudan girme" kuralı alış ve gideri de kapsar.
- **İş ekseni sipariş eksenlerinden bağımsızdır:** kanal (`b2b`/`b2c`) müşterinin şirket olup olmadığını söyler, hangi
  işin müşterisi olduğunu söylemez; QUALITE'nin restoranı da Lezzet'in B2B müşterisi de `b2b`dir.

## 3. Yol haritası

| Faz | İş | Ön şart |
|---|---|---|
| A | **Para tarafında iş.** Belgede ve belgesiz harekette zorunlu iş alanı; tedarikçi, cari ve hesapta varsayılan iş; formlarda seçim; Pennylane kategorisi belgenin işinden; banka satırının işi bağından; para ekranında iş süzgeci ve iki işin özeti; Crédit Mutuel eşlemesi. | §4, 2. soru |
| B | **Satışta iş.** Müşteride iş (B2C müşteri Lezzet'tir), sipariş işini müşteriden alır ve sonra değişmez; satış raporları iki iş için. | A |
| C | **Stokta iş.** Malın hangi işe ait olduğu ve işler arası mal geçişi. | §4, 1. soru |
| D | **Gider fişi mobilde.** Fotoğraf, iş, tür, tutar ve KDV ile belge açılır; Pennylane'e bugünkü kuyrukla yüklenir. | A |
| E | **E-fatura okuyucu** iki iş için; çift kayıt koruması (`kasa-muhasebe.md` 7. adım). | A |
| F | **Fişten otomatik okuma** (tutar, KDV, tedarikçi). | D |

## 4. Açık sorular

1. **Stokun fiziksel düzeni:** iki işin malı aynı depoda mı duruyor, ayrı depolarda mı; aynı ürünü iki iş de satıyor mu?
   Cevap C fazının modelini seçer: depo işe aittir · parti işe aittir · ortak mal ve satışta iş belirlenir.
2. **Bölünemeyen ortak gider** (kira, personel, enerji, ortak araç): tek belge iki işe nasıl yazılır? Seçenekler: bir işe
   yazılır · oranla bölünür (Pennylane kategoride ağırlığı destekliyor) · muhasebeci böler. Cevap A fazında iş alanının tek
   değer mi oranlı mı olacağını seçer.
