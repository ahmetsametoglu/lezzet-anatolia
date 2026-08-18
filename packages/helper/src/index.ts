// @lezzet/helper — saf fonksiyonlar (tarih/para/format/kimlik/slug). Tek bağımlılık `@lezzet/i18n`
// (o da sıfır bağımlılıklı dil birimi): para YAZIMI dile bağlı ve dil birliği tek kaynaktan gelmeli.
export * from './csv';
export * from './date';
// Yerin saf kararları (`elsewhereReasonOf`) — web ve native uygulama aynı cümleyi kuruyor; ev
// gerekçesi dosyanın kendi künyesinde (21.20).
export * from './delivery';
// İlan edilen teslimat tutarlarının cümleye dönüşmesi — yasal sayfaların iki yüzeydeki ortak
// kuralı; tutar prozanın içine gömülmez (gerekçe dosyanın künyesinde, 18.08).
export * from './delivery-terms';
export * from './format';
export * from './identity';
export * from './money';
export * from './postal-code';
export * from './place-name';
export * from './rich-text';
export * from './slug';
