import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null = null;

/** İki fabrikanın ortak env okuması — eksiklik iki yerde de AYNI cümleyle bildirilir. */
function anonCreds(): { url: string; key: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error('Supabase env eksik: NEXT_PUBLIC_SUPABASE_URL ve NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY tanımlı olmalı.');
  }
  return { url, key };
}

/**
 * Anon (publishable-key) istemci — YALNIZ durum YAZMAYAN auth çağrıları için (`auth.getUser(token)`:
 * token parametreyle gider, istemcide oturum bırakmaz; süreç içi tekil bu yüzden güvenli).
 *
 * Neden service-role DEĞİL: token doğrulamak public anahtarla yapılabilen bir iş; RLS baypas eden
 * anahtarı gerektirmeyen yere taşımamak en az yetki ilkesidir. Veri okumaları ayrı: onlar
 * `serviceDb()` üzerinden gider (iş kuralı sunucuda kalır, RLS ikinci savunma hattı — 02-mimari §4).
 *
 * Neden YEREL fabrika: `packages/database/client.ts` yalnız service-role fabrikası taşıyor
 * (`createServiceRoleClient`/`serviceDb`); anon fabrika yok. `packages/*` bu şeridin yazı alanı
 * dışında — terfi ihtiyacı yöneticiye raporlandı (02-mimari §2). Terfi olunca bu dosya silinir.
 */
export function anonClient(): SupabaseClient {
  if (cached) return cached;
  const { url, key } = anonCreds();
  cached = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  return cached;
}

/**
 * KISA ÖMÜRLÜ anon istemci — `verifyOtp(token_hash)` tüketimi İÇİN; her çağrı YENİ istemci döner.
 *
 * Tekil `anonClient()` burada BİLEREK kullanılmaz: `verifyOtp` başarısında istemciye oturum
 * YAZAR (bellek içi) ve süreç-geneli paylaşılan bir istemcide bu, sonraki isteklerin o
 * kullanıcının token'ıyla gitmesi demektir — iki müşterinin oturumunun karışabildiği, hiçbir
 * yerde hata üretmeyen bir arıza. Web'de aynı sorun yok çünkü SSR istemcisi istek-başına
 * kurulur; buradaki karşılığı da budur: tüket, zarfla, at.
 */
export function ephemeralAnonClient(): SupabaseClient {
  const { url, key } = anonCreds();
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
