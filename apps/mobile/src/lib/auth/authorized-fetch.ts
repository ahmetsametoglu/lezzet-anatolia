import type { z } from 'zod';
import { apiFetch, type ApiFetchInit, type ApiResult } from '../api/client';
import { getSupabase } from './supabase';

/**
 * Bearer middleware'in tel anahtarı (apps/mobile-api `auth.ts`): eksik ve geçersiz token AYNI
 * cevabı alır. Oturumsuz yerel kısa devre de aynı anahtarı kullanır — çağıran tek hâl görür.
 */
const UNAUTHORIZED = 'unauthorized';

/**
 * Korunan `/api/v1` çağrısı — Bearer'ı ekler; 401'de oturumu BİR KEZ tazeleyip BİR KEZ yeniden
 * dener (autoRefresh sayacının uyuduğu aralıkta süresi dolan token'ın tek meşru kurtarışı).
 * Tazeleme de düşerse ilk 401 sonucu döner — girişe yönlendirme kabuk/ekran kararıdır, veri
 * katmanı karar vermez (02-mimari §4).
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
  if (first.error === null || first.status !== 401) return first;

  const refreshed = await supabase.auth.refreshSession();
  const freshToken = refreshed.data.session?.access_token;
  if (refreshed.error || !freshToken) return first;

  return attempt(freshToken);
}
