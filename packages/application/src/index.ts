// Uygulama katmanı: saf kararı (domain-core) ve saf I/O'yu (database) birleştiren, taşımadan bağımsız orkestrasyonlar.
// Buraya en az iki yüzeyin çağırdığı akış girer; tek yüzeyin işi kendi uygulamasında kalır.
export { requestOtpCode, tryAttachReferral, verifyOtpCode } from './auth/otp';
export type { RequestOtpCodeResult, VerifyOtpCodeResult } from './auth/otp';
export { rejectFreshOAuthAccount } from './auth/oauth-account';
// Kurulmamış veritabanına hızlı girişle hesap açılmaz, çünkü açılış kuralı onu yönetici yapardı.
export { DEV_LOGIN_UNSEEDED_DATABASE, devLoginRefusal, devLoginRefusalOf } from './auth/dev-login';
export type { DevLoginRefusal } from './auth/dev-login';
// Müşteri profil güncellemesi.
export { updateCustomerProfile } from './customer/profile';
export type { UpdateCustomerProfileOutcome } from './customer/profile';
// WhatsApp bağlama: hesap ekranı jetonu üretir, Meta webhook'u tüketir.
export { consumeWhatsappLink, startWhatsappLink, waLinkTokenIn, WA_LINK_TTL_MS } from './customer/whatsapp-link';
export type { ConsumeWhatsappLinkOutcome, StartWhatsappLinkOutcome } from './customer/whatsapp-link';
// Kimlik çapası: "bu numaranın geçmişi kimin"; kararlar motorda.
export {
  anchorGateOf,
  anchorOf,
  answerEmailAnchor,
  issueAndSendSecurityCode,
  issueSecurityCode,
  offerAnchorIfDue,
  raiseChallengeIfDue,
  startEmailAnchor,
  verifySecurityCode,
  SECURITY_CODE_MAX_ATTEMPTS,
} from './customer/anchor';
export type {
  AnchorGate,
  AnchorSnapshot,
  AnswerAnchorOutcome,
  IssueAndSendOutcome,
  IssueSecurityCodeOutcome,
  StartEmailAnchorOutcome,
  VerifySecurityCodeOutcome,
} from './customer/anchor';
// ── Müşteri adresi ──
export {
  addCustomerAddress,
  deleteCustomerAddress,
  listCustomerAddresses,
  setBillingCustomerAddress,
  setDefaultCustomerAddress,
  updateCustomerAddress,
} from './customer/addresses';
export type { CustomerAddressOutcome, CustomerAddressWrite } from './customer/addresses';
// ── Müşteri tercihleri (dil + kampanya izinleri) ──
export { updateCustomerPreferences } from './customer/preferences';
export type { CustomerConsentToggles, UpdateCustomerPreferencesOutcome } from './customer/preferences';
// ── Puan cüzdanı: bakiye, eşik, kuponlar, puan→kupon çevirme ──
export {
  listCustomerCoupons,
  readCustomerPoints,
  readCustomerPointsHistory,
  readPointsRules,
  redeemCustomerPoints,
} from './customer/points';
export type {
  CustomerCoupon,
  CustomerEarnWay,
  CustomerPointsCard,
  CustomerPointsRules,
  CustomerPointsView,
  RedeemCustomerPointsOutcome,
} from './customer/points';
// ── B2B başvurusu: kayıt okuması, vergi numarası doğrulaması ve başvuru yazımı tek formun parçasıdır ──
export { readB2bApplicant, submitB2bApplication } from './customer/b2b';
export type { B2bApplicantView, B2bApplicationOutcome } from './customer/b2b';
export { lookupCompanyBySiret } from './b2b/company-registry';
export type { CompanyLookupFailure, CompanyRegistryRecord } from './b2b/company-registry';
export { checkEuVatNumber, refreshVatNumberCheck } from './b2b/vat-check';
export type { VatCheckState } from './b2b/vat-check';
export { readB2bCheck } from './b2b/check';
export type { B2bCheckView, B2bDuplicateRow } from './b2b/check';
export { readB2bQueue } from './b2b/queue';
export type { B2bQueueRowView, B2bQueueView } from './b2b/queue';
export { readB2bSummary } from './b2b/summary';
export type { B2bSummaryResult } from './b2b/summary';
// ── Davet altyapısı: kodu üret, adrese çevir, karşılamayı oku, bağı kur ──
// `linkReferrer`ı doğrudan çağıran yüzey yok ama dışa verilir ki ikinci bir yüzey kendi bağlama kodunu yazmasın.
export {
  attachReferralOnLogin,
  ensureCustomerReferralCode,
  inviteUrl,
  linkReferrer,
  linkReferrerById,
  readInviteWelcome,
  resolveReferrer,
} from './customer/referral';
export type { InviteWelcome, LinkReferrerOutcome } from './customer/referral';
// ── Bildirim tercihleri: mail altbilgisindeki bağı üreten her gönderim bu kapıdan geçer ──
export {
  cancelZoneNotices,
  ensureNotificationToken,
  notificationPreferencesUrl,
  preferencesSubjectOf,
  readNotificationPreferences,
  resolvePreferencesToken,
  setMarketingConsent,
  setNotificationConsent,
} from './customer/notification-preferences';
export type { NotificationPreferencesView, PreferencesSubject } from './customer/notification-preferences';
// ── Komşu daveti: kimliğe değil sefere bağlı; ödül para tarafında (`feedback/points`) ──
export {
  acceptNeighborInvite,
  countNeighborInviteUses,
  remainingNeighborInviteUses,
  declineNeighborInvite,
  matchNeighborInviteForOrder,
  neighborInviteUrl,
  openNeighborInvite,
  readNeighborWelcome,
  readPendingNeighborAwards,
  readPendingNeighborInvites,
  tryOpenNeighborInvite,
} from './customer/neighbor';
export type { NeighborWelcome, OpenNeighborInviteOutcome, PendingNeighborAward, PendingNeighborInvite } from './customer/neighbor';
// ── Müşteri sipariş okuması ──
export { getCustomerAwaitingPayment, getCustomerOrderDetail, listCustomerOrders } from './order/customer-orders';
export type {
  CustomerAwaitingPayment,
  CustomerOrderDetail,
  CustomerOrderDetailInput,
  CustomerOrderDetailLine,
  CustomerOrderListInput,
  CustomerOrderLookup,
  CustomerOrderPage,
  CustomerOrderSummary,
  CustomerOrderThumb,
} from './order/customer-orders';
export { trackingUrlOf } from './order/carrier';

