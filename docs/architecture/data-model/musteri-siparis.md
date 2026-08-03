# Veri Modeli — Müşteri ve Sipariş

Müşteri, adres, teslimat bölgesi, sipariş ve kalemleri, sepet, kurye gün kapanışı.

> Bu dosya `../DATA_MODEL.md`'nin parçasıdır. Ortak ilkeler (çok dilli alanlar, türetme ilkesi, enum listesi, kalıcı kararlar) ana dosyadadır; **karar oraya, alan buraya** yazılır.

---

## Customer (müşteri)

> **Tablo adı `user_profiles`.** Müşteri ayrı bir varlık değil, kimliğin bir **ROLÜDÜR**: müşteri ve
> personel tek tabloda yaşar, `roles` ayırır (bkz. `0001`). Aşağıdaki alanların kimlik kısmı `0001`'de,
> ticari kısmı `0013`'te eklenmiştir. `customer_id` diye geçen her FK (`address`, `price`, `order`)
> bu tabloyu işaret eder — "müşteri rolüyle davranan profil" demektir.
>
> 1:1 uzantı tablosu (`customer_profile`) bilinçli olarak açılmadı: alanlar küçük skaler, satır dar,
> güvenlik sınırı bizde tabloda değil (okuma sunucudan `service_role` + guard'dan geçer). Bölmek her
> sepet/checkout okumasına join, kimlik kurulumuna ikinci satır, birleştirmeye ikinci taşıma eklerdi.

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| type | enum(`individual`,`company`) | kanal bunu belirler |
| company_info | jsonb \| null | şirket bilgisi — doluysa B2B. Alanlar (`CompanyInfoSchema`): `legalName` · `siret` · `activityCode` (APE/NAF) · `foundedYear` · `isActive`. Self-servis başvuruda (08.7) SIRET yolunda resmî kayıttan dolar, AB yolunda elle girilir. jsonb olduğu için yeni alan migration istemez |
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
| roles | enum[] (`customer`,`admin`,`warehouse`,`courier`,`accounting`) | **dizi**: personel içinde çoklu rol olağandır (depo + muhasebe). `customer` yalnız BAŞINA durabilir — müşteri ↔ personel keskin ayrım, DB kısıtıyla zorlanır (`DOMAIN.md §2`) |
| auth_user_id | uuid \| null | Supabase Auth kullanıcısı; doğrulanınca bağlanır (bkz. `DOMAIN.md §10`). **Üçüncü kimlik anahtarıdır** — `0002` trigger'ı girişte profili e-postayla bulup bağlar |
| marketing_consent | jsonb | kanal bazlı pazarlama izni: `{email: {granted, at, source}, whatsapp: {...}}` — GDPR kanıtı (ne zaman, nereden); **Faz 1'de yalnız toplanır, gönderim yok** (bkz. `DOMAIN.md §11`) |
| acquisition_source | jsonb \| null | edinim kaynağı — **ilk siparişte bir kez** yazılır (UTM snapshot + order_source), sonra değişmez; "kaynağa göre tekrar sipariş" raporunun temeli |
| referred_by | uuid \| null | bu müşteriyi getiren müşteri (arkadaşını getir) — kayıtta bir kez |
| b2b_approved | boolean \| null | B2B self-servis kayıt onayı — onaylanana dek toptan fiyat görünmez (bkz. `DOMAIN.md §10`); B2C'de null |
| is_draft | boolean | taslak müşteri (WhatsApp telefonuyla otomatik açılan) — doğrulanınca false; birleştirme adayı işareti |
| addresses | (ayrı tablo) | |
| created_at | timestamptz | |

**Kimlik anahtarları tekildir (04.5):** `phone`, `email` (küçük harfe indirgenmiş) ve `auth_user_id` kısmi unique indekslidir — aynı anahtar iki profile yazılamaz, boş anahtarlar çakışmaz. Kopya kayıt birleştirme gerektiren bir **istisnadır**; veritabanı engellemezse sessizce çoğalır. Çözüm kararı (bağlan / oluştur / çakışma) motorundur (`domain-core/identity`), kapısı `apps/web/lib/identity` — servis yalnız aday getirir.

**Trigger ile kapının iş bölümü:** `0002` trigger'ı `auth.users` insert'inde çalışır ve **yalnız e-postayla** eşleştirir — Google OAuth'ta sunucu kodumuz devrede olmayabilir, bağlama atomik olmalıdır. Sadece telefonu olan WhatsApp taslağı girişte eşleşmez, ikinci profil doğar; kapı bunu `conflict` olarak görünür kılar, birleştirme (04.7) çözer.

## Address (adres)

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| customer_id | uuid | |
| label | string? | müşterinin kendi verdiği ad ("Ev", "İş"). Checkout adres kartının **başlığı** budur: iki adres arasında seçim yapan müşteri sokak adını okuyarak değil adıyla ayırt eder. Boş bırakılabilir — ekran o zaman şehri başlık yapar, uydurma etiket yazılmaz |
| recipient | string? | adrese **giden** kişi — hesap sahibiyle aynı olmak zorunda değil (hediye, iş adresi, aile büyüğü). Kurye kapıda kimi soracağını buradan bilir |
| line1 | string | |
| line2 | string \| null | |
| postal_code | string | |
| city | string | |
| phone | string? | **teslimat** telefonu; `user_profiles.phone` hesabın numarasıdır, bu adresin. Kapıya teslimde kurye zili çalmadan önce arar — hediye adresinde aranacak numara alıcınınkidir |
| country | enum(`FR`,`DE`) | |
| is_default | boolean | müşterinin varsayılan adresi — checkout onu önceden seçer; **tekildir** (yenisi seçilince eskisi düşer). İlk adres otomatik varsayılan olur |
| created_at | timestamptz | |
| in_route | boolean (türetilir) | posta kodu aktif bir `DeliveryZone`'a düşüyor mu — **saklanmaz** |

Müşteri silinince adresleri de gider (CASCADE) — yetim adres kalmaz.

## DeliveryZone (rota / teslimat bölgesi)

Admin tarafından düzenlenir; rota-içi belirleme ve teslimat günü bundan türer.

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| name | string | iç etiket (ör. "Strasbourg Kuzey") |
| warehouse_id | uuid | **bölge tek depoya bağlıdır** — posta kodu → bölge → depo zincirinin orta halkası (`DOMAIN §17`) |
| weekdays | int[] | haftalık teslimat günleri, **ISO**: 1=Pzt … 7=Paz |
| is_active | boolean | kapatılan bölge rota sayılmaz — adres kargoya düşer |
| created_at | timestamptz | |

**Posta kodları artık bu tabloda değil** (`DeliveryZonePostalCode`, `data-model/depo.md`): dizi kolonken iki bölgeye aynı kodu yazmak serbestti ve çözücü sessizce ilkini seçiyordu — çok depoda bu, siparişin yanlış depoya düşmesi demek. Anahtar `(ülke, kod)`: `67000` iki ülkede de geçerlidir.

**Rota içi/dışı SAKLANMAZ** (07.2): adresin posta kodu aktif bir bölgeye düşüyorsa rota içi. Bölge sınırı admin tarafından değiştirilebildiği için saklanan değer ertesi gün yalan olur. Teslimat günü hesabı da (kesim saati dâhil) motordadır — `domain-core/delivery`.

## Order (sipariş)

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| customer_id | uuid | |
| warehouse_id | uuid | **bir sipariş tek depodan çıkar** (`DOMAIN §17`, istisnasız): bölünmüş sipariş yoktur; kendi deposunda olmayan kargolanabilir ürün AYRI bir kargo siparişi olur. Kaynağı ya adresin posta kodu ya işlemi yapan personelin sabit deposudur — **varsayılan depo kavramı yoktur**. Siparişe yazılan partilerin de bu depodan olduğunu ertelenmiş kısıt tutar |
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
| shipping_fee | numeric (€) | müşteriden alınan kargo ücreti (varsayılan 0); KDV'ye tabi (bkz. `DOMAIN.md §6`). Uygulamadaki adı `shippingFeeCents`, birimi **cent** (`STACK §8`) |
| reference_no | string | sistemin ürettiği referans — marka+yıl+**rastgele** (ör. `LA-26-7K4M2P`), hacim sızdırmaz; **ilk kalıcı duruma geçişte** üretilir (`confirmed`, hızlı satışta `completed`); resmî fatura no değil |
| idempotency_key | string? | **çift sipariş kalkanı** — istemcinin o checkout denemesi için ürettiği anahtar; aynı istek ikinci kez ulaşırsa (çift tıklama, ağın yeniden denemesi) ikinci sipariş AÇILMAZ, var olan döner. Kısmi unique: anahtarsız satırlar (operasyon girişi, hızlı satış) birbirini engellemez |
| delivery_proof | jsonb \| null | teslim onayı: imza görüntüsü/foto (storage yolu), onaylayan, zaman — B2B varsayılan zorunlu, B2C kapalı (parametrik; bkz. `DOMAIN.md §6`) |
| carrier | enum \| null | kargo taşıyıcısı (`colissimo · chronopost · dhl · ups · other`). **Tanımlı küme, serbest metin değil:** takip bağlantısı taşıyıcının URL kalıbından üretilir. `other` kümeyi kapatmamak için — yeni taşıyıcı migration beklemez; seçilince bağlantı gösterilmez, numara düz metin durur |
| tracking_number | text \| null | kargo takip numarası. `carrier` ile birlikte **yalnız `delivery_type = 'shipping'`** siparişlerde dolar — kural veride (`order_carrier_only_shipping`): kendi aracımızla giden malın taşıyıcısı yoktur ve ekran unutsa bile yazılamaz |
| invoice_no | string \| null | dış muhasebeden sonradan eşleşir |
| vat_treatment | enum(`domestic`,`intra_eu_b2b_reverse_charge`) | KDV işleme tipi (export için); ileride `oss_destination` |
| locale | enum(`tr`,`fr`,`de`) \| null | **siparişin dili** — müşterinin bu siparişi verirken okuduğu yüzeyin dili; sipariş maillerinin dili buradan gelir. `null` = bilinmiyor (hızlı satış, operasyon girişi) → profilin `preferred_language`'ına düşülür. Profilden okumamanın sebebi snapshot mantığı: profil sonradan değişebilir, siparişin metni değişmemeli |
| total | numeric (€) | **sipariş edilen** toplam = Σ kalem − indirim + `shipping_fee` (sabit, sipariş anı). App: `totalCents` |
| discount_id | uuid \| null | uygulanan indirim/kupon (tek; üst üste binmez) |
| discount_amount | numeric (€) | uygulanan indirim tutarı; varsayılan 0. App: `discountAmountCents` |
| discount_label | jsonb \| null | inen indirimin **müşteriye görünen adının** sipariş anındaki kopyası (`{"fr":"Offre de bienvenue",…}`) — kampanya yeniden adlandırılsa/silinse de siparişin maili ve fişi aynı şeyi der; `address_snapshot` ile aynı gerekçe. `null` = ad verilmemiş → yüzey genel "İndirim"e düşer |
| amount_collected | numeric (€) | **cache** — kaynak `MoneyMovement` (siparişe bağlı girişler); toplam tahsil edilen. App: `amountCollectedCents` |
| amount_refunded | numeric (€) | **cache** — kaynak `MoneyMovement` (`order_refund` çıkışları); toplam iade edilen. App: `amountRefundedCents` |
| cogs_amount | numeric (€) \| null | malın maliyeti — tüketilen partilerin alışı; kapanışta sabitlenir. App: `cogsAmountCents` |
| delivery_cost | numeric (€) \| null | teslimat maliyeti (kargo gerçek / rota birim); kapanışta sabitlenir. App: `deliveryCostCents` |
| payment_fee | numeric (€) \| null | ödeme komisyonu (Stripe/SumUp); kapanışta sabitlenir. App: `paymentFeeCents` |
| packaging_cost | numeric (€) \| null | paketleme (soğuk zincir) maliyeti; kapanışta sabitlenir. App: `packagingCostCents` |
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
| unit_price | numeric (€) | **sabitlenmiş** fiyat (sepete eklenince). App: `unitPriceCents` |
| line_discount_amount | numeric (€) | sepet/kupon indiriminin bu kaleme **oransal payı** (varsayılan 0). App: `lineDiscountAmountCents` — kısmi iade ve kalem KDV'si indirimli birimden hesaplanır (bkz. `DOMAIN.md §5`) |
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
| from_status | enum \| null | ilk kayıtta null (siparişin doğuşu) |
| to_status | enum | |
| actor_id | uuid \| null | kim (sistem olayında null) |
| created_at | timestamptz | |

**`transition_order_status` fonksiyonu (07.6):** durum güncellemesi + log satırı tek transaction'da ve **yalnız beklenen kaynaktan** (koşullu). Araya biri girmişse yazmaz, güncel durumu bildirir — depocu "hazır" derken kurye "yolda" dediğinde biri diğerini sessizce ezmez. Geçişin izinli olup olmadığına fonksiyon KARAR VERMEZ; o motorun işidir (`domain-core/order/status-machine`).

## order_sale (görünüm — gerçekleşmiş satış)

Sipariş kayıt anında değil, **gerçekleştiği anda** gelirdir. `order_sale`, teslim edilmiş ya da kapanmış siparişleri `sale_date` ile birlikte verir: `sale_date` = `OrderStatusLog`'un İLK `delivered`/`completed` kaydının günü. Muhasebe export'u (12.7) da dönemsel kârlılık (12.6) da bu tarihi okur — iki rapor iki ayrı "satış günü" hesaplamaz.

- **`min(...)` şart:** tam yolda sipariş önce `delivered` sonra `completed` olur, ikisi farklı aya düşebilir. Kapanışı esas alsaydık ocakta teslim edilmiş satış şubat cirosuna yazılırdı.
- **`o.*` seçilir:** görünüm siparişin alanlarını yeniden yazmaz, yalnız `sale_date` ekler. Şema da öyle türetilir (`OrderSaleSchema = OrderSchema.extend({saleDate})`); alan listesi kopyalansaydı `order`a eklenen kolon burada sessizce eksik kalırdı.
- **Hediye sipariş DIŞLANMAZ:** patron ikramı gelirdir, kârdır, kasaya girer — yalnız dış muhasebeye gitmez. Süzgeç export kapısındadır (`domain-core/accounting`); burada dışlansaydı `is_gift_order` "yalnız export filtresini etkiler" kuralı sessizce genişlerdi.
- **`returned` dışarıda:** mal geri gelmiş, para iadesi süreci açık (07.9). Sipariş `completed`'a dönünce satış yine görünür ve `sale_date` orijinal teslim günüdür — geçmiş dönemin raporu yeniden üretildiğinde satır doğru aya oturur.

## Cart (sunucu sepeti)

Giriş yapmış müşterinin sepeti sunucuda kalıcıdır — cihaz değişse de durur; sepet kurtarma e-postasının (Faz 2 otomasyonu) zeminidir.

| Alan | Tip | Not |
| --- | --- | --- |
| customer_id | uuid | **birincil anahtar** — "tek satır / müşteri" kuralı şemada zorlanır |
| items | jsonb | `[{ kind, variantId, bundleId, qty, unitPrice, stockId, addedAt }]` |
| saved_items | jsonb | **sonraya kaydedilenler** (K33) — aynı biçim, aynı satır |
| updated_at | timestamptz | her dokunuşta tazelenir (sepet kurtarma zamanlaması buna bakar) |

**Sepetteki `unitPrice` BAĞLAYICI DEĞİLDİR** (DOMAIN §5): gösterim ve değişiklik tespiti içindir. Bağlayıcı fiyat **checkout başlangıcında** çözülür ve orada sabitlenir — stok ayırma + ödeme oturumuyla aynı 30 dk'lık pencerede. Sepet aylarca bekleyebilir; oradaki fiyatı bağlayıcı saymak maliyeti oynayan üründe zarar, fiyat düştüğünde müşteriye haksızlık olurdu.

**`stockId` dolu satır** partiye çıpalı teklif kalemidir ve normal satırdan **ayrı yaşar** — aynı ürün hem indirimli partiden hem normal fiyattan sepette olabilir. İndirim partiye aittir; parti tükenirse başka partiye taşınmaz.

**Sepette stok ayrılmaz** (DOMAIN §4): sepet bir niyet kaydıdır, rezervasyon checkout'ta yapılır.

**İKİ TÜR satır vardır** ve `kind` bunu açıkça taşır: varyant satırı (`variantId` + `stockId`) ve **paket satırı** (`bundleId`, 05.5). Paketin varyantı ya da partisi yoktur — satılan şey paketin kendisidir ve sepette bütün olarak artırılır/silinir (DOMAIN §13). Türü kimlik alanının varlığından çıkarmak yerine açıkça yazmanın sebebi kod tarafında: TypeScript yalnız birim tipli alanlarla daraltma yapar, `string` birim tip değildir.

**`saved_items` — sonraya kaydedilenler.** Teslimat yerine gönderilemeyen kalem sepetten SİLİNMEZ, buraya taşınır: alışveriş ölmez, sepet bölünür. Ayrı tablo açılmadı çünkü ikisi aynı şeyin iki hâli — ikisi de "bu ürünü istiyorum" kaydı, ayrımları yalnız BUGÜN alınıp alınamayacağı. Ayrı yapılarda tutmak, aralarında taşırken iki yazma yolu açardı. `addedAt` taşınırken korunur: "iki haftadır bekliyor" sinyali listeye geçerken sıfırlanmamalı.

## CourierDayClose (kurye gün kapanışı)

Kapanış bir **mutabakattır**, para hareketi değil: para kapıda tahsil edilirken yazıldı (`money_movement`, 12.2). Bu tablo beklenen ile sayılanı yan yana koyar ve farkı **aynı gün** görünür kılar (DOMAIN §7).

| Alan | Tip | Not |
| --- | --- | --- |
| id | uuid | |
| courier_id | uuid | `restrict` — kapanışı olan kişi silinemez |
| date | date | `(courier_id, date)` **tekil**: bir gün bir kez kapanır |
| expected_cash / expected_card / expected_cheque | numeric | sistemin hesabı — kapanış anında DONDURULUR |
| counted_cash / counted_card / counted_cheque | numeric | kuryenin fiilen teslim ettiği (sayım / cihaz raporu / yapraklar) |
| delivered_orders | uuid[] | günün teslim edilenleri (`delivered` + `completed`) |
| returned_orders | uuid[] | reddedilenler — getirilen mal |
| pending_orders | uuid[] | sonuçlanmamışlar; yarına devrolur |
| note | text \| null | fark açıklaması — fark gizlenmez, açıklanır |
| closed_by | uuid \| null | |
| closed_at | timestamptz | |
| reconciled | boolean | **generated** — beklenen = sayılan mı |

**`expected_*` türetilebilir olduğu hâlde SAKLANIR.** Kaynağı `courier_day_collection` görünümüdür (kapıda toplanan üç yöntemin sipariş hareketleri); ama kapanış o anın fotoğrafıdır — sonradan bir hareket düzeltilirse geçmiş mutabakat değişmemeli, "o gün ne konuşuldu" sabit kalmalı. Türetim ile snapshot çelişmez: canlı hesap görünümde, donmuş hesap burada.

**`reconciled` ise saklanmaz, generated kolondur.** Beklenen ve sayılan zaten yan yana duruyorken "fark var/yok" ayrıca yazılsaydı bir gün ikisi çelişirdi (DATA_MODEL kalıcı kararlar: türetilebilen sayaç tutulmaz). Generated kolon hem sorgulanabilir (mutabık olmayan günler listesi) hem kayamaz.

**Fark ayrı kolon değildir:** `counted − expected`. İşaret anlamlıdır — eksi eksik teslim, artı fazla para; ikisi de açıklanmayı hak eder, mutlak değere indirilmez.

**`close_courier_day` fonksiyonu (11.6):** beklenen toplamlar + günün üç listesi + kapanış satırı tek transaction'da. Kapanmış gün salt-okunurdur; ikinci çağrı ezmez, `already_closed` döner. Sonuçlanmamış durak kapanışı **engellemez** — kurye depoya döndüyse günü kapatabilmeli, ulaşılamayan sipariş yarına kalır.
