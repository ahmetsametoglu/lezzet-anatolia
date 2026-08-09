import type { z } from 'zod';
import { CatalogCategoryListSchema, CatalogPageSchema, CatalogProductDetailSchema, type CatalogSort } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';

import { apiFetch, type ApiResult } from './client';

/*
  KATALOG OKUMALARI — `/api/v1/categories` + `/api/v1/products`.

  ŞEMA BURADA YAZILMAZ: gövde sözleşmesi `@lezzet/types`ın (`catalog-api.schema.ts`) ve uç da AYNI
  şemayla üretiyor (02-mimari §3.2 "sözleşme tek kaynak"). Bu dosyanın işi yalnız sorgu dizesini
  kurmak ve şemayı istemciye vermek — alan adı değişirse iki taraf birden derlemede kırılır.

  `locale` HER İSTEKTE zorunlu: uç dilsiz çağrıyı 400'le reddediyor (sessizce Türkçe'ye düşmesin
  diye). Değer UYGULAMANIN DİLİDİR (`lib/i18n/app-locale.ts` — kullanıcının seçimi, yoksa cihaz
  dili), ekranların kendi kararı değil: ekran metniyle ürün adı aynı kaynaktan beslenir.
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
   * Ad araması — uç üç dilde birden arıyor (`q`). BOŞ DİZE GÖNDERİLMEZ: uç `min(1)` istiyor ve
   * "arama yok" ile "boş dize aradım" aynı şey değil; ayrımı burada, tek yerde yapıyoruz.
   */
  search?: string;
  /** Sıralama; verilmezse uç kendi varsayılanına (`featured`) düşer — istemci ikinci bir varsayılan tutmaz. */
  sort?: CatalogSort;
  /**
   * Bir önceki sayfanın `nextCursor`ı — OPAK dize, yorumlanmaz, aynen geri verilir. İçinin ne
   * olduğu sunucunun bileceği iş; istemci onu okumaya kalksaydı keyset'in şekli sözleşme olurdu.
   */
  cursor?: string;
}

/** Ürün detayı — sayfanın TAMAMI tek turda (boylar, aile, benzerler, beyan); bölüm başına çağrı yok. */
export function fetchProductDetail(slug: string, locale: Locale): Promise<ApiResult<z.infer<typeof CatalogProductDetailSchema>>> {
  return apiFetch(`/api/v1/products/${encodeURIComponent(slug)}${queryOf({ locale })}`, CatalogProductDetailSchema);
}

/** Ürün sayfası — keyset imleçli (`nextCursor === null` → liste bitti). */
export function fetchProducts(query: ProductPageQuery): Promise<ApiResult<z.infer<typeof CatalogPageSchema>>> {
  const search = query.search?.trim();
  const path = `/api/v1/products${queryOf({
    locale: query.locale,
    category: query.category ?? undefined,
    q: search === undefined || search.length === 0 ? undefined : search,
    sort: query.sort,
    cursor: query.cursor,
  })}`;
  return apiFetch(path, CatalogPageSchema);
}
