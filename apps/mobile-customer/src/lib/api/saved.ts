import type { z } from 'zod';
import type { Locale } from '@lezzet/i18n';
import { MeSavedViewSchema, type Country, type MeSavedRestoreBodySchema, type MeSavedView } from '@lezzet/types';

import { authorizedFetch } from '@lezzet/mobile-kit/src/lib/auth/authorized-fetch';
import type { ApiResult } from '@lezzet/mobile-kit/src/lib/api/client';

/*
  `/api/v1/me/saved` — hesaptaki "Sonraya kaydedilenler" kartı. Her uç kartın güncel hâlini döner; posta kodu kalemin bu adrese
  gelip gelmediğini çözdürür, dil zorunludur (sepet ailesinin kuralı).
*/

function pathOf(suffix: string, locale: Locale, postalCode: string | undefined, country: Country | null): string {
  const query = new URLSearchParams({ locale, ...(postalCode ? { postalCode } : {}), ...(postalCode && country !== null ? { country } : {}) });
  return `/api/v1/me/saved${suffix}?${query.toString()}`;
}

export function fetchSaved(locale: Locale, postalCode: string | undefined, country: Country | null = null): Promise<ApiResult<MeSavedView>> {
  return authorizedFetch(pathOf('', locale, postalCode, country), MeSavedViewSchema);
}

export function restoreSaved(
  lines: z.input<typeof MeSavedRestoreBodySchema>['lines'],
  locale: Locale,
  postalCode: string | undefined,
  country: Country | null = null,
): Promise<ApiResult<MeSavedView>> {
  return authorizedFetch(pathOf('/restore', locale, postalCode, country), MeSavedViewSchema, { method: 'POST', body: { lines } });
}

export function cancelZoneNotice(
  code: string,
  locale: Locale,
  postalCode: string | undefined,
  country: Country | null = null,
): Promise<ApiResult<MeSavedView>> {
  return authorizedFetch(pathOf(`/zone-notices/${encodeURIComponent(code)}`, locale, postalCode, country), MeSavedViewSchema, {
    method: 'DELETE',
  });
}
