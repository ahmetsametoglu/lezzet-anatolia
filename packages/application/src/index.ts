// @lezzet/application — UYGULAMA katmanı: saf kararı (domain-core) ve saf I/O'yu (database)
// birleştiren, TAŞIMA-BAĞIMSIZ orkestrasyonlar. Ne çerez bilir ne Bearer; çağıran yüzey
// (Next action, Hono ucu) sonucu kendi taşıma diline çevirir.
//
// Paket 02-mimari §3.1'in ("terfi, kopya değil") ilk vatandaşıyla kuruldu (21.4a): e-posta OTP
// giriş akışı — web'in `otp-actions.ts`'i geçiş döneminde köprü olarak durur, benimsemesi talep
// dosyasıyla gider. Buraya giren her akışın ölçütü aynıdır: EN AZ İKİ yüzeyin çağırdığı (ya da
// çağıracağı) bir orkestrasyon olması. Tek yüzeyin işi kendi uygulamasında kalır.
export { requestOtpCode, tryAttachReferral, verifyOtpCode } from './auth/otp';
export type { RequestOtpCodeResult, VerifyOtpCodeResult } from './auth/otp';
// Hızlı giriş kapılarının ortak ön şartı (26.08 bulgusu): kurulmamış veritabanına hesap açılmaz —
// açılış kuralı onu yönetici yapardı. Buraya konmasının ölçütü aynı: iki yüzey aynı kararı veriyor.
export { DEV_LOGIN_UNSEEDED_DATABASE, devLoginRefusal, devLoginRefusalOf } from './auth/dev-login';
export type { DevLoginRefusal } from './auth/dev-login';
// Müşteri profil güncellemesi (21.14c) — web hesap formunun kuralları paket hâlinde; web köprü.
export { updateCustomerProfile } from './customer/profile';
export type { UpdateCustomerProfileOutcome } from './customer/profile';
// WhatsApp bağlama (04.10) — hesabı numaraya bağlayan jeton akışı; iki tüketici: hesap ekranı
// (jetonu üretir) ve Meta webhook'u (tüketir).
export { consumeWhatsappLink, startWhatsappLink, waLinkTokenIn, WA_LINK_TTL_MS } from './customer/whatsapp-link';
export type { ConsumeWhatsappLinkOutcome, StartWhatsappLinkOutcome } from './customer/whatsapp-link';
// Kimlik ÇAPASI (04.10) — "bu numaranın geçmişi kimin". Kararlar motorda; kuruluş, tetik ve kapı burada.
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
// Müşteri adres kapısı (21.15) — web hesap sayfasının adres kuralları paket hâlinde; web köprü.
export {
  addCustomerAddress,
  deleteCustomerAddress,
  listCustomerAddresses,
  setDefaultCustomerAddress,
  updateCustomerAddress,
} from './customer/addresses';
export type { CustomerAddressOutcome, CustomerAddressWrite } from './customer/addresses';
// Müşteri tercih kapısı (21.16) — dil + kampanya izinleri; web'in `identity/language-actions` ve
// `setConsentAction` kurallarının TERFİSİ (web köprü). Damga politikası ve dil yan etkisi künyede.
export { updateCustomerPreferences } from './customer/preferences';
export type { CustomerConsentToggles, UpdateCustomerPreferencesOutcome } from './customer/preferences';
// ── Müşteri puan cüzdanı (21.17) — bakiye + eşik + kullanılabilir kuponlar + puan→kupon çevirme.
// Web `lib/account/coupons.ts` + `lib/feedback/points.ts`in TERFİSİ (web köprü). Kazanım çekirdeği
// `feedback/points.ts`te KALIYOR: çevirme bir cüzdan hareketi, geri bildirim aksiyonu değil.
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
// ── B2B başvurusu (08.7) — terfi 21.31 ─────────────────────────────────────
// Kaynağı `apps/web/lib/b2b/{application,company-registry,vat-check}.ts`tı; web köprü olarak
// duruyor. Üç kapı birden taşındı çünkü üçü de aynı formun parçası: numara kaydı OKUR, vergi
// numarası DOĞRULANIR, başvuru YAZILIR — ve yazma kapısı doğrulamayı kendi içinde çağırıyor.
export { readB2bApplicant, submitB2bApplication } from './customer/b2b';
export type { B2bApplicantView, B2bApplicationOutcome } from './customer/b2b';
export { lookupCompanyBySiret } from './b2b/company-registry';
export type { CompanyLookupFailure, CompanyRegistryRecord } from './b2b/company-registry';
export { checkEuVatNumber } from './b2b/vat-check';
// ── Davet altyapısı (17.7 zemin · 17.9 bağlantı) ────────────────────────────
// Dört kapı tek dosyada: kodu ÜRET · kodu ADRESE çevir · karşılama durumunu OKU · bağı KUR.
// `linkReferrer`ı doğrudan çağıran bir yüzey yok (kayıt akışının içinde, `verifyOtpCode`) ama
// barrel'da: sözleşmenin görünür olması, ikinci bir yüzeyin kendi bağlama kodunu yazmasını önler.
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
// ── Bildirim tercihleri (22.08) — her mailin altbilgisindeki bağın hedefi ──
// Kapı TEK: bağı üreten altı gönderim yolu da buradan geçer, yoksa biri jetonu unutur ve o mailin
// bağı sessizce giriş duvarına çıkar.
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
// ── Komşu daveti (17.10) — davetin İKİNCİ türü: kimliğe değil SEFERE bağlı ──
// Üç ucu da iki yüzeyden çağrılıyor: daveti AÇMA (sipariş sonrası ekran) · KARŞILAMA (bağlantının
// indiği sayfa) · SEFERE BAĞLAMA (checkout). Ödül burada değil, para tarafında (`feedback/points`).
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
// ── Müşteri sipariş okuması (08.5) — terfi 21.16 ────────────────────────────
// Kaynağı `apps/web/lib/order/{customer-orders,customer-lines,carrier}.ts`tı; web köprü olarak
// duruyor. Detay kapısı İKİ anahtarı da kabul eder (kimlik ⟷ referans) — gerekçe künyede.
export { getCustomerOrderDetail, listCustomerOrders } from './order/customer-orders';
export type {
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

// ── Müşteri talep/şikâyet kapısı (16.x) — terfi 21.18 ───────────────────────
// Web destek sayfalarının kuralları paket hâlinde (web köprü): liste, mesajlaşma detayı, yeni
// talep ve cevap yazımı. Bildirim tetikleri çağırana `TicketEffects` ile geçer — kapı taşıma
// bilmez (kurye/sipariş kapılarının aynı deseni).
export { getCustomerTicket, listCustomerTickets } from './ticket/read';
export { openCustomerTicket, replyToCustomerTicket } from './ticket/write';
export type { OpenCustomerTicketOutcome, ReplyToTicketOutcome, TicketEffects } from './ticket/write';
export type {
  CustomerTicketSummary,
  CustomerTicketView,
  TicketMessageView,
  TicketReturnOutcome,
} from './ticket/ticket-types';

// ── Bildirimin TEK KAPISI (14.12) ───────────────────────────────────────────
// Olay önce KAYDA yazılır (uygulama içi zil + okundu + teslim defteri), sonra kanala gider. Beş
// yayım noktası da buradan geçer; iki ayrı yerde "hem satır hem mail" yazılsaydı biri unutulurdu.
export { dispatchCustomerNotification, dispatchStaffNotification } from './notification/dispatch';
export type { CustomerNotificationInput, NotificationTargetRef, StaffNotificationInput } from './notification/dispatch';
// Okuma kapısı (14.13): uç (mobil) ve web zili aynı fonksiyonlardan — profileId HER ZAMAN guard'dan.
export {
  dismissNotification,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  unreadNotificationCount,
} from './notification/read';
export type { NotificationFeed } from './notification/read';
// Cihaz jetonu kapısı (14.14): kayıt sahip devriyle, çıkışta silme ZORUNLU, izin raporu dahil.
export { listSendablePushTokens, registerPushDevice, unregisterPushDevice } from './notification/devices';

// ── Talep bildirimleri + AI destek çekirdeği (16.4 · 16.5 · 20.4) — terfi 16.08 ─────────────
// Bildirim kurucusu webden geldi (web köprü, `order/notify` yolu): özerk AI cevabı backend
// cron'unda yazılıyor ve personel cevabıyla AYNI maili doğurmalı. AI çekirdeği de burada — web'in
// "Taslak öner" düğmesi ile backend'in destek turu aynı kapıyı çağırır.
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
  // Özerk SOHBET motoru (15.8) — sağlayıcı port olarak geçilir, motor sürücüyü bilmez.
  runAutonomousConversationReply,
  type SupportAiOpts,
  type SupportAiOutcome,
} from './ticket/ai';
// Ajanın araç seti (16.9) — dışa veriliyor ki denetlenebilsin: "ajan neye bakabiliyor" sorusunun
// cevabı tek bir çağrıyla okunur olmalı, prompt metninden çıkarılmamalı.
export { customerSupportTools } from './ticket/support-tools';

