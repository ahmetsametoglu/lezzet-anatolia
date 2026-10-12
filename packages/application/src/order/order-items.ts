import { BundleItemService, ProductService, ProductVariantService, ProductVatRateService, type Db } from '@lezzet/database';
import { applicableVatRate, sellableIn } from '@lezzet/domain-core';
import { groupBy, toCents } from '@lezzet/helper';
import type { Channel, Country, OrderItemInsert, ProductVatRate } from '@lezzet/types';
import type { CartLine } from '../cart/cart-types';
import type { SaleVat } from './sale-vat';

export type OrderItemsOutcome =
  | { status: 'ok'; items: Omit<OrderItemInsert, 'orderId'>[] }
  /** Satırın ürünü teslim ülkesinin tüketicisine satılmıyor (o ülkenin KDV oranı yok); adlar sepettekidir. */
  | { status: 'not_sold_in_country'; country: Country; lines: string[] };

export interface OrderItemsInput {
  lines: readonly CartLine[];
  shares: readonly number[];
  vat: SaleVat;
  deliveryCountry: Country;
  /** KDV kararının kanalı (`deriveChannel`); işletme satışında ülke oranı aranmaz. */
  channel: Channel;
  /** `null`: müşteri yolu, pazarlık izi yazılmaz. */
  priceSetBy: string | null;
}

/**
 * Sepet satırlarından sipariş kalemleri: paket varyant kalemlerine parçalanır, çünkü depo ürün toplar ve stok varyanttan düşer; birim
 * fiyat paketin payıdır. Kalemin oranı KDV kararının ülkesinden okunur (`applicableVatRate`), o ülkenin oranı olmayan ürün satılmaz.
 */
export async function orderItemsOf(db: Db, input: OrderItemsInput): Promise<OrderItemsOutcome> {
  const bundleService = new BundleItemService(db);
  const bundleItems = new Map(
    await Promise.all(
      input.lines.filter((l) => l.kind === 'bundle').map(async (l) => [l.bundleId, await bundleService.listByBundle(l.bundleId)] as const),
    ),
  );
  const variantIds = [
    ...input.lines.flatMap((l) => (l.kind === 'variant' ? [l.variantId] : [])),
    ...[...bundleItems.values()].flat().map((i) => i.variantId),
  ];
  const variants = await new ProductVariantService(db).listByIds([...new Set(variantIds)]);
  const productIds = [...new Set(variants.map((v) => v.productId))];
  const [products, countryRates] = await Promise.all([
    new ProductService(db).listByIds(productIds),
    new ProductVatRateService(db).listByProducts(productIds),
  ]);
  const rateOf = rateOfVariant(
    input,
    variants,
    products,
    groupBy(countryRates, (rate) => rate.productId),
  );

  const rows: Omit<OrderItemInsert, 'orderId'>[] = [];
  const notSold = new Set<string>();
  input.lines.forEach((line, index) => {
    if (line.kind === 'variant') {
      const vatRate = rateOf(line.variantId);
      if (vatRate === 'not_sold') {
        notSold.add(line.name);
        return;
      }
      rows.push({
        variantId: line.variantId,
        qty: line.qty,
        stockId: line.stockId,
        bundleId: null,
        unitPriceCents: line.unitPriceCents ?? 0,
        // Pazarlık izi ikisi birlikte yazılır (`order_item_negotiation_complete`); pazarlıksız satırda ikisi de `null`, yoksa her
        // kalem sahte bir taviz kaydı taşırdı.
        listUnitPriceCents: line.listUnitPriceCents ?? null,
        priceSetBy: line.listUnitPriceCents != null ? input.priceSetBy : null,
        vatRate,
        lineDiscountAmountCents: input.shares[index] ?? 0,
      });
      return;
    }
    for (const item of bundleItems.get(line.bundleId) ?? []) {
      const vatRate = rateOf(item.variantId);
      if (vatRate === 'not_sold') {
        notSold.add(line.name);
        continue;
      }
      rows.push({
        variantId: item.variantId,
        // Paketin adedi kalemin adedini çarpar.
        qty: item.qty * line.qty,
        stockId: null,
        bundleId: line.bundleId,
        // `allocatedUnitPrice` euro olarak saklanıyor; çevrim ortak `toCents` ile.
        unitPriceCents: toCents(item.allocatedUnitPrice),
        vatRate,
        // Pakete sepet indirimi binmez; paketin kendi indirimi birim fiyatın içinde.
        lineDiscountAmountCents: 0,
      });
    }
  });

  if (notSold.size > 0) return { status: 'not_sold_in_country', country: input.deliveryCountry, lines: [...notSold] };
  return { status: 'ok', items: rows };
}

/** Varyantın kalem oranı; ürünü okunamayan varyant oransız (0) yazılır, satılabilirlik ve oran ürünün ülke satırlarından okunur. */
function rateOfVariant(
  input: Pick<OrderItemsInput, 'vat' | 'deliveryCountry' | 'channel'>,
  variants: readonly { id: string; productId: string }[],
  products: readonly { id: string; vatRate: number }[],
  ratesByProduct: ReadonlyMap<string, readonly Pick<ProductVatRate, 'country' | 'vatRate'>[]>,
): (variantId: string) => number | 'not_sold' {
  const productOfVariant = new Map(variants.map((v) => [v.id, v.productId]));
  const productById = new Map(products.map((p) => [p.id, p]));
  return (variantId) => {
    const product = productById.get(productOfVariant.get(variantId) ?? '');
    if (!product) return 0;
    const countryRates = ratesByProduct.get(product.id) ?? [];
    if (!sellableIn({ country: input.deliveryCountry, channel: input.channel, countryRates })) return 'not_sold';
    return applicableVatRate(input.vat.rateCountry, { vatRate: product.vatRate, countryRates }) ?? 'not_sold';
  };
}
