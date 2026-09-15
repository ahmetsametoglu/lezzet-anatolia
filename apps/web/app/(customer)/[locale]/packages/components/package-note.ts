import type { PlaceMarkTone } from '@lezzet/helper';
import type { LocalizedCopy } from '@lezzet/i18n';
import type packagesMessages from '@lezzet/i18n/customer/packages';
import type { StorefrontPackage } from '@/lib/storefront/storefront-types';

type NoteCopy = LocalizedCopy<typeof packagesMessages>['note'];

/**
 * Paket kartının alt satırı: soğuk zincir + teslim yolu.
 * Seçili adrese gelmeyen pakette genel kargo cümlesinin yerini o adresin cevabı alır; kartın başka yerinde yer notu yok.
 */
export function packageNoteOf(
  pack: Pick<StorefrontPackage, 'coldChain' | 'inRouteOnly'>,
  tone: PlaceMarkTone | null,
  copy: NoteCopy,
  locale: string,
): string {
  const where = tone === 'blocked' ? copy.blocked : tone === 'pending' ? copy.away : pack.inRouteOnly ? copy.regionOnly : copy.shippable;
  if (pack.coldChain) return `${copy.coldChain} · ${where}`;
  // Önek yoksa parça cümlenin başıdır.
  return where.charAt(0).toLocaleUpperCase(locale) + where.slice(1);
}
