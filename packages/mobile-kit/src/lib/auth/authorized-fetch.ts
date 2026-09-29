import type { z } from 'zod';
import { apiFetch, type ApiFetchInit, type ApiResult } from '../api/client';
import { recoverFailedReads } from './recover-reads';
import { endRejectedSession, isDeadSessionAnswer } from './session-end';
import { getSupabase } from './supabase';

/**
 * Bearer middleware'in tel anahtarı (apps/mobile-api `auth.ts`): eksik ve geçersiz token AYNI
 * cevabı alır. Oturumsuz yerel kısa devre de aynı anahtarı kullanır — çağıran tek hâl görür.
 */
const UNAUTHORIZED = 'unauthorized';

/**
 * Korunan `/api/v1` çağrısı: Bearer ekler, 401'de oturumu bir kez tazeleyip bir kez yeniden dener; yönlendirme ekranın kararıdır.
 * Tazelemeyi auth sunucusu kesin reddettiyse ölü oturum kapatılır, çünkü supabase-js saati dolmamış jetonu kendisi bırakmaz.
 */
export async function authorizedFetch<TSchema extends z.ZodTypeAny>(
  path: string,
  schema: TSchema,
  init: ApiFetchInit = {},
): Promise<ApiResult<z.infer<TSchema>>> {
  const supabase = getSupabase();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    return { data: null, error: UNAUTHORIZED, status: 401, retryAfterSec: null };
  }

  const attempt = (accessToken: string): Promise<ApiResult<z.infer<TSchema>>> =>
    apiFetch(path, schema, { ...init, headers: { ...init.headers, Authorization: `Bearer ${accessToken}` } });

  const first = await attempt(token);
  if (first.error === null) recoverFailedReads();
  if (first.error === null || first.status !== 401) return first;

  const refreshed = await supabase.auth.refreshSession();
  const freshToken = refreshed.data.session?.access_token;
  if (refreshed.error || !freshToken) {
    if (isDeadSessionAnswer(refreshed.error)) await endRejectedSession();
    return first;
  }

  const second = await attempt(freshToken);
  if (second.error === null) recoverFailedReads();
  return second;
}

/**
 * Ziyaretçiye açık ama kimlikten yararlanan çağrı: oturum yoksa istek Bearer'sız gider, varsa `authorizedFetch`ten geçer ki
 * tazeleme mantığı tek yerde kalsın.
 */
export async function maybeAuthorizedFetch<TSchema extends z.ZodTypeAny>(
  path: string,
  schema: TSchema,
  init: ApiFetchInit = {},
): Promise<ApiResult<z.infer<TSchema>>> {
  const { data } = await getSupabase().auth.getSession();
  if (!data.session?.access_token) return apiFetch(path, schema, init);
  return authorizedFetch(path, schema, init);
}
