---
title: WhatsApp & Sosyal-Öncelikli Satış — Analiz ve Tespitler
type: research
status: aktif
scope: satış kanalı, pazar, entegrasyon
created: 2026-07-20
source: Claude yazışması (rakip araştırması + WhatsApp otomasyon teknik değerlendirmesi)
related:
  - ADR_WHATSAPP.md
  - CHANNELS.md
  - BACKLOG.md
note: >
  Bu dosya SADECE analiz ve tespit içerir. Kalıcı kararlar ADR'de,
  yapılacak işler backlog dosyasındadır. Bir tespit karara dönüşürse
  ADR'ye taşınır, buradaki satır "→ ADR-xxx" ile işaretlenir.
---

# WhatsApp & Sosyal-Öncelikli Satış — Analiz ve Tespitler

> Kapsam: Avrupa'da Türk gıda/pastane diaspora pazarı; site-dışı satış kanalı davranışı;
> WhatsApp satış otomasyonu ve entegrasyon yollarının teknik değerlendirmesi.
> Tüm rakip verileri Temmuz 2026 snapshot'ıdır; takipçi sayıları ve fiyatlar zamanla değişir.

## 1. Pazar yapısı: iki katman

Avrupa Türk gıda/pastane pazarı iki farklı satış modeline bölünmüş:

- **Site-öncelikli oyuncular:** Kendi e-ticaret sitesi + SEO yatırımı (Délice Land, Le Serail, Taqsim, Suntat/Baktat, Bakkal.eu). Web aramasıyla bulunurlar.
- **Sosyal-öncelikli oyuncular:** Satışı ağırlıkla Instagram DM + WhatsApp üzerinden yürütür; site varsa vitrindir. **SEO ile görünmezler** — bu, ilk arama turlarında kaçırılmalarının nedeni.

**Tespit:** İlk web-arama turları yalnızca site-öncelikli oyuncuları buldu. Sosyal-öncelikli segment (ör. @dogaltakil), doğrudan Instagram handle / niş hedeflemesi yapılmadıkça görünmez. Bu, pazarın en canlı ve en yüksek-etkileşimli katmanının standart SEO taramasında kör nokta olduğunu gösteriyor.

## 2. @dogaltakil ve sosyal-öncelikli oyuncu profilleri

**@dogaltakil (Dogaltakil B.V., Lijnden-Amsterdam):** ~400K Instagram takipçi. Satış WhatsApp sipariş hattı + Instagram DM + Shopify site üzerinden. Ülke-bazlı çok-hesaplı strateji (@dogaltakil.de ~12K, @dogaltakil.plein4045 showroom ~1.9K). Ürün: kuruyemiş, kuru meyve, yöresel ürünler, bal/reçel, soğuk-zincirli et-süt, tatlı/pasta, baharat. Kullanıcının "en büyüklerden" tanımı doğrulandı.

Diğer sosyal-öncelikli / karma oyuncular (snapshot):

| Oyuncu | Kanal | Takipçi | Konum | Not |
|---|---|---|---|---|
| Bizz Bize (@bizzbizeavrupa) | Sadece IG DM | ~183K | Avrupa geneli | En saf "sadece DM" modeli; HQ doğrulanamadı |
| Köşgeroğlu (@kosgeroglu.berlin) | WhatsApp + DM | ~564 | Berlin | Antep baklava |
| YÖREM (@yoremofficial) | WhatsApp + telefon | doğrulanamadı | Gagny/Paris | Baklava, künefe, börek, simit + catering |
| Ustam (@ustam.patisserie) | IG DM / dükkan | ~3.3K | **Strasbourg** | Baklava, düğün pastası |
| Tatlım (@tatlim.strasbourg) | IG DM / dükkan | doğrulanamadı | **Strasbourg (Lingolsheim)** | Baklava, brunch |
| Prodelices (@prodelices) | IG DM / dükkan | ~1.8K | **Strasbourg** | Türk fırın/pastane |
| Taqsim (@taqsim_patisserie) | IG DM / dükkan | ~4.9K | Köln (4 şube) | Vegan baklava dahil |
| HANA (@taste.hana) | IG DM / dükkan | ~10K | Viyana | Baklava, künefe |
| Çavuşzade | IG DM + Uber Eats | doğrulanamadı | Brüksel | Antep baklava |

