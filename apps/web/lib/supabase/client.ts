import { createBrowserClient } from '@supabase/ssr';

/** Tarayıcı istemcisi — yalnız anon key. Oturum çerezleri otomatik yönetilir. */
export function createClient() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
}
