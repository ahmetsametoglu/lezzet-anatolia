// @lezzet/application — UYGULAMA katmanı: saf kararı (domain-core) ve saf I/O'yu (database)
// birleştiren, TAŞIMA-BAĞIMSIZ orkestrasyonlar. Ne çerez bilir ne Bearer; çağıran yüzey
// (Next action, Hono ucu) sonucu kendi taşıma diline çevirir.
//
// Paket 02-mimari §3.1'in ("terfi, kopya değil") ilk vatandaşıyla kuruldu (21.4a): e-posta OTP
// giriş akışı — web'in `otp-actions.ts`'i geçiş döneminde köprü olarak durur, benimsemesi talep
// dosyasıyla gider. Buraya giren her akışın ölçütü aynıdır: EN AZ İKİ yüzeyin çağırdığı (ya da
// çağıracağı) bir orkestrasyon olması. Tek yüzeyin işi kendi uygulamasında kalır.
export { requestOtpCode, verifyOtpCode } from './auth/otp';
export type { RequestOtpCodeResult, VerifyOtpCodeResult } from './auth/otp';

// ── Vitrin (katalog) orkestrasyonu — terfi 21.6 ─────────────────────────────
// Kaynağı `apps/web/lib/storefront`ti; ticari bağlam (fiyat · stok · teklif · aile · benzer) orada
// yaşadığı için mobil katalog uçları bilerek bağlamsız kalmıştı. Kopyalamak tüzükçe yasak —
// taşındı. Web kopyaları geçiş köprüsüdür, benimsemesi ayrı talep dosyasıyla gider.
export { getCatalogData } from './catalog/catalog';
export type { CatalogInput, CatalogQuery } from './catalog/catalog';
export { getProductDetail } from './catalog/product';
export type { ProductDetailInput } from './catalog/product';
export { loadProductContext, listOfferProductIds } from './catalog/product-context';
export { pricingViewerOf, VISITOR } from './catalog/pricing-viewer';
export type { PricingViewer } from './catalog/pricing-viewer';
export {
  EMPTY_PRODUCT_CONTEXT,
  imageOf,
  sellingOf,
  stockStatusOf,
  toCategory,
  toProduct,
  toVariant,
} from './catalog/map';
export type { CatalogCategoryRow, CatalogProductRow, ProductContext } from './catalog/map';
export type {
  PlaceWarehouses,
  PurchaseMode,
  StorefrontCatalog,
  StorefrontCategory,
  StorefrontDeclaration,
  StorefrontFamilyMember,
  StorefrontImage,
  StorefrontProduct,
  StorefrontProductDetail,
  StorefrontVariant,
} from './catalog/storefront-types';
