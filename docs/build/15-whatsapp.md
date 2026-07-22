# 15 — WhatsApp: Zemin ve Canlı Kanal

## Kapsam

WhatsApp'ın satış yüzeyi olarak kurulması — **iki adımda, ikisi de Faz 1**. **Adım 1 (zemin):** `Conversation`/`Message` servisleri, telefon kimlik çözümünün gerçek akışa bağlanması, `wa.me` click-to-chat girişleri, WhatsApp'tan gelen siparişin admin tarafından **elle** işlenmesi köprüsü, admin konuşma izleme. **Adım 2 (canlı):** 360dialog webhook + AI ajanı (`packages/ai`) + interaktif kartlar + Stripe payment link + utility template'ler + opt-in toplama + insana devir + sohbetten talep açma. WhatsApp yeni bir beyin değildir: ticari gerçek (stok, fiyat, durum) daima `domain-core`'dan okunur, ajan uydurmaz (ADR-004). Broadcast/segmentli kampanya **yok** — Faz 2.

## Okunacaklar

- `CHANNELS.md` — tamamı (eksenler, kimlik, inbound/outbound, ajan sınırı, faz yerleşimi)
- `ADR_WHATSAPP.md` (ADR-001…005)
- `DOMAIN.md §10-11` (kimlik birleştirme, servis penceresi, opt-in)
- `DATA_MODEL.md` (`Conversation`, `Message`, `WebhookEvent`)
- `INTEGRATIONS.md` (360dialog notları, sürücü tablosu)

## Bağımlılık

`03-domain-core` (kimlik çözümü, rezervasyon/fiyat kararları), `04-auth-kimlik`, `06-stok`, `07-siparis` (checkout/rezervasyon/Stripe), `14-bildirim-email` (notify arayüzü — WhatsApp API sürücüsü burada dolar). **Adım 2 ayrıca `16-talep-sikayet`** ister (ajanın Ticket açması). Adım 1, 07 biter bitmez başlayabilir; adım 2'ye zemin oturmadan girilmez.

## Başlarken verilecek izah (örnek)

> "WhatsApp'ı satış kanalı yapıyoruz, iki adımda. Önce zemin: konuşmaları kendi veritabanımızda tutuyoruz, telefon numarasından müşteriyi tanıyoruz ve WhatsApp'tan gelen siparişi admin'in iki dokunuşla sisteme işlemesini sağlıyoruz — yani bugünkü elle düzeni sisteme bağlıyoruz. Sonra canlı adım: mesajlar 360dialog aracılığıyla sistemimize düşer, AI ajanı müşteriyle kendi dilinde konuşur, stok ve fiyatı motorumuzdan okur (asla uydurmaz), sipariş kartları ve ödeme linki gönderir. Ödeme linki stok rezervasyonuyla aynı süreye bağlıdır — süre dolunca ikisi birden kapanır. Ajan çözemediği konuyu insana devreder."

## Görevler

### Adım 1 — Zemin (elle işleme)

