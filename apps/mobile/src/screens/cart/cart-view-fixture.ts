import type { CartLineGroup, MeCartView, MeCartViewLine } from '@lezzet/types';

/*
  SEPET GÖRÜNÜMÜ FİKSTÜRÜ — sunucunun çözdüğü `MeCartView`in test karşılığı.

  NEDEN AYRI DOSYA: aynı görünümü İKİ ekran okuyor (sepet ve "Siparişi tamamla") ve ikisi de
  gruplama kararını sunucudan alıyor. İki testin iki ayrı fikstür yazması, bir gün iki farklı
  sözleşme şekli demekti — üstelik ayrışan taraf sessizce yeşil kalırdı (katalogdaki
  `catalog-fixture.ts` ile aynı gerekçe).

  ŞEKİL SÖZLEŞMENİN KENDİSİ (`MeCartView`): alan eklenirse burası DERLENMEZ ve fikstür güncellenir.
*/

/** Fikstür satırlarının kimliği — biçim gerçek (uuid), değeri sırayla üretiliyor. */
function uuid(n: number): string {
  return `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
}

/**
 * Grubun YOL karşılığı — sunucunun `cartGroupOf` kararının tersi.
 *
 * Fikstür ikisini birden taşır çünkü sözleşme de taşıyor: ekran GRUBU okur, `route` alanı ise
 * bilginin kendisidir. Tutarsız bir çift yazmak (grup `undeliverable`, yol `local`) testi ekranın
 * hiç göremeyeceği bir hâlde koştururdu.
 */
function routeOf(group: CartLineGroup): MeCartViewLine['route'] {
  if (group === 'shipping') return 'shipping';
  return group === 'undeliverable' ? 'not_shippable_here' : 'local';
}

interface CartLineOptions {
  qty?: number;
  unitPriceCents?: number;
  blocked?: boolean;
}

/** Tek varyant satırı — adı, grubu ve tutarı test kurar; kalanı sözleşmenin nötr hâli. */
export function cartViewLine(index: number, name: string, group: CartLineGroup, options: CartLineOptions = {}): MeCartViewLine {
  const qty = options.qty ?? 1;
  const unitPriceCents = options.unitPriceCents ?? 1000;
  return {
    kind: 'variant',
    variantId: uuid(index),
    stockId: null,
    qty,
    slug: `urun-${index}`,
    name,
    image: { url: null, crop: { x: 50, y: 50, zoom: 100 } },
    unitLabel: '500 g',
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
 * Satırlardan tam görünüm kurar. TOPLAMLAR SATIRLARDAN TÜRETİLİR — sunucu da öyle yapıyor ve
 * elle yazılan bir ara toplam, testi ekranın hiç karşılaşmayacağı bir sepetle koşturur.
 *
 * `undeliverableSubtotalCents` ayrı türetilir (sözleşmenin kendi kuralı): ara toplam sepette
 * DURAN her şeyi sayar, bu alan yalnız gelemeyenleri.
 */
export function cartView(lines: MeCartViewLine[], overrides: Partial<MeCartView> = {}): MeCartView {
  const subtotalCents = lines.reduce((sum, line) => sum + (line.lineTotalCents ?? 0), 0);
  return {
    lines,
    subtotalCents,
    discount: { status: 'none' },
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
    ...overrides,
  };
}
