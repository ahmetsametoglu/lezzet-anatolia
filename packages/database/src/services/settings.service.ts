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

/**
 * Ayar önbelleğinin ömrü, aynı zamanda Ayarlar ekranının operatöre verdiği söz ("en geç 30 saniye içinde her yerde geçerli"); sayı iki
 * yerde yaşasaydı ekran tutulmayan bir söz verirdi. Ayarın kendisi ayardan okunamaz (kendi kendine bağımlılık), o yüzden sabittir.
 */
export const SETTINGS_CACHE_TTL_MS = 30_000;

/**
 * Kapsam önceliği, en özgülden en genele; ilk eşleşen kazanır, hiçbiri yoksa global'e düşülür. Depo en baştadır, çünkü bir depo birden
 * çok bölgeye hizmet eder ve sıra ters olsaydı bölge satırı deponun kendi değerini sessizce ezerdi.
 */
const SCOPE_PRIORITY: readonly SettingScope[] = ['warehouse', 'zone', 'channel', 'country', 'global'];

/**
 * "En dar kazanır"ın istisnası: bu anahtarlarda eşleşen kapsamların en yükseği uygulanır, çünkü satırları rakip değil birlikte
 * karşılanacak koşullardır (kanalın ticari şartı ve bölgenin lojistik tabanı). Bedeli bilinir: eşik dar kapsamda yükseltilebilir ama
 * düşürülemez.
 */
const STRICTEST_WINS: ReadonlySet<string> = new Set(['min_basket_cents']);

/**
 * Okumayı belirli kapsam türleriyle sınırlar ve küresel satır bile sayılmaz: kargo siparişinde lojistik taban yoktur, ama global satır
 * her zaman eşleştiği için kapsam düşürmek operatörün yazdığı eşiği kargoya sessizce uygulardı. Sınır çağrı yerindedir, çünkü hangi
 * kapsamın dinleneceği teslimat yoluna bağlıdır, anahtara değil.
 */
export interface ScopeLimit {
  only?: readonly SettingScope[];
}

/**
 * İşletme ayarı servisi: kesim saati, asgari sepet gibi değerler işin sahibinin kararıdır ve dağıtım beklemeden değişir. Önbellek
 * süreli, çünkü süre sınırlı ve kendi kendini onaran, söylenebilir bir sözleşmedir; yayın (`LISTEN/NOTIFY`) koparsa önbellek bir daha
 * hiç düşmezdi ve bunu kimse fark etmezdi.
 */
export class SettingsService extends BaseDbService<Setting, SettingInsert, SettingUpdate> {
  /** key → o anahtarın TÜM kapsam satırları + okuma anı. Çözüm bellekte, sorgu anahtar başına tek. */
  private static cache = new Map<string, { rows: Setting[]; at: number }>();

