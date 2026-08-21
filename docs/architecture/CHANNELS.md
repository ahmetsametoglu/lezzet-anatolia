# Satış Yüzeyleri ve Sipariş Kaynağı

Bu dosya, **bir siparişin nereden kapandığını** ve sistemin bunu nasıl **tek modelde** taşıdığını anlatır. WhatsApp kanalı buraya oturur; strateji kararları `ADR_WHATSAPP.md`'de, işler `BACKLOG.md`'de, pazar analizi `WHATSAPP_ANALYSIS.md`/`COMPETITORS.md`'de.

> **Taşıma katmanı değişti + kanal genişledi (21.08 · ADR-006):** 360dialog kurulmayacak — tek
> Business tipi Meta app'te **WhatsApp Cloud API + Messenger Platform + Instagram Messaging**, tek
> webhook alıcısı. Konuşma modeli üç kanalı `conversation.source` ekseninde taşıyor; operasyondaki
> yüzey `/operations/social` (sosyal gelen kutusu). Bu dosyadaki 360dialog referansları "Meta
> Cloud API / Graph API" diye okunur; metin webhook turunda (15.7) elden geçirilecek.

Temel ilke (STACK §8, ADR-004): WhatsApp yeni bir *beyin* değil, `domain-core`'un yeni bir **yüzeyidir**. Stok, fiyat ve sipariş durum makinesi her yüzeyde aynı motordan geçer.

---

## 1. İki satış yüzeyi, tek sipariş modeli

Sistem üzerinden geçen her sipariş aynı `orders` tablosuna, aynı durum makinesine ve aynı domain motoruna düşer. Sipariş **nereden** kapatılırsa kapatılsın iş mantığı tektir:

- **Vitrin sitesi** — müşteri katalog/sepet/checkout üzerinden kapatır.
- **WhatsApp** — müşteri sohbette kapatır (zeminde admin elle işler; canlıda AI ajanı + interaktif kart + Stripe link — ikisi de Faz 1).
- **Kapı önü (hızlı satış)** — depo kapısında tek adımda kapanır (bkz. `ORDER_LIFECYCLE.md`).
- **Elle giriş** — telefon/DM'den gelen siparişin admin tarafından sisteme işlenmesi.

> WhatsApp, ADR-001'de **merkezî satış kanalı** olarak konumlandı: site vitrin ve katalog kalır, satışın kapandığı yer büyük ölçüde WhatsApp'tır. Ama sistem tarafında hiçbir yüzey ayrıcalıklı değildir — hepsi domain-core'u çağırır.

---

## 2. Üç bağımsız eksen — karıştırılmaz

Bir sipariş üç ayrı soruyu bağımsız yanıtlar. Bunlar **ortogonaldir**; biri diğerini belirlemez:

| Eksen | Soru | Değerler | Alan |
| --- | --- | --- | --- |
| **Kanal** | Sipariş veren *kim*? | `b2b` / `b2c` | `channel` (müşteri tipinden otomatik, değişmez) |
| **Sipariş kaynağı** | Sipariş *nereden kapandı*? | `web` / `whatsapp` / `door` / `manual` | `order_source` |
| **Teslimat tipi** | Sipariş *nasıl gidiyor*? | `route` / `shipping` | `delivery_type` |

Örnek: bir B2C müşteri WhatsApp'tan sipariş verip rota-içi teslimat seçebilir → `channel=b2c`, `order_source=whatsapp`, `delivery_type=route`. Aynı müşteri bir dahaki sefere siteden kargoyla alabilir → yalnızca `order_source` ve `delivery_type` değişir, müşteri ve kanal aynı kalır.

> **Terminoloji uyarısı:** DOMAIN'de "**Kanal**" kelimesi yalnızca `b2b`/`b2c` demektir (bkz. `DOMAIN.md §1, §3`). Siparişin nereden kapandığı için **"sipariş kaynağı"** (`order_source`) terimi kullanılır. İkisi farklı eksendir; "WhatsApp kanalı" günlük dilde geçse de veri modelinde `order_source=whatsapp`'tır.

### Neden ayrı bir eksen — ve neden zeminde

