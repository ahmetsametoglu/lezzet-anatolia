import 'server-only';
import { serviceDb } from '@lezzet/database';
import {
  getPackageDetail as getPackageDetailFromPackage,
  getPackagesByIds as getPackagesByIdsFromPackage,
  listStorefrontPackages as listStorefrontPackagesFromPackage,
  type PlaceWarehouses,
  type StorefrontPackage,
  type StorefrontPackageDetail,
} from '@lezzet/application';
import type { Locale } from '@lezzet/i18n';

/**
 * **Geçiş köprüsü** (paket kapısının terfisi, 09.08) — gövde
 * `@lezzet/application/catalog/packages`a taşındı; künyelerin tamamı orada.
 *
 * Taşınma sebebi ölçülmüş bir arızaydı: mobil sepette paket satırı sunucuya YAZILIYOR ama
 * `getCartView`in paket kapısını (`CartBundlePort`) besleyecek okuma bu dosyadaydı ve dosya
 * `server-only` — `apps/mobile-api` onu import edemiyordu. Sonuç: mobilde paket satırı
 * `name: ""`, `unitPriceCents: null`, `blocked: true` dönüyor ve tutarı sepet toplamına hiç
 * girmiyordu. Kopyalamak yasaktı (CLAUDE §1): stok zinciri, yol kararı
 * (`decideBundleAgainstWarehouse`), KDV ve kargo kısıtı tek yerde durmak zorunda — yoksa aynı
 * paket vitrinde "var", sepette "tükendi" diyebilirdi.
 *
 * ── KÖPRÜ NİYE İNCE BİR RE-EXPORT DEĞİL ─────────────────────────────────────
 * Terfi eden kapılar `db`yi ÇAĞIRANDAN alıyor (paketin ortak deseni: `serviceDb()` pakette
 * çağrılmaz). Web'in altı çağrı yeri ise bugün `db` geçmiyor ve ikisi
 * (`checkout/actions.ts`, `lib/order/checkout-draft.ts`) `getPackagesByIds`i `CartBundlePort`
 * olarak DOĞRUDAN geçiyor — imza `(ids, locale, place)`. Köprü bu yüzden `serviceDb()`yi bağlayan
 * üç ince sarmalayıcıdır: çağrı yerleri yerinden oynamıyor ve port imzası birebir tutuyor.
 * **Silinmesi web benimsemesiyle** — o gün her çağıran kendi `db`sini geçer.
 *
 * `server-only` burada KALIYOR: sınır web tarafında korunuyor, pakette değil (`batch-view.ts`
 * köprüsünün emsali).
 */

/**
 * Anasayfa bandının sabit sınırı — editoryal seçki, liste değil (CLAUDE.md §1).
 *
 * **3 → 2 (08.26):** yeni ana sayfa tasarımı paket bölümünü iki slotlu çiziyor
 * (`Musteri - Anasayfa.dc.html`, `hint-placeholder-count="2"`). Üçüncü kart ızgarayı taşırıyordu.
 *
 * **Terfide BİLEREK burada kaldı:** bu bir WEB ana sayfa ızgarası kararıdır, paket okumasının
 * kuralı değil. Native uygulamanın kendi sayısı var (`apps/mobile-api/src/lib/ideas.ts` — v3'te de
 * iki, ama başka bir tasarımdan) ve ikisini tek sabitte birleştirmek, bir yüzeyin ızgarasını
 * ötekine bağlamak olurdu.
 */
export const HOME_PACKAGE_LIMIT = 2;

/** Paket sayfası + ana sayfa şeridi. Künye: `@lezzet/application` → `listStorefrontPackages`. */
export function listStorefrontPackages(
  locale: Locale,
  limit?: number,
  place: Partial<PlaceWarehouses> = {},
): Promise<StorefrontPackage[]> {
  return listStorefrontPackagesFromPackage(serviceDb(), locale, limit, place);
}

/** Paket detay sayfası. Künye: `@lezzet/application` → `getPackageDetail`. */
export function getPackageDetail(
  slug: string,
  locale: Locale,
  place: Partial<PlaceWarehouses> = {},
): Promise<StorefrontPackageDetail | null> {
  return getPackageDetailFromPackage(serviceDb(), slug, locale, place);
}

/**
 * Sepetin/checkout'un paket kapısı — `CartBundlePort` olarak DOĞRUDAN geçilir (sarmalayıcı yok,
 * imza birebir). Künye: `@lezzet/application` → `getPackagesByIds`.
 */
export function getPackagesByIds(
  ids: readonly string[],
  locale: Locale,
  place: Partial<PlaceWarehouses> = {},
): Promise<StorefrontPackageDetail[]> {
  return getPackagesByIdsFromPackage(serviceDb(), ids, locale, place);
}
