import type { Locale, LocalizedCopy } from '@lezzet/i18n';
import type { StorefrontPackageDetail } from '@/lib/storefront/storefront-types';
// `typeof messages` için değer bağı gerek (Messages tipi JSON'dan türetilir) — bu yüzden `import type` değil.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import messages from './messages.json';

// Paket detay tip/sözleşme modülü (view DEĞİL — gerçek view'lar package.desktop/package.mobile).

export type Messages = LocalizedCopy<typeof messages>;

export interface PackageViewProps {
  t: Messages;
  locale: Locale;
  pack: StorefrontPackageDetail;
}
