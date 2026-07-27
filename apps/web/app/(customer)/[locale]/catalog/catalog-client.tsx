'use client';

import type { Locale } from '@lezzet/i18n';
import type { Device } from '@/lib/device';
import { useDevice } from '@/lib/use-device';
import type { CatalogSort, StorefrontCatalog } from '@/lib/storefront/catalog';
import type { CatalogHref, Messages } from './catalog-types';
import { CatalogDesktop } from './catalog.desktop';
import { CatalogMobile } from './catalog.mobile';

/**
 * Katalogun cihaz çatalı. Süzme sunucuda çözüldüğü ve seçim URL'de yaşadığı için burada state YOK —
 * bu katman yalnız `useDevice` içindir (UA tahmini yanlışsa mount sonrası düzeltilir).
 */
interface CatalogClientProps {
  t: Messages;
  locale: Locale;
  data: StorefrontCatalog;
  active: { category?: string; sort: CatalogSort; onlyOffers: boolean };
  device: Device;
}

export function CatalogClient({ t, locale, data, active, device }: CatalogClientProps) {
  const resolved = useDevice(device);

  /**
   * Bir süzgeci değiştirir, diğerlerini KORUR — çipe basmak sıralamayı sıfırlamaz. `null` kategori
   * süzgeci kaldırır ("Tümü"). Sayfa imleci bilerek taşınmaz: süzgeç değişince liste baştan başlar.
   */
  const hrefFor = (patch: { category?: string | null; sort?: CatalogSort; onlyOffers?: boolean }): CatalogHref => {
    const category = patch.category === null ? undefined : (patch.category ?? active.category);
    const sort = patch.sort ?? active.sort;
    const onlyOffers = patch.onlyOffers ?? active.onlyOffers;
    const query: Record<string, string> = {};
    if (category) query.category = category;
    if (sort !== 'featured') query.sort = sort;
    if (onlyOffers) query.offers = '1';
    return { pathname: '/catalog', query };
  };

  const view = { t, locale, data, active, hrefFor };
  return resolved === 'mobile' ? <CatalogMobile {...view} /> : <CatalogDesktop {...view} />;
}