`order_source` **zeminde bile veri modelinde vardır.** WhatsApp siparişi admin tarafından elle girilse bile kaynağı `whatsapp` yazılır. Yüzey canlı adımda otomasyona (webhook + AI ajanı) dönünce **veri modeli değişmez** — yalnızca siparişi *oluşturan* yüzey değişir: alan baştan var, otomasyon sonra dolar.

---

## 3. Kimlik çözümü — telefon anahtardır (yalnız WhatsApp'ta)

WhatsApp müşteriyi **telefon numarasıyla** tanır; web müşteriyi e-posta/oturumla tanır. Aynı kişi iki yüzeyden gelebilir, sistem tek müşteride birleştirmelidir.

- WhatsApp'tan sipariş/konuşma geldiğinde: **telefonla bul-veya-oluştur.** Numara bir müşteriyle eşleşiyorsa o müşteriye bağlanır; eşleşmiyorsa taslak müşteri açılır.
- `Customer.phone` bu yüzden bir **kimlik anahtarıdır** — normalize edilmiş (E.164) tutulur.
- Web'de e-postayla, WhatsApp'ta telefonla gelen aynı müşteride birleşir; kanal (b2b/b2c) yine `company_info` varlığından türetilir, kaynaktan değil.
- Bu kural `domain-core`'da saf bir çözümleyici olarak yaşar (uygulama katmanına dağıtılmaz).
- **Messenger/Instagram'da telefon YOKTUR (21.08 · doğrulanmış):** kişi kimliği PSID/IGSID'dir ve
  Meta ondan telefon/e-posta VERMEZ. Bu kanalların konuşması **kimliksiz doğar**
  (`conversation.customer_id null`) ve müşteriye ancak iki yolla bağlanır: operatörün bağlama
  eylemi (15.16) ya da 04.10 çapraz-kanal çapasının bu kanallara genellenmesi (kod e-postaya
  gider, müşteri sohbetten geri yazar). Sohbetin görünen adı `conversation.profile_name`'dir —
  görünen ad, kimlik değil.

---

## 4. Inbound ≠ Outbound

Mesajlaşmanın iki yönü ayrı katmanlarda yaşar; karıştırılmaz:

```
INBOUND  (müşteri → biz)                 OUTBOUND  (biz → müşteri)
  WhatsApp mesajı                          sipariş onayı, kargo bildirimi,
    → 360dialog webhook                      "yola çıktık", kampanya
    → apps/backend                         packages/notify (soyut katman)
    → AI ajanı (packages/ai)                 ├─ e-posta sürücüsü      (Faz 1)
    → domain-core (stok/fiyat/sipariş)       ├─ wa.me deep-link       (Faz 1)
    → yanıt/kart/Stripe link                 ├─ WhatsApp API (360dialog) (Faz 1, canlı)
                                             └─ mobil push            (Faz 2)
```

- **Inbound** (müşterinin başlattığı sohbet) `apps/backend`'de webhook olarak alınır — web uygulamasının dağıtımından bağımsız (bkz. `INTEGRATIONS.md`, STACK §7).
- **Outbound** (bizim gönderdiğimiz bildirim) `packages/notify` soyut katmanının arkasındadır; `wa.me` ile WhatsApp API aynı arayüzün iki sürücüsüdür.
- İkisi de **aynı** `domain-core`'dan beslenir; ticari gerçek tek yerdedir.

---

## 5. AI ajanı sınırı (ADR-004 özeti)

- **Claude API = mesaj beyni.** Çok dilli içerik + hangi kartın/aksiyonun gösterileceği kararını üretir.
- **domain-core = gerçek.** Stok rezervasyonu, fiyat çözümü, sipariş durum makinesi burada; ajan bunları **okur**, asla uydurmaz.
- **WhatsApp = taşıyıcı.** Butonu/listeyi/carousel'i/ürün kartını taşır; içeriği ajan üretir, render'ı Cloud API/360dialog yapar.
- Sağlayıcı-agnostik: AI arayüzü `packages/ai`'da; çeviri ve konuşma ajanı aynı paketin yetenekleridir.

Akış: `müşteri mesajı → 360dialog webhook → apps/backend → packages/ai (cevap + kart kararı) → domain-core (stok/sipariş) → carousel/Stripe link → onay`.

