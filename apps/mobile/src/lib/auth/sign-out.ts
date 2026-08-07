import { getSupabase } from './supabase';
import { clearStoredSession } from './session-store';

/**
 * Çıkış — `scope: 'local'`: bu cihazın oturumu kapanır (refresh token'ın sunucuda küresel iptali
 * ayrı ürün kararı; "tüm cihazlardan çıkış" gelirse buradan tek satırla döner). Supabase temizliği
 * ağdan bağımsız denenir, depo HER durumda elle de boşaltılır — çıkış asla yarım kalmaz.
 */
export async function signOut(): Promise<{ error: string | null }> {
  const { error } = await getSupabase().auth.signOut({ scope: 'local' });
  await clearStoredSession();
  return { error: error?.message ?? null };
}
