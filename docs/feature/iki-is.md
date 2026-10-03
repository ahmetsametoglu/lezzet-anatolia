# İki iş tek sistem — QUALITE ve Lezzet

> **Statü: KARAR ALINDI (03.10.2026), uygulama başlamadı.** Özelliğin tek kaydı bu dosya: kararlar, sonuçları, yol haritası ve açık
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
| 4 | **İki işe birden alınan mal ayrı fatura ve ayrı ödemeyle alınır** | Belge bölünmez. |
| 5 | **Bölünemeyen ortak gider (kira, personel, enerji, ortak araç) tek işe yazılır** | İş alanı tek değerdir, oran tutmaz. |

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
| A | **Para tarafında iş.** Belgede ve belgesiz harekette zorunlu iş alanı; tedarikçi, cari ve hesapta varsayılan iş; formlarda seçim; Pennylane kategorisi belgenin işinden; banka satırının işi bağından; para ekranında iş süzgeci ve iki işin özeti; Crédit Mutuel eşlemesi. | — |
| B | **Satışta iş.** Müşteride iş (B2C müşteri Lezzet'tir), sipariş işini müşteriden alır ve sonra değişmez; satış raporları iki iş için. | A |
| C | **Stokta iş.** Malın hangi işe ait olduğu ve işler arası mal geçişi. | §4, 1. soru |
| D | **Gider fişi mobilde.** Fotoğraf, iş, tür, tutar ve KDV ile belge açılır; Pennylane'e bugünkü kuyrukla yüklenir. | A |
| E | **E-fatura okuyucu** iki iş için; çift kayıt koruması (`kasa-muhasebe.md` 7. adım). | A |
| F | **Fişten otomatik okuma** (tutar, KDV, tedarikçi). | D |

## 4. Açık sorular

1. **Stokun fiziksel düzeni** (kullanıcı 03.10: not alındı, karar sonra, şimdi adım atılmaz): iki işin malı aynı depoda mı
   duruyor, ayrı depolarda mı; aynı ürünü iki iş de satıyor mu? Cevap C fazının modelini seçer (§5'teki karşılaştırma).
2. **Kapı ve araç satışının işi:** bu satışlar her zaman tek anonim alıcıya yazılıyor (`apps/mobile-api/src/api/v1/sale.ts`);
   iş müşteriden alınırsa hepsi tek işe düşer. Anonim alıcı Lezzet mi sayılır, iş başına iki anonim alıcı mı açılır?
3. **Ortak WhatsApp numarası:** iki iş aynı numarayı kullanıyorsa sohbetten doğan taslak müşterinin varsayılan işi seçilemez.

## 5. Ölçülmüş etki (03.10, salt okuma analizi; kod değişmedi)

**Para (A fazı):**
- İş enum'u `0010_supply.sql`'de tanımlanır, çünkü tedarikçi tablosu para tablolarından önce açılır. Varsayılanlar boş
  bırakılabilir (`supplier`, `counterparty`, `account`): ortak hesapta ya da ortak tedarikçide boşluk seçimi zorlar.
- `money_document.business` zorunlu; sırayla açık seçim, tedarikçi, cari; kararı belge kapısı (`createMoneyDocument`) verir.
- `money_movement.business` zorunlu ve tetikleyici kurar: bağ (belge, mal kabul ya da tedarikçi, B fazında sipariş), sonra
  cari, sonra hesap. Böylece RPC'ler ve SQL yazımları da kapsanır; bağ değişince iş yeniden türer. İki işin belgesine giden
  bağ reddedilir (4. karar).
- Pennylane: kategori işten; harekete kategori yazan port yöntemi ve aynası eklenir; kuyruk tetikleyicisinin sütun listesine
  iş girer.
- Riskler: kapı tahsilatının hesabı tek ayardan geliyor ve A fazında siparişin işi yok, toptanın nakdi Lezzet'e yazılır;
  eşleşmeyi geri alma ve "zaten yazmıştım" birleşmesi işi taşımalı; `matched_elsewhere` iki iş bizdeyken anlamını yitirir;
  zorunlu alan yaklaşık 70 testi, üç tohum dosyasını ve dört SQL yazım noktasını etkiler.

**Satış (B fazı):**
- Müşteri `user_profiles` satırıdır (B2B alanları aynı satırda). Bütün sipariş yolları `create_order` RPC'sindeki tek
  INSERT'ten geçiyor (`0030_create_order.sql`): sipariş işini müşteriden alan bir tetikleyici ve donma tetikleyicisi tek
  noktada yazar. "B2C müşteri Lezzet'tir" müşteride kısıt olabilir.
- Kapıda nakit alınan B2B parası Hiboutik çekmecesine kasa girişi olarak yazılıyor (`packages/application/src/register/sync.ts`);
  QUALITE'nin nakdi Lezzet kasasına karışır, B fazında ele alınır.
- Satış dışa aktarımı, kâr raporu (bugün kanala göre kırılıyor) ve analitik görünüm iş alanını okumalı.

**Stok (C fazı, karar sonra):**

| Seçenek | Dokunulan dosya (tahmini) | Risk |
|---|---|---|
| Depo işe aittir | ~6 SQL, ~15–20 TS | Orta: teslimat yönlendirmesi, araç, aynı binada iki sanal depo |
| Parti işe aittir | ~13 SQL, ~40–50 TS | Yüksek: unutulan tek süzgeç fazla ya da eksik satış yaptırır |
| Ortak mal, iş satışta belirlenir | ~0–2 SQL, ~5–8 TS | Teknik risk düşük; fire ve alış faturası için dağıtım kuralı gerekir |

**Mobil gider fişi (D fazı):**
- Mobil para API'si bugün yalnız okuma; gider için yeni bir yönlendirici gerekir. Kamera (`expo-camera`) var, galeriden seçim
  için `expo-image-picker` yok; izin metni yalnız kod okutmayı anlatıyor. Belge dosyası JPEG, PNG ya da PDF olmalı (HEIC
  reddediliyor).
- Pennylane karşı tarafı olmayan belgeyi yüklemez; fişte tedarikçi ya da cari seçilmeli. Belgeyi kimin girdiği bugün
  tutulmuyor.
