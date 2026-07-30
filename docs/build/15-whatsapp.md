# 15 — WhatsApp: Zemin ve Canlı Kanal

## Kapsam

WhatsApp'ın satış yüzeyi olarak kurulması — **iki adımda, ikisi de Faz 1**. **Adım 1 (zemin):** `Conversation`/`Message` servisleri, telefon kimlik çözümünün gerçek akışa bağlanması, `wa.me` click-to-chat girişleri, WhatsApp'tan gelen siparişin admin tarafından **elle** işlenmesi köprüsü, admin konuşma izleme. **Adım 2 (canlı):** 360dialog webhook + AI ajanı (`packages/ai`) + interaktif kartlar + Stripe payment link + utility template'ler + opt-in toplama + insana devir + sohbetten talep açma. WhatsApp yeni bir beyin değildir: ticari gerçek (stok, fiyat, durum) daima `domain-core`'dan okunur, ajan uydurmaz (ADR-004). Broadcast/segmentli kampanya **yok** — Faz 2.

## Okunacaklar

- `CHANNELS.md` — tamamı (eksenler, kimlik, inbound/outbound, ajan sınırı, faz yerleşimi)
- `ADR_WHATSAPP.md` (ADR-001…005)
- `DOMAIN.md §10-11` (kimlik birleştirme, servis penceresi, opt-in)
- `data-model/iletisim-geribildirim.md` (`Conversation`, `Message`, `WebhookEvent`)
- `INTEGRATIONS.md` (360dialog notları, sürücü tablosu)

## Bağımlılık

`03-domain-core` (kimlik çözümü, rezervasyon/fiyat kararları), `04-auth-kimlik`, `06-stok`, `07-siparis` (checkout/rezervasyon/Stripe), `14-bildirim-email` (notify arayüzü — WhatsApp API sürücüsü burada dolar). **Adım 2 ayrıca `16-talep-sikayet`** ister (ajanın Ticket açması). Adım 1, 07 biter bitmez başlayabilir; adım 2'ye zemin oturmadan girilmez.

## Başlarken verilecek izah (örnek)

> "WhatsApp'ı satış kanalı yapıyoruz, iki adımda. Önce zemin: konuşmaları kendi veritabanımızda tutuyoruz, telefon numarasından müşteriyi tanıyoruz ve WhatsApp'tan gelen siparişi admin'in iki dokunuşla sisteme işlemesini sağlıyoruz — yani bugünkü elle düzeni sisteme bağlıyoruz. Sonra canlı adım: mesajlar 360dialog aracılığıyla sistemimize düşer, AI ajanı müşteriyle kendi dilinde konuşur, stok ve fiyatı motorumuzdan okur (asla uydurmaz), sipariş kartları ve ödeme linki gönderir. Ödeme linki stok rezervasyonuyla aynı süreye bağlıdır — süre dolunca ikisi birden kapanır. Ajan çözemediği konuyu insana devreder."

## Görevler

### Adım 1 — Zemin (elle işleme)

