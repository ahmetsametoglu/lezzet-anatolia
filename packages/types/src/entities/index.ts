// VARLIK şemaları — veritabanı satırının (ya da görünümünün) aynası. Her domain entity'si için bir
// dosya eklenir (artımlı; docs/build/01-types.md envanter).
//
// SIRA, `export *` için teknik bir zorunluluk değil OKUMA sırasıdır: aile aile ilerler (kimlik →
// katalog → sipariş → yer/depo → stok/tedarik → para → operasyon → iletişim → geri bildirim →
// analitik). Yeni dosya kendi ailesinin sonuna eklenir, listenin dibine değil.
//
// Bu barrel yalnız `entities/` altını toplar; yapı taşları `../primitives`, yüzey sözleşmeleri
// `../contracts` barrel'ındadır (01.12). Üçünü de kök `src/index.ts` birleştirir — paketin dışa
// görünümü tek kapıdır, derin import yoktur.
export * from './user-profile.schema';
export * from './email-verification.schema';
export * from './category.schema';
export * from './collection.schema';
export * from './product.schema';
export * from './discount.schema';
export * from './product-variant.schema';
export * from './product-image.schema';
export * from './bundle.schema';
export * from './recipe.schema';
export * from './price.schema';
export * from './product-collection.schema';
export * from './address.schema';
export * from './cart.schema';
export * from './order.schema';
export * from './courier.schema';
export * from './setting.schema';
export * from './delivery-zone.schema';
export * from './postal-code-place.schema';
export * from './variant-stock-notice.schema';
export * from './zone-notice.schema';
export * from './warehouse.schema';
export * from './stock.schema';
export * from './stock-adjustment.schema';
export * from './supply.schema';
export * from './money.schema';
export * from './bank-import.schema';
export * from './job-run.schema';
export * from './webhook-event.schema';
export * from './ticket.schema';
export * from './conversation.schema';
export * from './product-feedback.schema';
export * from './points.schema';
export * from './feedback-request.schema';
export * from './error-log.schema';
export * from './system-health.schema';
export * from './analytics.schema';
export * from './postal-code-demand.schema';
