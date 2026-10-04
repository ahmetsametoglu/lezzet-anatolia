import { createHash } from 'node:crypto';
import { SettingsService } from '@lezzet/database';
import { parisDateOf } from '@lezzet/helper';
import type { SupabaseClient } from '@supabase/supabase-js';

/*
  Günlük oturum tuzu web ile mobil ucun tek kaynağıdır, ki iki yüzeyin aynı günkü anahtarları karşılaştırılabilsin. Tuz her gün değişir,
  eskisi saklanmaz ve sabit bir sırdan türetilmez; böylece defter psödonimden anonime döner (ayrıntı web `session-key.ts`).
*/

const SALT_KEY = 'analytics_session_salt';

/** Süreç içi önbellek — gün değişene kadar DB'ye gidilmez. */
let saltCache: { day: string; salt: string } | null = null;

/**
 * Günün oturum tuzu. Çağıran kendi istemcisini geçer: web servis istemcisiyle, mobil uç kendi
 * servis istemcisiyle çağırır — paket hangi bağlamda koştuğunu bilmez ve bilmemelidir.
 */
export async function dailySalt(db: SupabaseClient): Promise<string> {
  // Gün, günlük özetle aynı Paris günüdür; tuz o günün sınırında döner.
  const day = parisDateOf(new Date());
  if (saltCache?.day === day) return saltCache.salt;

  const settings = new SettingsService(db);
  const stored = await settings.get<{ day?: string; salt?: string }>(SALT_KEY, {});
  if (stored.day === day && stored.salt) {
    saltCache = { day, salt: stored.salt };
    return stored.salt;
  }

  const salt = createHash('sha256').update(`${day}:${Math.random()}:${process.hrtime.bigint()}`).digest('hex');
  await settings.set(SALT_KEY, { day, salt }, { description: 'Analitik oturum tuzu — günlük döner, eskisi saklanmaz.' });
  saltCache = { day, salt };
  return salt;
}
