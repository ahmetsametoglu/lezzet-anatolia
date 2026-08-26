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
- [x] (01.2) Tüm enum'lar — `DATA_MODEL.md` enum listesi birebir (channel, order_source, order_status, payment_*, ticket_*, movement_*, analytics_*…)
  - *Bitti:* enum sayısı ve değerleri dokümanla birebir; tek dosyadan export
  - **Durum (26.08 — DENETİM ÖLÇÜMÜ):** kod TAMAM (`primitives/enums.schema.ts`, 41 enum + türetilenler), ama
    KRİTER bayattı: dayandığı "Enum'lar (özet)" listesi bir ay içinde çürümüştü — altı ad
    veritabanında hiç yoktu (`adjustment_reason` · `po_status` · `language` · `country` ·
    `allergen` · `date_type`; hepsi yeniden adlandırılmış) ve DB'deki 60 enum'un 31'i listede hiç
    görünmüyordu. Liste migration'lardan ölçülerek yeniden yazıldı ve **artık `docs:check`
    doğruluyor** (§1c, sabotajla sınandı) — elle tutulan bir liste kaçınılmaz olarak çürür.
- [x] (01.3) Katalog şemaları: `Category`, `Collection`, `Product`, `ProductVariant`, `Price`, `Discount`, `Bundle`, `BundleItem`
  - **Durum (26.08 — DENETİM ÖLÇÜMÜ):** sekizi de var — `category` · `collection` · `product` · `product-variant` ·
    `price` · `discount` · `bundle` (`BundleItem` aynı dosyada). Modül 05 ile birlikte doğdular;
    satır o oturumlarda işaretlenmemiş.
- [x] (01.4) Stok/tedarik şemaları: `Stock`, `Reservation`, `StockAdjustment`, `TemperatureLog`, `Supplier`, `SupplierProduct`, `PurchaseOrder(+Item)`, `StockIntake`
  - **Durum (28.07):** hepsi yazılmış — `stock.schema.ts` (Stock, Reservation), `stock-adjustment.schema.ts` (StockAdjustment, TemperatureLog), `supply.schema.ts` (Supplier, SupplierProduct, PurchaseOrder+Item, StockIntake). Modül 06 ile birlikte doğdu; satır o oturumda işaretlenmemiş.
- [x] (01.5) Sipariş şemaları: `Order`, `OrderItem`, `OrderItemBatch`, `OrderStatusLog`, `Cart`
  - **Durum (28.07):** `order.schema.ts` (Order, OrderItem, OrderItemBatch, OrderStatusLog + RPC dönüş şemaları) · `cart.schema.ts`. Modül 07 ile büyüdü; 07.8/07.9'da düzeltme şemaları eklendi.
- [x] (01.6) Müşteri/kimlik şemaları: ~~`Customer`~~ → `UserProfile`, `Address`, `DeliveryZone`
  - **Durum (26.08 — DENETİM ÖLÇÜMÜ):** `address.schema.ts` · `delivery-zone.schema.ts` var. `Customer` **ayrı bir
    şema olarak doğmadı ve doğmayacak**: kimlik ekseni `UserProfile`e birleşti (rol dizisi ile —
    müşteri de personel de aynı tabloda). Vaadin üstü bu yüzden çizildi; satırı okuyan "eksik bir
    şema var" sanmasın.
- [x] (01.7) Para şemaları: `Account`, `MoneyMovement`, `BankImportProfile`, ~~`CourierDayClose`~~
  - **Durum (28.07):** `money.schema.ts` (Account, MoneyMovement, defter/bakiye görünümleri) · `bank-import.schema.ts` (BankImportProfile, BankImport). **EKSİK: `CourierDayClose`** — kurye gün kapanışı modül 11'de doğar, o şema oraya bağlı.
  - **Durum (26.08 — DENETİM ÖLÇÜMÜ):** `CourierDayClose` **iptal edildi, artık beklenmiyor.** Eksen 18.08'de
    kurye×gün'den SEFERE indi (11.6/11.7): halefi `DeliveryRunClose` ve o şema
    `entities/delivery-run.schema.ts`te yaşıyor. Satır, hiç doğmayacak bir şemayı bekler hâlde
    kalmıştı — modül 11 üstünü çizmiş, modül 01 çizmemişti.
