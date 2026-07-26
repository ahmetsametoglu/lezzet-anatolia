/**
 * R2 object key üreticileri — tek noktada path standardı (referans: petitcigogne r2-keys).
 * DB RELATIVE key tutar; prefix (dev/prod) R2 çağrısında eklenir. Artımlı: yeni klasörler
 * (temalar, siparişler, kargo etiketi…) ilgili özellikleriyle eklenir.
 *
 *   catalog/products/{slug}.{ext}   ürün katalog görseli (ürüne bağlı TEK görsel)
 */
const sanitize = (s: string): string =>
  s.replace(/[^a-zA-Z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').toLowerCase();

// Kaynak dosya adından uzantıyı çıkarır (yoksa 'jpg').
const extOf = (filename: string): string => {
  const m = /\.([a-zA-Z0-9]+)$/.exec(filename);
  return (m?.[1] ?? 'jpg').toLowerCase();
};

export const r2Keys = {
  /**
   * Ürün katalog görseli — ürüne (slug) bağlı deterministik key; TIMESTAMP YOK. Slug benzersiz
   * olduğundan çakışma olmaz; görsel değişince aynı obje üzerine yazılır (yetim obje kalmaz) ve
   * seed idempotent olur. `sourceFilename` yalnız uzantı içindir.
   */
  productImage: (slug: string, sourceFilename: string): string =>
    `catalog/products/${sanitize(slug)}.${extOf(sourceFilename)}`,
} as const;
