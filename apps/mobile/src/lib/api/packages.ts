import type { z } from 'zod';
import { PackageDetailSchema, PackageListSchema } from '@lezzet/types';
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

/**
 * Paket listesi — "Fikirler" sekmesinin paket bölümü. Vitrindeki şeritten farkı SÜZGEÇ: orada
 * yalnız işaretli paketler var, burada yayındakilerin tamamı (karar uçta — `PackageListSchema`).
 * Sayfalama yok: paket kataloğu doğal tavanlı bir kümedir, tek turda gelir.
 */
export function fetchPackages(locale: Locale): Promise<ApiResult<z.infer<typeof PackageListSchema>>> {
  return apiFetch(`/api/v1/packages?locale=${encodeURIComponent(locale)}`, PackageListSchema);
}
