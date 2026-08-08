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

// ── Kurye orkestrasyonu (K1 · K3–K5 · K7) — terfi 21.10 ─────────────────────
// Kaynağı `apps/web/lib/courier/*`tı ve operasyon web ekranları onu çağırmaya devam ediyor (köprü);
// mobil "Yol" bölümünün uçları (`/api/v1/courier/*`, sonraki ayak) AYNI kapıyı çağıracak. Ölçüt
// karşılandı: iki yüzey, tek orkestrasyon. Kopyalamak tüzükçe yasaktı — taşındı.
// 21.10d: gün başlatma (`startCourierDay`) ve kapı kasası ayarı (`readDoorCashAccountId`) aynı
// kapının yanına eklendi — paketin `exports` haritası yalnız `"."` açıyor, yani alt-yol import'u
// paket sınırında kapalı ve dışa açılmayan bir kapı çağrılamaz.
export { listCourierDay, markUndelivered, readDoorCashAccountId, startCourierDay } from './courier/day';
export type { CourierDayStart, CourierStop, CourierStopItem, StopOutcome, UndeliveredOutcome } from './courier/day';
export { confirmDoorDelivery } from './courier/delivery';
export type { DeliveryProofInput, DoorCollectionInput, DoorDeliveryOutcome } from './courier/delivery';
export { closeCourierDay, openDayClose } from './courier/day-close';
export type { DayCloseDraft } from './courier/day-close';
export { readDeliveryProof, requestDeliveryProofUploadUrl } from './courier/proof';

// ── Sipariş düzeltmesi ve para bağları — terfi 21.10 ────────────────────────
// `refund` kurye kapısının içinde DEĞİL, yanında: kapıda eksik kalem işaretlemek kurye işidir ama
// sipariş düzeltmesi kurye işi değildir (operasyon sipariş detayı, şikâyet çözümü ve Stripe webhook
// da aynı kapıyı çağırıyor). `payment` ve `fulfillment` zorunlu geçiş: ikisi de kurye kapısının
// içinden geçiyordu, bırakılsalardı terfi eden kapı web'e bakmak zorunda kalırdı.
export { adjustFulfillment, cancelOrder, retryRefund } from './order/refund';
export type { AdjustOutcome, CancelOutcome, RefundBlockReason, RefundOptions, WarehouseScope } from './order/refund';
export { closeOrder, deliverOrder } from './order/fulfillment';
export { recordOrderPayment, recordOrderRefund, syncOrderPaymentStatus } from './order/payment';
export type { OrderMovementInput, PaymentOutcome } from './order/payment';
export type {
  OrderEffects,
  OrderExceptionEvent,
  ProviderRefundInput,
  ProviderRefundOutcome,
  ProviderRefunder,
} from './order/effects';

// ── Depo orkestrasyonu (D1 · D2 · D4 · D5) — terfi 21.11 ────────────────────
// Kaynak `apps/web/lib/{order/preparation,stock/fefo,stock/intake,stock/adjustment}.ts`; transfer
// kapısı ise hiçbir yerde YOKTU (web servisi doğrudan çağırıyordu) ve ilk kez burada yazıldı.
// Ölçüt karşılandı: aynı kuyruğu/formu operasyon web ekranları ve mobil Depo bölümü okuyor.
//
// Web kopyaları bugün hâlâ kendi ekranlarını besliyor (KÖPRÜ) — benimsemesi web şeridinin işi;
// görev satırının şartı: web aynı kapıya ihtiyaç duyduğunda PAKETTEN çağırır, ikinci yol açılmaz.
//
// **Her kapı DEPO KİMLİĞİ ister** (CLAUDE.md §1: varsayılan depo YOKTUR) ve kapsam dışı yazım
// görünür retle döner (`forbidden`/`out_of_scope` — kurye kapılarının emsali).
export { confirmPreparation, listPreparationQueue } from './warehouse/preparation';
export type { PreparationLine, PreparationOrder, PreparationSuggestion } from './warehouse/preparation';
export { openIntakeForm, receiveGoods, receivePurchase } from './warehouse/intake';
export type {
  IntakeDifference,
  IntakeFormLine,
  IntakeFormRow,
  IntakeWarning,
  PurchaseIntakeLine,
  RepricePort,
} from './warehouse/intake';
export { recordAdjustment } from './warehouse/adjustment';
export type { AdjustmentLine, AdjustmentOutcome, WarehouseReason } from './warehouse/adjustment';
export { cancelTransfer, dispatchTransfer, listInboundTransfers, receiveTransfer } from './warehouse/transfer';
export type {
  CancelTransferOutcome,
  DispatchTransferOutcome,
  InboundTransfer,
  InboundTransferLine,
  ReceiveTransferOutcome,
} from './warehouse/transfer';
