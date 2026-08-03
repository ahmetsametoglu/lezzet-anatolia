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
| 0005 | `0005_catalog_product.sql` | `product` + `product_variant` + `product_collections` çoklu bağı (`position` ile koleksiyon içi kürasyon sırası + sıralı okuma indeksi); alerjen/tarih-tipi enum'ları |
| 0006 | `0006_price.sql` | `price` (varyant fiyatı: kanal listesi + müşteriye özel + tarihli geçerlilik, kanal tabanlı tutar) + `channel`/`currency` enum tipleri; çözüm sorgusu için `(variant_id, channel, customer_id, valid_from desc)` indeksi
| 0007 | `0007_stock.sql` | Stok partisi + rezervasyon (06.2) — temel denklem `KULLANILABİLİR = FİİLİ − AKTİF REZERVASYON`; "ayrılmış toplam" hiçbir yerde SAKLANMAZ, `reservation` satırlarından türetilir. `available_stock` görünümü |
| 0008 | `0008_reserve_stock.sql` | Atomik rezervasyon RPC'si (06.3) — iki müşteri aynı anda son birimi isteyebilir; "önce oku sonra yaz" arasına başkası girer ve ikisi de ayırır (aşırı-satış). Kontrol + yazım TEK transaction |
| 0009 | `0009_job_run.sql` | Zamanlanmış iş izi (06.4) — kritik işler `last_run` bırakır, gecikince alarm. Süreç belleğinde tutulmaz: backend yeniden başlayınca iz silinirdi. Tek satır/iş, tarihçe tutulmaz |
| 0010 | `0010_stock_adjustment.sql` | İmha/fire/sayım farkı (06.6) — stok azalışının SATIŞ DIŞI her sebebi; "bu üründen yılda ne kadar çöpe attım" sorusunun tek cevabı. RPC: kayıt + fiili düşüm bölünemez. `stock_adjustment_detail` görünümü aramayı taşır (09.18) |
| 0011 | `0011_temperature_log.sql` | Sıcaklık kaydı (06.7) — hijyen denetiminin İLK istediği veri. Sensör entegrasyonu YOK, günde bir-iki elle giriş; basit tutulur ki gerçekten girilsin |
| 0012 | `0012_supply.sql` | Tedarik zinciri (06.8–06.10) — tedarikçi, ürün-kod eşlemesi, tedarik siparişi, mal kabul. İlke: **sistem önerir, siparişi insan verir**; sistem tedarikçiye hiçbir şey GÖNDERMEZ. `purchase_order.reference_no` gönderimde doğar (06.12) |
| 0013 | `0013_customer_fields.sql` | Müşterinin ticari alanları + adres (04) — **ayrı `customer` tablosu YOKTUR**: müşteri bir ROLDÜR, kimlik tek tabloda. Vade/kapıda ödeme/kişisel indirim alanları |
| 0014 | `0014_cart.sql` | Sunucu sepeti (07.1) — sepet SUNUCUDA kalıcı (telefondan ekle, bilgisayardan devam et). Sepette hold YOK: stok ayrılmaz, fiyat sabitlenmez |
| 0015 | `0015_order.sql` | Sipariş omurgası (07.6) — sipariş, kalemleri, kalem-parti eşlemesi, durum geçiş kaydı. `order_counts` RPC'si sayaçları listeyle AYNI süzgeçten hesaplar |
| 0016 | `0016_settings.sql` | İşletme ayarı (02.6/02.7) — kesim saati, minimum sepet, kapıda ödeme tavanı env'e/koda gömülmez; işin sahibinin kararıdır ve dağıtım beklemeden değişmeli. Kapsamlı çözüm (bölge → kanal → ülke → global) |
| 0017 | `0017_delivery_zone.sql` | Teslimat bölgesi (07.2) — **rota-içi/dışı SAKLANMAZ, türetilir**: adresin posta kodu aktif bir bölgeye düşüyorsa rota içi. Sınır ötesi posta kodları (ADR-002) |
| 0018 | `0018_record_preparation.sql` | Hazırlık onayı (06.5'in yazım yarısı) — depo ekranı FEFO'ya göre partiyi ÖNERİR, depocu sapabilir; yazılan şey onun ONAYLADIĞI gerçektir. Kalem-parti eşlemesi + stok düşümü bölünemez |
| 0019 | `0019_deliver_order.sql` | Teslim ve kapanış (07.7) — İKİ AYRI AN, iki ayrı fonksiyon: teslim (fiziksel) ve kapanış (mali). Ayrım `DOMAIN §12`'den geliyor |
| 0020 | `0020_quick_sale.sql` | Hızlı satış (07.10) — tam yol yedi durumdan geçer, kapı önü BİR adımdır (`draft → completed`). Müşteri karşıda, ara durumların anlamı yok |
| 0021 | `0021_money.sql` | Para: hesaplar + hareketler (12.1) — TEK MANTIK: para bir hesapta durur, hareketlerle girer/çıkar. Kasa ile banka aynı mekanizma. Bakiye türetilir, saklanmaz |
| 0022 | `0022_order_money.sql` | Siparişin para bağları (12.2) — `amount_collected`/`amount_refunded` bir CACHE'tir, kaynağı para hareketleridir |
| 0023 | `0023_accounting.sql` | Muhasebe export zemini (12.7) — muhasebeye giden veri "hangi siparişler" değil "hangi SATIŞLAR" sorusunun cevabı (`order_sale`) |
| 0024 | `0024_bank_import.sql` | Banka ekstresi import'u (12.4) — banka dosyası bir GERÇEK KAYNAĞIDIR: satırları para hareketine dönüşür. Import profili sütun eşlemesini taşır |
| 0025 | `0025_product_counts.sql` | Ürün ekranının başlık sayaçları — TEK okuma (05.12): önce dört ayrı istek gidiyordu (üç `HEAD` sayım + kategori) |
| 0026 | `0026_order_return.sql` | Kısmi karşılama (07.8) + iptal/iade (07.9) — ikisi de aynı soruyu sorar: mal gitmediyse ya da geri geldiyse fiziksel gerçek nasıl düzeltilir |
| 0027 | `0027_bundle_read.sql` | Paket listesi okuma fonksiyonu (05.5) — okumada RPC eşiğinin üç koşulu birlikte sağlanıyor |
| 0028 | `0028_webhook_event.sql` | Dış sağlayıcı olayları (07.5) — ödeme sağlayıcısı aynı olayı BİRDEN ÇOK KEZ gönderir; bu bir arıza değil sözleşmenin kendisi. Olay kimliği tekil, ikinci gelen sessizce atlanır |
| 0029 | `0029_postal_code_demand.sql` | `postal_code_demand` — "nereye getirelim" sorusunun toplu sayacı (kod → talep adedi) + atomik artıran `record_postal_code_demand` RPC'si; ziyaretçi kimliği/IP/e-posta TUTULMAZ, tablo buna yer bırakmaz |
| 0030 | `0030_zone_notice.sql` | `zone_notice` — "bölgeye gelince haber ver" kaydı (posta kodu + e-posta + izin, ziyaretçide hesapsız); `notified_at` ile **tek** hatırlatma sözü tutulur. 0029'un anonim sayacından ayrıdır ve birleştirilmez |
| 0031 | `0031_discount.sql` | `discount` — kupon ve otomatik kampanya TEK varlıkta (ayrımları yalnız tetik); alanlar motorun `DiscountRule` sözleşmesiyle birebir, kısıtlar tutarsız kuralı DB'de reddeder (kodsuz kupon, hedefsiz kapsam, ters tarih, %100 üstü). `discount_use` kullanım KAYDI — sayaç tutulmaz, sayım ondan türetilir |
| 0032 | `0032_courier_day_close.sql` | Kurye gün kapanışı ve kasa mutabakatı (11.6) — kapanış bir MUTABAKAT, para hareketi değil (para kapıda tahsil edilirken yazıldı). Beklenen ↔ sayılan yan yana, fark AYNI GÜN görünür. RPC: aynı gün iki kez kapatılamaz + beklenen toplamların bölünemez okunması |
| 0033 | `0033_adjustment_document.sql` | İmha/sayım OLAY referansı (10.5) — numara SATIR başına değil OLAY başına: bir imhada üç parti çöpe giderse üçüne üç numara vermek, eşleştirilmek istenen kâğıdı üçe bölerdi. Kâğıt ↔ kayıt eşleşmesi, tedarikçi alacak yazışması ve sayım oturumu için |
| 0035 | `0035_ticket.sql` | Müşteri talebi/şikâyeti (16.1) — **karmaşık ticket sistemi DEĞİL**: atama, öncelik matrisi, SLA sayacı yok; üç durumlu sade döngü (`open → in_progress → resolved`, yeniden açılabilir). Ölçüt: müşteri kolay iletsin, biz siparişe ve ürüne bağlı net veri görelim |
| 0036 | `0036_product_feedback.sql` | Ürün geri bildirimi + ürün skoru (17.1, 17.3) — yıldız · yazılı yorum · beğen/geç TEK varlıkta; ayrımları biçimden ibaret, müşteri/ürün/tekillik/puan/skor katkısı üçünde de aynı. `discount`'ın kupon+kampanyayı tek tabloda tutmasıyla aynı gerekçe |
| 0037 | `0037_points.sql` | Puan defteri (17.4) — **ledger, sayaç değil**: bakiye Σ `points`, hiçbir yerde saklanmaz. `balance` kolonu olsaydı düzeltmeyi unutan tek bir yol bakiyeyi kalıcı yanlış gösterirdi. İstismar tavanı defterin kendisinde |
| 0038 | `0038_feedback_request.sql` | Alım-sonrası değerlendirme daveti (17.2) — teslimden ~10 gün sonra giden kişisel bağlantı; **token oturum yerine geçer** (araya giriş ekranı akışı kırar). `feedback_due_order` + `feedback_request_progress` görünümleri; ilerleme türetilir, saklanmaz |
| 0039 | `0039_error_log.sql` | `error_log` — sunucu tarafı hataların GRUPLANMIŞ kaydı (Sentry değil, kendi tablomuz) + atomik `capture_error` RPC'si (ekle-ya-da-say). Aynı parmak izli AKTİF hata tek satırda birikir; "çözüldü"den sonra tekrar gelen hata YENİ satır açar → regresyon görünür olur. Kısmi unique indeks `where resolved_at is null` bunu zorlar |
| 0040 | `0040_system_health.sql` | `system_health_snapshot` — sunucu/süreç/servis/uygulama görüntüsü (backend cron `*/2 dk`); `status` eşiklerden TÜRETİLİR (`domain-core/observability`), `metrics` tek jsonb. Saklama 14 gün |
| 0041 | `0041_create_order.sql` | `create_order` RPC'si — başlık + kalemler + indirim kullanımı TEK transaction'da (kolon listesi katalogdan türer); `order_discount_balance` ertelenmiş kısıtı: başlıktaki indirim kalem paylarının toplamına eşit olmak zorunda |
| 0042 | `0042_warehouse.sql` | **Depo ağı** — `warehouse` (+ülke başına tek aktif kargo deposu kısmi unique), `vehicle`, depo bazlı eşik, `warehouse_transfer(_line)`; tüm `warehouse_id` FK'lerinin bağlanması; `available_stock` (depo grain) + `available_stock_total` + `purchase_order_progress`; sipariş↔parti↔rezervasyon depo değişmezleri (ertelenmiş kısıtlar); `dispatch_transfer`/`receive_transfer` |
| 0043 | `0043_product_listing.sql` | Katalog fiyat sıralaması — `variant_effective_price` + `product_listing`. Depo boyutu aldı (0034'ten taşındı): her aktif depo için satır + **yeri bilinmeyen okuma için `warehouse_id is null` satırı** (liste fiyatı + `has_near_expiry_offer` bayrağı, teklif tutarı gizli) |
| 0044 | `0044_postal_code_place.sql` | **Posta kodu referansı** (GeoNames FR+DE, 16.878 satır, CC-BY) — ülke müşteriye SORULMAZ, koddan türer (sürtünme + vergi: serbest seçilen ülke KDV'yi etkilerdi). Tablo + veri tek dosyada: tablo boşken her kod "tanınmadı"ya düşer, yani veri tanımın parçası. Üreteç `scripts/build-postal-codes.mjs` |
| 0045 | `0045_variant_stock_notice.sql` | **Varyant + yer bazlı "gelince haber ver"** — `zone_notice` ile karıştırılmaz: o "bölgenize gelmiyoruz", bu "geliyoruz ama bu ürün burada yok" (19.10'un `elsewhere` hâli). Anahtar YER (`ülke, kod`), depo değil — bölge başka depoya bağlansa da söz ayakta kalır. Kısmi unique `where notified_at is null` |

> **0034 numara boşluğu KASITLI:** içeriği 0043'e taşındı (katalog fiyat sıralaması depo boyutu
> alınca yeniden yazıldı) ve orada kayıtlı. Numarayı geri kullanmıyoruz — uygulanmış bir migration
> numarasının anlamı değişirse, aynı numarayı farklı içerikle görmüş iki ortam sessizce ayrışır.
>
> **TEK indeks burasıdır** (denetim P3, 03.08): `supabase/MIGRATIONS.md` silindi. 0003'te donmuş
> ikinci bir indeksti — 41 migration'ı hiç görmemiş, repo genelinde tek referansı yoktu ve okuyan
> ajana yanlış gerçeklik öğretiyordu (*"`customer` tablosu şu alanlarla büyüyecek"* diyordu; oysa
> ayrı `customer` tablosu hiç doğmadı, kimlik tek tabloda toplandı — 0013). Taşınacak tekil içeriği
> yoktu: numara-çakışması vakası `docs-check.mjs:184`'te yaşıyor, büyüme planı ise zaten yanlıştı.
>
> **Tablo artık makine tarafından denetleniyor** (denetim A5, 03.08): `docs:check` her
> `NNNN_*.sql` dosyasının burada bir satırı olduğunu doğruluyor. Önceki hâlde tablo 0031'de
> donmuştu ve künyesindeki *"yazan ajanlar tamamlar"* sözü tutulmamıştı — yumuşak kural okunmayan
> kuraldır. Eksik yedi satır (0032–0038) aynı turda dosya başlıklarından yazıldı.

