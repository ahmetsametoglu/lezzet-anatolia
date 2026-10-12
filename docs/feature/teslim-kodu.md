# Teslim kodu — kapıda imza ve fotoğraf yerine kod

> **Statü: YAYINDA; kod e-postayla gidiyor, WhatsApp ayağı ertelendi (12.10.2026).** İlk karar 30.08.2026'da yazıldı ("Kapıda kimlik: WhatsApp OTP — imzanın yerine"), gövdesi
> 15.09'daki doküman birleştirmesinde düşmüştü; asıl metin `42b3ccd8` commit'inde. Kararlar 12.10.2026'da kullanıcıyla verildi.

## 1. Neden

Parmakla çizilen imza kimliği kanıtlamaz ve kaldırıldı; yerine geçen kutu okutması (`box_scan`) malın o kapıda çıktığını söyler,
ama kimin teslim aldığını söylemez. Müşterinin kendi telefonuna ya da posta kutusuna düşen kod, "o kişi oradaydı ve teslim aldı"
iddiasını destekler.

## 2. Kararlar (12.10.2026)

1. **Kod sefer yola çıkınca gider**, "yolda" mesajıyla birlikte; kapıda kod gönderip beklemek yok.
2. **Müşteri kodu veremezse kurye kodsuz teslim eder** ve kayıt "kodsuz" düşer; kutu okutması kanıt olarak kalır.
3. **Kanal:** doğrulanmış WhatsApp numarası (hesap sayfasındaki WhatsApp kartı, `customer_phone`) olan müşteriye WhatsApp'tan,
   olmayana e-postayla. Bildirim izni aranmaz: kod bir bildirim değil teslim kanıtıdır, gerekirse satış sözleşmesine yazılır.
4. **Kapsam:** yalnız kendi aracımızla teslim (rota) ve ayarın açık olduğu kanal; varsayılan B2B. Kargo ve gel-al kod almaz.
5. **WhatsApp'ta şimdilik yalnız "yolda" ve kod mesajı** açılır; öteki sipariş şablonları mesaj sayısı ve ücret çalışmasından sonra.
6. Mevcut "yolda" şablonunun metni değiştirilmez (koda gönderme cümlesi eklenmez).
7. **Kod şimdilik yalnız e-postayla gider.** Meta şablon oluşturmayı reddettiği için 3. ve 5. kararların WhatsApp ayağı ertelendi;
   kod yolu yerinde durur, gönderen numara (`META_PHONE_NUMBER_ID`) boş kaldıkça devreye girmez.

## 3. Tasarım

- **Kod:** altı hane, `order_delivery_code` tablosunda (0016). Tabloya politika yazılmadı: yalnız servis rolü okur, çünkü kurye
  kodu görebilseydi doğrulama anlamsızlaşırdı. Sipariş ikinci kez yola çıkarsa kod değişmez.
- **Üretim:** siparişin `out_for_delivery`ye geçtiği iki yerde (sefer başlatma, son kutunun araca okutulması), geçişten hemen sonra.
- **Gönderim:** "yolda" olayında kodlu siparişin cihaz bildirimi ve uygulama içi satırı kodsuz gider; kod tek yazılı mesajla gider,
  böylece e-posta iki kez gitmez. Doğrulanmış WhatsApp numarası varsa önce WhatsApp (`delivery_code` şablonu); WhatsApp
  yapılandırılmamışsa (`META_PHONE_NUMBER_ID` boş) ya da gönderim düşerse "yolda" e-postası kodu taşır. Gidilen kanal satıra yazılır
  (`sent_via`). Testler gönderen numarayı ortamdan siler ki fikstürün numarasına gerçek mesaj gitmesin.
- **Kapıda:** kurye ekranında kod adımı; altı hane girilir ya da "kodsuz teslim" seçilir. Yanlış kod hak düşürür
  (`delivery_code_max_attempts`, varsayılan 5); hak dolunca doğru kod da kabul edilmez, kodsuz teslim açık kalır.
- **Kayıt:** sonuç teslim kanıtına yazılır (`order.delivery_proof`): doğrulandı ya da kodsuz.

## 4. WhatsApp şablonu

Meta kuralı: kimlik doğrulama için tek kullanımlık kod yalnız **authentication** şablonuyla gönderilebilir; utility ve marketing
şablonları bu amaçla kullanılamaz. Authentication şablonunun metni Meta'nın sabit metnidir, emoji ve bağlantı almaz. Bu yüzden kod
WhatsApp'ta "yolda" mesajının içine konamaz, ardından ayrı mesajla gider.

| Şablon | Kategori | Diller | Ayarlar |
| --- | --- | --- | --- |
| `delivery_code` | Authentication | tr, fr, de | Kodu kopyala düğmesi · güvenlik önerisi kapalı (kod kuryeye söylenecek) · süre uyarısı kapalı (kod gün boyu geçerli) |

## 5. Açık

- **WhatsApp ayağı (7. karar).** Meta şablon oluşturmayı hem API'de hem WhatsApp Manager'da "Bu WhatsApp Business hesabı, mesaj
  şablonu oluşturma iznine sahip değil" (kod 10 / 2388185) ile reddediyor; alt kod Meta'nın hata listesinde yok. Jeton, hesap onayı,
  işletme doğrulaması, `health_status` ve numara temiz ölçüldü, 13 utility şablonun kategorisi değişmemiş. Açmak için: Business
  Support Home'da hesap kısıtına bakmak, utility şablonla ayırt etmek, Meta desteğine kayıt; sonra §4'teki şablon
  (`.test-results/meta/sablon-kapi-kodu.mjs`), sunucuya `META_PHONE_NUMBER_ID`, test numarasına tek deneme kullanıcı onayıyla.
- Mevcut `order_out_for_delivery` şablonunun üçüncü değişkeni "Teslimat aralığı"; sistemde saat aralığı verisi yok
  (`durak-sirasi.md` §"zaman penceresi"), şablon ayrıca olmayan bir varış bildirimini vaat ediyor. Kullanıcı kararı bekliyor.
- Öteki sipariş şablonlarının WhatsApp'tan açılması ücret çalışmasına bağlı (`whatsapp-bildirimleri.md`); karar kullanıcıda.
