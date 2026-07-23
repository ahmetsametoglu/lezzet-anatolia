import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export type Db = SupabaseClient;

let cached: SupabaseClient | null = null;

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
  });
}

/** Süreç içi tekil service-role istemci (durumsuz olduğu için önbelleklenebilir). */
export function serviceDb(): SupabaseClient {
  cached ??= createServiceRoleClient();
  return cached;
}
