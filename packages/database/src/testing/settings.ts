import type { SupabaseClient } from '@supabase/supabase-js';
import { SettingsService } from '../services/settings.service';

/**
 * Entegrasyon testlerinin **ayar geri koyma** yardımcısı (CLAUDE.md §4b).
 *
 * `settings` satırları test verisi DEĞİL, küresel tekildir: damgayla (`Date.now()`) ayrılmış
 * satırların aksine bunları tüm suite — ve aynı yerel veritabanını paylaşan başka bir ajan — okur.
 * Bir test `order_cutoff_time`'ı 10:00 yapıp bırakırsa kirlettiği şey kendi dosyası değil, birinin
 * bir sonraki koşusudur. Ortaya çıkan da "hata" değil, **tekrarlanmayan bir düşüş** olur.
 *
 * **Geri koyma OKUNAN değere yapılır, sabite değil.** Testler bunu elle yaparken `finally` içinde
 * varsayılanı yeniden yazıyordu ("16:00'ydı herhalde"); o varsayım migration'daki başlangıç değeri
 * değiştiği gün sessizce yanlışa döner ve ayarı test bozar. Burada ne bulunduysa o geri konur.
 *
 * Yalnız testlerden çağrılır (`@lezzet/database/testing`); paketin kamu API'sinde yer almaz.
 */
export interface SettingsSnapshot {
  /** Ayarı geçici olarak değiştirir; ilk değerini bir kez kaydeder. */
  override(key: string, value: unknown): Promise<void>;
  /** Ayarı geçici olarak KALDIRIR — "ayar hiç tanımlı değilken" hâlini sınayan testler için. */
  remove(key: string): Promise<void>;
  /** Kaydedilen tüm ayarları ilk hâline döndürür — `afterAll` ya da `finally` içinde çağrılır. */
  restore(): Promise<void>;
}

/**
 * Sentinel: **"ayar hiç yoktu" ile "boş dizeydi" ayrı şeylerdir.** İkincisini birincisi sanıp satır
 * yazmak, olmayan bir ayarı var etmek — yani testin kirlettiği şeyi "temizlerken" büyütmek olurdu.
 */
const ABSENT = Symbol('absent');

export function settingsSnapshot(db: SupabaseClient): SettingsSnapshot {
  const service = new SettingsService(db);
  const original = new Map<string, unknown>();

  const capture = async (key: string) => {
    if (!original.has(key)) original.set(key, await service.get<unknown>(key, ABSENT));
  };

  /**
   * Ham silme önbelleği düşürmez (`set` düşürür, `delete` düşürmez): süreç ömrü boyunca yaşayan
   * önbellek, silinmiş bir ayarı hâlâ dolu gösterirdi.
   */
  const drop = async (key: string) => {
    await db.from('settings').delete().eq('key', key).is('scope_id', null);
    SettingsService.invalidate(key);
  };

  return {
    async override(key, value) {
      await capture(key);
      await service.set(key, value);
    },

    async remove(key) {
      await capture(key);
      await drop(key);
    },

    async restore() {
      for (const [key, value] of original) {
        if (value === ABSENT) await drop(key);
        else await service.set(key, value);
      }
      original.clear();
    },
  };
}
