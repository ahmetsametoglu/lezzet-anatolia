import { createHash } from 'node:crypto';
import { SettingsService } from '@lezzet/database';
import type { SupabaseClient } from '@supabase/supabase-js';

/*
  GÜNLÜK OTURUM TUZU — İKİ YÜZEYİN ORTAK TEK PARÇASI (24.08 · MB-63).

  ── NEDEN BURAYA TAŞINDI ────────────────────────────────────────────────────
  Tuz `apps/web/lib/analytics/session-key.ts`te doğdu ve orada tek tüketicisi vardı. Native ölçüm
  açılınca ikinci tüketici doğdu (`apps/mobile-api`) ve uygulamalar birbirinden import edemez.
  Kopyalamak seçenek DEĞİLDİ: iki üretici, aynı gün iki farklı tuz üretebilir ve o gün iki yüzeyin
  anahtarları birbiriyle karşılaştırılamaz hâle gelirdi — hata vermeden. Taşındı, KOPYALANMADI;
  web aynı fonksiyonu buradan çağırıyor.

  Web'in `session-key.ts` künyesindeki kararlar AYNEN geçerlidir ve burada tekrarlanmaz; yalnız
  ikisi taşınacak kadar önemli:

  · **Tuz her gün değişir ve eskisi SAKLANMAZ** — üzerine yazılır. Atıldığı an o günün anahtarları
    geri hesaplanamaz, yani defter psödonimden ANONİME döner (GDPR Recital 26).
  · **Sabit bir sırdan TÜRETİLMEZ:** `hash(SIR ‖ gün)` biçiminde bir tuz, sırrı bilen için her günü
    geriye dönük yeniden hesaplanabilir kılardı — "eskisi saklanmıyor" iddiası yalan olurdu.

  Yarış davranışı da aynen korunur: aynı gün iki süreç birden üretirse son yazan kazanır. Kabul
  edilebilir — en kötüsü o günün bir kısım anahtarının bölünmesi; ölçüm gürültülenir, kimlik sızmaz.
  Ters ödünleşme (kilit) en sıcak yola kilit koymak olurdu.
*/

const SALT_KEY = 'analytics_session_salt';

/** Süreç içi önbellek — gün değişene kadar DB'ye gidilmez. */
let saltCache: { day: string; salt: string } | null = null;

/**
 * Günün oturum tuzu. Çağıran kendi istemcisini geçer: web servis istemcisiyle, mobil uç kendi
 * servis istemcisiyle çağırır — paket hangi bağlamda koştuğunu bilmez ve bilmemelidir.
 */
export async function dailySalt(db: SupabaseClient): Promise<string> {
  const day = new Date().toISOString().slice(0, 10);
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
