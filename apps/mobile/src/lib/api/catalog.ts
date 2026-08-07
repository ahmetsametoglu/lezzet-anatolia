import type { z } from 'zod';
import { CatalogCategoryListSchema, CatalogPageSchema } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';

import { apiFetch, type ApiResult } from './client';

/*
  KATALOG OKUMALARI — `/api/v1/categories` + `/api/v1/products`.

  ŞEMA BURADA YAZILMAZ: gövde sözleşmesi `@lezzet/types`ın (`catalog-api.schema.ts`) ve uç da AYNI
  şemayla üretiyor (02-mimari §3.2 "sözleşme tek kaynak"). Bu dosyanın işi yalnız sorgu dizesini
  kurmak ve şemayı istemciye vermek — alan adı değişirse iki taraf birden derlemede kırılır.

  `locale` HER İSTEKTE zorunlu: uç dilsiz çağrıyı 400'le reddediyor (sessizce Türkçe'ye düşmesin
  diye). Değer cihazın dilinden çözülür (`lib/i18n/locale.ts`), ekranların kendi kararı değil.
*/

/** Sorgu dizesi — verilmemiş (`undefined`) parametre YAZILMAZ; boş dize meşru bir değerdir. */
function queryOf(params: Record<string, string | undefined>): string {
  const pairs = Object.entries(params)
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
  return pairs.length === 0 ? '' : `?${pairs.join('&')}`;
}

/** Kategori rayı — DOĞAL TAVANLI küme, tek turda çekilir (sayfalama YOK — CLAUDE §1). Zarf dahil
 *  şema types'tan: uç da AYNI şemayla üretiyor, alan adı ayrışırsa iki taraf birden derlemede kırılır. */
export function fetchCategories(locale: Locale): Promise<ApiResult<z.infer<typeof CatalogCategoryListSchema>>> {
  return apiFetch(`/api/v1/categories${queryOf({ locale })}`, CatalogCategoryListSchema);
}

interface ProductPageQuery {
  locale: Locale;
  /** Kategori SLUG'ı; `null` = "Tümü" (süzgeç yok). */
  category: string | null;
  /**
   * Bir önceki sayfanın `nextCursor`ı — OPAK dize, yorumlanmaz, aynen geri verilir. İçinin ne
   * olduğu sunucunun bileceği iş; istemci onu okumaya kalksaydı keyset'in şekli sözleşme olurdu.
   */
  cursor?: string;
}

/** Ürün sayfası — keyset imleçli (`nextCursor === null` → liste bitti). */
export function fetchProducts(query: ProductPageQuery): Promise<ApiResult<z.infer<typeof CatalogPageSchema>>> {
  const path = `/api/v1/products${queryOf({
    locale: query.locale,
    category: query.category ?? undefined,
    cursor: query.cursor,
  })}`;
  return apiFetch(path, CatalogPageSchema);
}
