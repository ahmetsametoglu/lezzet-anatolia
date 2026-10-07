import type { z } from 'zod';
import { PackageDetailSchema, PackageListSchema, type Country } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';

import type { ApiResult } from '@lezzet/mobile-kit/src/lib/api/client';
import { maybeAuthorizedFetch } from '@lezzet/mobile-kit/src/lib/auth/authorized-fetch';

/* İki okuma da yeri gönderir, çünkü kod gitmezse `route` `null` döner ve sayfa "bu adrese gönderemiyoruz"u hiç söyleyemez. */

/** Kod boşsa parametre hiç yazılmaz; gel-al deposu kimlikle kapılandığı için okuma `maybeAuthorizedFetch`ten geçer. */
function queryOf(locale: Locale, postalCode?: string | null, pickupWarehouseId?: string | null, country: Country | null = null): string {
  const trimmed = postalCode?.trim();
  const place =
    trimmed === undefined || trimmed.length === 0
      ? ''
      : `&postalCode=${encodeURIComponent(trimmed)}${country === null ? '' : `&country=${country}`}`;
  const pickup = pickupWarehouseId ? `&pickupWarehouseId=${encodeURIComponent(pickupWarehouseId)}` : '';
  return `?locale=${encodeURIComponent(locale)}${place}${pickup}`;
}

export function fetchPackageDetail(
  slug: string,
  locale: Locale,
  postalCode?: string | null,
  pickupWarehouseId?: string | null,
  country: Country | null = null,
): Promise<ApiResult<z.infer<typeof PackageDetailSchema>>> {
  return maybeAuthorizedFetch(
    `/api/v1/packages/${encodeURIComponent(slug)}${queryOf(locale, postalCode, pickupWarehouseId, country)}`,
    PackageDetailSchema,
  );
}

/** "Fikirler" sekmesinin paket bölümü; paket kataloğu doğal tavanlı bir küme olduğu için sayfalanmaz. */
export function fetchPackages(
  locale: Locale,
  postalCode?: string | null,
  pickupWarehouseId?: string | null,
  country: Country | null = null,
): Promise<ApiResult<z.infer<typeof PackageListSchema>>> {
  return maybeAuthorizedFetch(`/api/v1/packages${queryOf(locale, postalCode, pickupWarehouseId, country)}`, PackageListSchema);
}
