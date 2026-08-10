import type { z } from 'zod';
import { PackageDetailSchema, PackageListSchema } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';

import { apiFetch, type ApiResult } from './client';

/*
  PAKET OKUMASI — `/api/v1/packages/:slug`. Sayfanın TAMAMI tek turda (içerik satırları dahil);
  şema `@lezzet/types`ın (`package-api.schema.ts`), uç da AYNI şemayla üretiyor — alan adı
  değişirse iki taraf birden derlemede kırılır (katalog istemcisinin kuralı, birebir).

  `locale` zorunlu: uç dilsiz çağrıyı 400'le reddediyor (sessizce Türkçeye düşmesin diye).

  ── POSTA KODU (10.08) ──────────────────────────────────────────────────────
  İki okuma da yeri GÖNDERİR ve bu kataloğun ölçülmüş dersidir (09.08: kod göndermeyen detay,
  gönderen listeden farklı fiyat gösteriyordu). Pakette karşılığı stok/yol: kod gitmezse `route`
  `null` döner ve ekran "bu adrese gönderemiyoruz"u hiç söyleyemez — sayfa yere KÖR kalır. Kod
  yoksa parametre HİÇ yazılmaz (`home.ts`/`catalog.ts` kuralı birebir): boş bir `postalCode=`
  sunucuda yine "yer bilinmiyor"a düşer ama isteği kirletir.
*/

/** Sorgu dizesi — `catalog.ts`teki ikizinin aynısı; kod boş/`null` ise parametre hiç yazılmaz. */
function queryOf(locale: Locale, postalCode?: string | null): string {
  const trimmed = postalCode?.trim();
  const place = trimmed === undefined || trimmed.length === 0 ? '' : `&postalCode=${encodeURIComponent(trimmed)}`;
  return `?locale=${encodeURIComponent(locale)}${place}`;
}

export function fetchPackageDetail(
  slug: string,
  locale: Locale,
  postalCode?: string | null,
): Promise<ApiResult<z.infer<typeof PackageDetailSchema>>> {
  return apiFetch(`/api/v1/packages/${encodeURIComponent(slug)}${queryOf(locale, postalCode)}`, PackageDetailSchema);
}

/**
 * Paket listesi — "Fikirler" sekmesinin paket bölümü. Vitrindeki şeritten farkı SÜZGEÇ: orada
 * yalnız işaretli paketler var, burada yayındakilerin tamamı (karar uçta — `PackageListSchema`).
 * Sayfalama yok: paket kataloğu doğal tavanlı bir kümedir, tek turda gelir.
 */
export function fetchPackages(
  locale: Locale,
  postalCode?: string | null,
): Promise<ApiResult<z.infer<typeof PackageListSchema>>> {
  return apiFetch(`/api/v1/packages${queryOf(locale, postalCode)}`, PackageListSchema);
}
