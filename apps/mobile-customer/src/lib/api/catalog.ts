import type { z } from 'zod';
import { CatalogCategoryListSchema, CatalogPageSchema, CatalogProductDetailSchema, type CatalogSort, type Country } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';

import { apiFetch, type ApiResult } from '@lezzet/mobile-kit/src/lib/api/client';
import { maybeAuthorizedFetch } from '@lezzet/mobile-kit/src/lib/auth/authorized-fetch';

/*
  Şema burada yazılmaz: gövde sözleşmesi `@lezzet/types`ta ve uç da aynı şemayla üretir, alan adı değişirse iki taraf birden kırılır.
  Ürün ve liste kimlikle okunur (`maybeAuthorizedFetch`), çünkü gel-al deposu sunucuda müşteri izniyle kapılanır; kategori rayı kimliksizdir.
*/

/** Sorgu dizesi — verilmemiş (`undefined`) parametre YAZILMAZ; boş dize meşru bir değerdir. */
function queryOf(params: Record<string, string | undefined>): string {
  const pairs = Object.entries(params)
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
  return pairs.length === 0 ? '' : `?${pairs.join('&')}`;
}

/** Kategori rayı doğal tavanlı bir küme, bu yüzden sayfalanmaz ve tek turda gelir. */
export function fetchCategories(locale: Locale): Promise<ApiResult<z.infer<typeof CatalogCategoryListSchema>>> {
  return apiFetch(`/api/v1/categories${queryOf({ locale })}`, CatalogCategoryListSchema);
}

interface ProductPageQuery {
  locale: Locale;
  /** Kategori SLUG'ı; `null` = "Tümü" (süzgeç yok). */
  category: string | null;
  /** Koleksiyon slug'ı; `null` = katalogun tamamı. Kategoriden bağımsız bir eksendir, ikisi birlikte gelince uç kesişimi döner. */
  collection: string | null;
  /** Ad araması (`q`); boş dize gönderilmez, çünkü uç `min(1)` ister ve "arama yok" ile "boş dize" ayrı şeydir. */
  search?: string;
  /** Sıralama; verilmezse uç kendi varsayılanına (`featured`) düşer — istemci ikinci bir varsayılan tutmaz. */
  sort?: CatalogSort;
  /** Önceki sayfanın `nextCursor`ı; opak kalır, çünkü istemci içini okusaydı keyset'in şekli sözleşme olurdu. */
  cursor?: string;
  /** Yerin sorusudur, depoyu sunucu çözer; kod gitmezse fiyat ve stok ağ geneli cevapla döner. */
  postalCode?: string | null;
  /** Kodun seçilen ülkesi; aynı kod iki ülkede varsa yer ancak bununla çözülür. */
  country?: Country | null;
  /** Seçili gel-al deposu (adres çekmecesindeki depo kartı): sunucu teklif kapısından geçirir, geçerse yer o depodur. */
  pickupWarehouseId?: string | null;
  /** "Adresime gönderilebilir" çipi yalnız yer eksenini daraltır; tükenmiş ürün listede kalır, çünkü onun kendi işareti var. */
  onlyShippable?: boolean;
}

/** Ürün detayı — sayfanın TAMAMI tek turda (boylar, aile, benzerler, beyan); bölüm başına çağrı yok. */
export function fetchProductDetail(
  slug: string,
  locale: Locale,
  postalCode?: string | null,
  pickupWarehouseId?: string | null,
  country: Country | null = null,
): Promise<ApiResult<z.infer<typeof CatalogProductDetailSchema>>> {
  /* Detay da yeri sorar, çünkü teklif tutarı depoya bağlıdır; sormasa aynı ürün listede indirimli, detayda normal fiyatla görünür. */
  const trimmed = postalCode?.trim();
  return maybeAuthorizedFetch(
    `/api/v1/products/${encodeURIComponent(slug)}${queryOf({
      locale,
      ...(trimmed ? { postalCode: trimmed } : {}),
      ...(trimmed && country !== null ? { country } : {}),
      ...(pickupWarehouseId ? { pickupWarehouseId } : {}),
    })}`,
    CatalogProductDetailSchema,
  );
}

/** Ürün sayfası — keyset imleçli (`nextCursor === null` → liste bitti). */
export function fetchProducts(query: ProductPageQuery): Promise<ApiResult<z.infer<typeof CatalogPageSchema>>> {
  const search = query.search?.trim();
  const postalCode = query.postalCode?.trim();
  const path = `/api/v1/products${queryOf({
    locale: query.locale,
    category: query.category ?? undefined,
    collection: query.collection ?? undefined,
    q: search === undefined || search.length === 0 ? undefined : search,
    sort: query.sort,
    cursor: query.cursor,
    postalCode: postalCode === undefined || postalCode.length === 0 ? undefined : postalCode,
    country: postalCode === undefined || postalCode.length === 0 ? undefined : (query.country ?? undefined),
    pickupWarehouseId: query.pickupWarehouseId ?? undefined,
    shippable: query.onlyShippable === true ? '1' : undefined,
  })}`;
  return maybeAuthorizedFetch(path, CatalogPageSchema);
}
