// Varlık şemaları, veritabanı satırının ya da görünümünün aynası. Sıra okuma sırasıdır (aile aile); yeni dosya kendi ailesinin
// sonuna eklenir, dışa görünüm kök `src/index.ts`ten tek kapıdır.
export * from './user-profile.schema';
export * from './email-verification.schema';
// Bildirim kaydı — giden kanal yükleriyle (contracts/notification.schema) karışmasın diye `app-` önekli.
export * from './app-notification.schema';
export * from './push-device.schema';
// Kimlik anahtarı doğrulanmış numaradır; `UserProfile.phone` yalnız iletişimdir.
export * from './customer-phone.schema';
export * from './category.schema';
export * from './category-image.schema';
export * from './collection.schema';
export * from './product.schema';
export * from './discount.schema';
export * from './product-variant.schema';
export * from './product-image.schema';
export * from './site-image.schema';
export * from './bundle.schema';
export * from './recipe.schema';
export * from './price.schema';
export * from './price-group.schema';
export * from './product-collection.schema';
export * from './address.schema';
export * from './cart.schema';
export * from './cart-link.schema';
export * from './order.schema';
export * from './order-box.schema';
export * from './shipping-box.schema';
export * from './warehouse-printer.schema';
export * from './shipment.schema';
export * from './courier.schema';
export * from './delivery-run.schema';
export * from './setting.schema';
export * from './delivery-zone.schema';
export * from './postal-code-place.schema';
export * from './variant-barcode.schema';
export * from './variant-stock-notice.schema';
export * from './zone-notice.schema';
export * from './warehouse.schema';
export * from './storage-point.schema';
export * from './stock.schema';
export * from './stock-movement.schema';
export * from './temperature-log.schema';
export * from './supply.schema';
export * from './money.schema';
export * from './bank-import.schema';
export * from './job-run.schema';
export * from './webhook-event.schema';
export * from './ticket.schema';
export * from './conversation.schema';
// AI kullanım defteri — koşu başına jeton ve yaklaşık maliyet (USD).
export * from './ai-usage.schema';
export * from './product-feedback.schema';
export * from './points.schema';
export * from './trust.schema';
export * from './feedback-request.schema';
// Komşu daveti — davetin ikinci türü: kimliğe değil sefere bağlıdır.
export * from './neighbor-invite.schema';
export * from './error-log.schema';
export * from './system-health.schema';
export * from './analytics.schema';
export * from './assistant-proposal.schema';
// MCP kapısı (22.4) — bağlantı anahtarı + çağrı izi. Kuyruğun (`assistant-proposal`) yanında
// duruyor çünkü ikisi aynı zincirin uçları: anahtar kapıyı açar, kuyruk yazımı denetler.
export * from './mcp.schema';
export * from './mcp-oauth.schema';
export * from './postal-code-demand.schema';
