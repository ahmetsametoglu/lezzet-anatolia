import type { z } from 'zod';
import { RecipeDetailSchema, RecipeListSchema, type Country } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';

import { apiFetch, queryString, type ApiResult } from '@lezzet/mobile-kit/src/lib/api/client';

/*
  Gövde şeması `@lezzet/types`tadır ve uç da aynı şemayla üretir, alan adı değişirse iki taraf birden derlemede kırılır.
  `locale` zorunludur, çünkü uç dilsiz çağrıyı sessizce Türkçeye düşürmek yerine 400'le reddeder.
*/

/**
 * Sayfanın tamamı tek turda gelir. Yer de sorulur, çünkü satır fiyatı depoya ve ülkeye bağlıdır; ülke yalnız kodla gider, aynı
 * kod iki ülkede bulunabilir.
 */
export function fetchRecipeDetail(
  slug: string,
  locale: Locale,
  postalCode: string | null = null,
  country: Country | null = null,
): Promise<ApiResult<z.infer<typeof RecipeDetailSchema>>> {
  const code = postalCode?.trim() || undefined;
  return apiFetch(
    `/api/v1/recipes/${encodeURIComponent(slug)}${queryString({
      locale,
      postalCode: code,
      country: code === undefined || country === null ? undefined : country,
    })}`,
    RecipeDetailSchema,
  );
}

/** Tarif kümesi editoryal bir seçkidir ve veriyle büyümez, bu yüzden imleçsiz tek turda gelir; sınır uçtadır. */
export function fetchRecipes(locale: Locale): Promise<ApiResult<z.infer<typeof RecipeListSchema>>> {
  return apiFetch(`/api/v1/recipes?locale=${encodeURIComponent(locale)}`, RecipeListSchema);
}
