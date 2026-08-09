import type { z } from 'zod';
import {
  PlaceNoticeResultSchema,
  PlaceResolutionSchema,
  type PlaceNoticeBodySchema,
  type PlaceNoticeResult,
  type PlaceResolution,
} from '@lezzet/types';

import { maybeAuthorizedFetch } from '../auth/authorized-fetch';
import { apiFetch, type ApiResult } from './client';

/*
  `/api/v1/places/*` — yer uçları.

  ÇÖZÜM (`by-postal-code`) ÇIPLAK `apiFetch`, korunan çağrı DEĞİL: uç bilerek oturumsuz (hesap
  açılmadan önce sorulur — `places.ts` künyesi). Şema `@lezzet/types`tan; dört hâlin (resolved ·
  ambiguous · unknown · unresolved) anlamı ve "rota günleri neden yok" kararı sözleşme
  dosyasında yazılı.
*/

/* `PlaceNoticeResult` BİLEREK yeniden ihraç EDİLMEZ: adını yazan bir çağıran yok (bant
   `submitPlaceNotice`in sonucunu doğrudan okuyor) ve kullanılmayan bir dışa verim `knip`in ölü
   listesine düşer — `place-view.ts`teki `PlaceMode` kararının aynısı. */
export type { PlaceResolution };

export function resolvePostalCode(code: string): Promise<ApiResult<PlaceResolution>> {
  return apiFetch(`/api/v1/places/by-postal-code?code=${encodeURIComponent(code)}`, PlaceResolutionSchema);
}

/**
 * "BURAYA DA GELİN" KAYDI — `POST /api/v1/places/notice` (21.20 · kullanıcı kararı 10.08).
 *
 * `maybeAuthorizedFetch`: ziyaretçiye AÇIK ama kimlikten YARARLANIR. Giriş duvarı yok (sözleşme
 * künyesi: "vazgeçmeye en yakın anda ikinci engel çıkarılmaz"); oturum varsa Bearer gider ve
 * e-postayı SUNUCU çözer — gövdeden gelen adres yok sayılır, yani başkasının yerine kayıt
 * bırakılamaz. Misafirde e-posta gövdeden gelir; verilmemişse uç `email_required` döner ve ekran
 * adresi sorar. Keşif turunun oy ucuyla aynı desen.
 *
 * Gövde tipi `z.input`: `email` şemada varsayılanlı (`.default(null)`), yani çağıran alanı hiç
 * yazmadan da geçebilir.
 */
export function submitPlaceNotice(body: z.input<typeof PlaceNoticeBodySchema>): Promise<ApiResult<PlaceNoticeResult>> {
  return maybeAuthorizedFetch('/api/v1/places/notice', PlaceNoticeResultSchema, { method: 'POST', body });
}
