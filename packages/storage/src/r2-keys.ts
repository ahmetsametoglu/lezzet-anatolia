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

  /** Paket (bundle) görseli — 3:2 kaynak; aynı deterministik desen. */
  bundleImage: (slug: string, sourceFilename: string): string =>
    `catalog/bundles/${sanitize(slug)}.${extOf(sourceFilename)}`,

  /**
   * **Şikâyet fotoğrafı** (16.2) — PRIVATE kovaya yazılır (`getR2Private`), public adresi yoktur.
   *
   * Katalog anahtarlarının tersine **deterministik DEĞİL**: aynı talebe birden çok fotoğraf
   * eklenebilir ve hiçbiri diğerinin üzerine yazmamalı — bozuk ürünün ikinci açısı, birincisinin
   * yerine geçmez. `photoToken` çağıranın ürettiği tek kullanımlık kimliktir.
   *
   * Talep kimliğine göre klasörlenir: talep silinirse `support/tickets/{id}/` tek seferde temizlenir.
   */
  ticketAttachment: (ticketId: string, photoToken: string, sourceFilename: string): string =>
    `support/tickets/${sanitize(ticketId)}/${sanitize(photoToken)}.${extOf(sourceFilename)}`,
} as const;
