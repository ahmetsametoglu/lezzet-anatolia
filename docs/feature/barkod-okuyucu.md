# Barkod okuyucu entegrasyonu — çalışma (02.08.2026)

> **Statü: ÇALIŞMA/ÖNERİ — karar değil.** Denetim ajanının mevcut sisteme hakimiyetle hazırladığı
> yerleşim etüdü. Kapsam kararı kullanıcının; şerit ajanları teknik itirazlarını maddelerin altına
> yazabilir. Karar olgunlaşınca ilgili `NN-*.md` dosyalarına görev satırı olarak iner ve bu dosya
> karara işaret eder.

## 0. Mevcut zemin (kod gerçeği)

| Var | Yok |
| --- | --- |
| `product_variant.sku` (nullable, serbest metin) | **EAN/GTIN alanı hiçbir tabloda yok** |
| `supplier_product.supplierCode` (tedarikçi katalog kodu) | Tedarikçi *barkodu* alanı yok (kod ≠ barkod) |
| `stock.lotNumber` + `expiryDate` (parti düzeyi) | Parti etiketi/iç barkod üretimi yok |
| `documentPrefixFor` (depo başına belge no) | Sipariş kolisi etiketi/barkodu yok |
| Operasyon yüzeyi telefon-öncelikli (PRODUCT.md) | Herhangi bir tarama komponenti/kütüphanesi yok |

Yani sistem barkoda **hazırlıksız değil ama boş**: kimlik alanları (sku, supplierCode, lotNumber)
duruyor, taranabilir tek bir kod alanı ve tek bir tarama girişi eksik.

## 1. Nerede kullanılmalı — öncelik sırasıyla

Öncelik ölçütü: (hata maliyeti × işlem sıklığı) ÷ entegrasyon maliyeti. İlk üçü, ekranı **henüz
çizilmemiş** akışlara denk geliyor — barkodu sonradan yamamak yerine ekran doğarken koymak en ucuz an.

### 1.1 Mal kabul (10.4 — ekran bekliyor) — EN YÜKSEK DEĞER
Depocu koliyi okutur → varyant bulunur → kabul formunun satırı seçilir/açılır; miktar + SKT girilir.
Arka uç kapıları hazır (`openIntakeForm`, `receiveGoods`, `receivePurchase`); barkodun işi yalnız
**satırı bulmak**. Kazanç: kabulde yanlış varyant seçimi (görsel benzer donuk ürünlerde en sık hata)
ve satır arama süresi. PO'lu kabulde okutulan kod PO kalemiyle eşleşmiyorsa uyarı — "fark raporu"
zaten var, barkod onu beslemiş olur.

### 1.2 Hazırlık / toplama doğrulaması (10.x — ekran bekliyor)
Toplayıcı ürünü rafa uzanıp okutur; sipariş kalemiyle eşleşmezse ekran anında itiraz eder. Yanlış
ürün sevkinin maliyeti iade + müşteri güveni; donukta iade çoğu zaman imha demek. `confirmPreparation`
akışına "okutarak onayla" seçeneği: zorunlu değil, teşvikli (okutulan kalem işaretlenir, okutulmayan
elle onaylanabilir — depocuyu kilitlemeyen tasarım).

### 1.3 Depo hızlı satış (`quick_sale` RPC hazır)
Tezgâh senaryosu: okut → sepete düş → tekrar okut → adet artar. POS'un yarısı barkodla kurulur;
`quick_sale` zaten satır listesi alıyor, ekranın giriş yöntemi değişir sadece.

### 1.4 Sayım / stok düzeltme (`adjustment` arka ucu hazır)
Sayımda ürünü okut → o depodaki partileri listele → sayılan adedi gir. Barkod parti seçmez
(EAN varyant düzeyidir), partiye inmek yine SKT/lot ile olur — bu sınır ekranda açık yazılmalı.

### 1.5 Depolar arası transfer (19.6 — ekran bekliyor)
Çıkışta ve varışta okutma; `transferDecision` motoru zaten var. Kabul ekranı 1.1 ile aynı
`ScanField`'i kullanır — ayrı iş çıkmaz.

### 1.6 Kurye yükleme kontrolü (09.15/11.x ile birlikte)
Sipariş kolisine iç etiket (belge no zaten var: `documentPrefixFor`) basılır; kurye araca yüklerken
okutur → "bu koli bu rotanın malı mı" cevabı. Bu, ürün barkodu değil **bizim ürettiğimiz** koli
etiketi — ayrı ve sonraki faz; etiket yazıcısı kararına bağlı.