// ── Müşteri talepleri; bildirim tetikleri çağırana `TicketEffects` ile geçer ──
export { getCustomerTicket, listCustomerTickets } from './ticket/read';
export { openCustomerTicket, replyToCustomerTicket } from './ticket/write';
export type { OpenCustomerTicketOutcome, ReplyToTicketOutcome, TicketEffects } from './ticket/write';
// Talep fotoğrafının yükleme kapısı.
export { requestTicketUploadUrl } from './ticket/attachments';
export type { TicketUploadOutcome } from './ticket/attachments';
export type {
  CustomerTicketSummary,
  CustomerTicketView,
  TicketMessageView,
  TicketReturnOutcome,
} from './ticket/ticket-types';

// ── Bildirimin tek kapısı: olay önce kayda, sonra kanala gider ──
export { dispatchCustomerNotification, dispatchStaffNotification } from './notification/dispatch';
export type { CustomerNotificationInput, NotificationTargetRef, StaffNotificationInput } from './notification/dispatch';
// Okuma kapısı; profileId daima guard'dan gelir.
export {
  dismissNotification,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  unreadNotificationCount,
} from './notification/read';
export type { NotificationFeed } from './notification/read';
// Cihaz jetonu: kayıt sahip devriyle, çıkışta silme zorunlu.
export { listSendablePushTokens, registerPushDevice, unregisterPushDevice } from './notification/devices';