// ── Mesaj defteri (15.1 · üç kanal 21.08) — terfi 21.08 ─────────────────────────────────────
// Kaynak `apps/web/lib/messaging/conversation.ts`ın kayıt yarısı; web action'ları ve Meta
// webhook'u artık buradan çağırıyor, mobil `/social` uçları da aynı kapıya yazıyor. Konuşma
// AÇILIŞI webde kaldı — kimlik çözümü web'in identity katmanında (gerekçe dosya başlığında).
export { recordInboundMessage, recordOutboundMessage } from './messaging/record';
// Kimlik bağlama KAPISI (15.19) — kanıt sunucuda doğrulanır; ikinci yüzey kendi kapısını yazmasın.
export { linkConversationCustomer } from './messaging/link';
// Sohbet izninin çift yazımı (15.12) — kural tek yerde, iki yüzey aynı kapıdan.
export { recordConversationOptIn } from './messaging/opt-in';
// Cloud API sürücüsü (15.11) — portun gerçek uygulaması; ekrana BAĞLI DEĞİL (künyesi dosyada).
export { metaCloudSender, messageSenderFor } from './messaging/meta-sender';
export {
  sendOutboundMessage,
  unconfiguredSender,
  type MessageSender,
  type SendMessageInput,
  type SendOutcome,
  type SendResult,
  type SendTarget,
} from './messaging/send';
export type { RecordMessageInput } from './messaging/record';
export type { LinkProof, LinkOutcome } from './messaging/link';
export type { ConversationOptInOutcome } from './messaging/opt-in';

