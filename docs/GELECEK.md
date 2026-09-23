# GELECEK — şimdi yapılmayacak özellikler

Bugünkü kapsamın dışında kalan, ileride ele alınacak özellikler. Açık iş değildir: koddaki `BEKLEYEN` işareti buraya
bağlanmaz. Satır = kimlik + ne + neden; ele alınmaya karar verilince satır `docs/KALAN.md`'ye taşınır.

## Satış kapsamı

- (07.17) **Fransa ve Almanya dışındaki AB ülkelerine satış.** Bugün sistem yalnız iki ülke tanıyor: veritabanındaki ülke
  türü (`FR`, `DE`), 5 haneli posta kodu kuralı, adres formunun ülke seçicisi ve ülkeye göre adres önerisi/doğrulama
  sağlayıcısı (FR'de BAN, DE'de Google). Açmak için: ülke listesi; ülkeye göre posta kodu biçimi; o ülkenin adres önerisi ve
  doğrulaması; kargo tarifesi; varış ülkesinin KDV oranı (AB tek durak düzeni); yasal metinler ve dil.
