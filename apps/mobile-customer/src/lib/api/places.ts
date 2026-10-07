import type { Locale } from '@lezzet/i18n';
import type { z } from 'zod';
import {
  DeliveryAreaListSchema,
  PlaceNoticeResultSchema,
  PlaceResolutionSchema,
  PlaceOptionListSchema,
  type DeliveryAreaList,
  type PlaceNoticeBodySchema,
  type PlaceNoticeResult,
  type PlaceResolution,
  type PlaceOption,
  type Country,
} from '@lezzet/types';

import { maybeAuthorizedFetch } from '@lezzet/mobile-kit/src/lib/auth/authorized-fetch';
import { apiFetch, type ApiResult } from '@lezzet/mobile-kit/src/lib/api/client';

/* Çözüm, öneri ve bölge uçları kimliksizdir, çünkü kod ve bölge hesap açılmadan önce sorulur. */

/* `PlaceNoticeResult` yeniden ihraç edilmez, çünkü adını yazan çağıran yok ve kullanılmayan dışa verim `knip`e takılır. */
export type { PlaceResolution, PlaceOption };

/** Ülke verilirse kod o ülkeye bağlanır; aynı kod iki ülkede varsa cevap ancak böyle tek yer olur. */
export function resolvePostalCode(code: string, country: Country | null = null): Promise<ApiResult<PlaceResolution>> {
  const where = country === null ? '' : `&country=${country}`;
  return apiFetch(`/api/v1/places/by-postal-code?code=${encodeURIComponent(code)}${where}`, PlaceResolutionSchema);
}

/** Kısa önek boş dizi döner, hata değil: "6" geçersiz bir soru değil, henüz hiçbir yeri işaret etmeyen bir sorudur. */
export function suggestPostalCodes(prefix: string): Promise<ApiResult<PlaceOption[]>> {
  return apiFetch(`/api/v1/places/suggest?prefix=${encodeURIComponent(prefix)}`, PlaceOptionListSchema);
}

/** Dil sorgusu yok, çünkü cevap çevrilmeyen şehir adlarıdır (`publicName`). Boş dizi "henüz ilan edilmiş bölge yok" demektir; okuma hatası zarftan gelir. */
export function fetchDeliveryAreas(): Promise<ApiResult<DeliveryAreaList>> {
  return apiFetch('/api/v1/places/zones', DeliveryAreaListSchema);
}

/** Oturum varsa e-postayı sunucu çözer ve gövdedeki adres yok sayılır, böylece başkasının yerine kayıt bırakılamaz. Dil imzadadır, çünkü uç dilsiz çağrıyı reddeder ve haber o dilde gider. */
export function submitPlaceNotice(
  locale: Locale,
  body: z.input<typeof PlaceNoticeBodySchema>,
): Promise<ApiResult<PlaceNoticeResult>> {
  return maybeAuthorizedFetch(`/api/v1/places/notice?locale=${encodeURIComponent(locale)}`, PlaceNoticeResultSchema, {
    method: 'POST',
    body,
  });
}