// ── Talep bildirimleri + AI destek çekirdeği: özerk AI cevabı personel cevabıyla aynı maili doğurur ──
export { notifyTicketReceived, notifyTicketReplied, notifyTicketStatusChanged } from './ticket/notify';
// Gönderim anında çeviri — kuyruğu beklemeden, zilden ÖNCE (gerekçe dosya başlığında).
export { translateTicketMessageNow } from './ticket/translate';
// Cevap maili: anında değil, okunmamışsa (gerekçe dosya başlığında). `clearTicketReplyMail`
// dışa VERİLMEZ — tek çağıranı komşu okuma kapısı.
export { queueTicketReplyMail, sweepTicketReplyMails } from './ticket/reply-mail';
// Tek metnin çevirisi — kuyruğun ve gönderim anının ortak kapısı.
export { translateUserText } from './translate/user-text';
export type { TranslatedUserText, TranslateUserTextResult } from './translate/user-text';
export {
  generateConversationDraft,
  generateTicketDraft,
  runAutonomousTicketReply,
  // Özerk sohbet motoru; sağlayıcı port olarak geçilir.
  runAutonomousConversationReply,
  type SupportAiOpts,
  type SupportAiOutcome,
} from './ticket/ai';
// Ajanın araç seti dışa verilir ki "ajan neye bakabiliyor" prompt'tan değil tek çağrıdan okunsun.
export { customerSupportTools } from './ticket/support-tools';

// ── Mesaj defteri ──
export { recordInboundMessage, recordOutboundMessage } from './messaging/record';
// Meta webhook işleyicisi; HTTP kabuğu `apps/backend/src/webhooks/meta.ts`.
export { handleMetaWebhook, metaAppSecret, metaVerifyToken, verifyMetaSignature } from './messaging/meta-webhook';
export { fetchMetaProfileName } from './messaging/meta-profile';
// Kimlik çözümü ("bul ya da oluştur"): misafir doğrulama, konuşma açılışı ve Meta webhook'unun ortak kapısı.
export { findOrCreateCustomer } from './customer/find-or-create';
// Sohbet izninin çift yazımı.
export { recordConversationOptIn } from './messaging/opt-in';
// Cloud API sürücüsü.
export { metaCloudSender, messageSenderFor, metaSenderFromEnv } from './messaging/meta-sender';
export {
  sendOutboundMessage,
  unconfiguredSender,
  type MessageSender,
  type SendMessageInput,
  type SendOutcome,
  type SendResult,
  type SendTarget,
} from './messaging/send';
// Sohbet çevirisi; gönderim anındaki çeviri `sendOutboundMessage` içinde kalır ki ikinci çağıran doğmasın.
export { resolveOutboundLanguage, saveMessageTranslation } from './messaging/translate';
// Yeni sohbetin varsayılan yürütücüsü.
export { defaultConversationHandler, setDefaultConversationHandler } from './messaging/default-handler';
// Müşterinin sohbet kanalları: operasyon web'i ve kurye ekranı aynı son kanalı okur.
export { readCustomerChannels } from './messaging/customer-channels';
export type { MessageTranslationPatch } from './messaging/translate';
export type { RecordMessageInput } from './messaging/record';
export type { ConversationOptInOutcome } from './messaging/opt-in';

// ── Canlı zil: zili çalan üç süreç (web · mobil arka uç · backend) tek çağrıyı paylaşır ──
export {
  BELL_EVENT,
  // Açık yazışma ekranının kanalı.
  conversationChannelName,
  conversationsChannelName,
  ringBell,
  ringConversationBell,
  ringConversationsBell,
  ringTicketBell,
  ringTicketsBell,
  // Personel bildirim kanalı; adı sunucu sırrından türer.
  staffNotificationsChannelName,
  ticketChannelName,
  ticketsChannelName,
} from './realtime/bell';

// ── Geri bildirim daveti: kimlik jetondan çözülür, kapılar customerId almaz ──
export { completeFeedbackInvite, openFeedbackInvite, readOrderFeedbackInvite } from './feedback/invite';
export type { OrderFeedbackInvite } from './feedback/invite';
export type { FeedbackCard, FeedbackCompletion, FeedbackInviteView } from './feedback/invite';
export { reviewFeedbackInvite, voteOnFeedbackInvite } from './feedback/write';
export type { FeedbackWriteOutcome } from './feedback/write';
// `POINTS_DEFAULTS`: ayar satırı yokken geçerli puanlar tek yerde, yoksa ekran ile motor ayrışırdı.
export { POINTS_DEFAULTS, awardFeedbackPoints, awardPoints, feedbackCompletionPoints, getPointsBalance } from './feedback/points';

