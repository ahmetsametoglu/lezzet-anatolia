import type { CartLineChange, MeCartViewLine } from '@lezzet/types';

/** Farkın okuduğu satır alanları; web ve native sepet satırı ikisi de taşır. */
type PlaceDiffLine = Pick<MeCartViewLine, 'route' | 'name' | 'qty' | 'availableHere' | 'unitPriceCents'>;

/** Kalem artık bu yerde alınamıyor mu: motorun iki olumsuz yolu. */
function unreachable(line: PlaceDiffLine): boolean {
  return line.route === 'not_shippable_here' || line.route === 'unavailable';
}

/**
 * Yer değişince sepette ne değişti: eski ve yeni yer bağlamıyla çözülmüş iki okuma karşılaştırılır, `keyOf` satırı iki okumada
 * eşler. `noDelivery` yeni yerin karşılanamadığını söyler, çünkü yolun `null`a düşmesi yerin bilinmemesi de olabilir.
 */
export function diffCartByPlace<L extends PlaceDiffLine>(
  before: readonly L[],
  after: readonly L[],
  keyOf: (line: L) => string,
  options: { noDelivery?: boolean } = {},
): CartLineChange[] {
  const previous = new Map(before.map((line) => [keyOf(line), line]));
  const changes: CartLineChange[] = [];

  for (const line of after) {
    const was = previous.get(keyOf(line));
    // Yeni eklenmiş satırın kıyaslanacak önceki hâli yok.
    if (!was) continue;

    if (options.noDelivery && line.route === null && was.route !== null) {
      changes.push({ kind: 'no_delivery', name: line.name });
      continue;
    }
    // Önce yol, sonra fiyat: kargoya düşen teklif kalemi fiyatını da kaybeder ve o fiyat farkı yol değişiminin sonucudur.
    if (unreachable(line) && !unreachable(was)) {
      changes.push({ kind: 'unavailable', name: line.name });
      continue;
    }
    if (line.route === 'shipping' && was.route !== 'shipping') {
      changes.push({ kind: 'to_shipping', name: line.name });
      continue;
    }
    if (line.route === 'local' && was.route === 'shipping') {
      changes.push({ kind: 'to_route', name: line.name });
      continue;
    }
    // Yalnız bu değişimin açtığı adet açığı söylenir; eski yerde de tavanın üstündeyse satırın kendi düğmesi onu zaten söyler.
    if (line.availableHere !== null && line.availableHere > 0 && line.qty > line.availableHere) {
      if (was.availableHere === null || line.qty <= was.availableHere) {
        changes.push({ kind: 'reduced', name: line.name, qty: line.qty, availableHere: line.availableHere });
        continue;
      }
    }
    // Fiyat yalnız iki taraf da biliniyorken kıyaslanır: satışa kapanmış kalemin `null` fiyatı "0 €'ya düştü" diye okunmaz.
    if (line.unitPriceCents !== null && was.unitPriceCents !== null && line.unitPriceCents !== was.unitPriceCents) {
      changes.push({ kind: 'price', name: line.name, fromCents: was.unitPriceCents, toCents: line.unitPriceCents });
    }
  }

  return changes;
}
