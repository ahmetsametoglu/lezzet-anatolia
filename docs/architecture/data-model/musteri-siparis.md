# Veri Modeli — Müşteri ve Sipariş

Müşteri, adres, teslimat bölgesi, sipariş ve kalemleri, sepet, kurye gün kapanışı.

> Bu dosya `../DATA_MODEL.md`'nin parçasıdır. Ortak ilkeler (çok dilli alanlar, türetme ilkesi, enum listesi, kalıcı kararlar) ana dosyadadır; **karar oraya, alan buraya** yazılır.

---

## Customer (müşteri)

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| type | enum(`individual`,`company`) | kanal bunu belirler |
| company_info | jsonb \| null | şirket bilgisi — doluysa B2B |
| vat_number | string \| null | AB vergi no (Alman USt-IdNr); reverse charge için |
| vat_number_valid | boolean \| null | VIES doğrulaması (açık API) |
| name | string | |
| email | string \| null | web kimliği |
| phone | string \| null | **kimlik anahtarı** — WhatsApp bununla tanır; normalize (E.164), bkz. `CHANNELS.md §3` |
| preferred_language | enum(`tr`,`fr`,`de`) | |
| country | enum(`FR`,`DE`) | |
| credit_enabled | boolean | vadeli (hesaba) sipariş yetkisi — **varsayılan false**, admin elle açar (bkz. `DOMAIN.md §7`) |
| credit_limit | number \| null | vade limiti (€) — vade açılırken admin girer; açık bakiye **türetilir** (ödenmemiş `on_account` siparişler), saklanmaz |
| payment_term_days | number \| null | vade süresi (gün) — boşsa `Setting` varsayılanı (30); gecikme bundan türetilir |
| discount_percent | number \| null | müşteriye genel özel indirim oranı; kanal fiyatına uygulanır (bkz. `DOMAIN.md §5`) |
| cod_allowed | boolean | kapıda ödeme izni (varsayılan true); kötüye kullanımda kapatılır (bkz. `DOMAIN.md §7`) |
| auth_user_id | uuid \| null | Supabase Auth kullanıcısı; doğrulanınca bağlanır (bkz. `DOMAIN.md §10`) |
| marketing_consent | jsonb | kanal bazlı pazarlama izni: `{email: {granted, at, source}, whatsapp: {...}}` — GDPR kanıtı (ne zaman, nereden); **Faz 1'de yalnız toplanır, gönderim yok** (bkz. `DOMAIN.md §11`) |
| acquisition_source | jsonb \| null | edinim kaynağı — **ilk siparişte bir kez** yazılır (UTM snapshot + order_source), sonra değişmez; "kaynağa göre tekrar sipariş" raporunun temeli |
| referred_by | uuid \| null | bu müşteriyi getiren müşteri (arkadaşını getir) — kayıtta bir kez |
| b2b_approved | boolean \| null | B2B self-servis kayıt onayı — onaylanana dek toptan fiyat görünmez (bkz. `DOMAIN.md §10`); B2C'de null |
| is_draft | boolean | taslak müşteri (WhatsApp telefonuyla otomatik açılan) — doğrulanınca false; birleştirme adayı işareti |
| addresses | (ayrı tablo) | |
| created_at | timestamptz | |

## Address (adres)

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| customer_id | uuid | |
| line1, line2, postal_code, city, country | string | |
| in_route | boolean (türetilir) | posta kodu aktif bir `DeliveryZone`'a düşüyor mu |

## DeliveryZone (rota / teslimat bölgesi)

Admin tarafından düzenlenir; rota-içi belirleme ve teslimat günü bundan türer.

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| name | string | iç etiket (ör. "Strasbourg Kuzey") |
| postal_codes | string[] | bölgeye dahil posta kodları (FR + DE/Baden dahil) |
| weekdays | int[] | haftalık teslimat günleri (1=Pzt … 7=Paz) |
| active | boolean | |

