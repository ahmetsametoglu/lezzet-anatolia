import { PlaceResolutionSchema, type PlaceResolution } from '@lezzet/types';

import { apiFetch, type ApiResult } from './client';

/*
  `/api/v1/places/by-postal-code` — posta kodundan yer çözümü (onboarding'in giriş sorusu).

  ÇIPLAK `apiFetch`, korunan çağrı DEĞİL: uç bilerek oturumsuz (hesap açılmadan önce sorulur —
  `places.ts` künyesi). Şema `@lezzet/types`tan; dört hâlin (resolved · ambiguous · unknown ·
  unresolved) anlamı ve "rota günleri neden yok" kararı sözleşme dosyasında yazılı.
*/

export type { PlaceResolution };

export function resolvePostalCode(code: string): Promise<ApiResult<PlaceResolution>> {
  return apiFetch(`/api/v1/places/by-postal-code?code=${encodeURIComponent(code)}`, PlaceResolutionSchema);
}
