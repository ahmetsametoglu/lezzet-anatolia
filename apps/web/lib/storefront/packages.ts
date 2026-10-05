import 'server-only';
import { serviceDb } from '@lezzet/database';
import {
  getPackageDetail as getPackageDetailFromPackage,
  getPackagesByIds as getPackagesByIdsFromPackage,
  listStorefrontPackages as listStorefrontPackagesFromPackage,
  type PlaceWarehouses,
  type StorefrontPackage,
  type StorefrontPackageDetail,
} from '@lezzet/application';
import type { Locale } from '@lezzet/i18n';

/**
 * Paket kapısının web köprüsü: gövde `@lezzet/application/catalog/packages`tadır, köprü yalnız `serviceDb()`yi bağlar ki çağrı yerleri
 * ve `CartBundlePort` imzası (`ids, locale, place`) yerinden oynamasın. `server-only` burada kalır, sınır web tarafında korunur.
 */

/**
 * Ana sayfa bandının sabit sınırı, editoryal seçki: tasarım paket bölümünü iki slotlu çizer. Web ana sayfa ızgarasının kararıdır,
 * telefon vitrininin kendi sayısı `ideas.ts`tedir ve ikisi tek sabitte birleşirse bir yüzeyin ızgarası ötekine bağlanırdı.
 */
export const HOME_PACKAGE_LIMIT = 2;

/** Paket sayfası + ana sayfa şeridi. Künye: `@lezzet/application` → `listStorefrontPackages`. */
export function listStorefrontPackages(
  locale: Locale,
  limit?: number,
  place: Partial<PlaceWarehouses> = {},
): Promise<StorefrontPackage[]> {
  return listStorefrontPackagesFromPackage(serviceDb(), locale, limit, place);
}

/** Paket detay sayfası. Künye: `@lezzet/application` → `getPackageDetail`. */
export function getPackageDetail(
  slug: string,
  locale: Locale,
  place: Partial<PlaceWarehouses> = {},
): Promise<StorefrontPackageDetail | null> {
  return getPackageDetailFromPackage(serviceDb(), slug, locale, place);
}

/**
 * Sepetin/checkout'un paket kapısı — `CartBundlePort` olarak DOĞRUDAN geçilir (sarmalayıcı yok,
 * imza birebir). Künye: `@lezzet/application` → `getPackagesByIds`.
 */
export function getPackagesByIds(
  ids: readonly string[],
  locale: Locale,
  place: Partial<PlaceWarehouses> = {},
): Promise<StorefrontPackageDetail[]> {
  return getPackagesByIdsFromPackage(serviceDb(), ids, locale, place);
}
