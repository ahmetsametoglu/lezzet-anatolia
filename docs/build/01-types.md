# 01 — `packages/types`: Şemalar ve Enum'lar

## Kapsam

Tüm veri modelinin **tek kaynak** Zod şemaları: varlıklar, enum'lar, `LocalizedText`. Tip elle yazılmaz, şemadan türer (`z.infer`). **Veritabanı yok, iş mantığı yok** — yalnız şekil tanımları ve doğrulama. Bu modül bitince diğer her paket "veri neye benzer" sorusunu buradan cevaplar.

## Okunacaklar

- `DATA_MODEL.md` (ortak ilkeler, enum listesi, "Kalıcı kararlar") + `data-model/*.md` (varlık tabloları — beş konu dosyası)
- `STACK.md §5` (şema tek kaynaktır; camelCase ↔ snake_case kuralı)

## Bağımlılık

`00-iskelet` bitmiş olmalı (paket kabukları derleniyor).

## Başlarken verilecek izah (örnek)

> "Sistemdeki her verinin (ürün, sipariş, müşteri...) şeklini tek yerde tanımlıyoruz: hangi alanlar var, hangi tipte, hangisi zorunlu. Bunu Zod ile yapıyoruz — hem çalışırken gelen veriyi doğrular ('bu gerçekten bir sipariş mi?') hem de TypeScript tiplerini otomatik üretir. Böylece aynı tanımı iki kez yazmayız ve veri modeli değişince tek dosya değişir."

## Görevler

- [x] (01.1) `LocalizedText` şeması (`{fr?, de?, tr?}` + en az bir dil zorunlu) + `language`/`country` enum'ları
  - *Bitti:* geçersiz (üç dil de boş) girdi parse'da reddediliyor (birim test)
- [~] (01.2) Tüm enum'lar — `DATA_MODEL.md` "Enum'lar (özet)" listesi birebir (channel, order_source, order_status, payment_*, ticket_*, po_status, adjustment_reason, movement_*, analytics_event_type...)
  - *Bitti:* enum sayısı ve değerleri dokümanla birebir; tek dosyadan export
- [~] (01.3) Katalog şemaları: `Category`, `Collection`, `Product`, `ProductVariant`, `Price`, `Discount`, `Bundle`, `BundleItem`
- [x] (01.4) Stok/tedarik şemaları: `Stock`, `Reservation`, `StockAdjustment`, `TemperatureLog`, `Supplier`, `SupplierProduct`, `PurchaseOrder(+Item)`, `StockIntake`
  - **Durum (28.07):** hepsi yazılmış — `stock.schema.ts` (Stock, Reservation), `stock-adjustment.schema.ts` (StockAdjustment, TemperatureLog), `supply.schema.ts` (Supplier, SupplierProduct, PurchaseOrder+Item, StockIntake). Modül 06 ile birlikte doğdu; satır o oturumda işaretlenmemiş.
- [x] (01.5) Sipariş şemaları: `Order`, `OrderItem`, `OrderItemBatch`, `OrderStatusLog`, `Cart`
  - **Durum (28.07):** `order.schema.ts` (Order, OrderItem, OrderItemBatch, OrderStatusLog + RPC dönüş şemaları) · `cart.schema.ts`. Modül 07 ile büyüdü; 07.8/07.9'da düzeltme şemaları eklendi.
- [~] (01.6) Müşteri/kimlik şemaları: `Customer`, `Address`, `DeliveryZone`
- [~] (01.7) Para şemaları: `Account`, `MoneyMovement`, `BankImportProfile`, `CourierDayClose`
  - **Durum (28.07):** `money.schema.ts` (Account, MoneyMovement, defter/bakiye görünümleri) · `bank-import.schema.ts` (BankImportProfile, BankImport). **EKSİK: `CourierDayClose`** — kurye gün kapanışı modül 11'de doğar, o şema oraya bağlı.
- [ ] (01.8) Mesajlaşma/talep şemaları: `Conversation`, `Message`, `Ticket`, `TicketMessage`, `WebhookEvent`
- [ ] (01.9) Geri bildirim/analitik şemaları: `Review`, `FeedbackRequest`, `PointsEntry`, `AnalyticsEvent`, `Setting`
  - *Ortak bitti kriteri (tüm şema görevleri):* her şema `DATA_MODEL.md`'deki alan listesiyle birebir; `z.infer` ile tip export ediliyor; örnek geçerli/geçersiz kayıtlarla parse birim testleri geçiyor
