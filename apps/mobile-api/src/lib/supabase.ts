import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let cached: SupabaseClient | null = null;

/**
 * Anon (publishable-key) istemci — YALNIZ Bearer token doğrulaması için (`auth.getUser(token)`).
 *
 * Neden service-role DEĞİL: token doğrulamak public anahtarla yapılabilen bir iş; RLS baypas eden
 * anahtarı gerektirmeyen yere taşımamak en az yetki ilkesidir. Veri okumaları ayrı: onlar
 * `serviceDb()` üzerinden gider (iş kuralı sunucuda kalır, RLS ikinci savunma hattı — 02-mimari §4).
 *
 * Neden YEREL fabrika: `packages/database/client.ts` yalnız service-role fabrikası taşıyor
 * (`createServiceRoleClient`/`serviceDb`); anon fabrika yok. `packages/*` bu şeridin yazı alanı
 * dışında — terfi ihtiyacı yöneticiye raporlandı (02-mimari §2). Terfi olunca bu dosya silinir.
 *
 * Oturum tutulmaz: istemci durumsuz bir doğrulayıcı, kullanıcı oturumu CİHAZDA yaşar (02-mimari §4).
 * Durumsuz olduğu için de süreç içi tekil olarak önbelleklenebilir (client.ts'teki `serviceDb` deseni).
 */
export function anonClient(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error('Supabase env eksik: NEXT_PUBLIC_SUPABASE_URL ve NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY tanımlı olmalı.');
  }
  cached = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
  return cached;
}
