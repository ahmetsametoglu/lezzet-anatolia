# Migration günlüğü

Her migration'ın bir satırlık ne-yaptığı (WORKFLOW §2). Dosya adları bir süre sonra yetmez.

**Yalnız ileri (WORKFLOW §2) — canlıya çıktıktan SONRA:** uygulanmış dosya düzenlenmez, yeni numaralı
dosya eklenir. **Şu an greenfield** (prod yok, veri yok): şema kaynağı temiz kalsın diye kolonlar ek
migration yerine doğal tablosunda düzenlenir; değişiklikten sonra yerelde `pnpm db:refresh`. İlk canlı
dağıtımdan itibaren bu serbestlik biter.

| # | Dosya | Ne yapar |
| --- | --- | --- |
| 0001 | `0001_auth_user_profiles.sql` | Auth kimlik + kullanıcı profili tabloları; RLS deny-by-default (erişim sunucudan service_role ile) |
| 0002 | `0002_auth_user_profile_trigger.sql` | `auth.users` → profil satırı trigger'ı (kayıt olunca profil doğar) |
| 0003 | `0003_email_verification_otp.sql` | E-posta doğrulama OTP tablosu (Supabase mail göndermez; Resend ile OTP akışı) |
| 0004 | `0004_catalog_category_collection.sql` | `category` + `collection` (düz gruplama, `LocalizedText` ad, benzersiz slug, sort_order, is_active); koleksiyonda ayrıca `description` + `image_key` — paylaşılabilir vitrin sayfası / OG kartı |
| 0005 | `0005_catalog_product.sql` | `product` + `product_variant` + `product_collections` çoklu bağı (`position` ile koleksiyon içi kürasyon sırası + sıralı okuma indeksi); alerjen/tarih-tipi enum'ları. **+ `price`** (eskiden ayrı dosyaydı): varyant fiyatı — kanal listesi + müşteriye özel + tarihli geçerlilik, `channel`/`currency` enum'ları, çözüm indeksi |
| 0006 | `0006_stock.sql` | Stok partisi + rezervasyon (06.2) — temel denklem `KULLANILABİLİR = FİİLİ − AKTİF REZERVASYON`; "ayrılmış toplam" hiçbir yerde SAKLANMAZ, `reservation` satırlarından türetilir. `available_stock` görünümü. **+ `temperature_log`** (eskiden ayrı dosyaydı): hijyen denetiminin ilk istediği veri, sensör yok — basit tutulur ki gerçekten girilsin |
| 0007 | `0007_reserve_stock.sql` | Atomik rezervasyon RPC'si (06.3) — iki müşteri aynı anda son birimi isteyebilir; "önce oku sonra yaz" arasına başkası girer ve ikisi de ayırır (aşırı-satış). Kontrol + yazım TEK transaction |
| 0008 | `0008_observability.sql` | **Gözlemleme ailesi** (18.5) — üç tablo bir arada: `job_run` (zamanlanmış iş izi, tek satır/iş, süreç belleğinde tutulmaz); `error_log` + atomik `capture_error` RPC'si (aynı parmak izli AKTİF hata tek satırda birikir, "çözüldü"den sonra tekrar gelen YENİ satır açar → regresyon görünür; kısmi unique `where resolved_at is null` bunu zorlar); `system_health_snapshot` (cron `*/2 dk`, `status` eşiklerden TÜRETİLİR, saklama 14 gün). Üçü eskiden üç ayrı dosyaydı |
| 0009 | `0009_stock_adjustment.sql` | İmha/fire/sayım farkı (06.6) — stok azalışının SATIŞ DIŞI her sebebi; "bu üründen yılda ne kadar çöpe attım" sorusunun tek cevabı. RPC: kayıt + fiili düşüm bölünemez. `stock_adjustment_detail` görünümü aramayı taşır (09.18). **+ imha/sayım OLAY referansı** (eskiden ayrı dosyaydı, 10.5): numara SATIR başına değil OLAY başına — bir imhada üç parti giderse üç numara vermek, eşleştirilmek istenen kâğıdı üçe bölerdi |
| 0010 | `0010_supply.sql` | Tedarik zinciri (06.8–06.10) — tedarikçi, ürün-kod eşlemesi, tedarik siparişi, mal kabul. İlke: **sistem önerir, siparişi insan verir**; sistem tedarikçiye hiçbir şey GÖNDERMEZ. `purchase_order.reference_no` gönderimde doğar (06.12) |
| 0011 | `0011_customer_fields.sql` | Müşterinin ticari alanları + adres (04) — **ayrı `customer` tablosu YOKTUR**: müşteri bir ROLDÜR, kimlik tek tabloda. Vade/kapıda ödeme/kişisel indirim alanları |
| 0012 | `0012_order.sql` | Sipariş omurgası (07.6) — sipariş, kalemleri, kalem-parti eşlemesi, durum geçiş kaydı. `order_counts` RPC'si sayaçları listeyle AYNI süzgeçten hesaplar. **+ `cart`** (eskiden ayrı dosyaydı, 07.1): sepet SUNUCUDA kalıcı; sepette hold YOK — stok ayrılmaz, fiyat sabitlenmez |
| 0013 | `0013_settings.sql` | İşletme ayarı (02.6/02.7) — kesim saati, minimum sepet, kapıda ödeme tavanı env'e/koda gömülmez; işin sahibinin kararıdır ve dağıtım beklemeden değişmeli. Kapsamlı çözüm (bölge → kanal → ülke → global) |
| 0014 | `0014_delivery_zone.sql` | Teslimat bölgesi (07.2) — **rota-içi/dışı SAKLANMAZ, türetilir**: adresin posta kodu aktif bir bölgeye düşüyorsa rota içi. Sınır ötesi posta kodları (ADR-002) |
| 0015 | `0015_record_preparation.sql` | Hazırlık onayı (06.5'in yazım yarısı) — depo ekranı FEFO'ya göre partiyi ÖNERİR, depocu sapabilir; yazılan şey onun ONAYLADIĞI gerçektir. Kalem-parti eşlemesi + stok düşümü bölünemez |
| 0016 | `0016_deliver_order.sql` | Teslim ve kapanış (07.7) — İKİ AYRI AN, iki ayrı fonksiyon: teslim (fiziksel) ve kapanış (mali). Ayrım `DOMAIN §12`'den geliyor |
| 0017 | `0017_quick_sale.sql` | Hızlı satış (07.10) — tam yol yedi durumdan geçer, kapı önü BİR adımdır (`draft → completed`). Müşteri karşıda, ara durumların anlamı yok |
| 0018 | `0018_money.sql` | **Para ailesi** (12) — dört dosya bir arada: hesaplar + hareketler (12.1, TEK MANTIK: para bir hesapta durur, hareketlerle girer/çıkar; kasa ile banka aynı mekanizma, bakiye türetilir); siparişin para bağları (12.2, `amount_collected`/`amount_refunded` bir CACHE'tir, kaynağı hareketlerdir); muhasebe export zemini (12.7, `order_sale` — "hangi siparişler" değil "hangi SATIŞLAR"); banka ekstresi import'u (12.4, dosya bir GERÇEK KAYNAĞIDIR + profil sütun eşlemesi). Dördü eskiden dört ayrı dosyaydı |
| 0019 | `0019_product_counts.sql` | Ürün ekranının başlık sayaçları — TEK okuma (05.12): önce dört ayrı istek gidiyordu (üç `HEAD` sayım + kategori) |
| 0020 | `0020_order_return.sql` | Kısmi karşılama (07.8) + iptal/iade (07.9) — ikisi de aynı soruyu sorar: mal gitmediyse ya da geri geldiyse fiziksel gerçek nasıl düzeltilir |
| 0021 | `0021_bundle_read.sql` | Paket listesi okuma fonksiyonu (05.5) — okumada RPC eşiğinin üç koşulu birlikte sağlanıyor |
| 0022 | `0022_webhook_event.sql` | Dış sağlayıcı olayları (07.5) — ödeme sağlayıcısı aynı olayı BİRDEN ÇOK KEZ gönderir; bu bir arıza değil sözleşmenin kendisi. Olay kimliği tekil, ikinci gelen sessizce atlanır |
| 0023 | `0023_notices.sql` | **Yer/talep bildirimleri ailesi** — üç tablo bir arada, ve **birleştirilmezler**, yalnız aynı dosyada dururlar: `postal_code_demand` (anonim toplu sayaç, kod → talep adedi + atomik RPC; ziyaretçi kimliği/IP/e-posta TUTULMAZ, tablo buna yer bırakmaz) · `zone_notice` ("bölgeye gelince haber ver", `notified_at` ile **tek** hatırlatma sözü) · `variant_stock_notice` (eskiden ayrı dosyaydı: "geliyoruz ama bu ürün burada yok" — anahtar YER (`ülke, kod`), depo değil; bölge başka depoya bağlansa da söz ayakta kalır). İlk ikisi anonim sayaç ↔ kişisel söz ayrımını taşır; üçüncüsü ürün eksenlidir. **04.08:** `zone_notice` `locale` kolonu kazandı (14.10) — kayıt hesapsız bırakılabildiği için haber gönderilirken dili çözecek profil çoğu zaman yoktur; kaydedilmeseydi tahminle gönderilir ve Alman müşteri Fransızca haber okurdu (`null` = bilinmiyor) |
| 0024 | `0024_discount.sql` | `discount` — kupon ve otomatik kampanya TEK varlıkta (ayrımları yalnız tetik); alanlar motorun `DiscountRule` sözleşmesiyle birebir, kısıtlar tutarsız kuralı DB'de reddeder (kodsuz kupon, hedefsiz kapsam, ters tarih, %100 üstü). `discount_use` kullanım KAYDI — sayaç tutulmaz, sayım ondan türetilir |
| 0025 | `0025_courier_day_close.sql` | Kurye gün kapanışı ve kasa mutabakatı (11.6) — kapanış bir MUTABAKAT, para hareketi değil (para kapıda tahsil edilirken yazıldı). Beklenen ↔ sayılan yan yana, fark AYNI GÜN görünür. RPC: aynı gün iki kez kapatılamaz + beklenen toplamların bölünemez okunması |
| 0026 | `0026_ticket.sql` | Müşteri talebi/şikâyeti (16.1) — **karmaşık ticket sistemi DEĞİL**: atama, öncelik matrisi, SLA sayacı yok; üç durumlu sade döngü (`open → in_progress → resolved`, yeniden açılabilir). Ölçüt: müşteri kolay iletsin, biz siparişe ve ürüne bağlı net veri görelim |
| 0027 | `0027_product_feedback.sql` | Ürün geri bildirimi + ürün skoru (17.1, 17.3) — yıldız · yazılı yorum · beğen/geç TEK varlıkta; ayrımları biçimden ibaret, müşteri/ürün/tekillik/puan/skor katkısı üçünde de aynı. `discount`'ın kupon+kampanyayı tek tabloda tutmasıyla aynı gerekçe |
| 0028 | `0028_points.sql` | Puan defteri (17.4) — **ledger, sayaç değil**: bakiye Σ `points`, hiçbir yerde saklanmaz. `balance` kolonu olsaydı düzeltmeyi unutan tek bir yol bakiyeyi kalıcı yanlış gösterirdi. İstismar tavanı defterin kendisinde |
| 0029 | `0029_feedback_request.sql` | Alım-sonrası değerlendirme daveti (17.2) — teslimden ~10 gün sonra giden kişisel bağlantı; **token oturum yerine geçer** (araya giriş ekranı akışı kırar). `feedback_due_order` + `feedback_request_progress` görünümleri; ilerleme türetilir, saklanmaz |
| 0030 | `0030_create_order.sql` | `create_order` RPC'si — başlık + kalemler + indirim kullanımı TEK transaction'da (kolon listesi katalogdan türer); `order_discount_balance` ertelenmiş kısıtı: başlıktaki indirim kalem paylarının toplamına eşit olmak zorunda |
| 0031 | `0031_warehouse.sql` | **Depo ağı** — `warehouse` (+ülke başına tek aktif kargo deposu kısmi unique), depo bazlı eşik, `warehouse_transfer(_line)`; tüm `warehouse_id` FK'lerinin bağlanması; `available_stock` (depo grain) + `available_stock_total` + `purchase_order_progress`; sipariş↔parti↔rezervasyon depo değişmezleri (ertelenmiş kısıtlar); `dispatch_transfer`/`receive_transfer` |
| 0032 | `0032_product_listing.sql` | Katalog fiyat sıralaması — `variant_effective_price` + `product_listing`. Depo boyutu alınca yeniden yazıldı: her aktif depo için satır + **yeri bilinmeyen okuma için `warehouse_id is null` satırı** (liste fiyatı + `has_near_expiry_offer` bayrağı, teklif tutarı gizli) |
| 0033 | `0033_postal_code_place.sql` | **Posta kodu referansı — ŞEMA** (elle bakılır). Ülke müşteriye SORULMAZ, koddan türer (sürtünme + vergi: serbest seçilen ülke KDV'yi etkilerdi). `postal_code` indeksi `text_pattern_ops` sınıfıyla: önek araması (`like '672%'`) varsayılan sınıfta tabloyu geziyordu — 36,9 ms → 0,11 ms (19.19) |
| 0034 | `0034_postal_code_place_data.sql` | **Posta kodu referansı — VERİ** (ÜRETİLMİŞ, elle düzenlenmez; GeoNames FR+DE 16.878 satır, CC-BY). Veri tanımın parçasıdır: tablo boşken her kod "tanınmadı"ya düşer, ülke çözülemez. Üreteç `scripts/build-postal-codes.mjs` (`pnpm postal:build`) ve artık YALNIZ bu dosyayı yazar |
| 0035 | `0035_analytics.sql` | **Analitik olay defteri** (13.1) — kurallar `docs/architecture/ANALYTICS.md`'de. Üç tablo: `analytics_event` (ham iz, **kimlik kolonu YOK**, aylık bölümlenmiş, 25 ay) · `analytics_session` (oturumun UTM künyesi) · `analytics_daily` (ekranların okuduğu özet, 24'lük saat dizisi + **terk sebebi boyutu**). Saklama **bölüm düşürerek** işler, satır silerek değil. Özetin tekil anahtarı `nulls not distinct` — `null` boyutlu satır yoksa sessizce çoğalırdı |
| 0036 | `0036_analytics_signals.sql` | **Analitik sinyal özetleri + rapor okumaları** (13.2 · 13.4 · 13.5). Üç özet tablosu: `analytics_daily_product` (gün × ürün — ilgi/dönüşüm, vitrin seçkisi de bunu okur) · `analytics_daily_search` (gün × terim × sıfır-sonuç kovası, **25 ay**) · `analytics_daily_source` (gün × kaynak × kampanya; doğrudan trafik `null` kovasında — sol birleşim). Dört RPC: dönem sinyalleri (`analytics_product_signals` · `analytics_search_signals`), **kampanya cirosu ilk-temas atfıyla** (`analytics_campaign_revenue`) ve müşteri segmentleri (`analytics_customer_segments` + `analytics_segment_members`). Segment SAKLANMAZ, türetilir; eşikler parametrik. `purge_analytics_before` oturum künyesini ve arama özetini ham defterle aynı 25 ayda süpürür. **`analytics_order_base` görünümü "hangi sipariş ciro sayılır"ı TEK yerde tanımlar** (taslak/iptal/iade dışarıda) — üç okuma da onu kullanır, üç kez yazılsaydı biri iadeyi düşer öteki düşmezdi. Ayrıca `analytics_order_revenue` (dönem cirosu gün × kanal, süzgeç SİPARİŞ tarihinde) ve `analytics_postal_code_orders` (talep sayacının karşı ucu — kullanıcının "çok soruluyor az alınıyor" sorusu) |

> **NUMARALAR 03.08'DE BAŞTAN VERİLDİ — 0001–0034, boşluksuz** (02.11 · kullanıcı kararı). 43 dosya
> 34'e indi: kırıntı dosyalar aile içinde birleşti ve numaralar sıfırdan sıralandı. Eski numaraların
> hiçbiri artık geçerli değil; kodda ya da dokümanda `0042` gibi bir atıf görürseniz **bayattır.**
>
> **Bu ancak bugün yapılabilirdi ve bir daha yapılamaz.** Yeniden numaralandırma, aynı numarayı
> farklı içerikle görmüş iki ortamı sessizce ayrıştırır — kimse hata almaz, şemalar farklıdır.
> Bugün güvenliydi çünkü **canlı yok, veri yok ve tek ortam var**; iş tek ajanın tek penceresinde
> yapıldı ve arkasından `db:reset` geldi. İlk üretim dağıtımından sonra bu kapı kapanır: o günden
> itibaren dosya düzenlenmez, yeni numaralı dosya eklenir (WORKFLOW §2).
>
> **Neden birleştirildiler (denetim P2):** kırıntı dosyalar aynı konuyu üç yere bölüyordu; bir
> tabloyu okumak isteyen üç dosya açıyordu. **Sıra korundu:** her taşıma öncesi bağımlılıklar
> tarandı — taşınan dosya, hedefinden SONRA doğan hiçbir nesneye şema düzeyinde değmiyor. (Tek
> istisna görünen `adjust_stock_batch`, `warehouse`'a **fonksiyon gövdesinden** değiyor; plpgsql
> gövdesi geç çözüldüğü için bu zaten depo dosyasından önce çalışıyordu ve taşıma bunu değiştirmedi.)
>
> **Birleşme "aynı dosyada" demektir, "aynı şey" değil:** `0023`'ün üç tablosu birbirinden ayrı
> kalır (anonim sayaç ↔ kişisel söz ↔ ürün eksenli söz) ve her taşınan bloğun başında ayrı bir
> dosyadan geldiğini söyleyen bir ayraç durur.
>
> **`vehicle` tablosu DÜŞTÜ** (aynı pencerede): servisi yoktu, `from('vehicle')` hiç geçmiyordu,
> sıfır satır taşıyordu ve hiçbir tasarım aracı bir VARLIK olarak kullanmıyordu. Zod şeması da
> düştü — karşılığı olmayan bir tip, okuyanı "araçlar sistemde tutuluyor" diye inandırırdı.
> Ölü şemayı `knip` YAKALAYAMAZ (SQL ve Zod onun kapsamı dışında), yani kendiliğinden hiç görünmezdi.
>
> **Posta kodu dosyası İKİYE ayrıldı** (denetim P1): şema `0033` (elle bakılır) + veri `0034`
> (üretilir). Eskiden tek dosyaydı, 1,8 MB ≈ 450k token — açan aracın bağlam bütçesi bitiyordu.
> Dosya kendisiyle de çelişiyordu: başlığı "elle düzenlenmez" diyordu ama şema yorumları elle
> bakılan metindi, ve fiilen elle düzenlendiler — `text_pattern_ops` indeks düzeltmesi üretece
> değil ÇIKTIYA yazılmıştı; bir sonraki `postal:build` ölçülmüş bir kazancı (36,9 ms → 0,11 ms)
> sessizce geri alacaktı. Üreteç artık yalnız veri dosyasını yazıyor: kayma yüzeyi sıfır.
>
> **TEK indeks burasıdır** (denetim P3, 03.08): `supabase/MIGRATIONS.md` silindi. erken bir migration'da donmuş
> ikinci bir indeksti — sonraki migration'ların hiçbirini görmemiş, repo genelinde tek referansı yoktu ve okuyan
> ajana yanlış gerçeklik öğretiyordu (*"`customer` tablosu şu alanlarla büyüyecek"* diyordu; oysa
> ayrı `customer` tablosu hiç doğmadı, kimlik tek tabloda toplandı). Taşınacak tekil içeriği
> yoktu: numara-çakışması vakası `docs-check.mjs:184`'te yaşıyor, büyüme planı ise zaten yanlıştı.
>
> **Tablo artık makine tarafından denetleniyor** (denetim A5, 03.08): `docs:check` her
> `NNNN_*.sql` dosyasının burada bir satırı olduğunu doğruluyor. Önceki hâlde tablo eski numaralamada donmuştu ve künyesindeki *"yazan ajanlar tamamlar"* sözü tutulmamıştı — yumuşak kural okunmayan
> kuraldır. Eksik yedi satır aynı turda dosya başlıklarından yazıldı.