// ── Keşif turu; kimlik çağırandan gelir, istemcinin iddiasından değil ──
export { claimDiscoverSwipes, countDiscoverDeck, openDiscoverDeck, recordDiscoverSwipe } from './feedback/discover';
export type {
  DiscoverCard,
  DiscoverClaimResult,
  DiscoverSwipeOutcome,
  DiscoverSwipeRecord,
} from './feedback/discover';

// ── Yer çözümü: posta kodu → rota/kargo ──
export { resolvePlaceForPostalCode, resolvePlaceWarehouses, UNRESOLVED_PLACE } from './delivery/place';

// ── Vitrin (katalog) ──
export { getCatalogData, readCollectionHead } from './catalog/catalog';
export type { CatalogInput, CatalogQuery } from './catalog/catalog';
export { productIdOfCode } from './catalog/code-search';
export { getProductDetail } from './catalog/product';
export type { ProductDetailInput } from './catalog/product';
export { loadProductContext, listOfferProductIds } from './catalog/product-context';
export { pricingViewerOf, VISITOR } from './catalog/pricing-viewer';
export type { PricingViewer } from './catalog/pricing-viewer';
export { readCostBasis } from './catalog/cost-basis';
export {
  EMPTY_PRODUCT_CONTEXT,
  frameSourcesOf,
  imageOf,
  primaryVariantOf,
  sellingOf,
  stockStatusOf,
  thumbnailImageUrl,
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
  StorefrontCollectionHead,
  StorefrontDeclaration,
  StorefrontFamilyMember,
  ImageFrameSource,
  ImageFrameSources,
  StorefrontImage,
  StorefrontProduct,
  StorefrontProductDetail,
  StorefrontVariant,
} from './catalog/storefront-types';

// ── Kurye ──
export { discardCourierRun, listCourierDay, listStrandedStops, markUndelivered, readCourierRun, readCourierRuns, readDoorCashAccountId, startCourierDay } from './courier/day';
export type { CourierStrandedStop } from './courier/day';
// Kurye dönüşünün depo kabul kapısı.
export { acceptCourierReturn, readCourierReturn } from './courier/return';
export { ensureStopOrder, type StopOrderOutcome } from './courier/stop-order';
export { geocodeAddressesScan, type GeocodeScanResult } from './delivery/geocode-scan';
export { geocoder, geocoderConfigured } from './delivery/geocode-provider';
// Almanya adres önerisi Google Places'tan sunucudan gelir; FR önerisi tarayıcıdan BAN'a gider.
export {
  lookupAddressOptions,
  resolveAddressOption,
  resolveAddressSuggestion,
  suggestAddresses,
} from './delivery/address-suggest';
export type {
  AddressLookupAddress,
  AddressLookupOption,
  AddressLookupOutcome,
  AddressResolveOutcome,
  AddressSuggestOutcome,
} from './delivery/address-suggest';
export { googleMapsConfigured } from './delivery/google-maps';
export { resolveAddressPoint, type AddressPointCandidate } from './delivery/geo-address';
export { checkAddress, type AddressCheckOutcome } from './delivery/address-check';
export { checkAddressForCustomer } from './customer/addresses';
export type { Geocoder, GeocodeOutcome, GeocodeQuery } from './delivery/geocode-port';
export { costOfMatrix } from './delivery/route-matrix-port';
export { routeMatrixConfigured, routeMatrixProvider } from './delivery/route-matrix-provider';
export type { RouteMatrix, RouteMatrixOutcome, RouteMatrixProvider } from './delivery/route-matrix-port';
export type { CourierDayStart, CourierRunBriefView, CourierStop, CourierStopItem, StopOutcome, UndeliveredOutcome } from './courier/day';
export { listCourierRoutes, listCourierVehicles } from './courier/routes';
export { courierVanContext, listVanCandidates, readVanStock, returnFromVan, setVanQty, takeToVan, vehicleWarehouseOf } from './courier/van-stock';
export type { CourierVanContext } from './courier/van-stock';
export type { CourierRouteView } from './courier/routes';
export { confirmDoorDelivery } from './courier/delivery';
export type { DeliveryProofInput, DoorCollectionInput, DoorDeliveryOutcome } from './courier/delivery';
export { loadBox } from './courier/load';
export type { LoadBoxOutcome } from './courier/load';
export { closeCourierDay, openDayClose } from './courier/day-close';
export type { DayCloseDraft } from './courier/day-close';
export { readDeliveryProof, requestDeliveryProofUploadUrl } from './courier/proof';

