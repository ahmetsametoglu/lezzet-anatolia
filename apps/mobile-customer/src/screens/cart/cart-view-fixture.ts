import type { CartLineGroup, MeCartView, MeCartViewLine } from '@lezzet/types';

import type { CartState } from '@/screens/customer-kit/cart-store';

/*
  Sepet görünümü fikstürü: sepet ve "Siparişi tamamla" testleri aynı şekli kullanır, şekil sözleşmenin kendisidir (`MeCartView`).
*/

/** Fikstür satırlarının kimliği — biçim gerçek (uuid), değeri sırayla üretiliyor. */
function uuid(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

/**
 * Grubun yol karşılığı; fikstür ikisini tutarlı taşır ki test ekranın göremeyeceği bir hâlde koşmasın.
 */
function routeOf(group: CartLineGroup): MeCartViewLine['route'] {
  if (group === 'shipping') return 'shipping';
  return group === 'undeliverable' ? 'not_shippable_here' : 'local';
}

interface CartLineOptions {
  qty?: number;
  /**
   * `null` sunucu çözemedi demek: adsız, fiyatsız ve engelli satır, ekran onu "satışa kapandı" diye ayırır.
   */
  unitPriceCents?: number | null;
  blocked?: boolean;
}

/** Tek varyant satırı — adı, grubu ve tutarı test kurar; kalanı sözleşmenin nötr hâli. */
export function cartViewLine(index: number, name: string, group: CartLineGroup, options: CartLineOptions = {}): MeCartViewLine {
  const qty = options.qty ?? 1;
  /* `undefined` (verilmedi) ile `null` (çözülemedi) AYRI: `??` ikisini birden yakalardı ve
     çözülemeyen satır sessizce fiyatlı doğardı. */
  const unitPriceCents = options.unitPriceCents === undefined ? 1000 : options.unitPriceCents;
  return {
    kind: 'variant',
    variantId: uuid(index),
    stockId: null,
    qty,
    categoryId: null,
    collectionIds: [],
    slug: `urun-${index}`,
    name,
    image: { url: null, crop: { x: 50, y: 50, zoom: 100 }, frames: null },
    unitLabel: '500 g',
    unitPriceCents,
    limitCap: null,
    lineTotalCents: unitPriceCents === null ? null : unitPriceCents * qty,
    blocked: options.blocked ?? false,
    route: routeOf(group),
    group,
    availableHere: null,
    contents: [],
  };
}

/**
 * Tek paket satırı, sözleşmenin öteki dalı (`kind: 'bundle'`).
 */
export function cartViewBundleLine(index: number, name: string, group: CartLineGroup, options: CartLineOptions = {}): MeCartViewLine {
  const qty = options.qty ?? 1;
  const unitPriceCents = options.unitPriceCents ?? 2500;
  return {
    kind: 'bundle',
    bundleId: uuid(index),
    qty,
    slug: `paket-${index}`,
    name,
    image: { url: null, crop: { x: 50, y: 50, zoom: 100 }, frames: null },
    unitLabel: '',
    unitPriceCents,
    limitCap: null,
    lineTotalCents: unitPriceCents * qty,
    blocked: options.blocked ?? false,
    route: routeOf(group),
    group,
    availableHere: null,
    contents: [],
  };
}

/**
 * Satırlardan tam görünüm; toplamlar satırlardan türetilir, sunucu da öyle yapar.
 */
export function cartView(lines: MeCartViewLine[], overrides: Partial<MeCartView> = {}): MeCartView {
  const subtotalCents = lines.reduce((sum, line) => sum + (line.lineTotalCents ?? 0), 0);
  return {
    lines,
    subtotalCents,
    discount: { status: 'none' },
    reachableDiscount: null,
  discountRules: [],
  isFirstOrder: false,
    totalCents: subtotalCents,
    itemCount: lines.reduce((sum, line) => sum + line.qty, 0),
    hasBlocked: lines.some((line) => line.blocked),
    undeliverableSubtotalCents: lines.reduce(
      (sum, line) => (line.group === 'undeliverable' ? sum + (line.lineTotalCents ?? 0) : sum),
      0,
    ),
    minBasketOk: true,
    missingForMinBasketCents: 0,
    minBasketCents: 2500,
    freeShippingCents: 0,
    shippingSubtotalCents: lines.reduce((sum, line) => (line.group === 'shipping' ? sum + (line.lineTotalCents ?? 0) : sum), 0),
    shippingTariffCents: 690,
    shippingOnly: lines.length > 0 && lines.every((line) => line.group === 'shipping'),
    /* Fikstürde eşik tanımsız (`freeShippingCents: 0`) olduğu için ücret HAM TARİFEDİR ve kalan
       sıfırdır — sunucunun `shippingGroupFee` kararının bu girdilerle verdiği cevabın aynısı. */
    shippingGroupFeeCents: lines.some((line) => line.group === 'shipping') ? 690 : 0,
    shippingFreeRemainingCents: 0,
    localOrderDiscountCents: 0,
    ...overrides,
  };
}

/** Sepet deposunun nötr hâli: niyet listesi boş, ekranın çizdiği şey sunucunun görünümüdür. */
export function cartWith(view: MeCartView): CartState {
  return {
    products: [],
    bundles: [],
    couponCode: null,
    coupon: null,
    view,
    resolving: false,
    source: 'server',
    error: null,
    placeChange: null,
  };
}