// ── Canlı zil (16.8) ────────────────────────────────────────────────────────────────────────
// Sipariş zilinin terfi etmiş hâli: müşteri mobilden yazınca operasyon ekranının kendiliğinden
// tazelenmesi için, zili çalan üç süreç (web · mobil arka uç · backend cron) tek çağrıyı paylaşsın.
export {
  BELL_EVENT,
  conversationsChannelName,
  ringBell,
  ringConversationsBell,
  ringTicketBell,
  ringTicketsBell,
  // Personel bildirim kanalı (14.15): adı sunucu sırrından türer — operasyon layout'u zile taşır.
  staffNotificationsChannelName,
  ticketChannelName,
  ticketsChannelName,
} from './realtime/bell';

// ── Geri bildirim akışı (17.2 · 17.6) — terfi: web davet sayfası + mobil vFb ────────────────
// Kaynak `apps/web/lib/feedback/{invite,product-feedback,points}.ts`in TOKEN akışı dilimi; web
// köprü, benimsemesi web şeridinin işi. Kimlik TOKEN'dan çözülür; kapılar customerId almaz.
export { completeFeedbackInvite, openFeedbackInvite, readOrderFeedbackInvite } from './feedback/invite';
export type { OrderFeedbackInvite } from './feedback/invite';
export type { FeedbackCard, FeedbackCompletion, FeedbackInviteView } from './feedback/invite';
export { reviewFeedbackInvite, voteOnFeedbackInvite } from './feedback/write';
export type { FeedbackWriteOutcome } from './feedback/write';
// `POINTS_DEFAULTS` dışa veriliyor (17.11): ayar satırı yazılmamışken geçerli olan sayılar TEK
// yerde durmalı. Web kendi tablosunu taşıyordu ve 11.08 kararından (getiren 500) habersizdi —
// ekran 50 der, motor 500 yazardı; 29.07 denetiminin kapattığı "ekran ile motor ayrışması"nın aynısı.
export { POINTS_DEFAULTS, awardFeedbackPoints, awardPoints, feedbackCompletionPoints, getPointsBalance } from './feedback/points';