// ── Sipariş düzeltmesi ve para bağları: kurye, operasyon, şikâyet ve Stripe webhook'u aynı kapıyı çağırır ──
export { adjustFulfillment, cancelOrder, deliverOrderWithAdjustments, retryRefund } from './order/refund';
export { cancelOrderShipment, isOpenShipment, type ShipmentCancelOutcome } from './shipping/cancel';
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

// ── Depo: her kapı depo kimliği ister ve kapsam dışı yazım `forbidden`/`out_of_scope` ile döner ──
export { confirmPreparation, listPreparationQueue, recordShipment } from './warehouse/preparation';
// FEFO önerisi hızlı satış da çağırabilsin diye dışa verilir.
export { suggestPicksForVariant } from './warehouse/preparation';

// Hızlı satış: yerinde satışın kapanış adımı, çağıranı `apps/mobile-api`.
export { quickSale } from './order/quick-sale';
export type { QuickSaleInput, QuickSaleOutcome } from './order/quick-sale';

// Yerinde satış: fiyat, KDV, indirim ve pazarlık sepet okumasından gelir, ikinci bir sipariş kuralı yazılmaz.
export { sellOnSite, listRecentDoorSales, ANONYMOUS_BUYER_ID } from './order/on-site-sale';
export type { DoorSaleRecord, OnSiteSaleInput, OnSiteSaleLine, OnSiteSaleOutcome } from './order/on-site-sale';
export type { PreparationBox, PreparationLine, PreparationOrder, PreparationSuggestion } from './warehouse/preparation';
export { boxLabelPayload, declareOrderShort, printersFor, registerPrinter, markBoxPrinted, openBox, sealBox, unsealBox } from './warehouse/boxes';
export type { RegisterPrinterOutcome } from './warehouse/boxes';
export type { BoxLabel, BoxLabelOutcome, BoxPrinter, MarkPrintedOutcome, OpenBoxOutcome, SealBoxOutcome } from './warehouse/boxes';
export { listOrderBoxes } from './warehouse/order-boxes';
export type { OrderBoxTrace } from './warehouse/order-boxes';
export { boxLabelSvg, sampleBoxLabel } from './warehouse/label-svg';
export { listPendingIntakes, openIntakeForm, readIntakeHeader, receiveGoods, receivePurchase } from './warehouse/intake';
export { duplicateSupplierMessage, duplicateSupplierOf, supplierRowOf } from './warehouse/supplier';
// Tarama kapısı (Modül 23): kod → kimlik + öğrenen eşleme. Kimlik bulur, stok/depo kararı VERMEZ.
export { learnCode, resolveScannedCode } from './warehouse/scan';
export type { LearnCodeOutcome, ScanResolution } from './warehouse/scan';
export type {
  IntakeDifference,
  IntakeFormLine,
  IntakeFormRow,
  IntakeHeader,
  IntakeWarning,
  PendingIntake,
  PurchaseIntakeLine,
  RepricePort,
  StorageMismatch,
} from './warehouse/intake';
export { listWarehouseBatches, recordAdjustment, resolveBatchCode } from './warehouse/adjustment';
export { listWarehouseAreas, markBatchSeen } from './warehouse/batch-area';
export type { MarkBatchSeenOutcome, WarehouseArea } from './warehouse/batch-area';
export type {
  AdjustmentAfterCounts,
  AdjustmentLine,
  AdjustmentOutcome,
  ResolvedBatch,
  ResolveBatchOutcome,
  WarehouseReason,
} from './warehouse/adjustment';
export {
  cancelTransfer,
  dispatchTransfer,
  listClosedTransfers,
  listInboundTransfers,
  listOutboundTransfers,
  readDispatchCandidate,
  readTransferDetail,
  receiveTransfer,
  transitAgeOf,
} from './warehouse/transfer';
export type {
  CancelTransferOutcome,
  ClosedTransfer,
  DispatchCandidate,
  DispatchTransferOutcome,
  InboundTransfer,
  InboundTransferLine,
  OutboundTransfer,
  ReceiveTransferOutcome,
  TransferDetail,
  TransferShortfall,
  TransitAgeTone,
} from './warehouse/transfer';
// "Rampama ne geri geldi" okuması; yazma yarısı `order/refund.adjustFulfillment`ta.
export { listReturningCouriers, listWarehouseReturns, readReturningCourier } from './warehouse/returns';
export type { ReturnDrop, ReturnDropLine, ReturningCourier, ReturningCourierDetail } from './warehouse/returns';