## Order (sipariş)

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| customer_id | uuid | |
| channel | enum(`b2b`,`b2c`) | *kim* — müşteri tipinden otomatik, değişmez |
| order_source | enum(`web`,`whatsapp`,`door`,`manual`) | *nereden kapandı* — kanaldan bağımsız eksen (bkz. `CHANNELS.md §2`) |
| is_gift_order | boolean | patron ikramı (arkadaşa hediye); **yalnız muhasebe export'una girmez** — gelir/kâr/kasa/ortaklık dahil gerisi tam normal, parayı patron öder (bkz. `DOMAIN.md §9`) |
| status | enum | bkz. `ORDER_LIFECYCLE.md` |
| payment_status | enum(`pending`,`paid`,`partial`,`refunded`) | ayrı eksen; **türetilir** (`amount_collected`−`amount_refunded` vs karşılanan tutar) — bkz. Kalıcı kararlar |
| payment_method | enum(`online`,`cash`,`card`,`cheque`,`bank_transfer`) \| null | `bank_transfer` = havale (peşin veya vadeli tahsilat) |
| on_account | boolean | vadeli sipariş mi — yalnız `credit_enabled` müşteride true; peşin ödemesiz `confirmed` (bkz. `DOMAIN.md §7`) |
| delivery_type | enum(`route`,`shipping`) | rota içi / kargo |
| delivery_zone_id | uuid \| null | rota-içi ise hangi bölge (bkz. `DeliveryZone`) |
| delivery_date | date \| null | seçilen/atanan rota günü; kargoda null |
| address_id | uuid \| null | teslimat adresi; hızlı satışta null |
| address_snapshot | jsonb \| null | sipariş anında adresin kopyası — adres sonradan değişse de sipariş bozulmaz (zone editable olduğu için `delivery_zone_id` de snapshot'tır) |
| courier_id | uuid \| null | atanan kurye (rota teslimatı; atamada dolar) |
| delivery_country | enum(`FR`,`DE`) | teslimat ülkesi — DE B2C 10.000€ OSS eşiği izlemi (bkz. `DOMAIN.md §5`) |
| vat_number_snapshot | string \| null | reverse charge siparişinde o anki geçerli vergi no (denetim kanıtı) |
| shipping_fee | number | müşteriden alınan kargo ücreti (varsayılan 0); KDV'ye tabi (bkz. `DOMAIN.md §6`) |
| reference_no | string | sistemin ürettiği referans — marka+yıl+**rastgele** (ör. `LA-26-7K4M2P`), hacim sızdırmaz; **ilk kalıcı duruma geçişte** üretilir (`confirmed`, hızlı satışta `completed`); resmî fatura no değil |
| delivery_proof | jsonb \| null | teslim onayı: imza görüntüsü/foto (storage yolu), onaylayan, zaman — B2B varsayılan zorunlu, B2C kapalı (parametrik; bkz. `DOMAIN.md §6`) |
| invoice_no | string \| null | dış muhasebeden sonradan eşleşir |
| vat_treatment | enum(`domestic`,`intra_eu_b2b_reverse_charge`) | KDV işleme tipi (export için); ileride `oss_destination` |
| total | number | **sipariş edilen** toplam = Σ kalem − indirim + `shipping_fee` (sabit, sipariş anı) |
| discount_id | uuid \| null | uygulanan indirim/kupon (tek; üst üste binmez) |
| discount_amount | number | uygulanan indirim tutarı; varsayılan 0 |
| amount_collected | number | **cache** — kaynak `MoneyMovement` (siparişe bağlı girişler); toplam tahsil edilen |
| amount_refunded | number | **cache** — kaynak `MoneyMovement` (`order_refund` çıkışları); toplam iade edilen |
| cogs_amount | number \| null | malın maliyeti — tüketilen partilerin alışı; kapanışta sabitlenir |
| delivery_cost | number \| null | teslimat maliyeti (kargo gerçek / rota birim); kapanışta sabitlenir |
| payment_fee | number \| null | ödeme komisyonu (Stripe/SumUp); kapanışta sabitlenir |
| packaging_cost | number \| null | paketleme (soğuk zincir) maliyeti; kapanışta sabitlenir |
| created_at | timestamptz | |

## OrderItem (sipariş kalemi)

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| order_id | uuid | |
| variant_id | uuid | sipariş edilen varyant |
| qty | number | sipariş edilen |
| fulfilled_qty | number | **fiziksel olarak müşteriye giden** miktar (varsayılan = qty; eksikte düşer, 0 olabilir). Mal geri döndüyse düşer; `goodwill` iadesinde düşmez — mal müşteride kalmıştır |
| stock_id | uuid \| null | partiye bağlı teklif satırıysa hangi parti (batch-pinned); normal satırda null. Fiilen çıkan parti(ler) `OrderItemBatch`'te |
| bundle_id | uuid \| null | bu kalem bir paketten geldiyse hangi paket; normal satırda null |
| unit_price | number | **sabitlenmiş** fiyat (sepete eklenince) |
| line_discount_amount | number | sepet/kupon indiriminin bu kaleme **oransal payı** (varsayılan 0) — kısmi iade ve kalem KDV'si indirimli birimden hesaplanır (bkz. `DOMAIN.md §5`) |
| vat_rate | number | o anki oran |
| return_disposition | enum(`restock`,`discard`,`goodwill`) \| null | kalem iade edildiyse **mala ne oldu** (DOMAIN §8). `goodwill` = mal müşteride kaldı: `fulfilled_qty` ve stok DEĞİŞMEZ, yalnız para iade edilir — jestin maliyeti kârda görünür |

## OrderItemBatch (kalem–parti eşlemesi)

Hazırlıkta fiilen çıkan parti(ler)in kaydı — depocu FEFO önerisini onaylarken otomatik yazılır (bkz. `DOMAIN.md §4`). Geri çağırma ("bu parti kimlere gitti") ve gerçek COGS (`Order.cogs_amount`) buradan türetilir.

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| order_item_id | uuid | |
| stock_id | uuid | çıkan parti |
| qty | number | bu partiden çıkan adet (kalem birden çok partiden karşılanabilir) |

Σ qty = kalemin `fulfilled_qty`'si. `cogs_amount` = Σ (qty × partinin `purchase_price`) — kapanışta sabitlenir.

## OrderStatusLog (durum geçiş kaydı)

"Her geçiş kaydedilir" kuralının varlığı (bkz. `ORDER_LIFECYCLE.md`). Teslim anı, kapanış anı ve geri bildirim zamanlaması (~10 gün) buradan türetilir.

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| order_id | uuid | |
| from_status / to_status | enum | |
| actor_id | uuid \| null | kim (sistem olayında null) |
| created_at | timestamptz | |

## Cart (sunucu sepeti)

Giriş yapmış müşterinin sepeti sunucuda kalıcıdır — cihaz değişse de durur; sepet kurtarma e-postasının (Faz 2 otomasyonu) zeminidir.

| Alan | Tip | Not |
| --- | --- | --- |
| customer_id | uuid | tek satır / müşteri |
| items | jsonb | varyant + adet + eklenme fiyatı |
| updated_at | timestamptz | |

## CourierDayClose (kurye gün kapanışı)

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| courier_id | uuid | |
| date | date | |
| delivered_orders | uuid[] / ilişki | |
| collected_cash | number | |
| collected_card | number | |
| collected_cheque | number | |
| returns | ilişki | |
| reconciled | boolean | fark var/yok |
