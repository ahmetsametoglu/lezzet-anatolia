/**
 * R2 object key üreticileri — tek noktada path standardı (referans: petitcigogne r2-keys).
 * DB RELATIVE key tutar; prefix (dev/prod) R2 çağrısında eklenir. Artımlı: yeni klasörler
 * (temalar, siparişler, kargo etiketi…) ilgili özellikleriyle eklenir.
 *
 *   catalog/products/{slug}.{ext}      ürün katalog görseli (ürüne bağlı TEK görsel)
 *   catalog/collections/{slug}.{ext}   koleksiyon kapak görseli (paylaşım/OG kartı)
 *   catalog/categories/{slug}.{ext}    kategori görseli (anasayfa kategori şeridi)
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

  /**
   * Galeri (ek) fotoğrafı — kapaktan farklı olarak ürün başına ÇOK dosya var, dolayısıyla anahtar
   * yalnız slug'dan türeyemez. `photoToken` fotoğrafa özgü tek kullanımlık bir kimliktir: aynı
   * fotoğraf yeniden yüklenmez, silinince nesnesi de silinir → yetim obje kalmaz.
   */
  productGalleryImage: (slug: string, photoToken: string, sourceFilename: string): string =>
    `catalog/products/${sanitize(slug)}-${sanitize(photoToken)}.${extOf(sourceFilename)}`,

  /** Koleksiyon kapak görseli — aynı deterministik desen (slug'a bağlı, timestamp yok). */
  collectionImage: (slug: string, sourceFilename: string): string =>
    `catalog/collections/${sanitize(slug)}.${extOf(sourceFilename)}`,

  /** Kategori görseli — aynı deterministik desen (slug'a bağlı, timestamp yok). */
  categoryImage: (slug: string, sourceFilename: string): string =>
    `catalog/categories/${sanitize(slug)}.${extOf(sourceFilename)}`,
} as const;
