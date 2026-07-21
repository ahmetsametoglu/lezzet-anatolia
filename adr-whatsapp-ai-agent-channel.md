---
title: "ADR: WhatsApp'ı AI ajanıyla merkezî satış kanalı yapmak"
type: decision-record
status: önerilen        # önerilen | kabul | reddedilen | değiştirildi
created: 2026-07-20
deciders: [proje sahibi]
source: Claude yazışması (rakip araştırması + entegrasyon değerlendirmesi)
related:
  - content/research/whatsapp-conversational-commerce-analysis.md
  - content/backlog/whatsapp-sales-channel-backlog.md
note: >
  Bu dosya SADECE kalıcı kararları içerir. Her karar; bağlam, karar,
  gerekçe, sonuç ve alternatifler alanlarıyla yazılır. Analiz detayı
  research dosyasında, yapılacak işler backlog dosyasındadır.
---

# ADR: WhatsApp'ı AI ajanıyla merkezî satış kanalı yapmak

Bu doküman, WhatsApp/sosyal satış yönündeki kalıcı kararları kaydeder.
Statü değişirse (önerilen → kabul) tarih ve gerekçe eklenir; karar
değiştirilirse eski karar "değiştirildi" olarak işaretlenir, silinmez.

---

## ADR-001 — WhatsApp merkezî satış kanalı olarak konumlandırılır

**Bağlam.** Avrupa Türk gıda/pastane pazarında en yüksek etkileşimli ve en
güvenilir bulunan kanal, site değil mesajlaşma (WhatsApp + Instagram DM).
Diaspora müşterisi güven, anadil, ödeme esnekliği ve topluluk nedeniyle
mesajlaşmayı tercih ediyor (bkz. research §3).

**Karar.** Site vitrin ve katalog olarak kalır; **satışın kapandığı yer
WhatsApp** olur. Instagram keşif/üst-huni; WhatsApp dönüşüm/tekrar-sipariş.

**Gerekçe.** Kanal tercihi pazar davranışıyla uyumlu; rakiplerin çoğu bu
kanalı gayri resmi/otomasyonsuz kullanıyor — sistematik kullanım fark yaratır.

**Sonuç.** Sipariş akışı, ödeme ve müşteri iletişimi WhatsApp öncelikli
tasarlanır. Site tarafı buna bağlanır, tersi değil.

**Alternatifler.** (a) Site-öncelikli klasik e-ticaret — pazar davranışına
aykırı, reddedildi. (b) Yalnızca Instagram — API sınırları ve cold-DM yasağı
nedeniyle satış kapatmaya elverişsiz, reddedildi.

---

## ADR-002 — Konumlanma: yerel teslimat + Avrupa-geneli kargo birleşimi

**Bağlam.** Strasbourg'da yerel sosyal-öncelikli rakipler var ama çok-dilli
online + katalog + kargo altyapısı kimsede yok. Türkiye'den kargo yapanlar
yavaş/tazelik riskli; Avrupa-içi site-oyuncuları (Délice Land) çok-dilli ama
kargo-merkezli, yerel teslimat yok.

**Karar.** **Yerel (Strasbourg/Alsace + sınır ötesi Baden) rota-içi teslimat
+ kapıda ödeme** ile **Avrupa-geneli kargo**yu tek sistemde birleştir.

**Gerekçe.** Bu birleşim rakip haritasında boş; hem yerel yakınlık hem
diaspora erişimi sağlar.

**Sonuç.** Faz odağı önce yerel derinlik (Strasbourg), sonra Avrupa kargo
genişlemesi. Ülke-bazlı ücretsiz kargo eşiği modeli benimsenir (@dogaltakil
referans: ülkeye göre kademeli eşik).

**Alternatifler.** Sadece kargo (Délice Land benzeri) — yerel avantajı harcar.
Sadece yerel — diaspora ölçeğini kaçırır. İkisi de reddedildi.

---

## ADR-003 — Entegrasyon yolu: 360dialog ile başla, kendi Cloud API'yi opsiyon tut