**Strasbourg tespiti:** Merkez şehirde en az üç sosyal-öncelikli rakip var (Ustam, Tatlım, Prodelices) ama hiçbiri güçlü çok-dilli online + WhatsApp katalog + kargo altyapısına sahip değil — hepsi dükkan/DM modelinde. **Yerel + Avrupa-geneli kargo birleşiminde net boşluk.**

## 3. Site-dışı satış kanalı tercih analizi

Diaspora müşterisi neden site yerine DM/WhatsApp tercih ediyor:

- **Güven** — kişisel ilişki, "anne eli" hissi.
- **Dil** — anadilde sohbet.
- **Ödeme esnekliği** — havale, kapıda ödeme, sohbet içi link.
- **Topluluk aidiyeti** — Facebook diaspora grupları, yerel WhatsApp grupları.

Kanal-ürün eşleşmesi:

- **Instagram DM** → keşif, dürtüsel sipariş, fiyat sorusu. Yanıt hızı kritik (5 dk içinde yanıt, 30 dk'ya göre lead niteliğinde ~21x fark — MIT Sloan/InsideSales, Oldroyd 2007).
- **WhatsApp** → tekrarlı sipariş, kişisel ilişki, sipariş takibi, hatırlatma. Diaspora için birincil kanal.
- **Facebook grupları / Telegram** → ev-üreticileri, ağızdan ağıza, toplu duyuru.
- **Soğuk-zincir ürünler (Maraş dondurma, et-süt)** → WhatsApp koordinasyonu şart. **Tespit:** Avrupa'da diasporaya IG/WhatsApp üzerinden Maraş dondurma kargolayan belirgin bir oyuncu tespit edilmedi — fırsat penceresi.

## 4. WhatsApp satış otomasyonu — teknik olabilirlik

**Uçtan uca otomatik sipariş teknik olarak mümkün** ama iki seviyede:

- **WhatsApp Business App (ücretsiz):** Sadece karşılama/uzakta mesajı + hazır yanıtlar. Koşullu mantık/dış entegrasyon YOK. ~500 aktif müşteri altında yeterli.
- **WhatsApp Business API (Cloud API):** Müşteri mesajı → webhook → kendi sistem. Bot ürün önerisi, sipariş toplama, durum sorgulama, SSS yapabilir. **Kritik sınır:** Hazır bot, özel entegrasyon katmanı olmadan gerçek stok/sipariş arka ucundan canlı veri çekemez — bunu kendi mimari (webhook + domain motoru) sağlamalı.

**Instagram sınırları:** Cold-DM API ile mümkün değil; otomatik mesaj 24 saat penceresiyle sınırlı. Comment-to-DM bir giriş noktasıdır, tam sohbet kanalı değil. Açık pencerede saatte ~200 otomatik giden DM sınırı. API yalnızca FB sayfasına bağlı işletme/creator hesabında çalışır. Pratik model: **IG keşif → WhatsApp'a taşı → satışı WhatsApp'ta kapat.**

**Ödeme:** Avrupa'da WhatsApp Pay YOK (yalnızca Hindistan/Brezilya). Model: sohbette sipariş → Stripe payment link (SCA/3D Secure) → onay mesajı.

**Maliyet (FR/DE):** Meta mesaj ücreti pazarlama ~€0,13–0,14, utility ~€0,004, kullanıcı-başlatan servis penceresi ücretsiz. **Sonuç:** "önce müşteri yazsın" (inbound) stratejisi hem maliyet hem GDPR açısından altın kural.

**Sektör örnekleri:** Charles (Berlin, EU DTC), Zoko (Shopify-öncelikli), Kings Collection (Flowcart), Dior Beauty (kullanıcı-başlatan model).

> Uyarı: Yaygın "%98 WhatsApp açılma oranı" iddiası doğrulanmamış BSP/Meta pazarlama metnidir; bağımsız ölçümler ~%68 ortalamaya işaret eder. Planlamada temkinli kullanılmalı.

## 5. Entegrasyon yolu karşılaştırması (kendi Cloud API vs BSP)

İki API karıştırılmamalı:
- **WhatsApp Cloud API** = mesajı taşıyan boru.
- **Claude API** = mesaj içeriğine karar veren beyin. İkisi rakip değil, birlikte çalışır.

| Boyut | Kendi Cloud API | 360dialog (API-first BSP) | All-in-one (Charles/Wati/Zoko) |
|---|---|---|---|
| Sabit ücret | Yok (sadece Meta) | ~€49/ay/numara, markup yok | $49–99+/ay, kısmen markup |
| Çalışma-zamanı bakım | Sizde (token, template, uptime) | BSP'de | BSP'de |
| Esneklik/kontrol | Tam | Yüksek (saf API) | Sınırlı (platform dayatır) |
| domain-core derin entegrasyon | ✅ Tam | ✅ Yüksek | ⚠️ Kısıtlı |
| GDPR/EU veri | Sizde | ✅ EU-yerli + DPA | ✅ (Charles güçlü) |
| Yeni Meta özelliği erişimi | Anında | BSP destekleyince | BSP destekleyince |

**AI ajanı entegrasyonu yazınca:** "Kod yükü" argümanı ikisinde de düşer. Geriye kalan gerçek fark **çalışma-zamanı operasyonel güvenlik** (360dialog lehine: token yaşam döngüsü, numara kalite derecesi, template onay araçları, EU DPA) vs **tam kontrol + sıfır aracı + taban maliyet** (kendi Cloud API lehine). Not: 360dialog saf/markup'suz API-first olduğu için kendi Claude ajanı + domain-core'u üstüne bağlamaya engel değildir — all-in-one BSP'lerin aksine kendi mantık katmanına hapsetmez.

## 6. Claude API + kart/zengin mesaj yeteneği

**Kartları WhatsApp taşır, Claude içeriğini üretir.** Cloud API 2026 zengin tipleri: butonlar (≤3), liste mesajları (≤10 öğe), carousel/kart dizisi (2–10 kart; görsel+metin+1-2 buton), ürün kartı carousel'i (kullanıcıyı WhatsApp'ta tutar), iletişim kartı, konum, medya, emoji reaksiyon.

