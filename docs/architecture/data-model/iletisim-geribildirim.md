# Veri Modeli — İletişim, Geri Bildirim ve Analitik

Konuşma/mesaj, webhook, analitik olayı, yorum, puan, talep, işletme ayarı.

> Bu dosya `../DATA_MODEL.md`'nin parçasıdır. Ortak ilkeler (çok dilli alanlar, türetme ilkesi, enum listesi, kalıcı kararlar) ana dosyadadır; **karar oraya, alan buraya** yazılır.

---

## Conversation (konuşma) — WhatsApp/mesajlaşma

Konuşma durumu kendi DB'mizde yaşar (karar: kendi DB — bkz. `CHANNELS.md §7`). Alanlar Faz 1'de tanımlı, otomasyon Faz 2'de doldurur.

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| customer_id | uuid \| null | telefonla çözülür; taslakta boş olabilir |
| source | enum(`whatsapp`) | ileride başka mesajlaşma kaynağı eklenebilir |
| external_ref | string | sağlayıcıdaki kişi/thread anahtarı (WhatsApp: telefon) |
| opt_in | boolean | ticari mesaj izni (double opt-in, `DOMAIN.md §11`) |
| opt_in_at | timestamptz \| null | |
| window_expires_at | timestamptz \| null | 24s servis penceresi bitişi (ücretsiz/template kararı) |
| last_message_at | timestamptz \| null | |
| created_at | timestamptz | |

## Message (mesaj)

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| conversation_id | uuid | |
| direction | enum(`inbound`,`outbound`) | müşteri→biz / biz→müşteri |
| kind | enum(`text`,`interactive`,`template`,`media`) | |
| body | jsonb | metin veya kart/interaktif yapı |
| template_name | string \| null | outbound template ise (Meta-onaylı) |
| provider_message_id | string \| null | 360dialog/Cloud API mesaj id'si |
| created_at | timestamptz | |

## WebhookEvent (dış olay kaydı)

Stripe/360dialog webhook'ları için tekrar-işleme kilidi (idempotency): aynı olay ikinci kez gelirse no-op (bkz. `STACK.md §13`).

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| provider | string | stripe / 360dialog |
| provider_event_id | string | **unique** (provider ile birlikte) |
| processed_at | timestamptz \| null | |
| payload | jsonb \| null | ham gövde (hata ayıklama) |

## AnalyticsEvent (analitik olayı)

Cookie'siz, sunucu-tarafı, toplu ölçüm (bkz. `FEATURES.md` Analitik). Kişisel kimlik yok; giriş yapılmışsa `customer_id` opsiyonel.

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| type | enum(`page_view`,`product_view`,`add_to_cart`,`checkout_start`,`order_placed`,`product_swipe`,`share`,`search`) | |
| session_key | string | sunucu-tarafı geçici oturum (kişisel değil) |
| source | string \| null | trafik kaynağı |
| utm | jsonb \| null | kampanya (source/medium/campaign) — reklam ROI |
| path | string \| null | |
| product_id | uuid \| null | |
| variant_id | uuid \| null | |
| customer_id | uuid \| null | yalnız giriş yaptıysa (opsiyonel) |
| device | enum(`web`,`mobile`) | |
| country | enum(`FR`,`DE`) \| null | |
| language | enum(`tr`,`fr`,`de`) \| null | |
| meta | jsonb \| null | tipe özel (ör. `product_swipe`: `{context, direction, order_id?, dwell_ms}`); `dwell_ms`+desen sinyal kalitesi/ağırlık için; `search`: `{query, result_count}` — sıfır-sonuç aramalar talep/çeşit sinyali |
| created_at | timestamptz | |

## Review (ürün yorumu)

Yalnız satın alan müşteri; moderasyondan sonra ürün sayfasında görünür (bkz. `DOMAIN.md §14`).

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| product_id | uuid | yorum ürün düzeyinde |
| customer_id | uuid | |
| order_id | uuid \| null | doğrulanmış alışveriş |
| rating | int \| null | 1–5 |
| comment | text \| null | |
| is_approved | boolean | moderasyon (görünmeden önce) |
| created_at | timestamptz | |