// ── Depo: parti görünümü ve ürün geçmişi ──
export { readVariantStockHistory } from './warehouse/variant-history';
export type { VariantBatchHistory, VariantStockHistory } from './warehouse/variant-history';
export { TRANSFER_TRANSIT_DAYS_DEFAULT, TRANSFER_TRANSIT_DAYS_KEY } from './warehouse/settings-keys';
export { readExpiryThresholds, toBatchViews } from './warehouse/batch-view';
export { listNearExpiry } from './warehouse/near-expiry';
export type { BatchView } from './warehouse/batch-types';
export * from './assistant/apply';
export * from './assistant/kind-meta';

// ── Sepet ──
// Girdi yalnız `{variantId, qty, stockId}`: ad, fiyat ve stok kapıda yeniden çözülür ki istemci siparişin parasını belirleyemesin.
export { getCartView } from './cart/read';
export type { CartBundlePort, CartBundleSource } from './cart/read';
export {
  EMPTY_CART,
  cartBlockReason,
  cartBlockedAnalyticsReason,
  // Kalemin yolu (kapıya teslim · kargo · gelemez) tek yerde ki iki yüzey aynı sepete aynı cevabı versin.
  cartGroupOf,
  cartKey,
  discountAmountOf,
  entryOf,
  entryOfItem,
  isSplitCart,
  itemOfEntry,
  // Siparişe girebilecek kalemler; gelemeyenler sepette kalır, çünkü yeni adreste yine lazım olabilir.
  orderableLines,
  shippingGroupFee,
  splitByRoute,
  storedPrices,
  viewWithEntries,
} from './cart/cart-types';
export type {
  AddToCartIntent,
  CartBundleEntry,
  CartDiscount,
  CartDiscountResult,
  CartEntry,
  CartLine,
  CartReachableDiscount,
  CartRef,
  CartSignal,
  CartVariantEntry,
  CartView,
  CouponFailure,
  DiscountReason,
} from './cart/cart-types';
export { resolveCartDiscount } from './cart/discount';
export type { CartDiscountInput } from './cart/discount';
export { diffCartByPlace } from './cart/place-change';
export type { CartLineChange } from './cart/place-change';
export { clearOrderedLines } from './cart/settle';
export { readLastOrderSuggestion } from './cart/last-order';
export type { LastOrderSuggestion } from './cart/last-order';
// Ayar kapsamı: sepet ve checkout müşteriye söz veren ayarı aynı kapsamla okumak zorunda.
export { settingScopeOf } from './cart/setting-scope';
export {
  FREE_SHIPPING_THRESHOLD_DEFAULT,
  FREE_SHIPPING_THRESHOLD_KEY,
  MIN_BASKET_DEFAULT,
  MIN_BASKET_KEY,
  SHIPPING_FEE_DEFAULT,
  SHIPPING_FEE_KEY,
} from './cart/settings-keys';
// Bilgi sayfalarının ilan ettiği tutarlar aynı `settings` satırından okunur.
export { COD_MAX_DEFAULT, COD_MAX_KEY, readPublicDeliveryTerms } from './settings/public-terms';
export type { PublicDeliveryTerms } from './settings/public-terms';

