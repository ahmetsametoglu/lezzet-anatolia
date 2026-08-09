import type { z } from 'zod';
import { RecipeDetailSchema, RecipeListSchema } from '@lezzet/types';
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

/**
 * Tarif listesi — "Fikirler" sekmesinin tarif bölümü.
 *
 * SAYFALAMA/İMLEÇ YOK ve olmaması sözleşmenin kararıdır (`RecipeListSchema` künyesi): tarif kümesi
 * editoryal bir seçkidir, veriyle büyümez → tek turda gelir. `limit` de gönderilmez; sınır uçtadır
 * ve istemcinin büyütebileceği bir sınır, sınır değildir.
 */
export function fetchRecipes(locale: Locale): Promise<ApiResult<z.infer<typeof RecipeListSchema>>> {
  return apiFetch(`/api/v1/recipes?locale=${encodeURIComponent(locale)}`, RecipeListSchema);
}
