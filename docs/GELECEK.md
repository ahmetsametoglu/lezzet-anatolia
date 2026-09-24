# GELECEK — şimdi yapılmayacak özellikler

Bugünkü kapsamın dışında kalan, ileride ele alınacak özellikler (ileri vade). Açık iş değildir: koddaki `BEKLEYEN` işareti buraya
bağlanmaz. Satır = kimlik + ne + neden; ele alınmaya karar verilince satır `docs/KALAN.md`'ye taşınır.

## Satış kapsamı

- (07.17) **Fransa ve Almanya dışındaki AB ülkelerine satış.** Bugün sistem yalnız iki ülke tanıyor: veritabanındaki ülke
  türü (`FR`, `DE`), 5 haneli posta kodu kuralı, adres formunun ülke seçicisi ve ülkeye göre adres önerisi/doğrulama
  sağlayıcısı (FR'de BAN, DE'de Google). Açmak için: ülke listesi; ülkeye göre posta kodu biçimi; o ülkenin adres önerisi ve
  doğrulaması; kargo tarifesi; varış ülkesinin KDV oranı (AB tek durak düzeni); yasal metinler ve dil.
- (K.37) **Sınır ötesi satış — birbirine bağlı üç eksik:** depo → ülke eşlemesi yok (kargo deposu yalnız varış ülkesindeki
  depodan seçiliyor, `domain-core/delivery/warehouse-resolve.ts`; ölçüme göre Fransa dışındaki her yere Almanya'dan göndermek
  daha ucuz); BE · LU · NL · AT adresi girilemiyor (07.17); kargo adresinde sokak düzeyinde doğrulama yok (11.11).

## Teslimat ve kargo

- (K.38) **Rota dışına soğuk zincir ekspres kargo** — araştırılacak.
- (K.39) **Kuryenin telefonunda harita ve akıllı rota.**
- (K.40) **Otomatik taşıyıcı seçiminde onaylı liste ve azami teslim süresi.**

## Fiyat ve indirim

- (K.41) **Hediye kartı / hediye çeki** (bakiye taşıyan): kavramın kendisi kararlaştırılmadı. `order.is_gift_order` var ama o
  "siparişi hediye olarak gönder"dir, bakiye taşıyan bir araç değil.
- (OB-16) **Müşteri grubu bazlı genel yüzde indirimi (iskonto).**
- (OB-17) **Müşteriye özel, tek ürün kapsamlı, tek seferlik indirim.**

## Bildirim ve kanal

- (14.17) **Tarayıcı bildirimi (web push) ve "uygulama önce" kuralı:** müşteri web yüzeyinde (masaüstü + mobil web) tarayıcı
  aboneliği; bir haber tek cihaz bildirimine gider — native uygulama (son 30 gün içinde görülmüş; parametrik) → tarayıcı →
  e-posta; belgede e-posta daima + tek push. Parçalar: `app/manifest.ts` (iOS 16.4+ ana ekran şartı `display: standalone`) ·
  service worker · VAPID anahtarları (web + backend + mobile-api) · abonelik kaydı (`push_device`a `web` platformu +
  aboneliğin iki anahtarı) · `packages/notify` tarayıcı sürücüsü (`web-push`; 404/410'da abonelik budanır).
- (15.24) **Sohbet hunisi — platform verimliliği:** hangi sosyal platformun daha verimli olduğunu görmek için gün × platform
  özeti — açılan sohbet · sepet kurulan sohbet · gönderilen bağlantı · açılan bağlantı · sipariş · ciro; analitik ekranına bölüm.
- (MB-44) **B2B'de fatura e-postasının ayrı verilebilmesi:** bugün hesap e-postası her şeye gidiyor (karar maili, fatura,
  bildirim); muhasebede yetkili adresi ile fatura adresi genelde ayrıdır. Dokunacağı yer: profil künyesi (ikinci bir adres
  alanı) ve maili gönderen taraf; başvuru formu değil.

## Tasarım

- (K.35) **Kendi kurduğumuz formlar Claude Design ile yeniden tasarlanacak** (ör. ürün düzenleme diyaloğu): tasarım dosyasında
  karşılığı olmadan kodda kurgulanmış formlar.

## İçerik

- (K.36) **Doğal ürünlerin açıklamaları kısa** (kozalak · andız · karadut özü, propolis macunu: 110–130 karakter) ve müşterinin
  "bu neymiş" sorusunu karşılamıyor. Kimlik tarafı yasal olarak uzatılabilir: hangi bitki, hangi yöre, hangi mevsim, nasıl
  yapılır, renk-kıvam-tat, neyle ve ne kadar tüketilir; kapalı olan tek şey etki. İki düzeltme: Propolis Macunu'ndaki "Kışın
  sabah kahvaltısına" mevsim-bağışıklık çağrışımı taşıyor, çıkarılmalı; Bromelain Şurubu kendini "gıda takviyesi" diye
  tanımlıyor ve Fransa'da bu kategori piyasaya sürülmeden DGCCRF bildirimi istiyor — işletmecinin hukukçusuna sorulacak.
