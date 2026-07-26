# 07 — Sipariş, Checkout ve Ödeme

## Kapsam

Siparişin doğuşundan kapanışına kadar tüm akış: sepet, checkout (teslimat + ödeme seçimi), rezervasyon–ödeme sırası, Stripe, durum geçişleri, kısmi karşılama, iade, hızlı satış. `domain-core` kararları (03) burada DB'ye ve dış dünyaya bağlanır. Sistemin en kritik ve en çok tabloya dokunan akışı — çok-tablolu yazımlar **RPC** ile atomik.

## Okunacaklar

- `DOMAIN.md §4` (rezervasyon/TTL/geç ödeme), `§5` (fiyat/indirim dağıtımı), `§6` (teslimat/kargo ücreti/teslim onayı), `§7` (ödeme/vade/kapıda), `§8` (kısmi karşılama)
- `ORDER_LIFECYCLE.md` — tamamı
- `STACK.md §13` (webhook güvenliği + çok-tablolu RPC — taslak)

## Bağımlılık

`03-domain-core` (kararlar), `04-auth-kimlik` (müşteri bağı), `06-stok` (rezervasyon/teslim RPC'leri). Stripe kurulumu → Netleşecekler.

## Başlarken verilecek izah (örnek)

> "Sipariş akışını kuruyoruz: müşteri sepeti onaylayınca stok ayrılır, ödeme başlar, mal hazırlanıp teslim edilir ve sipariş kapanır. En hassas yer ödeme–stok sırası: önce stoğu ayırıp sonra parayı çekiyoruz ki karşılığı olmayan tahsilat olmasın. Ödeme sayfasının süresini stok ayırma süresine eşitliyoruz, gecikmiş ödeme için de emniyet kuralı koyuyoruz. Birden çok tabloya birden yazan her adımı (onay, teslim) tek işlemde yapıyoruz ki yarıda kesilince tutarsız kayıt kalmasın."

## Görevler

- [ ] (07.1) **Sepet (Cart):** sunucu-kalıcı sepet servisi (giriş yapmış müşteri); fiyat sepete eklenince sabitlenir (`unit_price` kopyası); anonim → giriş sonrası devralma
  - *Bitti:* cihaz değişince sepet duruyor; eklenen fiyat sonradan ana fiyat değişse de sabit
- [ ] (07.2) **Checkout — teslimat:** adres → posta kodundan zone türetimi → rota-içi gün(ler)/kargo; cut-off saatine göre gün hesabı; kargo yasak ürün (`shippable=false`) kuralı
  - *Bitti:* tek gün otomatik, çok gün seçtiriliyor; cut-off sonrası sipariş ertesi güne düşüyor (test)
- [ ] (07.3) **Checkout — ödeme seçenekleri:** bağlama göre (online/kapıda/vadeli); kapıda tavan + nakit uyarısı + `cod_allowed`; vade freni (03 kararı) uygulanır; `shipping_fee` hesabı + KDV
  - *Bitti:* tavan aşan sipariş kapıda seçeneğini gizliyor; vadesi dolu müşteride "hesaba" kapalı
- [ ] (07.4) **Rezervasyon → ödeme sırası:** atomik ayır (06 RPC) → Stripe checkout session (TTL = rezervasyon süresi, session expiry eşit); ayrılamazsa ödeme hiç başlamaz; `acquisition_source` ilk siparişte yazılır; izin kutusu (`marketing_consent`)
  - *Bitti:* stok yetmezse ödeme açılmıyor; session süresi Setting TTL'iyle eşit
- [ ] (07.5) **Stripe webhook (apps/backend):** imza doğrulama + `WebhookEvent` idempotency (aynı olay no-op) + ödeme onayı → `confirmed` + `reference_no` üretimi; geç ödeme dallanması (yeniden ayır / olmazsa otomatik iade)
  - *Bitti:* aynı event iki kez gelince tek kayıt; rezervasyon düşmüş siparişte geç ödeme iki dalıyla doğru
- [ ] (07.6) **Durum geçişleri + log:** `domain-core` durum makinesini bağlayan servis; her geçiş `OrderStatusLog`'a (from/to/kim/zaman); izinsiz geçiş `{data,error}` ile reddedilir
  - *Bitti:* teslim/kapanış/iptal geçişleri loglanıyor; yasak geçiş hata dönüyor
- [ ] (07.7) **Teslim RPC'si:** tek transaction — Reservation düş + Stock fiiliden düş + `OrderItemBatch` (06'daki FEFO onayından) + kâr snapshot'ları (COGS/teslimat/komisyon/paketleme) + `delivery_proof`
  - *Bitti:* teslim sonrası tüm kayıtlar tutarlı; yarıda kesme testi rollback yapıyor
- [ ] (07.8) **Kısmi karşılama:** `fulfilled_qty` düşümü + para dallanması (peşin → `order_refund` hareketi; kapıda → tahsilat düşer); `payment_status` türetimi (03) uygulanır
  - *Bitti:* eksik + kuponlu sipariş doğru iade tutarını üretiyor
- [ ] (07.9) **İptal ve iade:** ödenmiş iptal → tam otomatik iade; `returned → completed` kapanışı; iade hareketleri `order_refund` tipiyle; `amount_*` cache güncellemesi (kaynak MoneyMovement)
  - *Bitti:* iptal sonrası `payment_status=refunded`; cache ile hareket toplamı tutuyor
- [ ] (07.10) **Hızlı satış yolu (door):** `draft → completed` tek adım; rezervasyon atlanır, fiiliden düşülür; ödeme anında; `reference_no` `completed`'de üretilir
  - *Bitti:* kapı önü satış tek işlemde kapanıyor, stok anında düşüyor

## Netleşecekler

- **Stripe hesap/ürün kurulumu:** hesap, webhook imza anahtarı, ödeme yöntemleri (kart + Apple/Google Pay), SEPA/ödeme tipleri kullanıcıyla kurulur (dış hesap işlemi).
- **Çok-tablolu RPC listesinin son hali:** teslim/onay/hızlı satış RPC sınırları 03/06'daki TS↔SQL konuşmasının çıktısına göre kesinleşir.
