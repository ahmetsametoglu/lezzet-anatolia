/**
 * R2 object key üreticileri — tek noktada path standardı (referans: petitcigogne r2-keys).
 * DB RELATIVE key tutar; prefix (dev/prod) R2 çağrısında eklenir. Artımlı: yeni klasörler
 * (temalar, siparişler, kargo etiketi…) ilgili özellikleriyle eklenir.
 *
 *   catalog/products/{ts}-{name}   ürün katalog görseli
 */
const ts = (): number => Date.now();
const sanitize = (filename: string): string => filename.replace(/[^a-zA-Z0-9.-]/g, '-').toLowerCase();

export const r2Keys = {
  productImage: (filename: string): string => `catalog/products/${ts()}-${sanitize(filename)}`,
} as const;
