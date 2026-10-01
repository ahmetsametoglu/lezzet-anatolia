import { PriceService, ProductService, ProductVariantService, RegisterProductService, type Db } from '@lezzet/database';
import { resolveLocalizedText, type RegisterProduct } from '@lezzet/types';
import type { CashRegister } from './port';

/**
 * Fiş kaleminin kasadaki ürünü: varyant başına bir, kargo oran başına bir ürün; ilk satışta açılır, katalog değişince güncellenir.
 * Dış referans 20 karakterde kesildiği için kısa anahtar taşınır, yarıda kalan açılış kasada onunla bulunur.
 */

/** Fişte görünen ad Fransızca ürün adı ve boydur; katalog fiyatı B2C liste fiyatıdır ki kasanın indirim raporu anlam taşısın. */
async function catalogOf(
  db: Db,
  variantIds: readonly string[],
): Promise<Map<string, { name: string; priceCents: number; vatRate: number }>> {
  const variants = await new ProductVariantService(db).listByIds([...variantIds]);
  const [products, prices] = await Promise.all([
    new ProductService(db).listByIds([...new Set(variants.map((variant) => variant.productId))]),
    new PriceService(db).findApplicableMap([...variantIds], 'b2c'),
  ]);
  const productOf = new Map(products.map((product) => [product.id, product]));
  const catalog = new Map<string, { name: string; priceCents: number; vatRate: number }>();
  for (const variant of variants) {
    const product = productOf.get(variant.productId);
    if (!product) continue;
    const name = resolveLocalizedText(product.name, 'fr');
    const label = resolveLocalizedText(variant.label, 'fr');
    catalog.set(variant.id, {
      name: label ? `${name} (${label})` : name,
      priceCents: prices.get(variant.id)?.channelPrice?.amountCents ?? 0,
      vatRate: product.vatRate,
    });
  }
  return catalog;
}

/** Varyantların kasa ürünleri; eksik olan açılır, adı, fiyatı ya da oranı değişen kasada güncellenir. */
export async function ensureItemProducts(
  db: Db,
  register: CashRegister,
  variantIds: readonly string[],
): Promise<Map<string, RegisterProduct>> {
  const unique = [...new Set(variantIds)];
  const mirror = new RegisterProductService(db);
  const [known, catalog] = await Promise.all([mirror.listByVariants(unique), catalogOf(db, unique)]);
  const byVariant = new Map(known.map((product) => [product.variantId!, product]));

  for (const variantId of unique) {
    const want = catalog.get(variantId);
    if (!want) throw new Error(`kasa: varyantın ürünü bulunamadı (${variantId})`);
    const have = byVariant.get(variantId);
    if (!have) {
      const refExt = variantId.replace(/-/g, '').slice(0, 20);
      const externalProductId = (await register.findProductByRef(refExt)) ?? (await register.createProduct({ ...want, refExt }));
      byVariant.set(variantId, await mirror.insert({ kind: 'item', variantId, externalProductId, ...want }));
      continue;
    }
    if (have.name === want.name && have.priceCents === want.priceCents && have.vatRate === want.vatRate) continue;
    await register.updateProduct(have.externalProductId, {
      ...(have.name !== want.name ? { name: want.name } : {}),
      ...(have.priceCents !== want.priceCents ? { priceCents: want.priceCents } : {}),
      ...(have.vatRate !== want.vatRate ? { vatRate: want.vatRate } : {}),
    });
    byVariant.set(variantId, await mirror.update({ id: have.id, ...want }));
  }
  return byVariant;
}

/** Kargo oran başına ayrı üründür; fiyatı satışta yazılır, katalog fiyatı yoktur. */
export async function ensureShippingProduct(db: Db, register: CashRegister, vatRate: number): Promise<RegisterProduct> {
  const mirror = new RegisterProductService(db);
  const have = await mirror.findShipping(vatRate);
  if (have) return have;
  const name = `Frais de livraison ${String(vatRate).replace('.', ',')} %`;
  const refExt = `livraison-${vatRate}`;
  const externalProductId =
    (await register.findProductByRef(refExt)) ?? (await register.createProduct({ name, priceCents: 0, vatRate, refExt }));
  return mirror.insert({ kind: 'shipping', variantId: null, externalProductId, name, vatRate, priceCents: 0 });
}
