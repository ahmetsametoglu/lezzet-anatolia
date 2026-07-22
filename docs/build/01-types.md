# 01 — `packages/types`: Şemalar ve Enum'lar

## Kapsam

Tüm veri modelinin **tek kaynak** Zod şemaları: varlıklar, enum'lar, `LocalizedText`. Tip elle yazılmaz, şemadan türer (`z.infer`). **Veritabanı yok, iş mantığı yok** — yalnız şekil tanımları ve doğrulama. Bu modül bitince diğer her paket "veri neye benzer" sorusunu buradan cevaplar.

## Okunacaklar

- `DATA_MODEL.md` — tamamı (varlıklar, enum listesi, "Kalıcı kararlar")
- `STACK.md §5` (şema tek kaynaktır; camelCase ↔ snake_case kuralı)

## Bağımlılık

`00-iskelet` bitmiş olmalı (paket kabukları derleniyor).

## Başlarken verilecek izah (örnek)

> "Sistemdeki her verinin (ürün, sipariş, müşteri...) şeklini tek yerde tanımlıyoruz: hangi alanlar var, hangi tipte, hangisi zorunlu. Bunu Zod ile yapıyoruz — hem çalışırken gelen veriyi doğrular ('bu gerçekten bir sipariş mi?') hem de TypeScript tiplerini otomatik üretir. Böylece aynı tanımı iki kez yazmayız ve veri modeli değişince tek dosya değişir."

## Görevler

- [ ] `LocalizedText` şeması (`{fr?, de?, tr?}` + en az bir dil zorunlu) + `language`/`country` enum'ları
  - *Bitti:* geçersiz (üç dil de boş) girdi parse'da reddediliyor (birim test)
- [ ] Tüm enum'lar — `DATA_MODEL.md` "Enum'lar (özet)" listesi birebir (channel, order_source, order_status, payment_*, ticket_*, po_status, adjustment_reason, movement_*, analytics_event_type...)
  - *Bitti:* enum sayısı ve değerleri dokümanla birebir; tek dosyadan export
- [ ] Katalog şemaları: `Category`, `Collection`, `Product`, `ProductVariant`, `Price`, `Discount`, `Bundle`, `BundleItem`
- [ ] Stok/tedarik şemaları: `Stock`, `Reservation`, `StockAdjustment`, `TemperatureLog`, `Supplier`, `SupplierProduct`, `PurchaseOrder(+Item)`, `StockIntake`
- [ ] Sipariş şemaları: `Order`, `OrderItem`, `OrderItemBatch`, `OrderStatusLog`, `Cart`
- [ ] Müşteri/kimlik şemaları: `Customer`, `Address`, `DeliveryZone`
- [ ] Para şemaları: `Account`, `MoneyMovement`, `BankImportProfile`, `CourierDayClose`
- [ ] Mesajlaşma/talep şemaları: `Conversation`, `Message`, `Ticket`, `TicketMessage`, `WebhookEvent`
- [ ] Geri bildirim/analitik şemaları: `Review`, `FeedbackRequest`, `PointsEntry`, `AnalyticsEvent`, `Setting`
  - *Ortak bitti kriteri (tüm şema görevleri):* her şema `DATA_MODEL.md`'deki alan listesiyle birebir; `z.infer` ile tip export ediliyor; örnek geçerli/geçersiz kayıtlarla parse birim testleri geçiyor
- [ ] Insert/Update türevleri (id/created_at hariç tutan `.omit()/.partial()` türevleri) — servis katmanının kullanacağı biçimler
  - *Bitti:* en az Order/Customer/Product için türev tipler derleniyor
- [ ] `README` (paket içi): şema ekleme kuralı — "önce DATA_MODEL, sonra şema; çelişkide doküman güncellenir"

## Netleşecekler

- Yok — model `DATA_MODEL.md`'de karara bağlı. Kod yazarken alan düzeyinde sapma gerekirse aynı oturumda doküman güncellenir (build kuralı 4).