- [x] (01.8) Mesajlaşma/talep şemaları: `Conversation`, `Message`, `Ticket`, `TicketMessage`, `WebhookEvent`
  - **Durum (26.08 — DENETİM ÖLÇÜMÜ):** beşi de var — `conversation.schema.ts` (Conversation + Message) ·
    `ticket.schema.ts` (Ticket + TicketMessage) · `webhook-event.schema.ts`. Modül 15/16 ile
    doğdular.
- [x] (01.9) Geri bildirim/analitik şemaları: `Review`→`ProductFeedback`, `FeedbackRequest`, `PointsEntry`, `AnalyticsEvent`, `Setting`
  - **Durum (26.08 — DENETİM ÖLÇÜMÜ):** beşi de var — `product-feedback.schema.ts` (`Review` bu adla doğdu) ·
    `feedback-request.schema.ts` · `points.schema.ts` · `analytics.schema.ts` · `setting.schema.ts`.
    Modül 13/17 ile doğdular.
  - *Ortak bitti kriteri (tüm şema görevleri):* her şema `DATA_MODEL.md`'deki alan listesiyle birebir; `z.infer` ile tip export ediliyor; örnek geçerli/geçersiz kayıtlarla parse birim testleri geçiyor
- [x] (01.10) Insert/Update türevleri (id/created_at hariç tutan `.omit()/.partial()` türevleri) — servis katmanının kullanacağı biçimler
  - *Bitti:* en az Order/Customer/Product için türev tipler derleniyor
  - **Durum (26.08 — DENETİM ÖLÇÜMÜ):** 46 varlık dosyasında Insert/Update türevi var; satırın kendi kriteri
    (`OrderInsert/Update` · `ProductInsert/Update` · `UserProfileInsert/Update`) fazlasıyla
    karşılanıyor. Türev yazmak artık bir görev değil, servis yazmanın rutini.
- [x] (01.11) `README` (paket içi): şema ekleme kuralı — "önce DATA_MODEL, sonra şema; çelişkide doküman güncellenir"
  - **Durum (26.08) — YAZILDI** (`packages/types/README.md`; deponun İLK paket README'si).
    **Kuralı TEKRAR ETMİYOR, işaret ediyor** ve bu bilinçli: kuralın kendisi `STACK §5` ile
    `DATA_MODEL`de duruyor, buraya kopyalansaydı üçüncü bir nüsha olurdu — aynı oturumda bu paketin
    enum listesinin elle tutulduğu için çürüdüğünü ölçmüşken (01.2) yeni bir nüsha üretmek
    tutarsızlık olurdu. README yalnız **paketin kendi iç düzenini** anlatıyor: hangi şema hangi
    eksene (`primitives`/`entities`/`contracts`), bağımlılık yönü, barrel zorunluluğu, dosya adı
    ve türev kuralı — artı disiplinin hangi bölümünün MAKİNEYE bağlı olduğu (`layering.test.ts` ·
    `docs:check`). Yani okuyanı kurala götürür, kuralı çoğaltmaz.
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

**Modül durumu (26.08.2026 — denetim ölçümü):** artımlı ilerledi ve **fiilen tamamlandı**; şemalar
ihtiyaç duyan modülle birlikte yazıldı (toptan değil, CLAUDE.md §1). 51 varlık · 6 yapı taşı ·
4 sözleşme şeması; 41 enum.

> **Önceki alt bilgi bir ay bayattı ve bu satırın kendisi bir derstir.** *"Yok: Price, Discount,
> Bundle, tüm stok/tedarik · sipariş · para · mesajlaşma · geri bildirim şemaları"* diyordu —
> ölçüldüğünde hepsi vardı. Şema başka modülün turunda doğuyor, o modül kendi satırını işaretliyor,
> **01'in satırı ise kimsenin işi olmadığı için açık kalıyordu.** Artımlı ilerleyen bir modülün
> durumu, ancak birinin dönüp ÖLÇMESİYLE doğru kalır. Bugün ölçüldü: 12 satırın 11'i kapalı, biri
> (01.11) yazıldı — modül kapandı.

## Netleşecekler

- Yok — model `DATA_MODEL.md`'de karara bağlı. Kod yazarken alan düzeyinde sapma gerekirse aynı oturumda doküman güncellenir (build kuralı 4).
