/**
 * Sepetin sözleşmesi ve kuralları — **geçiş köprüsü** (terfi aşama 1/3'ün benimsemesi, 10.08).
 *
 * Gövde `@lezzet/application/cart/cart-types`ta; künyelerin tamamı orada (niyet ↔ görünüm ayrımı,
 * indirimin dört hâli, satır kimliği, grup kararı, asgari sepetin matrahı).
 *
 * **Neden köprüye indi.** Terfi 09.08'de yapılmıştı ama web nüshası yerinde bırakılmıştı ve İKİSİ
 * DE canlıydı: web sepeti buradan, mobil arka uç paketten okuyordu. Aynı soruya iki cevap veren bir
 * kural, bir gün ayrışan bir kuraldır — ve **hiçbir test bunu yakalamaz**, çünkü iki dosyanın da
 * kendi testi vardır ve ikisi de yeşil koşar. Ayrışma 10.08'de ÖLÇÜLDÜ: "bu adrese hiç gelemeyen
 * kalem" hâli pakete eklenirken web nüshası eski kuralda kalsaydı, aynı sepet webde asgari sepeti
 * tutmuş, telefonda tutmamış görünürdü (`discount.ts`/`settle.ts` köprülerinin aynı gerekçesi).
 *
 * Köprü hiçbir şey EKLEMEZ: ad ad yeniden dışa açım. Ekranlar `@/lib/cart/cart-types` yazmaya devam
 * eder; tek kaynak paketin kendisidir.
 *
 * ── ADRES BARREL DEĞİL, DERİN YOL — ZORUNLU (10.08, ÖLÇÜLDÜ) ────────────────
 * Bu köprü barrel'dan (`@lezzet/application`) açılınca **ödeme sayfası 500 verdi**:
 * `UnhandledSchemeError: Reading from "node:crypto"`. Zincir Next'in kendi izinde yazılı —
 * `cart-context.tsx` (istemci) → bu dosya → barrel → `auth/otp` → `@lezzet/database` →
 * `email-verification.service` → `node:crypto`. **Sepetin kuralları saf; barrel değil**: tek bir
 * değer bile barrel'dan açılırsa paketin TAMAMI tarayıcı paketine girer.
 *
 * Ölçüm bunun tek vaka olmadığını gösterdi: aynı zincir müşteri yüzeyinde 48 istemci dosyasına
 * ulaşıyordu (sepet · checkout · ürün · tarif · hesap · site çerçevesi). `import type` güvenlidir
 * (derlemede silinir); tehlikeli olan DEĞER importu ve `export … from` yeniden-açımıdır — ikincisi
 * gözle kolayca kaçar, çünkü dosyada "import" kelimesi hiç geçmez.
 *
 * Derin yol barrel'ı hiç yüklemez: `packages/application/src/cart/cart-types.ts` yalnız
 * `@lezzet/domain-core` ve `@lezzet/types` okur, ikisi de istemciye açıktır. Paket kapısı bunun için
 * açıldı (`package.json` → `"./*": "./src/*.ts"`).
 *
 * **Yalnız WEB'İN kullandığı adlar geçer** — paketin sözlüğü daha geniş (satır birleşiminin iki
 * ucu, indirimin sebebi, toplamı çıkaran yardımcı). Hepsini buradan da açsaydık, kullananı olmayan
 * bir dışa açım doğardı ve `knip` onu haklı olarak ölü kod sayardı. İhtiyaç doğduğunda satır
 * eklenir; adres zaten aynı pakettir.
 */
export {
  EMPTY_CART,
  cartBlockReason,
  cartBlockedAnalyticsReason,
  cartKey,
  cartPayableCents,
  entryOf,
  entryOfItem,
  isSplitCart,
  itemOfEntry,
  shippingGroupFee,
  splitByRoute,
  storedPrices,
  viewWithEntries,
} from '@lezzet/application/cart/cart-types';
export type {
  AddToCartIntent,
  CartDiscount,
  CartEntry,
  CartLine,
  CartRef,
  CartSignal,
  CartView,
  CouponFailure,
} from '@lezzet/application/cart/cart-types';
