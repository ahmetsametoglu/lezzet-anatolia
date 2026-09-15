// @lezzet/helper — saf fonksiyonlar (tarih/para/format/kimlik/slug). Tek bağımlılık `@lezzet/i18n`
// (o da sıfır bağımlılıklı dil birimi): para YAZIMI dile bağlı ve dil birliği tek kaynaktan gelmeli.
// Müşterinin telefon ekranlarının cümle kurucuları — native uygulama ile web telefon görünümünün ortak
// malı (14.09): kampanya rozeti ve cümlesi, kartın fiyat etiketi, vitrinin selamlaması ve sayaçları.
// Metinleri `@lezzet/i18n/customer/*`da; burada yalnız hangi cümlenin hangi veriyle kurulacağı.
export * from './campaign-label';
export * from './csv';
export * from './date';
// Yerin saf kararları (`elsewhereReasonOf`) ve kartın yer işareti (`placeMarkOf` · `cardPlaceNoteOf`,
// 14.09) — web ve native uygulama aynı cümleyi kuruyor; ev gerekçesi dosyanın kendi künyesinde (21.20).
export * from './delivery';
// İlan edilen teslimat tutarlarının cümleye dönüşmesi — yasal sayfaların iki yüzeydeki ortak
// kuralı; tutar prozanın içine gömülmez (gerekçe dosyanın künyesinde, 18.08).
export * from './delivery-terms';
export * from './format';
export * from './home-copy';
export * from './identity';
export * from './money';
// Hazır paketin iki yüzeyde ortak kuralları — yolun stok diline çevrilmesi ve detayın adet tavanı (14.09).
export * from './package';
export * from './postal-code';
export * from './place-name';
export * from './price-label';
// Tarif satırının alt metni — native tarif detayı ile web telefon görünümünün ortak cümlesi (14.09).
export * from './recipe';
export * from './rich-text';
export * from './slug';
