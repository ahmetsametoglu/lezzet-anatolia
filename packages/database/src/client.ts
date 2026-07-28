import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type Db = SupabaseClient;

let cached: SupabaseClient | null = null;

/**
 * YEREL yığının bilinen kusuru için tek seferlik yeniden deneme.
 *
 * Belirti: aralıklı `An invalid response was received from the upstream server` (Kong 502) — hep
 * YAZMA isteğinde. Sebep, Kong günlüğünde açık: `recv() failed (104: Connection reset by peer) while
 * reading response header from upstream`. PostgREST boşta duran keep-alive bağlantısını kapatıyor,
 * Kong o bayat bağlantıyı yeniden kullanıyor. GET'i Kong kendiliğinden taze bağlantıyla yeniden
 * deniyor (bu yüzden okumalar hiç düşmüyor), POST'u denemiyor: idempotent değil.
 *
 * Yeniden denemek burada GÜVENLİ: bağlantı istek OKUNMADAN kapandığı için yazma hiç gerçekleşmedi
 * (cevap başlığı bile başlamamış). Tarayıcıların bayat keep-alive'da yaptığı da budur.
 *
 * ⚠ YALNIZ yerelde devrede. Üretimde 502, isteğin işlenmesinin ORTASINDA da doğabilir; orada sessiz
 * yeniden deneme kaydı ikizleyebilir — o yüzden ana makine adresine bakıp karar veriyoruz.
 */
const LOCAL_HOST = /^https?:\/\/(127\.0\.0\.1|localhost|\[::1\])(:\d+)?/i;

function retryOnStaleUpstream(fetchImpl: typeof fetch): typeof fetch {
  return async (input, init) => {
    try {
      const res = await fetchImpl(input, init);
      if (res.status !== 502) return res;
    } catch (err) {
      // Bağlantı düzeyinde sıfırlama (ECONNRESET) — aynı bayat bağlantı hikâyesi.
      if (!(err instanceof TypeError)) throw err;
    }
    return fetchImpl(input, init);
  };
}

/**
 * Service-role istemci — RLS'i baypas eder. YALNIZ sunucuda (Server Action, RSC, backend,
 * script). Tarayıcıya asla sızmamalı. Servisler bu istemciyi (ya da cookie'li kullanıcı
 * istemcisini) constructor'dan enjekte alır; hangi istemci verilirse RLS ona göre işler.
 */
export function createServiceRoleClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) {
    throw new Error('Supabase env eksik: NEXT_PUBLIC_SUPABASE_URL ve SUPABASE_SECRET_KEY tanımlı olmalı.');
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    // Bayat keep-alive yeniden denemesi yalnız yerel yığında (yukarıdaki gerekçe).
    ...(LOCAL_HOST.test(url) ? { global: { fetch: retryOnStaleUpstream(fetch) } } : {}),
  });
}

/** Süreç içi tekil service-role istemci (durumsuz olduğu için önbelleklenebilir). */
export function serviceDb(): SupabaseClient {
  cached ??= createServiceRoleClient();
  return cached;
}