Akış: Claude cevabı + hangi kart gösterileceğine dair JSON üretir → backend bunu WhatsApp interactive/carousel formatına çevirir → Cloud API/360dialog gönderir. Claude kart görselini çizmez ama "bu müşteriye şu 3 böreği, şu fiyatla, 'Sepete ekle' butonuyla göster" kararını ve çok-dilli içeriği üretir.

**Template sınırı:** İşletme-başlatan mesajda carousel/kart önceden Meta-onaylı template olmalı. 24 saat servis penceresi içinde (müşteri yazdıktan sonra) serbest interaktif mesaj template'siz gönderilebilir. Yani Claude'un tam dinamik kartı ağırlıkla inbound sohbette çalışır; proaktif kampanyada onaylı template iskeleti değişkenlerle doldurulur.

## 7. Doğrulanamayan / dikkat edilecek noktalar

- Takipçi sayıları arama-anı snapshot; bazıları (YÖREM, Tatlım, Çavuşzade) IG giriş duvarı nedeniyle doğrulanamadı.
- Bizz Bize HQ şehri ve tam ürün yelpazesi doğrulanamadı.
- Suntat/Baktat market/barkod rakamları kaynaklar arası tutarsız; muhafazakâr doğrulanmış değerler (3.000+ ürün, 50+ ülke, ~1.800 çalışan) esas alındı.
- Meta WhatsApp fiyatları çeyreklik güncellenir; kampanya öncesi güncel rate card kontrol edilmeli.
- WhatsApp Business App (ücretsiz) ticari newsletter için GDPR açısından yetersiz DPA nedeniyle riskli; ticari toplu mesaj için API + BSP + double opt-in gerekir.
