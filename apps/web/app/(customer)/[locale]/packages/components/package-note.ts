import type { PlaceMarkTone } from '@lezzet/helper';
import type { LocalizedCopy } from '@lezzet/i18n';
import type packagesMessages from '@lezzet/i18n/customer/packages';
import type { StorefrontPackage } from '@/lib/storefront/storefront-types';

type NoteCopy = LocalizedCopy<typeof packagesMessages>['note'];

/**
 * Paket kartının alt satırı: paketin KENDİ kalıcı gerçeği (soğuk zincir + teslim yolu). Seçili adresin cevabı bu satırın
 * değil, künyedeki yer notunun işi; kapalı kapıda o cümle soğuk zinciri de söylediği için alt satır susar (`''`).
 */
export function packageNoteOf(
  pack: Pick<StorefrontPackage, 'coldChain' | 'inRouteOnly'>,
  tone: PlaceMarkTone | null,
  copy: NoteCopy,
  locale: string,
): string {
  if (tone === 'blocked') return '';
  const where = pack.inRouteOnly ? copy.regionOnly : copy.shippable;
  if (pack.coldChain) return `${copy.coldChain} · ${where}`;
  // Önek yoksa parça cümlenin başıdır.
  return where.charAt(0).toLocaleUpperCase(locale) + where.slice(1);
}
