# Mobil Uygulama — Backend / Veritabanı Notları

Yeni eklenen üç özelliğin veri modeli gereksinimleri (React Native + API için).

## 1. Günün fırsatı (flash satış)
- `flash_deals`: id, product_id, variant_id, price, starts_at, ends_at, per_customer_limit, active
- Sepet doğrulaması sunucuda: adet sınırı ve `ends_at` kontrolü sipariş anında tekrarlanır (istemci sayacına güvenilmez).
- Bitiş anında push bildirimi tetiklenebilir (opsiyonel cron).

## 2. Arkadaşını getir (referans)
- `referral_codes`: id, customer_id, code (unique), created_at
- `referrals`: id, code_id, referred_customer_id, first_order_id, status (pending → delivered → rewarded)
- Ödül akışı: yeni müşteri kodu checkout'ta girer → ilk siparişe %/€ indirim; sipariş **teslim edildiğinde** davet edene 5 € kupon (`coupons` tablosuna yazılır). İptal/iade durumunda ödül düşer.
- Kötüye kullanım: aynı adres/telefon/cihaz için tekil ödül kısıtı.

## 3. Bildirim merkezi + stok haberi
- `notifications`: id, customer_id, type (order_status | flash_deal | stock | points), title, body, deep_link, read_at, created_at
- `stock_alerts`: id, customer_id, product_id, notified_at (null = bekliyor)
- Ürün stoğu 0 → >0 olduğunda `stock_alerts` kuyruğuna e-posta/push job'ı; gönderim sonrası `notified_at` doldurulur, kayıt tek seferliktir.
- Push için cihaz tokenları: `devices`: customer_id, platform, push_token, last_seen_at.

## Genel
- Mevcut kupon altyapısı (`coupons`) referans ve puan çevirimiyle ortak kullanılır.
- Tüm tarihler UTC; istemci yerel saat diliminde gösterir (geri sayım istemcide hesaplanır).
