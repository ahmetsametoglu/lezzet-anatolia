import type { Locale, LocalizedCopy } from '@lezzet/i18n';
import type { StorefrontPackage } from '@/lib/storefront/storefront-types';
import type { SitePageImage } from '@/lib/storefront/site-image';
// `typeof messages` için değer bağı gerek (Messages tipi JSON'dan türetilir) — bu yüzden `import type` değil.
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
import messages from './messages.json';

// Paketler tip/sözleşme modülü (view DEĞİL — gerçek view'lar packages.desktop/packages.mobile).

export type Messages = LocalizedCopy<typeof messages>;

export interface PackagesViewProps {
  t: Messages;
  locale: Locale;
  packages: StorefrontPackage[];
  /**
   * Sayfa kahramanı (`site_image.packages_hero`, 08.33) — liste verisinden AYRI kaynak.
   *
   * `null` = operatör henüz yüklemedi; çerçeve yer tutucusunu çizer ve iki sütunlu denge bozulmaz.
   * Mobil dalda kahraman YOK (tasarım): dar ekranda liste hemen başlar.
   */
  hero: SitePageImage | null;
}
