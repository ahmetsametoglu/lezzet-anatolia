# Runbook — kapıda kart (Revolut Business, Tap to Pay)

> **Ne zaman okunur:** kart alacak personeli ya da şirket iPhone'unu hazırlarken ve ilk canlı ödemeden önce. Kararlar ve
> eşleştirmenin işleyişi `docs/feature/kasa-muhasebe.md` §9'dadır; burada yalnız yapılacak işler durur.

## Hesap (bir kez)

- Canlı Merchant hesabı yüz yüze ödemeye açık olmalı; canlı Merchant API anahtarı kök `.env`'de ya da Ayarlar › Kurulum'da
  durur. Anahtar yoksa eşleştirme işi atlanır ve Para ekranındaki pencere "Revolut anahtarı tanımlı değil" der.
- Ayarlar › Para › Para hesapları'nda "Kapıda kart hesabı" Revolut Merchant olmalı (fabrika değeri). Eşleştirme yalnız bu
  hesaptaki kart tahsilatlarını arar.
- Revolut Business'ta "Kapı tahsilatı" adlı özel rol: yalnız Merchant yetkisi; para hesapları, kartlar ve transfer kapalı.

## Personel (kişi başına)

- Kart alacak her personel "Kapı tahsilatı" rolüyle ekip üyesi olarak davet edilir ve kendi hesabıyla girer; hesap paylaşılmaz.
- Personel bizim operasyon uygulamasında da kendi hesabıyla çalışır.

## iPhone (cihaz başına)

- Şirket iPhone'u: iPhone XS ya da daha yeni, iOS 16.4 ya da üstü. Tap to Pay Android'de yoktur.
- Revolut Business uygulaması kurulur, personel kendi ekip hesabıyla girer.
- Merchant › New › Tap to Pay on iPhone açılır; ilk kullanımda cihazdaki Apple hesabıyla Tap to Pay koşulları onaylanır.

## Günlük kullanım

- **Kurye ve gel-al tezgâhı:** bizim uygulamada "kart"ı seç; ekran çekilecek tutarı yazar. Revolut Business'ta aynı tutarı yaz,
  müşteri kartını ya da telefonunu dokundursun. Ödeme onaylanınca bizim uygulamada teslimi kapat. Kart geçmezse "kart"ı bırak,
  başka yöntem seç.
- **Yerinde satış:** sepette "kart"ı seç ve satışı tamamla; kesin tutar fişte çıkar. Fişteki tutarı Revolut Business'ta çek.
- Tutarı Revolut'ta farklı yazma: eşleştirme tutarı birebir arar, farklı tutarlı ödeme hiçbir tahsilata bağlanmaz.

## Eşleşmeyen ödeme

- Eşleştirme işi 15 dakikada bir koşar; iki saat sonra hâlâ eşleşmeyen ödeme ve tahsilat zil düşürür.
- **"Kapıda kart ödemesi bizde yazılı değil":** zil Para › Kapıda kart eşleştirme penceresini açar. Ödemenin altında aynı
  tutarlı tahsilat varsa "Bağla". Aday yoksa bu tutarda bağlanmamış kart tahsilatı yoktur; ödemenin hangi teslime ya da satışa
  ait olduğu personelle netleştirilir.
- **"Kart tahsilatı Revolut'ta bulunamadı":** zil siparişe açılır. Revolut'ta o tutarda ödeme varsa Para › Eylemler › Kapıda
  kart eşleştirme'den bağla; yoksa para karttan çekilmemiştir.

## İlk canlı ödeme

1 €'luk gerçek ödeme ve iadesiyle yapılır; ölçülecekler `docs/feature/kasa-muhasebe.md` §9 "İlk canlı ödemede ölçülecek"te.
Sonuç oraya yazılır, açık kalan kararlar ona göre verilir.
