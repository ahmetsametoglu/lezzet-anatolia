# Denetim K2 — Tip / şema tek kaynağı (`packages/types`)

> Program: `denetim-katman-haritasi.md` · Ölçü: 70 dosya · 9.230 satır · 392 `z.object` · 216 adlı şema
> Yöntem: alan kümesi örtüşme taraması (script) + her adayın elle doğrulanması. Tarih: 10.08.2026
>
> **Sonuç: türetme disiplini güçlü.** 168 türetme kullanımı (53 `.extend` · 62 `.partial` ·
> 36 `.pick` · 17 `.omit`), yalnız 5 elle `interface` (hepsi jenerik/yardımcı — `Page<T>` gibi Zod'la
> ifade edilemeyenler). Bir gerçek duplikasyon bulundu ve **düzeltildi**; bir de kural boşluğu var.

---

## K2-1 · `ProductDeclarationSchema` ürünün alanlarını yeniden yazıyordu — DÜZELTİLDİ

**Bulgu:** `entities/assistant-proposal.schema.ts` içindeki `ProductDeclarationSchema`, altı ürün
alanını (`description` · `ingredients` · `storageInstructions` · `nutrition` · `allergens` ·
`traces`) `z.object` ile **baştan** tanımlıyordu. `ProductSchema`'daki karşılıklarıyla %100 örtüşüyor
ve katılık farkı yok — yani `.pick().partial()` birebir aynı sonucu veriyor.

**Neden önemliydi:** dilekçe tipi ürünün tipinden koparsa — `NutritionSchema`'ya bir kalem eklenir,
`allergens` kümesi değişir — **onay ekranı, asistanın yazdığını ürünün kabul edeceğinden farklı
doğrular.** Hata vermeden; çünkü iki şema da kendi içinde geçerli.

**Düzeltildi (aynı turda, kendi alanım):**

```ts
const ProductDeclarationSchema = ProductSchema.pick({
  description: true, ingredients: true, storageInstructions: true,
  nutrition: true, allergens: true, traces: true,
}).partial();
```

`pick` bilinçli seçim: ürüne yarın eklenen alan buraya **kendiliğinden girmez** — asistanın
dokunabileceği küme kapalı kalır (`AI_ADMIN_ASSISTANT §6`), açık olan yalnız tipler. Alan künyeleri
şema üstündeki bloğa taşındı.

**Doğrulama:** `NutritionSchema` ve `ProductAllergenEnum` importları **kullanılmaz hâle geldi** —
duplikasyonun kalktığının kanıtı. `typecheck` temiz, 1185 birim testi yeşil.

---

## K2-2 · 20+ şema kurala aykırı GÖRÜNÜYOR ama haklı — gerekçe hiçbir yerde yazılı değil

**Ölçüm:** tarama 63 örtüşme buldu; incelendiğinde neredeyse tamamı iki desendendi:

1. **`XSchema` ↔ `XInsertSchema`** (20 çift: Order, Product, Discount, MoneyMovement, Address,
   Stock, ProductVariant, Message, ErrorLog, Supplier…) — hepsi `z.object` ile ayrı yazılmış.
2. **API yazma sözleşmeleri** (`AddressWriteSchema` ↔ `AddressSchema`).

**Türetme burada YANLIŞ olurdu ve sebebi ölçüldü.** `OrderSchema` ↔ `OrderInsertSchema`
karşılaştırması:

| Fark | Örnek |
|---|---|
| Katılık | Entity `deliveryZoneId: …nullable()` ↔ Insert `…nullish()` |
| DB varsayılanı olanlar | Insert'te `.optional()` (`status`, `channel`, `deliveryType`) |
| Ek kısıt | Insert `shippingFeeCents: …int().nonnegative()`, Entity yalnız `.int()` |
| Farklı tip | `discountLabel` Insert'te `LocalizedTextDraftSchema` |
| Sonradan set edilenler | `paymentStatus` · `referenceNo` · `invoiceNo` · `carrier` · `trackingNumber` Insert'te **YOK** |

`.omit().partial()` bu semantiği ifade edemez: `.partial()` `customerId`/`warehouseId`
zorunluluğunu da kaldırırdı — deposuz sipariş açılamaz kuralı (DOMAIN §17) tip düzeyinde çökerdi.
`AddressWriteSchema` da aynı: `postalCode: regex(/^\d{5}$/)`, `line1: min(1)` — okuma şemasında
olmayan doğrulamalar.

**Kayıt:** bu gerekçe **hiçbir künyede yazılı değil.** CLAUDE §1 *"`.pick/.omit/.partial/.extend`
ile türet, elle yazma"* diyor ve 20 şema ona aykırı duruyor. İki risk: *(a)* iyi niyetli bir ajan
"düzeltmeye" kalkar ve katılık farklarını ezer — sessizce, çünkü `typecheck` geçer; *(b)* kural
aşınır, gerçekten türetilebilecek yerler de yeniden yazılır (K2-1 tam olarak böyle doğdu).

**Öneri:** kurala bir ayrım cümlesi — *"Entity ↔ Insert/Write ayrı yazılır ve bu bilinçlidir: yazma
şeması farklı KATILIK taşır (zorunluluk, ek doğrulama, sonradan set edilen alanların yokluğu). Alan
kümesi aynı ve katılık farkı yoksa TÜRETİLİR — emsal `ProductDeclarationSchema`."* Yeri `STACK §5`
ya da `packages/types` künyesi. → sahibi **arka uç şeridi**.

**Cevap (arka-uc):**

---

## Temiz çıkan eksenler

| Eksen | Ölçüm | Sonuç |
|---|---|---|
| Elle `interface` | 5 adet / 392 `z.object` | Hepsi meşru: `Page<T>` (jenerik), `ImageFrame`, `SourceImageInfo`, `SettingScopeContext`, `CaptureErrorInput` — Zod'la ifade edilemeyen ya da girdi-nesnesi tipleri |
| Türetme kullanımı | 168 çağrı | Yaygın ve doğru yerde |
| Enum senkronu | K1-1'de ölçüldü | 54/54 DB ile senkron |