- [ ] `Conversation` + `Message` servisleri ve elle konuşma/mesaj kaydı (admin, gelen DM'i işler)
  - *Bitti:* konuşma açılıyor, mesajlar yön/tür ile kaydediliyor; alanlar `DATA_MODEL.md` ile birebir
- [ ] **Telefon kimlik çözümü bağlanması:** E.164 normalize + bul-veya-oluştur (03'teki saf fonksiyon) gerçek akışta — eşleşmeyen numara `is_draft` taslak müşteri açar, konuşma müşteriye bağlanır
  - *Bitti:* bilinen numara mevcut müşteriye bağlanıyor; yeni numara taslak açıyor; aynı numara ikinci kez taslak açmıyor
- [ ] **`wa.me` click-to-chat girişleri:** sitede buton (çok dilli önceden yazılı mesaj), QR üretimi; IG bio linki operasyon notu olarak
  - *Bitti:* buton doğru numara + dile uygun mesajla WhatsApp'ı açıyor
- [ ] **Admin elle sipariş köprüsü:** konuşmadan "sipariş oluştur" → müşteri önseçili admin sipariş girişi, `order_source=whatsapp`
  - *Bitti:* köprüden girilen sipariş kaynak=whatsapp ile normal yaşam döngüsünde akıyor
- [ ] **Admin konuşma izleme:** konuşma listesi + detay (mesaj geçmişi, bağlı müşteri/sipariş)
  - *Bitti:* admin tüm konuşmaları görüyor; müşteri kartından konuşmasına geçilebiliyor

### Adım 2 — Canlı (webhook + AI ajanı)

- [ ] **[Önce netleştir]** 360dialog onboarding (aşağıdaki "Netleşecekler") — hesap kurulmadan kod yazılmaz
- [ ] **Webhook alıcısı (`apps/backend`):** imza doğrulama + `WebhookEvent` idempotency (provider+event_id unique, tekrar = no-op) + gelen mesajın `Conversation`/`Message`'a yazımı + 24s pencere güncellemesi (`window_expires_at`)
  - *Bitti:* aynı olay iki kez gönderilince tek kayıt; pencere bitişi doğru hesaplanıyor; imzasız istek reddediliyor
- [ ] **AI ajanı (`packages/ai`):** çok dilli sohbet; stok/fiyat/sipariş durumunu **domain-core'dan okur** — cevap + kart/aksiyon kararı üretir, ticari değer uydurmaz
  - *Bitti:* test sohbetinde fiyat/stok cevapları domain-core ile birebir; stokta olmayan ürüne satış sözü verilmiyor
- [ ] **İnteraktif kartlar:** buton/liste/carousel/ürün kartı gönderimi (içerik ajandan, render 360dialog/Cloud API)
  - *Bitti:* örnek ürün carousel'i telefonda görünüyor, buton cevabı webhook'tan geri okunuyor
- [ ] **Sohbette sipariş kapatma:** ajan sepeti kurar → rezervasyon (önce ayır) → **Stripe payment link, süresi rezervasyon TTL'ine eşit** → ödeme webhook'unda `confirmed`
  - *Bitti:* link süresi = TTL; süre dolunca stok serbest + link geçersiz; geç ödeme dallanması (03) işliyor
- [ ] **Utility template'ler:** sipariş onayı / kargo bildirimi şablonları onaylatılır; `packages/notify` WhatsApp API sürücüsü doldurulur; pencere içi serbest mesaj / pencere dışı template kararı `Conversation`'dan
  - *Bitti:* pencere içinde serbest mesaj, dışında onaylı template seçiliyor (birim test + gerçek gönderim)
- [ ] **Sohbet sonunda opt-in sorma:** ajan uygun anda pazarlama iznini sorar → `Conversation.opt_in` + `Customer.marketing_consent.whatsapp` (`{granted, at, source}`)
  - *Bitti:* onay kaydı zaman + kaynakla düşüyor; reddedene tekrar sorulmuyor
- [ ] **Ajan → insan devri:** ajan çözemediğinde/müşteri istediğinde konuşma "insanda" işaretlenir + admin'e bildirim; devirdeyken ajan susar
  - *Bitti:* devir sonrası gelen mesaja ajan otomatik cevap vermiyor; admin cevabı konuşmaya düşüyor
- [ ] **Ajanın Ticket açması:** şikâyette hangi sipariş → hangi ürün → birkaç netleştirme sorusu → `Ticket` (`conversation_id` bağlı; 16 servisleri)
  - *Bitti:* sohbetten açılan talep admin kuyruğunda, sipariş/kalem bağıyla görünüyor

## Netleşecekler

- **360dialog hesap/BSP kurulumu — kullanıcıyla birlikte:** WhatsApp Business hesabı, numara seçimi (mevcut numaranın taşınma etkisi dahil), Meta işletme doğrulaması, DPA imzası, güncel fiyat/plan ve kullanıcı şikâyetlerinin gözden geçirilmesi (`INTEGRATIONS.md` notu). Bunlar kod değil operasyon adımlarıdır; adım 2 bunlar bitmeden başlayamaz.
- **Ajanın talep açma tekniği:** DOMAIN §15 notu gereği teknik uygunluk (medya/foto alma, akış kısıtları) BSP altyapısında doğrulanacak — onboarding sırasında test edilir.
