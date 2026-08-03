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
 * Ayar önbelleğinin ÖMRÜ — aynı zamanda ekranın operatöre verebileceği SÖZ.
 *
 * Dışa açık, çünkü Ayarlar ekranı bu sayıyı yazacak ("değişiklik en geç 30 saniye içinde tüm
 * süreçlerde geçerli olur"). Sayı iki yerde ayrı yaşasaydı ekran bir gün tutulmayan bir söz verirdi.
 *
 * 30 sn: ayarlar sıcak yolda okunuyor (checkout), yani süre başına anahtar başına iki sorgu — ihmal
 * edilebilir; ve operatörün kaydedip etkisini görmek için beklediği süre bir sayfa yenilemesi
 * kadar. Ayarın kendisi ayardan okunamaz (kendi kendine bağımlılık), o yüzden sabit.
 */
export const SETTINGS_CACHE_TTL_MS = 30_000;

/** Özgüllük sırası: en dar kapsam kazanır, hiçbiri yoksa global'e düşülür. */
/**
 * Kapsam önceliği — **en özgülden en genele.** İlk eşleşen kazanır.
 *
 * `warehouse` EN BAŞTA (03.08): depo, bir ayarın farklılaşabileceği en dar eksendir ve bölgeden de
 * dardır — bir bölge tek bir depoya bağlıdır ama bir depo birden çok bölgeye hizmet eder. Sıra ters
 * olsaydı bölge satırı depo satırını ezerdi ve "bu deponun paketleme maliyeti" hiçbir zaman
 * uygulanmazdı; operatör değeri girer, sistem yok sayardı — sessizce.
 *
 * `country` en sonda (global'den önce): ülke bir kapsam eksenidir ama en geniş olanıdır.
 */
const SCOPE_PRIORITY: readonly SettingScope[] = ['warehouse', 'zone', 'channel', 'country', 'global'];

/**
 * İşletme ayarı servisi (02.6) — DATA_MODEL "Setting", STACK §10.
 *
 * **Ayar env'e/koda gömülmez.** Kesim saati, minimum sepet, kapıda ödeme tavanı gibi değerler işin
 * sahibinin kararıdır; dağıtım beklemeden değişebilmelidir.
 *
 * **Önbellekli, ve önbellek SÜRELİ.** Ayarlar her istekte okunur ama neredeyse hiç değişmez; her
 * checkout için tur atmak gereksizdir.
 *
 * ── SÜRE NEDEN ŞART (operasyon şeridinin bulgusu, 02.08) ─────────────────────
 * Önceki hâlde önbellek süreç ömrü boyunca yaşıyordu ve yalnız `set()` düşürüyordu — yani yalnız
 * YAZAN sürecinki. Buradaki künye bunu "çok instance'ta gecikmeli yayılır" diye anlatıyordu ve
 * **o cümle yanlıştı**: gecikme değil, hiç yayılmama. Operatör Ayarlar ekranından bir değeri
 * değiştirir, ekran "kaydedildi" der, kararı veren öteki süreç bir sonraki dağıtıma kadar eski
 * değeri okurdu. Ayar ekranının var olma sebebi tam da bunun tersi.
 *
 * ── NEDEN TTL, NEDEN `LISTEN/NOTIFY` DEĞİL ───────────────────────────────────
 * Yayın (notify) anında yansıtır ama bir kalıcı bağlantı ister: PostgREST `LISTEN` bilmez, yani ya
 * doğrudan `pg` bağlantısı ya Realtime aboneliği gerekir. İkisi de yeni bir arıza yüzeyi getirir ve
 * o arıza SESSİZDİR — abonelik koparsa önbellek bir daha hiç düşmez, üstelik çalışırken anında
 * yansıdığı için kimse süreyi izlemez. TTL sınırlıdır, kendi kendini onarır, bağımlılık istemez.
 *
 * Ve asıl fark şu: TTL **söylenebilir bir sözleşmedir.** Ekran "değişiklik en geç N saniye içinde
 * her yerde geçerli olur" diye yazabilir; yayın kurulumunda söylenebilecek şey "genelde anında,
 * bozulursa bilinmiyor"dur — belirsiz bir vaat, yanlış bir vaatten kötüdür.
 *
 * Yazan süreç beklemez: `set()` kendi kopyasını hemen düşürür. Süre yalnız ÖTEKİ süreçler için.
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

  /** Sayısal ayar — jsonb'den gelen değer metin olabilir; sayı değilse `fallback`'e düşer. */
  async getNumber(key: string, fallback: number, scope: SettingScopeContext = {}): Promise<number> {
    const value = Number(await this.get<unknown>(key, fallback, scope));
    return Number.isFinite(value) ? value : fallback;
  }

  /**
   * Ayarı yazar/günceller (admin ekranı). Aynı anahtar+kapsam ikinci kez açılmaz — üzerine yazılır.
   *
   * `actorId` — değişikliğin izini bırakan alan (09.16). **Opsiyonel, çünkü her yazan bir insan
   * değil:** tohum/göç ve iş süreçleri de ayar yazabilir ve onlara uydurma bir aktör atamak, izi
   * güvenilir sanılan bir yalana çevirirdi. Verilmediğinde alan `null` kalır ve ekran bunu "sistem"
   * diye okur — "bilinmiyor" diye değil.
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
   * TÜM ayar satırları — Ayarlar ekranının (09.16) tek okuması.
   *
   * **Sayfalanmaz ve bu ölçülü bir karar** (`CLAUDE.md §1`): küme veriyle büyümez, operatörün elle
   * kurduğu bir sözlüktür ve doğal tavanı vardır — anahtar sayısı kadar, kapsam satırlarıyla birkaç
   * katı. Sipariş ya da stok gibi sınırsız büyüyen bir küme değil.
   *
   * İki gerçek bedeli kapatıyor (operasyon şeridinin talebi, 03.08): ekran sözlükteki 27 anahtar
   * için 27 ayrı sorgu atıyordu, ve — daha önemlisi — **sözlükte olmayan bir satır ekranda hiç
   * görünmüyordu.** Elle açılmış ya da sözlüğe henüz eklenmemiş bir ayarın sistemde çalışan bir
   * değeri olabilir; yönetim ekranının onu göstermemesi, "ayarı buradan yönetiyorum" vaadini deler.
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
    // Süresi dolan kayıt SİLİNMEZ, yenilenir: silmek ile yenilemek arasındaki fark, aradaki
    // sorgu düşerse eski değerin mi yoksa `fallback`'in mi kullanılacağıdır. Burada yenileme
    // atılıyor ve hata yukarı gidiyor — sessizce varsayılana düşmek, ayarı hiç yazmamış gibi
    // davranmak olurdu (`CLAUDE.md §1`: ölçülemeyen değer sıfır değildir).
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