// ── Sipariş oluşturma ──
// Paket çözümü (`bundles`) ve edinim kaynağı (`onCustomerAcquired`) port olarak dışarıda, çünkü biri oturum çerezini okur.
export { placesForPostalCode, suggestPlaces } from './delivery/places';
export { readDeliveryInputs, resolveDelivery } from './order/delivery';
export type { DeliveryInputs, DeliveryResolution, ResolveDeliveryInput } from './order/delivery';
export { resolveCheckoutPayment } from './order/checkout-options';
export type { CheckoutPaymentInput, CheckoutPaymentResult } from './order/checkout-options';
export { reserveOrderStock } from './order/reserve';
export type { ReserveOrderInput, ReserveOutcome } from './order/reserve';
export { createCheckoutDraft } from './order/checkout-draft';
export type { CheckoutDraftInput, CheckoutDraftOutcome } from './order/checkout-draft';
export { readCheckoutSnapshot } from './order/checkout-snapshot';
export type { CheckoutSnapshot, CheckoutSnapshotInput } from './order/checkout-snapshot';
// ── Sipariş onaylama ──
// `stripe` pakete girmez, çünkü paket React Native ağacında da okunur; ödeme niyeti, ölçüm ve durum yan etkileri port.
export { placeOrder } from './order/place-order';
export type { PlaceOrderInput, PlaceOrderOutcome, PlaceOrderRejection } from './order/place-order';
export { createCheckoutSession } from './order/checkout-session';
export type { CheckoutSessionCreator, CheckoutSessionInput, CheckoutSessionOutcome } from './order/checkout-session';
export { transitionOrder } from './order/transition';
export type { TransitionInput, TransitionOutcome } from './order/transition';
// ── Kart ödemesinin onayı: webhook, ödeme sayfası ve zamanlayıcı aynı yolu çağırır ──
export { confirmOnlinePayment, providerAccountId } from './order/confirm-payment';
export type { ConfirmPaymentDeps, ConfirmPaymentInput, ConfirmPaymentOutcome } from './order/confirm-payment';
export { openPaymentBefore, reconcileDraftPayment, sweepUnpaidDrafts } from './order/reconcile-payment';
export type { OpenPayment, ReconcileOutcome } from './order/reconcile-payment';
export { stripeGateway } from './order/payment-gateway';
export type { PaymentGateway, PaymentSnapshot, StripeLike } from './order/payment-gateway';
// ── Paket (bundle) çözümü ──
export { getPackageDetail, getPackagesByIds, listStorefrontPackages } from './catalog/packages';
// Tarif malzeme okumasının tek kapısı.
export { readRecipeItems, recipeSoldOut, recipeTotalCents } from './catalog/recipe';
export type { RecipeItemReading } from './catalog/recipe';
export { dailyRng, pickFeatured, rotateDaily } from './catalog/featured';
// Vitrin seçkisi.
export { orderByRank, rankSignals, readShowcase, SHOWCASE_LIMIT_DEFAULT, topUp } from './catalog/showcase';
export type { ShowcaseOptions } from './catalog/showcase';
export type { StorefrontPackage, StorefrontPackageDetail, StorefrontPackageItem } from './catalog/storefront-types';
// ── Sipariş bildirimi + sipariş puanı ──
export { notifyOrderException, notifyOrderStatus } from './order/notify';
export { buildOrderNotification } from './order/notification-data';
export type { NotificationBundle } from './order/notification-data';
export { awardReferralPoints, revokeReferralOnUnpaidOrder, rewardReferralOnPaidOrder } from './feedback/points';
export { mergeCustomers } from './customer/merge';
export type { MergeCustomersInput, MergeCustomersOutcome } from './customer/merge';
// ── "Buraya da gelin" ve "gelince haber ver" kayıtları: yer adı kayıt anında donar, tekillik veritabanında ──
export { recordStockNotice, recordZoneNotice } from './delivery/notice';
export type { ZoneNoticeInput, ZoneNoticeOutcome } from './delivery/notice';
// ── Teslimat bölgeleri: ad `public_name`den gelir, `name`den asla ──
export { listPublicDeliveryAreas } from './delivery/zones';

// ── Kapsam kampanyası: tutar döndürmez, kampanya ürün fiyatına yazılamaz ──
export { readScopeCampaigns, EMPTY_SCOPE_CAMPAIGNS } from './catalog/campaign';
export type { ScopeCampaign, ScopeCampaigns } from './catalog/campaign';

// ── Telefon vitrini ──
export { composeHomeBands, readHome } from './catalog/home';
export { readPackageCards, readRecipeCards, RECIPE_LIST_LIMIT } from './catalog/ideas';
export { toWireCampaign } from './catalog/campaign-wire';
export { resolvedOrNull } from './catalog/resolved-text';

