import type { z } from 'zod';
import { PackageDetailSchema } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';

import { apiFetch, type ApiResult } from './client';

/*
  PAKET OKUMASI — `/api/v1/packages/:slug`. Sayfanın TAMAMI tek turda (içerik satırları dahil);
  şema `@lezzet/types`ın (`package-api.schema.ts`), uç da AYNI şemayla üretiyor — alan adı
  değişirse iki taraf birden derlemede kırılır (katalog istemcisinin kuralı, birebir).

  `locale` zorunlu: uç dilsiz çağrıyı 400'le reddediyor (sessizce Türkçeye düşmesin diye).
*/

export function fetchPackageDetail(slug: string, locale: Locale): Promise<ApiResult<z.infer<typeof PackageDetailSchema>>> {
  return apiFetch(`/api/v1/packages/${encodeURIComponent(slug)}?locale=${encodeURIComponent(locale)}`, PackageDetailSchema);
}
