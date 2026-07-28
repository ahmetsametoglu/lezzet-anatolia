import type { Locale, LocalizedCopy } from '@lezzet/i18n';
import type { StorefrontPackage } from '@/lib/storefront/storefront-types';
// `typeof messages` için değer bağı gerek (Messages tipi JSON'dan türetilir) — bu yüzden `import type` değil.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import messages from './messages.json';

// Paketler tip/sözleşme modülü (view DEĞİL — gerçek view'lar packages.desktop/packages.mobile).

export type Messages = LocalizedCopy<typeof messages>;

export interface PackagesViewProps {
  t: Messages;
  locale: Locale;
  packages: StorefrontPackage[];
}
