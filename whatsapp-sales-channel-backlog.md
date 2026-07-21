---
title: WhatsApp Satış Kanalı — Backlog & Yol Haritası
type: backlog
status: aktif
created: 2026-07-20
source: Claude yazışması (rakip araştırması + WhatsApp otomasyon değerlendirmesi)
related:
  - content/research/whatsapp-conversational-commerce-analysis.md
  - content/decisions/adr-whatsapp-ai-agent-channel.md
note: >
  Bu dosya SADECE yapılacak işleri ve faz sınırlarını içerir. Kararların
  gerekçesi ADR'de, arka plan analizi research dosyasındadır. Her kalem
  tamamlanınca [x] işaretlenir; iptal olursa üstü çizilir, silinmez.
---

# WhatsApp Satış Kanalı — Backlog & Yol Haritası

Fazlar sırayla ilerler. Faz geçiş eşikleri "Karar eşiği" başlığında.
Bir kalem bir ADR'ye dayanıyorsa parantezde belirtilir.

## Faz 1 — Temel (0–2 ay): düşük hacim, otomasyonsuz başlangıç

- [ ] WhatsApp Business App kurulumu (ücretsiz) — karşılama/uzakta mesajı, hazır yanıtlar (TR/FR/DE)
- [ ] WhatsApp Katalog: ürün grupları (börek, baklava, tatlı, poğaça, simit, Maraş dondurma, çerez, kuru meyve) — TR/FR/DE ad+açıklama, temiz beyaz-zemin görseller (1024×1024, <200KB)
- [ ] wa.me click-to-chat linki: Instagram bio, site, QR kod, broşür (ADR-005)
- [ ] Hızlı yanıt setleri: fiyat, teslimat süresi, ödeme, soğuk zincir — üç dilde
- [ ] Instagram vitrin + keşif: Reels/Stories + "DM'den sipariş" CTA; hedef yanıt süresi <5 dk
- [ ] Strasbourg/FR + DE diaspora Facebook/WhatsApp gruplarında görünürlük ve düzenli paylaşım
- [ ] Sipariş DM/WhatsApp'tan gelir, elle sisteme işlenir (henüz API yok)

**Karar eşiği → Faz 2:** ~500 aktif müşteri veya elle işlemenin sürdürülemez olması.

## Faz 2 — Otomasyon + ödeme (2–6 ay): API'ye geçiş

- [ ] 360dialog hesabı + WhatsApp Business API bağlama (ADR-003)
- [ ] Webhook → apps/backend hattı: müşteri mesajı akışı
- [ ] Claude API entegrasyonu: çok-dilli cevap + kart/aksiyon kararı (ADR-004)
- [ ] domain-core bağlama: stok rezervasyonu, fiyat, sipariş durum makinesi (ADR-004)
- [ ] Stripe payment link akışı: SCA/3D Secure, Apple/Google Pay; kapıda ödeme/havale seçenekleri (ADR-001)
- [ ] WhatsApp interactive mesajlar: buton/liste/carousel ürün kartları (inbound sohbet içinde serbest)
- [ ] Onaylı template iskeletleri: sipariş onayı, kargo bildirimi (utility — ücretsiz pencere)
- [ ] Soğuk zincir paketleme akışı (dondurma/et-süt: jel + yalıtım) — sipariş akışına bağlı
- [ ] Ülke-bazlı ücretsiz kargo eşiği tanımları (ADR-002)
- [ ] Instagram comment-to-DM giriş noktası → WhatsApp'a taşıma akışı

**Karar eşiği → Faz 3:** aylık 1.000+ konuşma, çok kişili ekip, veya GDPR-uyumlu newsletter ihtiyacı.

## Faz 3 — Ölçek + tam otomasyon (6–12 ay)

- [ ] Double opt-in ile GDPR-uyumlu WhatsApp newsletter (yalnızca API+BSP+DPA) (ADR-005)
- [ ] Segmentli, seyrek pazarlama şablonları (FR/DE maliyeti yüksek — ROI ölçülmeden broadcast yok)
- [ ] Sipariş botu/chatbot: SSS + sipariş toplama otomasyonu; utility şablonlarla ücretsiz pencere maksimizasyonu
- [ ] Proaktif kampanyalar için onaylı carousel/kart template'leri
- [ ] B2B kancası: yerel Türk kafe/restoran/markete tek-tuş tekrar sipariş + özel fiyat listesi
- [ ] (Opsiyon) Kendi Meta Cloud API'ye geçiş değerlendirmesi — €49 sabit ücret fazla gelince / en ince kontrol gerekince (ADR-003)

## Fırsat kalemleri (önceliklendirilmemiş, takipte)

- [ ] Maraş dondurma soğuk-zincir kargo — Avrupa'da IG/WhatsApp'ta belirgin rakip yok (research §3)
- [ ] Ramazan/bayram/yılbaşı sezonluk ürün hatları + içerik (sistemi sezon tepesinde açma)
- [ ] Premium köken hikâyesi içeriği (Antep fıstığı, Maraş dondurma) — fiyat rekabetinden kaçış
- [ ] Ülke-bazlı çok-hesaplı Instagram stratejisi değerlendirmesi (@dogaltakil modeli)

## Rakip izleme (çeyreklik)

- [ ] Délice Land (model ikizi — çok-dilli + grossiste)
- [ ] Le Serail (marka gücü, ~33K IG)
- [ ] @dogaltakil (sosyal-öncelikli dev, ~400K IG)
- [ ] Alimex (Reichstett — en yakın coğrafi B2B rakip)
- [ ] Strasbourg yerel: Ustam, Tatlım, Prodelices

## Açık uçlar / doğrulanacaklar

- [ ] Güncel Meta WhatsApp rate card (çeyreklik değişir) — kampanya öncesi kontrol
- [ ] Marka adı çakışması ("Anatolia" adlı marketler) — tescil + SEO ayrışması
- [ ] Helal sertifikasyonu + alerjen beyanı — katalogda net (rakiplerde standart)
