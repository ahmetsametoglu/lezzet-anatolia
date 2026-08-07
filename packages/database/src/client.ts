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

/**
 * ── ANON (publishable-key) İSTEMCİ — EN AZ YETKİ İLKESİ ─────────────────────────────────────────
 * Mobil API'nin Bearer doğrulaması (`auth.getUser(token)`) ve OTP tüketimi (`auth.verifyOtp`)
 * service-role GEREKTİRMEZ: ikisi de public anahtarla yapılabilen işler. RLS baypas eden anahtarı
 * gerektirmeyen yere taşımamak bir tercih değil, güvenlik kuralı.
 *
 * Fabrika 06.08'de mobil şeridinde YEREL yazılmıştı (`apps/mobile-api/src/lib/supabase.ts`) ve
 * dosyanın kendi künyesi terfi bekliyordu; ikinci tüketen (21.4 OTP uçları) doğmadan buraya alındı
 * — duplikasyon hiç doğmasın diye (`CLAUDE §1`).
 *
 * **Veri okumaları buradan GİTMEZ.** Onlar `serviceDb()` üzerinden gider: iş kuralı sunucuda kalır,
 * RLS ikinci savunma hattıdır. Anon istemci yalnız auth uçlarınındır.
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
 * **HER ÇAĞRIDA YENİ** anon istemci — adlandırma `createServiceRoleClient` ile aynı sözleşmeyi
 * taşır: `create*` yeni nesne verir, `*Db()` tekili verir.
 *
 * Oturum YAZAN çağrılar bunu kullanmak ZORUNDA. `auth.verifyOtp` başarıda istemciye (bellek içi)
 * oturum yazar; süreç-geneli paylaşılan bir istemcide bu, sonraki isteklerin o kullanıcının
 * token'ıyla gitmesi demektir — **iki müşterinin oturumunun karışabildiği ve hiçbir yerde hata
 * üretmeyen** bir arıza. Web'de karşılığı yok çünkü SSR istemcisi istek başına kurulur; buradaki
 * karşılığı da budur: tüket, zarfla, at.
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
 * Süreç içi TEKİL anon istemci — yalnız **durum YAZMAYAN** auth çağrıları için.
 *
 * `auth.getUser(token)` böyledir: token parametreyle gider, istemcide oturum bırakmaz. Tekil
 * olması bu yüzden güvenli. Oturum yazan bir çağrı için `createAnonClient()` kullanılır; ayrımı
 * çağıranın hatırlaması gerekiyor ve künyelerin ikisi de bunu söylüyor.
 */
export function anonDb(): SupabaseClient {
  anonCached ??= createAnonClient();
  return anonCached;
}