- [ ] (15.1) `Conversation` + `Message` servisleri ve elle konuşma/mesaj kaydı (admin, gelen DM'i işler)
  - *Bitti:* konuşma açılıyor, mesajlar yön/tür ile kaydediliyor; alanlar `DATA_MODEL.md` ile birebir
- [ ] (15.2) **Telefon kimlik çözümü bağlanması:** E.164 normalize + bul-veya-oluştur (03'teki saf fonksiyon) gerçek akışta — eşleşmeyen numara `is_draft` taslak müşteri açar, konuşma müşteriye bağlanır
  - *Bitti:* bilinen numara mevcut müşteriye bağlanıyor; yeni numara taslak açıyor; aynı numara ikinci kez taslak açmıyor
  - **Önkoşul: numara DOĞRULANMIŞ olmalı → `04.10`.** Bu görev "numaradan müşteriyi bul" işidir; numaranın o hesaba ait olduğunu **kanıtlayan** akış kimlik modülünde. Bugün numara serbest metinden yazılabildiği için bu çözümleme yanlış hesaba bağlayabiliyor — gerekçe ve para riski (puan → kupon) 04.10'da yazılı.
- [ ] (15.3) **`wa.me` click-to-chat girişleri:** sitede buton (çok dilli önceden yazılı mesaj), QR üretimi; IG bio linki operasyon notu olarak
  - *Bitti:* buton doğru numara + dile uygun mesajla WhatsApp'ı açıyor
- [ ] (15.4) **Admin elle sipariş köprüsü:** konuşmadan "sipariş oluştur" → müşteri önseçili admin sipariş girişi, `order_source=whatsapp`
  - *Bitti:* köprüden girilen sipariş kaynak=whatsapp ile normal yaşam döngüsünde akıyor
- [ ] (15.5) **Admin konuşma izleme:** konuşma listesi + detay (mesaj geçmişi, bağlı müşteri/sipariş)
  - *Bitti:* admin tüm konuşmaları görüyor; müşteri kartından konuşmasına geçilebiliyor

### Adım 2 — Canlı (webhook + AI ajanı)

- [ ] (15.6) **[Önce netleştir]** 360dialog onboarding (aşağıdaki "Netleşecekler") — hesap kurulmadan kod yazılmaz
- [ ] (15.7) **Webhook alıcısı (`apps/backend`):** imza doğrulama + `WebhookEvent` idempotency (provider+event_id unique, tekrar = no-op) + gelen mesajın `Conversation`/`Message`'a yazımı + 24s pencere güncellemesi (`window_expires_at`)
  - *Bitti:* aynı olay iki kez gönderilince tek kayıt; pencere bitişi doğru hesaplanıyor; imzasız istek reddediliyor
  - **İmza doğrulaması artık rutin hijyen DEĞİL, kimlik kurgusunun TEMELİ (30.07).** `04.10`'daki güvenlik kodu "kod doğru **ve** doğru numaradan geldi" şartına dayanıyor; numaranın doğruluğunu ise bize Meta beyan ediyor. İmzasız uç noktaya erişebilen biri "şu numaradan geliyorum" diyebilirse geriye yalnız 6 haneyi tahmin etmek kalır. Yani imza düşerse **güvenlik kodu da düşer** — "geliştirmede kapatalım" denince neyin gittiği görünsün diye buraya yazıldı.
  - **Gönderen numarası E.164'e normalize edilerek karşılaştırılır** (`normalizePhone`): `wa_id` numarayı `+` olmadan verir, kimlik kaydımız `+33…` tutar. Atlanırsa kontrol doğru kodda bile **hep** başarısız olur; asıl tehlike de birinin bunu karşılaştırmayı gevşeterek "düzeltmesi"dir.
  - **Doğrulama mesajları konuşmaya maskelenerek yazılır.** Süresi dolan e-posta OTP'si için bu isteğe bağlı bir sertleştirme; **güvenlik kodu için şart** — o kod aylarca geçerli ve 15.5 admin'e konuşma izleme veriyor. Ayrım: kısa ömürlü sırda arşivin önemi yok, uzun ömürlü sırda arşiv riskin kendisi.
- [ ] (15.8) **AI ajanı (`packages/ai`):** çok dilli sohbet; stok/fiyat/sipariş durumunu **domain-core'dan okur** — cevap + kart/aksiyon kararı üretir, ticari değer uydurmaz
  - *Bitti:* test sohbetinde fiyat/stok cevapları domain-core ile birebir; stokta olmayan ürüne satış sözü verilmiyor
- [ ] (15.9) **İnteraktif kartlar:** buton/liste/carousel/ürün kartı gönderimi (içerik ajandan, render 360dialog/Cloud API)
  - *Bitti:* örnek ürün carousel'i telefonda görünüyor, buton cevabı webhook'tan geri okunuyor
- [ ] (15.10) **Sohbette sipariş kapatma:** ajan sepeti kurar → rezervasyon (önce ayır) → **Stripe payment link, süresi rezervasyon TTL'ine eşit** → ödeme webhook'unda `confirmed`
  - *Bitti:* link süresi = TTL; süre dolunca stok serbest + link geçersiz; geç ödeme dallanması (03) işliyor
- [ ] (15.11) **Utility template'ler:** sipariş onayı / kargo bildirimi şablonları onaylatılır; `packages/notify` WhatsApp API sürücüsü doldurulur; pencere içi serbest mesaj / pencere dışı template kararı `Conversation`'dan
  - *Bitti:* pencere içinde serbest mesaj, dışında onaylı template seçiliyor (birim test + gerçek gönderim)
- [ ] (15.12) **Sohbet sonunda opt-in sorma:** ajan uygun anda pazarlama iznini sorar → `Conversation.opt_in` + `Customer.marketing_consent.whatsapp` (`{granted, at, source}`)
  - *Bitti:* onay kaydı zaman + kaynakla düşüyor; reddedene tekrar sorulmuyor
- [ ] (15.13) **Ajan → insan devri:** ajan çözemediğinde/müşteri istediğinde konuşma "insanda" işaretlenir + admin'e bildirim; devirdeyken ajan susar
  - *Bitti:* devir sonrası gelen mesaja ajan otomatik cevap vermiyor; admin cevabı konuşmaya düşüyor
- [ ] (15.14) **Ajanın Ticket açması:** şikâyette hangi sipariş → hangi ürün → birkaç netleştirme sorusu → `Ticket` (`conversation_id` bağlı; 16 servisleri)
  - *Bitti:* sohbetten açılan talep admin kuyruğunda, sipariş/kalem bağıyla görünüyor

## Netleşecekler

- **360dialog hesap/BSP kurulumu — kullanıcıyla birlikte:** WhatsApp Business hesabı, numara seçimi (mevcut numaranın taşınma etkisi dahil), Meta işletme doğrulaması, DPA imzası, güncel fiyat/plan ve kullanıcı şikâyetlerinin gözden geçirilmesi (`INTEGRATIONS.md` notu). Bunlar kod değil operasyon adımlarıdır; adım 2 bunlar bitmeden başlayamaz.
- **Ajanın talep açma tekniği:** DOMAIN §15 notu gereği teknik uygunluk (medya/foto alma, akış kısıtları) BSP altyapısında doğrulanacak — onboarding sırasında test edilir.
- **Onboarding'de sorulacak üç teknik soru (30.07 · `04.10` kimlik kurgusu bunlara dayanıyor):**
  1. **Gönderen kimliği hangi alanla geliyor?** Kurgunun tamamı "mesaj şu numaradan geldi" bilgisine dayanıyor; alanın adı ve garantisi netleşmeli.
  2. **Telefon ↔ WhatsApp Web ayrımı webhook'a yansıyor mu?** Beklentimiz *hayır* — Web bağlı cihazdır, aynı `wa_id` üzerinden gelir. Doğrulanmalı: yansısaydı "aynı numaradan yazdı" kontrolü müşteriyi bilgisayarından yazdığı için reddederdi.
  3. **Numaranın yeni bir cihazda/hesapta yeniden kaydolduğunu bildiren bir kimlik-değişim sinyali API'de var mı?** Protokolde böyle bir kavram olduğunu biliyoruz, Business API'de bize hangi biçimde ulaştığından emin değiliz. **Varsa, hat devri için kurduğumuz bütün dolaylı çıkarımların yerine geçer** — sessizlik süresi tahmininden çok daha keskin bir sinyal olur.
- **ARCEP numara karantina süresi** (hattın bırakılmasından yeniden dağıtımına kadar): ay mertebesinde olduğunu biliyoruz, kesin rakamı bilmiyoruz. `04.10`'daki 3 aylık sessizlik tetiği bu rakama dayandırılacaksa bakılmalı — bugün dayanmıyor (tetik ucuz olduğu için erken seçildi).
