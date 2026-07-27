// @lezzet/domain-core — UI'sız domain motoru: durum makinesi, stok, fiyat, kanal.
// Yalnız types + helper bilir; uygulamayı bilmez. İçerik: docs/build/03-domain-core.md
export * from './pricing/resolve-price';
export * from './pricing/apply-discount';
export * from './order/status-machine';
export * from './order/channel';
export * from './order/reference-no';
export * from './identity/resolve-identity';
export * from './tax/vat-treatment';
export * from './stock/reservation';
export * from './stock/shelf-life';
export * from './delivery/delivery-days';
export * from './payment/checkout-options';
export * from './payment/payment-status';
