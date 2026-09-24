# GELECEK — şimdi yapılmayacak özellikler

Bugünkü kapsamın dışında kalan, ileride ele alınacak özellikler. Açık iş değildir: koddaki `BEKLEYEN` işareti buraya
bağlanmaz. Satır = kimlik + ne + neden; ele alınmaya karar verilince satır `docs/KALAN.md`'ye taşınır.

## Satış kapsamı

- (07.17) **Fransa ve Almanya dışındaki AB ülkelerine satış.** Bugün sistem yalnız iki ülke tanıyor: veritabanındaki ülke
  türü (`FR`, `DE`), 5 haneli posta kodu kuralı, adres formunun ülke seçicisi ve ülkeye göre adres önerisi/doğrulama
  sağlayıcısı (FR'de BAN, DE'de Google). Açmak için: ülke listesi; ülkeye göre posta kodu biçimi; o ülkenin adres önerisi ve
  doğrulaması; kargo tarifesi; varış ülkesinin KDV oranı (AB tek durak düzeni); yasal metinler ve dil.

## Tasarım

- (K.35) **Kendi kurduğumuz formlar Claude Design ile yeniden tasarlanacak** (ör. ürün düzenleme diyaloğu): tasarım dosyasında
  karşılığı olmadan kodda kurgulanmış formlar.

## İçerik

- (K.36) **Doğal ürünlerin açıklamaları kısa** (kozalak · andız · karadut özü, propolis macunu: 110–130 karakter) ve müşterinin
  "bu neymiş" sorusunu karşılamıyor. Kimlik tarafı yasal olarak uzatılabilir: hangi bitki, hangi yöre, hangi mevsim, nasıl
  yapılır, renk-kıvam-tat, neyle ve ne kadar tüketilir; kapalı olan tek şey etki. İki düzeltme: Propolis Macunu'ndaki "Kışın
  sabah kahvaltısına" mevsim-bağışıklık çağrışımı taşıyor, çıkarılmalı; Bromelain Şurubu kendini "gıda takviyesi" diye
  tanımlıyor ve Fransa'da bu kategori piyasaya sürülmeden DGCCRF bildirimi istiyor — işletmecinin hukukçusuna sorulacak.
