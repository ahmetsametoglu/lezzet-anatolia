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
   * Koleksiyon SLUG'ı (21.64); `null` = kesit yok, katalogun tamamı.
   *
   * Kategoriden BAĞIMSIZ bir eksen: ikisi birlikte gönderilebilir ve uç AND'ler. Tel üstündeki
   * adı web'in URL'siyle aynı (`?collection=`) — `shippable`ın kuralı birebir.
   */
  collection: string | null;
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
  /**
   * Cihazda kayıtlı posta kodu — YERİN SORUSUDUR, cevabı değil: depoyu sunucu çözer (uç künyesi
   * `apps/mobile-api/src/api/v1/catalog.ts` → `readPlace`). Fiyat, teklif ve stok hâli depoya göre
   * değişir; kod gitmezse liste "hiç var mı" sorusunun ağ-geneli cevabıyla döner.
   *
   * `null`/boş = kod hiç girilmemiş → parametre HİÇ YAZILMAZ (vitrin okumasının kuralı birebir,
   * `home.ts`): boş bir `postalCode=` sunucuda yine "yer bilinmiyor"a düşer ama isteği kirletir.
   */
  postalCode?: string | null;
  /**
   * "Adresime gönderilebilir" çipi (21.20) — kargolanabilir kalemlere daraltır.
   *
   * Tel üstündeki adı WEB'İN URL'siyle AYNI (`?shippable=1`): iki yüzey aynı soruyu aynı kelimeyle
   * sorar. Varsayılan KAPALI ve kapalıyken parametre HİÇ YAZILMAZ — `shippable=0` göndermek
   * "süzgeç yok" ile aynı sonucu verir ama isteği kirletir (`postalCode`un kuralı birebir).
   *
   * **Süzgeç YALNIZ YER eksenini daraltır:** tükenmiş ürün listede kalır (o başka bir eksen ve
   * kendi işareti var). Çipin adının söylemediği ikinci bir daraltma yapılmaz.
   */
  onlyShippable?: boolean;
}

/** Ürün detayı — sayfanın TAMAMI tek turda (boylar, aile, benzerler, beyan); bölüm başına çağrı yok. */
export function fetchProductDetail(
  slug: string,
  locale: Locale,
  postalCode?: string | null,
): Promise<ApiResult<z.infer<typeof CatalogProductDetailSchema>>> {
  /* POSTA KODU DETAYDA DA ZORUNLU — atlanınca ÖLÇÜLEBİLİR bir tutarsızlık doğuyor (09.08):
     katalog kodu gönderiyor, detay göndermiyordu ve aynı ürün listede 1,84 €, detayda 2,30 €
     görünüyordu. Müşteri indirimli fiyata dokunup normal fiyatı görüyor — verilmiş sözün
     bozulmasının ta kendisi. Teklif tutarı depoya bağlı olduğu için iki ekranın AYNI yeri
     sorması şart. */
  const trimmed = postalCode?.trim();
  return apiFetch(
    `/api/v1/products/${encodeURIComponent(slug)}${queryOf({ locale, ...(trimmed ? { postalCode: trimmed } : {}) })}`,
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
    shippable: query.onlyShippable === true ? '1' : undefined,
  })}`;
  return apiFetch(path, CatalogPageSchema);
}
