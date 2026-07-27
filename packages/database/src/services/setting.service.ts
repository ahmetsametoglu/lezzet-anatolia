import type { SupabaseClient } from '@supabase/supabase-js';
import {
  SettingSchema,
  SettingInsertSchema,
  SettingUpdateSchema,
  type Setting,
  type SettingInsert,
  type SettingScope,
  type SettingScopeContext,
  type SettingUpdate,
} from '@lezzet/types';
import { BaseDbService } from '../core/base.service';

/** Özgüllük sırası: en dar kapsam kazanır, hiçbiri yoksa global'e düşülür. */
const SCOPE_PRIORITY: readonly SettingScope[] = ['zone', 'channel', 'country', 'global'];

/**
 * İşletme ayarı servisi (02.6) — DATA_MODEL "Setting", STACK §10.
 *
 * **Ayar env'e/koda gömülmez.** Kesim saati, minimum sepet, kapıda ödeme tavanı gibi değerler işin
 * sahibinin kararıdır; dağıtım beklemeden değişebilmelidir.
 *
 * **Önbellekli:** ayarlar her istekte okunur ama neredeyse hiç değişmez; her checkout için tur
 * atmak gereksizdir. Önbellek süreç ömrü boyunca yaşar, yazma anında düşer (`invalidate`).
 * Süreç içi olduğu için çok instance'ta gecikmeli yayılır — ayar değişimi saniyeler içinde her
 * yere ulaşmak zorunda değil, `apps/backend` de tek instance (STACK §13).
 */
export class SettingService extends BaseDbService<Setting, SettingInsert, SettingUpdate> {
  /** key → o anahtarın TÜM kapsam satırları. Çözüm bellekte yapılır, sorgu anahtar başına tek. */
  private static cache = new Map<string, Setting[]>();

  constructor(supabase: SupabaseClient) {
    super(supabase, 'setting', SettingSchema, SettingInsertSchema, SettingUpdateSchema);
  }

  /**
   * Anahtarın **bağlama göre** değeri. En özgül kapsam kazanır (bölge → kanal → ülke → global);
   * hiç satır yoksa `fallback` döner — çağıran koda sabit yazmaz, çağrı yerinde varsayılanı bildirir.
   */
  async get<T>(key: string, fallback: T, scope: SettingScopeContext = {}): Promise<T> {
    const rows = await this.rowsFor(key);
    if (rows.length === 0) return fallback;

    for (const scopeType of SCOPE_PRIORITY) {
      const wanted = scopeIdFor(scopeType, scope);
      if (scopeType !== 'global' && !wanted) continue;

      const match = rows.find((row) => row.scopeType === scopeType && (scopeType === 'global' || row.scopeId === wanted));
      if (match) return match.value as T;
    }
    return fallback;
  }

  /** Sayısal ayar — jsonb'den gelen değer metin olabilir; sayı değilse `fallback`'e düşer. */
  async getNumber(key: string, fallback: number, scope: SettingScopeContext = {}): Promise<number> {
    const value = Number(await this.get<unknown>(key, fallback, scope));
    return Number.isFinite(value) ? value : fallback;
  }

  /** Ayarı yazar/günceller (admin ekranı). Aynı anahtar+kapsam ikinci kez açılmaz — üzerine yazılır. */
  async set(key: string, value: unknown, opts: { scopeType?: SettingScope; scopeId?: string | null; description?: string } = {}): Promise<Setting> {
    const scopeType = opts.scopeType ?? 'global';
    const scopeId = scopeType === 'global' ? null : (opts.scopeId ?? null);

    const existing = (await this.rowsFor(key)).find((row) => row.scopeType === scopeType && row.scopeId === scopeId);
    const saved = existing
      ? await this.update({ id: existing.id, value, updatedAt: new Date().toISOString() })
      : await this.insert({ key, value, scopeType, scopeId, description: opts.description });

    SettingService.cache.delete(key);
    return saved;
  }

  /** Bir anahtarın tüm kapsam satırları (admin ekranı: "bu ayar nerede eziliyor"). */
  listByKey(key: string): Promise<Setting[]> {
    return this.getAll({ key }, { orderBy: 'scopeType' });
  }

  /** Süreç içi önbelleği düşürür — testler ve dış kaynaklı değişiklik sonrası. */
  static invalidate(key?: string): void {
    if (key) SettingService.cache.delete(key);
    else SettingService.cache.clear();
  }

  private async rowsFor(key: string): Promise<Setting[]> {
    const cached = SettingService.cache.get(key);
    if (cached) return cached;

    const rows = await this.getAll({ key });
    SettingService.cache.set(key, rows);
    return rows;
  }
}

/** Bağlamdan kapsam kimliğini seçer — kapsam tipi hangi ekseni okuyacağını bilir. */
function scopeIdFor(scopeType: SettingScope, scope: SettingScopeContext): string | null {
  if (scopeType === 'zone') return scope.zoneId ?? null;
  if (scopeType === 'channel') return scope.channel ?? null;
  if (scopeType === 'country') return scope.country ?? null;
  return null;
}