- [~] (01.10) Insert/Update türevleri (id/created_at hariç tutan `.omit()/.partial()` türevleri) — servis katmanının kullanacağı biçimler
  - *Bitti:* en az Order/Customer/Product için türev tipler derleniyor
- [ ] (01.11) `README` (paket içi): şema ekleme kuralı — "önce DATA_MODEL, sonra şema; çelişkide doküman güncellenir"
- [x] (01.12) **`schemas/` klasörüne eksen düzeni (kullanıcı kararı 08.08):** DB modelleri ile
  öteki şemalar tek düzlemde durmayacak — "modeller birbirine girmemeli". Ölçüldü (08.08): 48
  dosyada üç eksen iç içe: **DB satır aynaları** (product, order, money, cart, …), **yüzey
  sözleşmeleri** (`auth`, `catalog-api`, `me-api` — kendi künyeleri "sözleşme" diyor), **yapı
  taşları** (`db-numeric`, `pagination`, `localized-text`, `user-text`, `image`, `enums`).
  Plan: `src/{entities,contracts,primitives}/` altklasörleri; barrel (`index.ts`) dışa görünümü
  DEĞİŞTİRMEZ (derin import hiç yok — ölçüldü, tüketici etkisi sıfır); bağımlılık yönü
  `primitives ← entities ← contracts` ve bu yön sözleşme testiyle makineye bağlanır.
  `analytics.schema.ts` gibi TEK dosyada iki ekseni taşıyanlar taşımada BÖLÜNMEZ (davranış
  değişmez), bölünme adayı olarak not edilir. **Zamanlama:** web şeridinin bu klasörde
  commit'lenmemiş işi var (conversation/enums/order) — çakışan iş aynı anda başlamaz (CLAUDE §5);
  taşıma onların commit penceresinden sonra TEK harekette yapılır (defter girdisi 08.08).
  `touches: packages/types (yapı), docs/architecture/STACK.md §5 (kural satırı)`
  - **Durum (08.08 — TAMAMLANDI):** `schemas/` kalktı → `src/{primitives(6),entities(38),contracts(4)}/`
    (50 `git mv`, tarih korundu). `notification.schema.ts` → `contracts` (yönetici onayı: künyesi
    "görünüm modelidir, tablo değil" diyor; üç paketin ortak dili). İhraç eşitliği makineyle
    kanıtlandı: önce/sonra 721 ihraç, ad+tür+tip imzası md5 eşit. `layering.test.ts` yönü import
    satırlarından zorlar (kasıtlı ihlalle ısırdığı kanıtlandı; bugünkü ihlal: sıfır — primitives
    içi yatay kenarlar meşru, kural katman SIRASI). `docs-check` şema keşfi üç klasörü tarar.
    Bölünme adayları (davranış değişmedi, rapora): `analytics` (girdi sözleşmesi + ayna),
    `image` (şekil + politika), `user-profile` (`FindOrCreateInput`), `enums` (78 ihraç, aile
    bazlı bölünme). Doğrulama: typecheck 17/17 · birim 1103 · lint/knip/boundaries temiz.

**Modül durumu (26.07.2026):** artımlı ilerliyor — şemalar ihtiyaç duyan modülle birlikte yazılıyor (toptan değil, CLAUDE.md §1).
- **Var:** `LocalizedText`, `UserProfile`, `EmailVerification`, `Category`, `Collection`, `Product`, `ProductVariant`, `ProductCollection` + hepsinin Insert/Update türevleri; enum'lardan `ProductAllergen`, `ProductDateType`.
- **Yok:** `Price`, `Discount`, `Bundle(+Item)`, tüm stok/tedarik · sipariş · para · mesajlaşma · geri bildirim şemaları; sipariş/ödeme/ticket/hareket enum'ları; paket içi README.
- `Customer`/`Address`/`DeliveryZone` henüz yok — bugünkü kimlik `UserProfile` üzerinden yürüyor (04'ün `Customer` görevleri açık).

## Netleşecekler

- Yok — model `DATA_MODEL.md`'de karara bağlı. Kod yazarken alan düzeyinde sapma gerekirse aynı oturumda doküman güncellenir (build kuralı 4).
