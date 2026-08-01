// @lezzet/database — Supabase erişimi (ORM yok, supabase-js). Yalnız types + helper bilir.
// Artımlı büyür: her modül kendi tablolarının servisini ekler. İçerik: docs/build/02-database.md
// Not: BaseDbService ve case-transformers paket-içi altyapıdır; dışa yalnız kamu API'si (istemci + servisler) verilir.

// İstemci
export { createServiceRoleClient, serviceDb, type Db } from './client';
// Reset/restart sonrası ilk istek 502 alır (PostgREST şema önbelleğini yüklüyor) — seed ve testler
// ilk sorgudan önce bunu bekler.
export { waitForRest, type WaitForRestOptions } from './core/ready';

// Servisler
export { UserProfileService } from './services/user-profile.service';
export { EmailVerificationService, type RequestCodeResult, type VerifyCodeResult } from './services/email-verification.service';
export { CategoryService, type CreateCategoryInput } from './services/category.service';
export { CollectionService, type CreateCollectionInput } from './services/collection.service';
export { ProductService, ProductListingService, VARIANT_POOL_LIMIT, type CreateProductInput, type CreateVariantInput } from './services/product.service';
export { ProductVariantService } from './services/product-variant.service';
export { ProductImageService } from './services/product-image.service';
export { BundleService, type CreateBundleInput } from './services/bundle.service';
export { BundleItemService } from './services/bundle-item.service';
export { PriceService } from './services/price.service';
export { DiscountService, type DiscountUsage } from './services/discount.service';
export { DiscountCodeService } from './services/discount-code.service';
export { DiscountUseService } from './services/discount-use.service';
export { AddressService } from './services/address.service';
export { SettingsService } from './services/settings.service';
export { DeliveryZoneService } from './services/delivery-zone.service';
export { WarehouseService } from './services/warehouse.service';
export { WarehouseTransferService } from './services/warehouse-transfer.service';
export { CartService } from './services/cart.service';
export {
  OrderService,
  OrderItemService,
  OrderStatusLogService,
  type CreateOrderItemInput,
  type OrderCounts,
  type OrderListFilters,
} from './services/order.service';
export { StockService, LOT_SEARCH_LIMIT } from './services/stock.service';
export { ReservationService, type ReserveInput } from './services/reservation.service';
export { StockAdjustmentService, type AdjustInput } from './services/stock-adjustment.service';
export { TemperatureLogService } from './services/temperature-log.service';
export { SupplierService, SupplierProductService } from './services/supplier.service';
export { PurchaseOrderService, PurchaseOrderItemService, type DraftLine, type PurchaseListLine } from './services/purchase-order.service';
export { StockIntakeService, type ReceiveIntakeInput } from './services/stock-intake.service';
export { ReorderService, type ReorderGroup, type ReorderLine } from './services/reorder.service';
export { AccountService, MoneyMovementService, type CampaignSpend, type PeriodTotal } from './services/money.service';
export { OrderSaleService } from './services/accounting.service';
export { BankImportProfileService, BankImportService } from './services/bank-import.service';
export { JobRunService } from './services/job-run.service';
export { WebhookEventService } from './services/webhook-event.service';
export { ErrorLogService, errorFingerprint, type ListErrorLogsOptions } from './services/error-log.service';
export { SystemHealthService } from './services/system-health.service';
export { CourierDayCloseService, CourierDayCollectionService } from './services/courier-day-close.service';
export { TicketService, TicketQueueService, TicketMessageService, type TicketQueueFilter } from './services/ticket.service';
export { ProductFeedbackService, ProductRatingService } from './services/product-feedback.service';
export { PointsEntryService, PointsBalanceService } from './services/points.service';
export { FeedbackRequestService, FeedbackProgressService, FeedbackDueOrderService } from './services/feedback-request.service';