---

## 6. Inbound-öncelikli mesajlaşma ilkesi (ADR-005 özeti)

- **"Önce müşteri yazsın."** Kullanıcı-başlatan 24 saatlik servis penceresinde mesajlar ücretsiz; işletme-başlatan template mesajı FR/DE'de pahalı (~€0,13–0,14).
- `wa.me` click-to-chat girişleri her yere serpilir (IG bio, site, QR, broşür) — müşteri sohbeti başlatır.
- Proaktif pazarlama şablonları **seyrek, segmentli ve yalnızca double opt-in ile** (Faz 2).
- Utility şablonları (sipariş onayı, kargo bildirimi) ücretsiz servis penceresi içinde önceliklidir.
- Hem maliyet hem GDPR aynı yöne işaret eder: inbound-öncelik altın kuraldır.

---

## 7. Konuşma verisi (kendi DB'mizde)

Konuşma durumu **bizim veritabanımızda** yaşar (karar: kendi DB — AI ajan bağlamı + tek-kaynak + taşınırlık). Alanlar zeminde tanımlıdır, otomasyon canlı adımda doldurur. Varlıklar `DATA_MODEL.md`'de: `Conversation` (kaynak ekseni, opt-in, 24s pencere, işletme hesabı, profil adı, son mesaj), `Message` (yön, tür, sağlayıcı mesaj id'si).

- **Üç Meta kanalı tek modelde (21.08, ADR-006):** kanal `conversation.source` ekseninde ayrışır
  (`whatsapp` · `messenger` · `instagram`); tekillik `(source, external_ref)`. Pencere kavramı üç
  kanalda da 24 saattir; **ekonomisi** yalnız WhatsApp'ındır (şablon/ücret — Messenger/IG ücretsiz,
  pencere-dışı kuralları etikettir).
- Opt-in durumu ve servis penceresi bitişi bizde tutulur → hangi mesajın ücretsiz/template olduğu bizim tarafta bilinir.
- Sağlayıcı değişse de konuşma tarihi ve müşteri bağlamı bizde kalır.

---

## 8. Faz yerleşimi

| | Faz 1 / adım 1 — Zemin | Faz 1 / adım 2 — Canlı | Faz 2 — Ölçek |
| --- | --- | --- | --- |
| Sipariş kaynağı alanı | ✅ var (`order_source`) | — | — |
| Telefon kimliği + çözümleyici | ✅ | — | — |
| Konuşma veri modeli | ✅ tanımlı (boş) | dolar | — |
| WhatsApp sipariş girişi | elle (admin) | AI ajanı otomatik | — |
| Outbound | e-posta + `wa.me` | + WhatsApp API (360dialog) template | + segmentli kampanya |
| Inbound sohbet | yok | AI ajanı + interaktif kart | tam chatbot/SSS |
| Ödeme | web checkout / kapıda | + Stripe payment link (sohbette) | — |

Sıra kuralı (SCOPE ile uyumlu): zemin adımında yalnızca **genişlemeye engel olmayan** kararlar verilir; canlı API kodu zeminle aynı anda yazılmaz ama alanları ve arayüzü hazır bırakılır.

---

## İlgili dosyalar

- `AI_CUSTOMER_AGENT.md` — müşteri ajanının işletme kurgusu: otonom-varsayılan reaktif cevap +
  proaktif satış döngüsü (inceleme 09.08, karar turu bekliyor)
- `ADR_WHATSAPP.md` — WhatsApp strateji kararları (ADR-001…005)
- `WHATSAPP_ANALYSIS.md` — pazar/kanal analizi ve teknik olabilirlik
- `COMPETITORS.md` — rakip haritası
- `DATA_MODEL.md` — `order_source`, `Conversation`, `Message`, telefon kimliği
- `DOMAIN.md §3` — kanal vs sipariş kaynağı ayrımı, kimlik kuralı
- `ORDER_LIFECYCLE.md` — kaynak eksenin durum makinesine etkisi (yok)
- `INTEGRATIONS.md` — 360dialog, Stripe, AI sağlayıcı arayüzleri
