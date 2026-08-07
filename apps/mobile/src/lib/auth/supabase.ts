import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { AppState } from 'react-native';
import { env } from '../env';
import { AUTH_STORAGE_KEY, secureStoreAdapter } from './session-store';

/*
  Cihazdaki supabase-js istemcisi — YALNIZ anon anahtar (secret anahtar mobil bundle'a giremez,
  02-mimari §4). Oturum SecureStore adapter'ıyla saklanır, access token süresi dolunca refresh
  token'la kendiliğinden tazelenir (`autoRefreshToken`).

  Tembel tekil: modül import'u istemci KURMAZ (test ortamı env vermeden import edebilir);
  ilk `getSupabase()` çağrısı kurar.
*/

let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;

  client = createClient(env.supabaseUrl, env.supabaseKey, {
    auth: {
      storage: secureStoreAdapter,
      storageKey: AUTH_STORAGE_KEY,
      autoRefreshToken: true,
      persistSession: true,
      // RN'de tarayıcı URL'i yok; magic-link parametresi aramaya kalkması anlamsız.
      detectSessionInUrl: false,
    },
  });

  // Supabase'in Expo rehberi: yenileme sayacı yalnız uygulama ÖNDEYKEN çalışsın — arka planda
  // atılan istek OS tarafından kesilir ve yarım kalmış yenileme oturumu kilitleyebilir.
  const supabase = client;
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      supabase.auth.startAutoRefresh();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  });

  return client;
}
