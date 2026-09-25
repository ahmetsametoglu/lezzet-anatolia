import type { CartLineGroup } from '@lezzet/types';

/** Sepet tutar kurallarının okuduğu asgari satır; fiyatı çözülemeyen satırda tutar `null`dur ve toplama sıfır katar. */
export interface CartTotalLine {
  group: CartLineGroup;
  lineTotalCents: number | null;
}

/** Bu adrese gelemeyen kalemlerin tutarı: siparişe girmez, sepette bekler; ara toplama, indirime ve eşiğe sayılmaz. */
export function undeliverableTotalOf(lines: readonly CartTotalLine[]): number {
  return lines.reduce((sum, l) => (l.group === 'undeliverable' ? sum + (l.lineTotalCents ?? 0) : sum), 0);
}

/**
 * Asgari sepetin ölçtüğü tutar (indirim öncesi): iki gruplu sepette kapı siparişinin kendi tutarı, çünkü kargo kalemleri o siparişe
 * girmez; öteki hâlde bu adrese gelemeyenler hariç sepet. Sunucu okuması ve istemcinin anlık hesabı aynı kuraldan okur.
 */
export function minBasketBaseOf(lines: readonly CartTotalLine[]): number {
  const total = (keep: (l: CartTotalLine) => boolean) => lines.reduce((sum, l) => (keep(l) ? sum + (l.lineTotalCents ?? 0) : sum), 0);
  if (lines.some((l) => l.group === 'local') && lines.some((l) => l.group === 'shipping')) return total((l) => l.group === 'local');
  return total((l) => l.group !== 'undeliverable');
}
