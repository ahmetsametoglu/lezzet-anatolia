import type { z } from 'zod';
import { RecipeDetailSchema } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';

import { apiFetch, type ApiResult } from './client';

/*
  TARİF OKUMASI — `/api/v1/recipes/:slug`.

  ŞEMA BURADA YAZILMAZ: gövde sözleşmesi `@lezzet/types`ın (`recipe-api.schema.ts`) ve uç da AYNI
  şemayla üretiyor (02-mimari §3.2 "sözleşme tek kaynak") — alan adı değişirse iki taraf birden
  derlemede kırılır (katalog istemcisinin kuralı, birebir).

  `locale` zorunlu: uç dilsiz çağrıyı 400'le reddediyor (sessizce Türkçeye düşmesin). Değer cihaz
  dilinden çözülür (`lib/i18n/locale.ts`), ekranın kendi kararı değil.
*/

/** Tarif detayı — sayfanın TAMAMI tek turda (satırlar, evinizden, hazırlanış); bölüm başına çağrı yok. */
export function fetchRecipeDetail(slug: string, locale: Locale): Promise<ApiResult<z.infer<typeof RecipeDetailSchema>>> {
  return apiFetch(`/api/v1/recipes/${encodeURIComponent(slug)}?locale=${encodeURIComponent(locale)}`, RecipeDetailSchema);
}
