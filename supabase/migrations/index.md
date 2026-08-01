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
| 0029 | `0029_postal_code_demand.sql` | `postal_code_demand` — "nereye getirelim" sorusunun toplu sayacı (kod → talep adedi) + atomik artıran `record_postal_code_demand` RPC'si; ziyaretçi kimliği/IP/e-posta TUTULMAZ, tablo buna yer bırakmaz |
| 0030 | `0030_zone_notice.sql` | `zone_notice` — "bölgeye gelince haber ver" kaydı (posta kodu + e-posta + izin, ziyaretçide hesapsız); `notified_at` ile **tek** hatırlatma sözü tutulur. 0029'un anonim sayacından ayrıdır ve birleştirilmez |
| 0031 | `0031_discount.sql` | `discount` — kupon ve otomatik kampanya TEK varlıkta (ayrımları yalnız tetik); alanlar motorun `DiscountRule` sözleşmesiyle birebir, kısıtlar tutarsız kuralı DB'de reddeder (kodsuz kupon, hedefsiz kapsam, ters tarih, %100 üstü). `discount_use` kullanım KAYDI — sayaç tutulmaz, sayım ondan türetilir |
| 0039 | `0039_error_log.sql` | `error_log` — sunucu tarafı hataların GRUPLANMIŞ kaydı (Sentry değil, kendi tablomuz) + atomik `capture_error` RPC'si (ekle-ya-da-say). Aynı parmak izli AKTİF hata tek satırda birikir; "çözüldü"den sonra tekrar gelen hata YENİ satır açar → regresyon görünür olur. Kısmi unique indeks `where resolved_at is null` bunu zorlar |
| 0040 | `0040_system_health.sql` | `system_health_snapshot` — sunucu/süreç/servis/uygulama görüntüsü (backend cron `*/2 dk`); `status` eşiklerden TÜRETİLİR (`domain-core/observability`), `metrics` tek jsonb. Saklama 14 gün |
| 0041 | `0041_create_order.sql` | `create_order` RPC'si — başlık + kalemler + indirim kullanımı TEK transaction'da (kolon listesi katalogdan türer); `order_discount_balance` ertelenmiş kısıtı: başlıktaki indirim kalem paylarının toplamına eşit olmak zorunda |
| 0042 | `0042_warehouse.sql` | **Depo ağı** — `warehouse` (+ülke başına tek aktif kargo deposu kısmi unique), `vehicle`, depo bazlı eşik, `warehouse_transfer(_line)`; tüm `warehouse_id` FK'lerinin bağlanması; `available_stock` (depo grain) + `available_stock_total` + `purchase_order_progress`; sipariş↔parti↔rezervasyon depo değişmezleri (ertelenmiş kısıtlar); `dispatch_transfer`/`receive_transfer` |
| 0043 | `0043_product_listing.sql` | Katalog fiyat sıralaması — `variant_effective_price` + `product_listing`. Depo boyutu aldı (0034'ten taşındı): her aktif depo için satır + **yeri bilinmeyen okuma için `warehouse_id is null` satırı** (liste fiyatı + `has_near_expiry_offer` bayrağı, teklif tutarı gizli) |
| 0044 | `0044_postal_code_place.sql` | **Posta kodu referansı** (GeoNames FR+DE, 16.878 satır, CC-BY) — ülke müşteriye SORULMAZ, koddan türer (sürtünme + vergi: serbest seçilen ülke KDV'yi etkilerdi). Tablo + veri tek dosyada: tablo boşken her kod "tanınmadı"ya düşer, yani veri tanımın parçası. Üreteç `scripts/build-postal-codes.mjs` |
| 0045 | `0045_variant_stock_notice.sql` | **Varyant + yer bazlı "gelince haber ver"** — `zone_notice` ile karıştırılmaz: o "bölgenize gelmiyoruz", bu "geliyoruz ama bu ürün burada yok" (19.10'un `elsewhere` hâli). Anahtar YER (`ülke, kod`), depo değil — bölge başka depoya bağlansa da söz ayakta kalır. Kısmi unique `where notified_at is null` |

> **Eksik satırlar (0032–0038):** bu tablo 0031'den sonra güncellenmemiş; aradaki migration'lar
> (ticket, product_feedback, points, feedback_request…) kayda geçmedi. Dosyaların kendi başlıkları
> tam, eksik olan yalnız bu özet. Yazan ajanlar tamamlar.