// ── Keşif turu (08.7 · 17.3) — terfi 21.19: web keşif sayfası + mobil keşif ekranı ──────────
// Kaynak `apps/web/lib/feedback/{discover,discover-claim}.ts` ve `product-feedback.ts`in
// `candidate` DALI; web köprü, benimsemesi web şeridinin işi. Kimlik ÇAĞIRANDAN gelir
// (oturum ya da Bearer), istemcinin iddiasından değil.
export { claimDiscoverSwipes, countDiscoverDeck, openDiscoverDeck, recordDiscoverSwipe } from './feedback/discover';
export type {
  DiscoverCard,
  DiscoverClaimResult,
  DiscoverSwipeOutcome,
  DiscoverSwipeRecord,
} from './feedback/discover';

// ── Yer çözümü (19.8 · 21.6 B) — posta kodu → rota/kargo; onboarding + web yer okuması ──────
export { resolvePlaceForPostalCode, resolvePlaceWarehouses, UNRESOLVED_PLACE } from './delivery/place';

// ── Vitrin (katalog) orkestrasyonu — terfi 21.6 ─────────────────────────────
// Kaynağı `apps/web/lib/storefront`ti; ticari bağlam (fiyat · stok · teklif · aile · benzer) orada
// yaşadığı için mobil katalog uçları bilerek bağlamsız kalmıştı. Kopyalamak tüzükçe yasak —
// taşındı. Web kopyaları geçiş köprüsüdür, benimsemesi ayrı talep dosyasıyla gider.
export { getCatalogData, readCollectionHead } from './catalog/catalog';
export type { CatalogInput, CatalogQuery } from './catalog/catalog';
export { getProductDetail } from './catalog/product';
export type { ProductDetailInput } from './catalog/product';
export { loadProductContext, listOfferProductIds } from './catalog/product-context';
export { pricingViewerOf, VISITOR } from './catalog/pricing-viewer';
export type { PricingViewer } from './catalog/pricing-viewer';
export {
  EMPTY_PRODUCT_CONTEXT,
  imageOf,
  primaryVariantOf,
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
  StorefrontCollectionHead,
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
export { listCourierDay, markUndelivered, readCourierRun, readDoorCashAccountId, startCourierDay } from './courier/day';
export type { CourierDayStart, CourierRunBriefView, CourierStop, CourierStopItem, StopOutcome, UndeliveredOutcome } from './courier/day';
export { listCourierRoutes } from './courier/routes';
export type { CourierRouteView } from './courier/routes';
export { confirmDoorDelivery } from './courier/delivery';
export type { DeliveryProofInput, DoorCollectionInput, DoorDeliveryOutcome } from './courier/delivery';
export { loadBox } from './courier/load';
export type { LoadBoxOutcome } from './courier/load';
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
export { confirmPreparation, listPreparationQueue, recordShipment } from './warehouse/preparation';
// FEFO önerisi paketin İÇİNDE zaten vardı (`preparation`in özel yardımcısı); hızlı satış onu
// çağırabilsin diye ihraç edildi — ikinci bir kopya yazmak yerine (CLAUDE §1).
//
// **WEB KOPYASI SİLİNDİ (26.08).** Bu satır bir tur *"`lib/stock/fefo.ts` hâlâ kendi ekranını
// besleyen KÖPRÜdür"* diyordu ve hızlı satış terfi edince o cümle YALAN oldu: kopyanın tek üretim
// çağıranı `quickSale`di, o da pakete geçti. Ölçüldü — geriye yalnız kendi testi kalmıştı.
// Kopyanın taşıdığı üç fazla alan (`flag` · `remainingPercent` · `lotNumber`) buraya TAŞINMADI ve
// bu bilinçli: onları okuyan üretim kodu hiç olmamıştı (eski çağıran da yalnız `stockId`+`qty`
// alıyordu). Okuyacak ekran (D3 raf ömrü) geldiği gün eklenir — hesaplanıp atılan bir değer, bir
// gün "bu neden hep boş" diye aranacak ölü koddur (bu fonksiyonun kendi künyesi).
export { suggestPicksForVariant } from './warehouse/preparation';

/**
 * **HIZLI SATIŞ — YERİNDE SATIŞIN KAPANIŞ ADIMI** (terfi 26.08, `apps/web/lib/order/quick-sale.ts`).
 *
 * Taşınmasının sebebi kullanıcı kararıdır: yerinde satış (depo kapısı **ve kuryenin aracı**) artık
 * native uygulamanın işi (`DOMAIN §17` — *"Admin yerinde satış yapmaz"*), yani çağıran
 * `apps/mobile-api` olacak ve o `apps/web/lib`den import EDEMEZ. Motor web'de kaldığı sürece tek
 * çağıranı testleriydi: web'de üretim çağrısı hiç yoktu, o yüzden taşıma kimsenin işini kesmedi.
 */
export { quickSale } from './order/quick-sale';
export type { QuickSaleInput, QuickSaleOutcome } from './order/quick-sale';

/**
 * **YERİNDE SATIŞ** (21.118) — depo kapısı ve kuryenin aracı, tek adımda.
 *
 * Fiyat/KDV/indirim/toplam sepet okumasından geliyor (`getCartView`), pazarlık da oraya
 * (`priceOverrides`) — yani ikinci bir sipariş kuralı yazılmadı (09.8'in dersi). `draft →
 * completed` kararı BU kapıda durur, `delivery_type` semantiğinde değil: Drive günü geldiğinde
 * aynı `pickup` değeri tam yoldan geçecek (DATA_MODEL › pickup).
 */
export { sellOnSite, listRecentDoorSales, ANONYMOUS_BUYER_ID } from './order/on-site-sale';
export type { DoorSaleRecord, OnSiteSaleInput, OnSiteSaleLine, OnSiteSaleOutcome } from './order/on-site-sale';
export type { PreparationBox, PreparationLine, PreparationOrder, PreparationSuggestion } from './warehouse/preparation';
export { boxLabelPayload, labelPrinterFor, markBoxPrinted, openBox, sealBox, LABEL_PRINTER_KEYS } from './warehouse/boxes';
export type { BoxLabel, BoxLabelOutcome, BoxPrinter, MarkPrintedOutcome, OpenBoxOutcome, SealBoxOutcome } from './warehouse/boxes';
export { boxLabelSvg, LABEL_WIDTH_PX, LABEL_HEIGHT_PX } from './warehouse/label-svg';
export { listPendingIntakes, openIntakeForm, readIntakeHeader, receiveGoods, receivePurchase } from './warehouse/intake';
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
export { recordAdjustment } from './warehouse/adjustment';
export type { AdjustmentLine, AdjustmentOutcome, WarehouseReason } from './warehouse/adjustment';
export {
  cancelTransfer,
  dispatchTransfer,
  listInboundTransfers,
  readDispatchCandidate,
  readTransferDetail,
  receiveTransfer,
} from './warehouse/transfer';
export type {
  CancelTransferOutcome,
  DispatchCandidate,
  DispatchTransferOutcome,
  InboundTransfer,
  InboundTransferLine,
  ReceiveTransferOutcome,
  TransferDetail,
} from './warehouse/transfer';
// D6'nın OKUMA yarısı (21.11d). Yazma yarısı `order/refund.adjustFulfillment`ta ve orada KALIYOR:
// sipariş düzeltmesi depo işi değil, üç ayrı çağıranı var (`refund.ts` künyesi). Burada yalnız
// "rampama ne geri geldi" sorusu yaşıyor ve o gerçekten deponun sorusudur.
export { listWarehouseReturns } from './warehouse/returns';
export type { ReturnDrop, ReturnDropLine } from './warehouse/returns';

// ── Depo: parti görünümü — terfi 06.13 ──────────────────────────────────────
// Yakın-SKT kararının TEK adresi. Kaynağı `apps/web/lib/stock/batch-view.ts`ti ve `server-only`
// olduğu için `apps/mobile-api` okuyamıyordu — mobil D3 ekranı bu yüzden açılamıyordu. Eşiği
// kopyalamak iki yüzeyin aynı parti için farklı karar göstermesi demekti. Web tarafı ince köprü.
// Ürün geçmişi (22.30) — seçili boyun parti/çıkış/fire geçmişi; okuma TIKLANDIĞINDA yapılır.
export { readVariantStockHistory } from './warehouse/variant-history';
export type { VariantBatchHistory, VariantStockHistory } from './warehouse/variant-history';
export { readExpiryThresholds, toBatchViews } from './warehouse/batch-view';
export type { BatchView } from './warehouse/batch-types';
export * from './assistant/apply';
export * from './assistant/kind-meta';

// ── Sepet okuması ve kuralları (08.4 · 09.6 · 19.7 · 19.11) — TERFİ aşama 1/3 ────────────────
// Kaynak `apps/web/lib/cart/{read,cart-types,discount,place-change,settle,empty-cart}.ts` +
// `apps/web/lib/{settings-scope,settings-keys}.ts`. Gerekçe 02-mimari §3.1 ve denetimin 07.08 notu
// (`docs/talep/not-mobil-sepet-yarisi-web-native.md`): çapraz-istemci kural ya veritabanında ya
// paylaşılan pakette yaşar — `apps/web`'e de `apps/mobile-api`'ye de kural yazılmaz, ikisi de çağırır.
// Web kopyaları bugün KÖPRÜ; benimsemesi web şeridinin takvimi.
//
// **Girdi yalnız `{variantId, qty, stockId}`**: ad/fiyat/stok/tavan kapıda YENİDEN çözülür
// (DOMAIN §5). Bu bir güvenlik özelliğidir, gevşetilmez — istemcinin yazabildiği tutar siparişin
// parasını belirleyemez.
export { getCartView } from './cart/read';
export type { CartBundlePort, CartBundleSource } from './cart/read';
export {
  EMPTY_CART,
  cartBlockReason,
  cartBlockedAnalyticsReason,
  /* Kalemin ÜÇ yoldan hangisine düştüğü — kapıya teslim · kargo · bu adrese hiç gelemez
     (kullanıcı kararı 10.08). Karar TEK yerde: iki yüzey aynı sepete aynı cevabı versin diye
     terfi edildi; mobil ekranı elle filtre yazıyordu ve `not_shippable_here` kalemi "kapıya
     teslim" grubuna sokuyordu — müşteri engeli ancak kasada görüyordu. */
  cartGroupOf,
  cartKey,
  discountAmountOf,
  entryOf,
  entryOfItem,
  isSplitCart,
  itemOfEntry,
  /* Siparişe GİREBİLECEK kalemler — gelemeyenler sepette KALIR, silinmez ve sildirilmez
     (kullanıcı kararı 10.08): yarın bölge içi bir adres eklendiğinde o kalem yine lazım. */
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
// Ayar kapsamı + müşteriye SÖZ VEREN anahtarlar: sepet ve checkout aynı satırı, aynı kapsamla
// okumak zorunda (07.15 · 29.07 dersi). Kapsam kurucusu artık SAF — görüntüleyen çağırandan gelir.
export { settingScopeOf } from './cart/setting-scope';
export {
  FREE_SHIPPING_THRESHOLD_DEFAULT,
  FREE_SHIPPING_THRESHOLD_KEY,
  MIN_BASKET_DEFAULT,
  MIN_BASKET_KEY,
  SHIPPING_FEE_DEFAULT,
  SHIPPING_FEE_KEY,
} from './cart/settings-keys';
// Bilgi sayfalarının ilan ettiği tutarlar (18.08): yasal "Teslimat ve iade", SSS ve posta kodu notu
// sayıyı cümleye GÖMÜYORDU; artık aynı `settings` satırından okuyorlar.
export { COD_MAX_DEFAULT, COD_MAX_KEY, readPublicDeliveryTerms } from './settings/public-terms';
export type { PublicDeliveryTerms } from './settings/public-terms';

// ── Sipariş oluşturma zinciri (07.2 · 07.3 · 07.4 · 08.13) — TERFİ aşama 2/3 ────────────────
// Kaynak `apps/web/lib/{delivery/places,order/{delivery,checkout-options,reserve,checkout-draft}}.ts`
// + `apps/web/app/(customer)/[locale]/checkout/actions.ts`'in checkout anlık görüntüsü. Gerekçe
// 02-mimari §3.1 ve mobilin "Siparişi tamamla" ekranı: **iki yüzeyde iki sipariş kuralı olamaz.**
// Web kopyaları bugün KÖPRÜ; benimsemesi web şeridinin takvimi.
//
// İki bağımlılık PORT olarak dışarıda: paket çözümü (`bundles`, aşama 1'in `CartBundlePort`u) ve
// edinim kaynağı (`onCustomerAcquired`, oturum çerezini okuyor — pakette yaşayamaz).
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
// ── Sipariş ONAYLAMA zinciri (07.4 · 07.6 · 08.13) — TERFİ aşama 3/3 ────────────────────────
// Kaynak `apps/web/app/(customer)/[locale]/checkout/actions.ts`'in onay eylemi +
// `apps/web/lib/order/{checkout-session,transition}.ts`. Web kopyaları bugün KÖPRÜ.
//
// **`stripe` PAKETE GİRMEZ:** ödeme niyetini açan taraf port (`CheckoutSessionCreator`) ve çağıran
// geçer — bu paket React Native tarafından da okunabilen bir bağımlılık ağacında yaşıyor. Aynı
// gerekçeyle ölçüm (`onRejected`/`onPlaced`, çerez okur) ve durum geçişinin iki yan etkisi
// (`OrderEffects` — müşteri haberi + sipariş puanı) da dışarıda. Ret DETAYININ dizeye çevrilmesi
// çağıranda kalır: para biçimi dile bağlı, yani bir GÖRÜNÜM kararı.
export { placeOrder } from './order/place-order';
export type { PlaceOrderInput, PlaceOrderOutcome, PlaceOrderRejection } from './order/place-order';
export { createCheckoutSession } from './order/checkout-session';
export type { CheckoutSessionCreator, CheckoutSessionInput, CheckoutSessionOutcome } from './order/checkout-session';
export { transitionOrder } from './order/transition';
export type { TransitionInput, TransitionOutcome } from './order/transition';
// ── Paket (bundle) çözümü — terfi 09.08 ─────────────────────────────────────
// Kaynağı `apps/web/lib/storefront/packages.ts`tı ve `server-only` olduğu için `apps/mobile-api`
// okuyamıyordu; web köprü olarak duruyor. Terfi tetiği ÖLÇÜLMÜŞ bir arızaydı: mobil sepette paket
// satırı sunucuya yazılıyor ama onu çözecek kapı (`CartBundlePort`) beslenemediği için satır
// adsız/fiyatsız/ENGELLİ dönüyor ve tutarı sepet toplamına hiç girmiyordu.
// `pickFeatured` de onunla geldi (vitrin şeridini süzüyor, zincir gereği). `rotateDaily` 05.23'da
// izledi — kategori kartı kendi fotoğraf havuzundan güne göre bir kare seçmeye başladı ve seçim
// `toCategory` indirgemesinde, yani mobil API'nin de çağırdığı yerde yapılıyor. `pickRandom` webde
// KALDI: tek tüketeni hâlâ web ana sayfasının fırsat bandı.
export { getPackageDetail, getPackagesByIds, listStorefrontPackages } from './catalog/packages';
export { dailyRng, pickFeatured, rotateDaily } from './catalog/featured';
/* VİTRİN SEÇKİSİ — iki yüzeyin tek kaynağı (terfi 27.08; kaynağı `apps/web/lib/storefront/home.ts`
   idi ve native uygulama onu kopyalamak yerine kataloğun ham sırasını okuyordu). */
export { orderByRank, rankSignals, readShowcase, SHOWCASE_LIMIT_DEFAULT, topUp } from './catalog/showcase';
export type { ShowcaseOptions } from './catalog/showcase';
export type { StorefrontPackage, StorefrontPackageDetail, StorefrontPackageItem } from './catalog/storefront-types';
// ── Sipariş BİLDİRİMİ + sipariş puanı — terfi 10.08 ─────────────────────────
// Kaynağı `apps/web/lib/order/{notify,notification-data}.ts` ve `lib/feedback/points.ts`ti; web
// köprü olarak duruyor. Tetiği ÖLÇÜLMÜŞ bir arızaydı: durum geçişinin yan etkileri `OrderEffects`
// portundan akıyor ve web köprüsü portu VARSAYILAN olarak dolduruyordu — yani operasyonun
// "yola çıktı"/"teslim edildi" geçişleri mail gönderiyor, ama MOBİLDEN verilen kapıda-ödemeli
// siparişin `order_confirmed` maili hiç gitmiyordu: `placeOrder`a `effects` geçilmiyordu, çünkü
// maili kuran kod `apps/web` içindeydi ve `apps/mobile-api` onu import edemiyordu.
//
// Yeni npm bağımlılığı GİRMEDİ (ölçüldü): `@lezzet/notify`ın npm kapanışı `@lezzet/email` üzerinden
// zaten paketin ağacındaydı — eklenen yalnız iki `workspace:*` satırı.
export { notifyOrderException, notifyOrderStatus } from './order/notify';
export { buildOrderNotification } from './order/notification-data';
export type { NotificationBundle } from './order/notification-data';
export { awardReferralPoints, revokeReferralOnUnpaidOrder, rewardReferralOnPaidOrder } from './feedback/points';
export { mergeCustomers } from './customer/merge';
export type { MergeCustomersInput, MergeCustomersOutcome } from './customer/merge';
// ── "Buraya da gelin" kaydı — terfi 10.08 ───────────────────────────────────
// Kaynağı `apps/web/lib/delivery/notice-actions.ts`in `recordZoneNoticeAction`ıydı; web köprü.
// Mobil bant (21.20) aynı kaydı yazıyor ve kural TEK olmalı: yer adının KAYIT ANINDA dondurulması
// (kod tablosu değişse de operatör "68000" değil "Colmar" okur) ve tekilliğin veritabanında
// durması (`zone_notice_unique_idx` — aynı kişi aynı yer için ikinci kez sayılmaz) iki yüzeyde
// ayrı yazılsaydı biri bir gün ötekinden geride kalırdı. Yüzeye özgü olan dışarıda: web'in
// çerezten okuduğu yer cevabı ve oturumdan çözdüğü kimlik parametre olarak geliyor.
export { recordZoneNotice } from './delivery/notice';
export type { ZoneNoticeInput, ZoneNoticeOutcome } from './delivery/notice';
// ── Teslimat bölgeleri listesi — "araç nerelere gidiyor" (kullanıcı kararı 10.08) ──
// Kaydın kardeşi: bant müşteriye "buraya gelmiyoruz" derken, bu okuma "peki nereye gidiyoruz"un
// cevabını veriyor. Ad `public_name`den gelir, `name`den ASLA — gerekçe varlık şemasının künyesinde.
export { listPublicDeliveryAreas } from './delivery/zones';

// ── Kapsam kampanyası (08.44) — "bu kategoride/koleksiyonda açık kampanya var mı" ────────────
// Vitrin bandının rozeti ve filtrelenmiş katalogun cümlesi bu TEK kapıdan okur; web ile mobil-api
// aynı kararı iki kez yazmasın. Tutar döndürmez — kampanya ürün fiyatına yazılamaz (künyede
// gerekçesi ölçümüyle yazılı), yüzey onu rozet/cümle olarak söyler.
export { readScopeCampaigns, EMPTY_SCOPE_CAMPAIGNS } from './catalog/campaign';
export type { ScopeCampaign, ScopeCampaigns } from './catalog/campaign';

/* Analitiğin İKİ YÜZEYE ortak tek parçası (24.08 · MB-63) — günlük oturum tuzu. Kapının kendisi
   ortak DEĞİL ve olmamalı: web'in düşürme kurallarının (prefetch · bot UA · rota kalıbı · UTM)
   native'de karşılığı yok, native'in kendi kapısı `apps/mobile-api/src/lib/analytics.ts`. */
export { dailySalt } from './analytics/salt';

/* Görüntüleme anındaki satılabilirlik — `apps/web`ten taşındı (24.08 · MB-63): saf mantık, iki
   yüzeyde AYNI soru. Kopyalansaydı aynı ürün web'de `sellable`, native'de `sold_out` sınıflanabilir
   ve hiçbir yerde hata vermezdi. */
export { availabilityOf } from './analytics/availability';
export { bundleAvailabilityOf } from './analytics/availability';
export { effectiveChannelOf } from './catalog/pricing-viewer';
export { checkoutBlockedAnalyticsReason } from './cart/cart-types';

// Yönetim + Para bölümleri (21.12) — hub karar kutusu/gün özeti ve salt-okuma para özetleri.
export { readManagementHub } from './management/hub';
export { readMoneyDayEnd, readMoneyOverview } from './accounting/money';
export { listOfferCandidates, openBatchOffer, type OpenBatchOfferOutcome } from './warehouse/offer';
export { createSupplyDraft, listSupplyGroups } from './warehouse/supply';
// Talep PERSONEL yolu (21.12 terfisi) — kuyruk/detay okumaları ve yazma kapıları; web köprüyle okur.
export { customerLabel } from './customer/label';
export { getStaffTicketDetail, listTicketQueue, ticketOrderRefOf, ticketReturnOutcomeOf } from './ticket/staff-read';
export { toTicketMessageViews } from './ticket/read';
export {
  changeTicketStatus,
  consumeTicketDraft,
  openTicket,
  replyAsStaff,
  takeOverTicket,
  ticketAttachmentsBelongTo,
  type TicketWriteResult,
} from './ticket/staff-write';
export type { StaffTicketDetail, TicketOrderRef, TicketQueueItem } from './ticket/ticket-types';
export { readComplaint } from './management/complaint';
export { askShortfall, countOrderExceptions, listOrderExceptions } from './management/exceptions';
