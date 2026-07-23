# Migration İndeksi

Migration'lar **artımlı** ilerler: her modül/özellik yalnız ihtiyacı olan şema değişikliğini ekler.
Dosya öneki **zaman damgası değil, sıralı index**tir (`0001`, `0002`, …) — okunması ve sıralaması net.
Yeni bir migration eklendiğinde buraya bir satır düşülür — hangi migration neyi getirdi, tek bakışta.

| Index | Migration                    | Modül   | Ne ekledi                                                                                                                                                           |
| ----- | ---------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0001  | `auth_customer_staff_role`   | 04-auth | `customer` (kimlik altkümesi), `staff_role`, `has_role()`, enum'lar (`customer_type`, `preferred_language`, `country_code`, `staff_role_kind`), RLS deny-by-default |
| 0002  | `auth_link_customer_trigger` | 04-auth | `handle_new_auth_user()` trigger — `auth.users` insert → e-postayla Customer bağla/oluştur + **ilk hesabı admin** (advisory-lock yarış-güvenli)                     |
| 0003  | `email_verification_otp`     | 04-auth | `email_verifications` (SHA-256 hash, 15dk TTL, attempts) + `request_/verify_passwordless_code` RPC (rate-limit 5/saat + cooldown 60sn, atomik). Özel Resend akışı  |

## Sonraki adımlarda büyüyecek

`customer` tablosu bilinçli olarak dar başladı; şu alanlar ilgili modülün migration'ında eklenecek:
`company_info`/`vat_*` (B2B), `credit_*`/`payment_term_days`/`cod_allowed` (sipariş/vade), `marketing_consent`/`acquisition_source`/`referred_by` (pazarlama), `discount_percent`. Ayrıca `address` ve müşteri-birleştirme RPC'si, taşıyacağı tablolar (sipariş/adres/puan/konuşma/ticket) doğunca gelir.
