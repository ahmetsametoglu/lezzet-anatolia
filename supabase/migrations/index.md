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