## FeedbackRequest (geri bildirim daveti)

Teslim sonrası (~10 gün) swipe/yorum daveti; tamamlayınca ödül kuponu (bkz. `DOMAIN.md §14`).

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| order_id | uuid | |
| customer_id | uuid | |
| channel | enum(`email`,`whatsapp`) | davetin gittiği kanal |
| sent_at | timestamptz \| null | |
| completed_at | timestamptz \| null | |
| points_awarded | int \| null | tamamlayınca verilen puan (`PointsEntry`); puanlar sonra kişisel kupona çevrilir |

## PointsEntry (puan hareketi)

Oyunlaştırma/sadakat: müşteri aksiyonları puan kazandırır, biriken puan kişisel kupona çevrilir. Ledger; bakiye **türetilir** (Σ points).

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| customer_id | uuid | |
| points | int | +kazanım / −harcama (delta) |
| reason | enum(`review`,`swipe_candidate`,`swipe_post_purchase`,`order`,`redemption`,`manual`) | |
| ref_id | uuid \| null | ilgili kayıt (review/order/discount…) |
| created_at | timestamptz | |

Puan bakiyesi = Σ `points` (saklanmaz, türetilir). Kupona çevirme: `redemption` (negatif) + kişisel `Discount` (`customer_id`).

## Ticket (müşteri talebi / şikâyet)

Basit yaşam döngüsü; siparişe ve ürünlere isteğe bağlı bağlanır (bkz. `DOMAIN.md §15`).

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| customer_id | uuid | |
| order_id | uuid \| null | siparişle ilgiliyse |
| order_item_ids | uuid[] | ilgili sipariş kalemleri (boş olabilir) |
| conversation_id | uuid \| null | WhatsApp'tan açıldıysa |
| type | enum(`damaged`,`missing`,`question`,`other`) | bozuk / eksik / soru / diğer |
| status | enum(`open`,`in_progress`,`resolved`) | yeniden açılabilir → `open` |
| subject | text \| null | kısa başlık |
| created_at / resolved_at | timestamptz | |

## TicketMessage (talep yazışması)

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| ticket_id | uuid | |
| sender | enum(`customer`,`admin`) | |
| body | text | |
| attachments | text[] | storage yolu (fotoğraf vb.) |
| created_at | timestamptz | |

## Setting (işletme ayarı)

Parametrik değerler (minimum sepet, ücretsiz kargo eşiği, **yaklaşan son tarih eşiği — kalan %, varsayılan %25**, **önerilen near-expiry indirim — varsayılan %30**, **MLOR kabul eşiği — kalan %, varsayılan %75**, KDV varsayılanları, **checkout rezervasyon TTL — varsayılan 30 dk (Stripe oturum asgarisi; ödeme penceresiyle eşit)**, **kapıda ödeme tavanı — yöntem bazında: nakit varsayılanı yasal sınır ~1.000€, uyarı verir engellemez; genel kötüye-kullanım tavanı ayrı**, **sipariş kesim saati (cut-off)**, **teslim onayı kapsamı — B2B zorunlu / B2C kapalı varsayılanı**, **teslimat özeti otomatik e-posta — varsayılan açık**, **vade süresi varsayılanı — 30 gün**, **oyunlaştırma: aksiyon puan değerleri + puan→kupon eşiği/oranı**, **kâr hesabı için: rota teslimat birim maliyeti, paketleme birim maliyeti, ödeme komisyon oranları**). Yapı **kapsamlıdır (scoped)**: `key + scope_type(global/channel/zone/country) + scope_id + value` — minimum sepet gibi değerler kanala/bölgeye/ülkeye göre farklılaşabilir; çözücü en özgül kapsamı seçer, yoksa global'e düşer. Önbellekli çözücü (blueprint STACK §10). Env'e veya koda gömülmez.

---
