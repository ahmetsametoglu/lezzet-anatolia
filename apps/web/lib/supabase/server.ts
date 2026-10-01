import 'server-only';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { supabaseFetch } from '@lezzet/database';

type CookieToSet = { name: string; value: string; options: CookieOptions };

/**
 * Sunucu istemcisi (RSC / Server Action / route handler) — oturumu çerezden okur.
 * anon key ile; RLS kullanıcının oturumuna göre uygulanır.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, {
    // Her sayfanın oturum doğrulaması servis istemcisiyle aynı bağlantı havuzundan gider.
    global: { fetch: supabaseFetch },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet: CookieToSet[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Server Component'ten çağrılırsa çerez set edilemez — sorun değil.
        }
      },
    },
  });
}
