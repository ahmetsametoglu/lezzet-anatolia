import type { z } from 'zod';
import { HomeSchema, type Country } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';

import { maybeAuthorizedFetch } from '@lezzet/mobile-kit/src/lib/auth/authorized-fetch';
import type { ApiResult } from '@lezzet/mobile-kit/src/lib/api/client';

/* Vitrinin üç bölümü tek turda gelir ve sayfalanmaz, çünkü raylar sabit sınırlı editoryal seçkidir. */

export function fetchHome(
  locale: Locale,
  postalCode?: string | null,
  pickupWarehouseId?: string | null,
  country: Country | null = null,
): Promise<ApiResult<z.infer<typeof HomeSchema>>> {
  /* Kod yerin sorusudur, depoyu sunucu çözer; teklif tutarı depoya bağlı olduğu için kodsuz vitrinde fırsat şeridi boş kalır. */
  const query = new URLSearchParams({ locale });
  if (postalCode !== undefined && postalCode !== null && postalCode !== '') {
    query.set('postalCode', postalCode);
    if (country !== null) query.set('country', country);
  }
  // Gel-al seçiliyken vitrin de seçilen depodan okunur (katalog/ürünle aynı yer kuralı).
  if (pickupWarehouseId) query.set('pickupWarehouseId', pickupWarehouseId);
  /* Kimlik varsa gider, çünkü fırsat fiyatı (B2B/özel fiyat) ve keşif daveti müşteriye göre kişiselleşir; oturum yoksa istek kimliksiz atılır. */
  return maybeAuthorizedFetch(`/api/v1/home?${query.toString()}`, HomeSchema);
}