// Analitiğin iki yüzeye ortak parçası günlük oturum tuzudur; kapıların düşürme kuralları yüzeye özgü kalır.
export { dailySalt } from './analytics/salt';

// Görüntüleme anındaki satılabilirlik, iki yüzeyde aynı soru.
export { availabilityOf } from './analytics/availability';
export { bundleAvailabilityOf } from './analytics/availability';
export { effectiveChannelOf } from './catalog/pricing-viewer';
export { checkoutBlockedAnalyticsReason } from './cart/cart-types';

// Yönetim ve Para bölümleri.
export { readManagementHub } from './management/hub';
export { readMoneyDayEnd, readMoneyOverview } from './accounting/money';
// Belge, tür, cari, etiket ve izah kapıları.
export {
  allocateToDocument,
  attachDocumentFile,
  createMoneyDocument,
  documentFileUrl,
  listOpenDocuments,
  removeAllocation,
  requestDocumentUploadUrl,
  type AllocationOutcome,
  type DocumentOutcome,
  type DocumentUploadOutcome,
} from './accounting/document';
export { addMovementTag, setMovementTagActive, tagMovement, type TagMovementOutcome, type TagOutcome } from './accounting/tags';
export {
  addMovementNature,
  natureProblemOf,
  setMovementNature,
  updateMovementNature,
  type MovementNatureOutcome,
  type NatureOutcome,
} from './accounting/natures';
export {
  addCounterparty,
  setMovementCounterparty,
  updateCounterparty,
  type CounterpartyOutcome,
  type MovementCounterpartyOutcome,
} from './accounting/counterparties';
export { listOfferCandidates, openBatchOffer, type OpenBatchOfferOutcome } from './warehouse/offer';
export { createSupplyDraft, listSupplyGroups } from './warehouse/supply';
export { readFacilityVanSummary, type FacilityVanSummary, type VanLoadView } from './warehouse/van-summary';
// Talep personel yolu.
export { customerLabel } from './customer/label';
export { getStaffTicketDetail, listTicketQueue, ticketOrderRefOf, ticketReturnOutcomeOf } from './ticket/staff-read';
export { toTicketMessageViews } from './ticket/read';
export {
  changeTicketStatus,
  consumeTicketDraft,
  openTicket,
  replyAsStaff,
  setTicketMode,
  setTicketType,
  takeOverTicket,
  ticketAttachmentsBelongTo,
  triggerReturnFromTicket,
  type TicketWriteResult,
} from './ticket/staff-write';
export type { StaffTicketDetail, TicketOrderRef, TicketQueueItem } from './ticket/ticket-types';
export { readComplaint, readComplaintQueue } from './management/complaint';
export type { ComplaintQueueCounts, ComplaintQueueFilter } from './management/complaint';
export { askShortfall, countOrderExceptions, listOrderExceptions } from './management/exceptions';

// ── Kargo tarifesi ──
export { quoteShipping, type ShippingQuoteInput, type ShippingQuoteOutcome } from './shipping/quote';
export { announceOrderShipment, type AnnounceInput, type AnnounceOutcome } from './shipping/announce';
export { quoteOrderShipment, resolveDispatch, type DispatchBlock, type DispatchQuoteOutcome } from './shipping/dispatch';
export { countAwaitingHandover, handOverBox, listAwaitingHandover, type AwaitingHandoverBox, type HandoverOutcome } from './shipping/handover';
export { sendcloudProvider, shippingProviderConfigured } from './shipping/provider';
export type { RecipientAddress, SenderAddress, ShippingRateProvider } from './shipping/port';
export { syncShipmentStatus, type SyncInput, type SyncOutcome } from './shipping/sync-status';
export { scanOrphanShipments, sweepStuckShipments, type OrphanScanResult, type StuckSweepResult } from './shipping/watch';
/* Takip künyesinin TEK kapısı — dört yüzey (mail · müşteri detayı · mobil sözleşmesi · operasyon
   sipariş detayı) buradan okuyor. Barrel'a çıkması dördüncü tüketicide gerekti. */
export { parcelOrdinal, readOrderTracking, type OrderTracking, type TrackedParcel } from './shipping/tracking';