  constructor(supabase: SupabaseClient) {
    super(supabase, 'settings', SettingSchema, SettingInsertSchema, SettingUpdateSchema);
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

  /**
   * Sayısal ayar: jsonb'den gelen değer metin olabilir, sayı değilse `fallback`'e düşer. `STRICTEST_WINS` anahtarlarında ilk eşleşen
   * değil eşleşen kapsamların en yükseği döner (gerekçe o sabitte).
   */
  async getNumber(key: string, fallback: number, scope: SettingScopeContext = {}, opts: ScopeLimit = {}): Promise<number> {
    if (STRICTEST_WINS.has(key)) return this.strictestNumber(key, fallback, scope, opts);
    const value = Number(await this.get<unknown>(key, fallback, scope));
    return Number.isFinite(value) ? value : fallback;
  }

  /**
   * Eşleşen tüm kapsamların en katısı; sayıya çevrilemeyen satır sayılmaz, çünkü bozuk değer eşiği sessizce `NaN`'a çevirmemeli. `only`
   * verilirse yalnız o kapsam türleri katılır (gerekçe `ScopeLimit`te).
   */
  private async strictestNumber(
    key: string,
    fallback: number,
    scope: SettingScopeContext,
    opts: ScopeLimit = {},
  ): Promise<number> {
    const rows = await this.rowsFor(key);
    const values: number[] = [];

    for (const scopeType of SCOPE_PRIORITY) {
      if (opts.only && !opts.only.includes(scopeType)) continue;
      const wanted = scopeIdFor(scopeType, scope);
      if (scopeType !== 'global' && !wanted) continue;

      const match = rows.find((row) => row.scopeType === scopeType && (scopeType === 'global' || row.scopeId === wanted));
      if (!match) continue;
      const value = Number(match.value);
      if (Number.isFinite(value)) values.push(value);
    }

    return values.length > 0 ? Math.max(...values) : fallback;
  }

  /**
   * Ayarı yazar ya da günceller; aynı anahtar+kapsam ikinci kez açılmaz. `actorId` opsiyoneldir, çünkü tohum ve iş süreçleri de yazar
   * ve onlara uydurma aktör atamak izi yalana çevirirdi; `null`u ekran "sistem" diye okur.
   */
  async set(
    key: string,
    value: unknown,
    opts: { scopeType?: SettingScope; scopeId?: string | null; description?: string; actorId?: string | null } = {},
  ): Promise<Setting> {
    const scopeType = opts.scopeType ?? 'global';
    const scopeId = scopeType === 'global' ? null : (opts.scopeId ?? null);

    const existing = (await this.rowsFor(key)).find((row) => row.scopeType === scopeType && row.scopeId === scopeId);
    const saved = existing
      ? await this.update({ id: existing.id, value, updatedAt: new Date().toISOString(), updatedBy: opts.actorId ?? null })
      : await this.insert({ key, value, scopeType, scopeId, description: opts.description, updatedBy: opts.actorId ?? null });

    SettingsService.cache.delete(key);
    return saved;
  }

  /** Bir anahtarın tüm kapsam satırları (admin ekranı: "bu ayar nerede eziliyor"). */
  listByKey(key: string): Promise<Setting[]> {
    return this.getAll({ key }, { orderBy: 'scopeType' });
  }

  /**
   * Tüm ayar satırları, Ayarlar ekranının tek okuması; sayfalanmaz, çünkü küme operatörün kurduğu bir sözlüktür ve veriyle büyümez
   * (`CLAUDE.md §1`). Sözlükte olmayan satır da gelir, çünkü çalışan bir değeri göstermeyen yönetim ekranı kendi vaadini delerdi.
   */
  listAll(): Promise<Setting[]> {
    return this.getAll(undefined, { orderBy: 'key' });
  }

  /** Süreç içi önbelleği düşürür — testler ve dış kaynaklı değişiklik sonrası. */
  static invalidate(key?: string): void {
    if (key) SettingsService.cache.delete(key);
    else SettingsService.cache.clear();
  }

  private async rowsFor(key: string): Promise<Setting[]> {
    const cached = SettingsService.cache.get(key);
    // Süresi dolan kayıt yenilenir ve sorgu düşerse hata yukarı gider: sessizce varsayılana düşmek ayarı hiç yazılmamış saymak olurdu
    // (`CLAUDE.md §1`).
    if (cached && Date.now() - cached.at < SETTINGS_CACHE_TTL_MS) return cached.rows;

    const rows = await this.getAll({ key });
    SettingsService.cache.set(key, { rows, at: Date.now() });
    return rows;
  }
}

/** Bağlamdan kapsam kimliğini seçer — kapsam tipi hangi ekseni okuyacağını bilir. */
function scopeIdFor(scopeType: SettingScope, scope: SettingScopeContext): string | null {
  if (scopeType === 'warehouse') return scope.warehouseId ?? null;
  if (scopeType === 'zone') return scope.zoneId ?? null;
  if (scopeType === 'channel') return scope.channel ?? null;
  if (scopeType === 'country') return scope.country ?? null;
  return null;
}
