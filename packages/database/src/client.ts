import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type Db = SupabaseClient;

let cached: SupabaseClient | null = null;

/**
 * Yerel yığında PostgREST boştaki keep-alive bağlantısını kapatıyor ve Kong o bayat bağlantıyı kullanınca yazma isteği 502
 * alıyor; istek okunmadan düştüğü için bir kez yeniden denemek güvenli. Üretimde 502 işlemin ortasında da doğabilir ve yeniden
 * deneme kaydı ikizler, bu yüzden yalnız yerel adreste devrede.
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
 * Service-role istemci RLS'i baypas eder, bu yüzden yalnız sunucuda kullanılır ve tarayıcıya sızmamalıdır. Servisler istemciyi
 * (ya da cookie'li kullanıcı istemcisini) constructor'dan alır; RLS verilen istemciye göre işler.
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

/**
 * Bearer doğrulaması (`auth.getUser(token)`) ve OTP tüketimi (`auth.verifyOtp`) public anahtarla yapılabildiği için RLS'i
 * baypas eden anahtar oraya taşınmaz (en az yetki). Veri okumaları bu istemciden değil `serviceDb()`den gider: iş kuralı
 * sunucuda kalır, RLS ikinci savunma hattıdır.
 */
function anonCreds(): { url: string; key: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error('Supabase env eksik: NEXT_PUBLIC_SUPABASE_URL ve NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY tanımlı olmalı.');
  }
  return { url, key };
}

/**
 * Her çağrıda yeni anon istemci; oturum yazan çağrılar (`auth.verifyOtp`) bunu kullanmak zorunda, çünkü paylaşılan istemcide
 * yazılan oturum sonraki istekleri başka müşterinin jetonuyla gönderir ve hiçbir yerde hata üretmez. Adlandırma
 * `createServiceRoleClient` ile aynı: `create*` yeni nesne, `*Db()` tekil verir.
 */
export function createAnonClient(): SupabaseClient {
  const { url, key } = anonCreds();
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    // Bayat keep-alive yeniden denemesi yalnız yerel yığında — auth çağrıları da aynı Kong'dan
    // geçiyor, yani aynı kusura açıklar (gerekçe `retryOnStaleUpstream` künyesinde).
    ...(LOCAL_HOST.test(url) ? { global: { fetch: retryOnStaleUpstream(fetch) } } : {}),
  });
}

let anonCached: SupabaseClient | null = null;

/**
 * Süreç içi tekil anon istemci, yalnız oturum yazmayan auth çağrıları için: `auth.getUser(token)` jetonu parametreyle alır,
 * istemcide oturum bırakmaz. Oturum yazan çağrı `createAnonClient()` kullanır.
 */
export function anonDb(): SupabaseClient {
  anonCached ??= createAnonClient();
  return anonCached;
}