### 1.7 Ürün–kod eşlemesi ekranı (09.14 kapsamında küçük dokunuş)
Eşleme ekranında "okut" düğmesi: tedarikçi kolisindeki barkodu okutup `supplier_product`'a yazmak,
elle kod kopyalamaktan hem hızlı hem hatasız. 1.1'in yan ürünü olarak neredeyse bedava.

### Kullanılmaması gereken yer
**Müşteri yüzeyinde yeri yok** (müşteri barkod okutmaz) ve **satış kararı barkodla verilmez** —
barkod kimlik bulur, stok/depo kararını yine mevcut motorlar verir (depo değişmezi aynen geçerli).

## 2. Veri modeli önerisi (greenfield avantajıyla)

- **Faz A:** `product_variant.ean` — nullable, `unique` (kısmi: null hariç). Tek alan, migration
  doğrudan düzenlenir (greenfield). SKU serbest metindir ve bizimdir; EAN dış dünyanın kimliğidir —
  ikisi ayrı durmalı, SKU'ya EAN sıkıştırılmamalı.
- **Faz B (ihtiyaç doğarsa):** `variant_barcode` tablosu (variant_id, code unique, kind: unit/case) —
  aynı varyantın adet ve koli barkodu ayrıysa. Faz A'daki alan o gün tabloya taşınır; bugünden tablo
  kurmak spekülasyon olur.
- İsteğe bağlı: `supplier_product.barcode` — tedarikçinin kolisindeki barkod bizim EAN'den farklıysa
  eşlemede ikinci anahtar. 1.7 yapılacaksa gerekli, yoksa erteleme.
- Arama zinciri tek sorguda: `ean → sku → supplier_product.supplierCode/barcode` öncelik sırasıyla;
  `packages/database`'e tek metot (`VariantLookupService.findByCode` gibi), ekranlar başka yol kurmaz.

## 3. Teknoloji önerisi — iki kademe, teknoloji duplikasyonu doğurmadan

- **Kademe 1: donanım okuyucu (HID / "klavye taklidi") — SIFIR yeni bağımlılık.** USB/Bluetooth el
  okuyucuları odaklanmış input'a yazar + Enter basar. Gereken tek şey paylaşılan bir `ScanField`
  komponenti (`components/operation/form/`): odak tutma, hızlı-giriş algısı (insan yazımından ayırt
  etmek için karakter-arası süre eşiği), Enter'da `onScan(code)`. Depo/tezgâh gibi sabit noktalar
  için bugün kurulabilir.
- **Kademe 2: telefon kamerası.** Operasyon telefon-öncelikli olduğu için asıl hedef bu; ama
  `BarcodeDetector` API'si Safari/iOS'ta yok, dolayısıyla **bir kütüphane kararı** gerekiyor
  (aday: `@zxing/browser` sınıfı tek bir seçim). Bu yeni teknolojidir → seçim yapılmadan kod
  yazılmamalı, seçilen tek kütüphane STACK.md'ye beyanla girmeli (bkz. `STACK §2` beyan tablosu ve `docs:check`'in bağımlılık kuralı —
  beyansız teknoloji sınıfına yenisini eklemeyelim). `ScanField` arayüzü iki kademeyi de aynı
  `onScan` sözleşmesine bağlar; ekranlar kaynağın donanım mı kamera mı olduğunu bilmez.

## 4. Önerilen fazlama

1. **Şema + arama:** `product_variant.ean` + `findByCode` (arka uç şeridi — küçük).
2. **`ScanField` (HID kademesi)** + 1.1 mal kabul ekranına entegre doğuş (operasyon şeridi; 10.4
   zaten ekran bekliyor — barkod, ekranın tasarım girdisi olarak `design/`e şimdi yazılmalı).
3. 1.3 hızlı satış + 1.4 sayım + 1.7 eşleme düğmesi (aynı `ScanField`'in yeniden kullanımı).
4. Kamera kademesi (kütüphane kararı + STACK beyanı ile birlikte).
5. 1.6 koli etiketi — etiket yazıcısı/donanım kararıyla birlikte ayrı çalışma.

**Cevaplar / itirazlar:** —