**Bağlam.** Entegrasyonu bir AI ajanı yazacak; bu, "mühendislik yükü"
argümanını büyük ölçüde ortadan kaldırıyor. Geriye kalan gerçek fark
çalışma-zamanı operasyonel yük (token yaşam döngüsü, numara kalite derecesi,
template onayı, EU DPA) vs tam kontrol + taban maliyet (bkz. research §5).

**Karar.** **360dialog** (API-first, markup'suz, EU-yerli, hazır DPA) ile
başla. Kendi Meta Cloud API'ni gelecekteki bir opsiyon olarak sakla.

**Gerekçe.** AI ajanı kodu *yazabilir* ama numara sağlığı / token / template
onayını *işletmek* sürekli operasyonel yüktür; 360dialog bunu ~€49/ay ve
markup'suz üstlenir, FR/DE için hazır GDPR/DPA verir. Saf API-first olduğu
için kendi Claude ajanı + domain-core üstüne bağlanabilir; all-in-one'ların
(Charles/Wati) aksine kendi mantık katmanına hapsetmez.

**Sonuç.** Taşıma katmanı = 360dialog. Beyin = Claude API. Mantık/stok/sipariş
= domain-core. Hacim büyüyüp €49 sabit ücret fazla gelince veya en ince
kontrol gerekince kendi Cloud API'ye geçilir (aynı ajan, farklı taşıma).

**Alternatifler.** (a) Kendi Cloud API baştan — operasyonel güvenlik ağı yok,
başlangıçta erken. (b) All-in-one BSP (Charles/Wati/Zoko) — domain-core derin
entegrasyonunu kısıtlar, gereksiz katman tekrarı. İkisi de şimdilik reddedildi.

---

## ADR-004 — AI ajanı (Claude API) mesaj beynidir; kararı domain-core verir

**Bağlam.** Claude API kart görseli çizmez ama içerik + hangi kartın
gösterileceği kararını üretebilir. WhatsApp zengin mesaj tiplerini (buton,
liste, carousel, ürün kartı) taşır (bkz. research §6).

**Karar.** Claude API **çok-dilli içerik + kart/aksiyon kararı** üretir;
gerçek **stok rezervasyonu, fiyat, sipariş durum makinesi domain-core**'da
kalır. Ajan asla stok/fiyatı kendi uydurmaz, domain-core'dan okur.

**Gerekçe.** Doğruluk ve tek-kaynak ilkesi: ticari gerçekler tek yerde
(domain-core) yaşamalı; ajan yalnızca sunum ve diyalog katmanıdır.

**Sonuç.** Akış: müşteri mesajı → 360dialog webhook → backend → Claude
(cevap + kart kararı) → domain-core (stok/sipariş) → carousel/Stripe link →
onay. Dinamik serbest kart inbound sohbette; proaktif kampanya onaylı
template iskeletiyle.

**Alternatifler.** Ajanın stok/fiyatı kendi üretmesi — hata ve tutarsızlık
riski, reddedildi.

---

## ADR-005 — Inbound-öncelikli ve GDPR-uyumlu mesajlaşma ilkesi

**Bağlam.** FR/DE'de Meta pazarlama mesajı pahalı (~€0,13–0,14); kullanıcı-
başlatan 24 saat servis penceresi ücretsiz. Ticari toplu mesaj GDPR açısından
double opt-in + API + BSP + DPA gerektirir (bkz. research §4, §7).

**Karar.** **"Önce müşteri yazsın" (inbound) modeli** esas alınır. Proaktif
pazarlama şablonları seyrek, segmentli ve yalnızca double opt-in ile.

**Gerekçe.** Hem maliyet (ücretsiz servis penceresi) hem yasal uyum (GDPR)
aynı yöne işaret ediyor.

**Sonuç.** wa.me click-to-chat girişleri her yere (IG bio, site, QR); broadcast
öncesi opt-in mekanizması kurulur. Utility şablonları (sipariş onayı, kargo)
ücretsiz pencere içinde önceliklidir.

**Alternatifler.** Agresif outbound pazarlama — maliyet + GDPR + numara kalite
riski, reddedildi.
