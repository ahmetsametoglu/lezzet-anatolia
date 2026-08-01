import type { WarehouseContext } from './context';

/**
 * TABLO depo süzgeci (19.5) — bağlamın İÇİNDE daraltma.
 *
 * **`server-only` DEĞİL, bilerek:** URL anahtarı ve seçenek tipi süzgeç çipinin de sözleşmesidir ve
 * o çip bir istemci komponentidir. Sunucuya bağlı okuma (`readWarehouseLabels`) bu yüzden burada
 * değil `context.ts`'te durur — ikisi aynı dosyada olsaydı `server-only` bütün ekran şeridini
 * derlenemez hâle getirirdi (fiilen yaşandı).
 *
 * Bağlam ("hangi evrende çalışıyorum") çerezde yaşar ve URL'e yazılmaz; süzgeç ("bu listede şu an
 * neye bakıyorum") URL'de yaşar ve paylaşılabilir. İkisi aynı eksende ama farklı katmandadır —
 * sözleşme `design/pages/operasyon-depo-ekseni.md §2`.
 *
 * Türetme BURADA, sayfalarda değil: aynı beş kuralı (süzgeç ne zaman var, ne zaman düşer, kod nasıl
 * çözülür) her ekranın kendi başına yazması, birinin bir kuralı atlamasıyla biterdi.
 */

/** URL anahtarı — süzgeç adreste taşınır (kural 6). Değeri depo KODUdur, kimliği değil. */
export const WAREHOUSE_PARAM = 'depo';

/** Seçicide/süzgeçte görünen depo — `Warehouse`'un ekranın ihtiyaç duyduğu üç alanı. */
interface WarehouseOption {
  id: string;
  code: string;
  name: string;
}

interface WarehouseFilter {
  /**
   * Satır listesine geçilecek süzgeç: **bağlam ∩ tablo süzgeci**.
   *
   * ⚠ Sayaçlara bu DEĞİL, bağlamın kendi `warehouseIds`'i geçer (kural 5): sekme sayıları ve özet
   * kartlar bağlam evreninin gerçeğidir, tablo süzgeci yalnız satırları daraltır. İkisi aynı
   * süzgeci alsaydı "süzülüyor" ibaresi yalan söylerdi — sayı da satırla birlikte düşerdi ve
   * operatör iş yükünü olduğundan az görürdü.
   */
  warehouseIds: readonly string[] | undefined;
  /** Süzgeç uygulandıysa hangi depo — çip etiketi ve "süzülüyor" şeridi bunu yazar. */
  active: WarehouseOption | null;
  /**
   * Adresten gelen ama uygulanamayan kod (kural 7). Bağlam üstündür: paylaşılan bir bağlantı
   * alıcının evreninin dışını gösteremez. Sessizce düşmez — ekran kısaca söyler.
   */
  dropped: string | null;
  /**
   * Süzgeç kontrolü çizilir mi (kural 2). Bağlam tek depoya inince süzgecin işi yoktur: tek
   * elemanlı bir evrende daraltacak bir şey kalmaz.
   */
  available: boolean;
  /** Seçenekler kapsamdan türer (kural 8) — kapsam dışı depo burada YOKTUR. */
  options: WarehouseOption[];
}

/**
 * Bağlam + adres → süzgeç.
 *
 * Kod (uuid değil) taşınmasının iki sebebi var: paylaşılan bağlantı okunabilir kalır (`?depo=STR`),
 * ve kapsam dışı bir kod geldiğinde onu KULLANICIYA GERİ YAZABİLİRİZ — kimlik olsaydı adını
 * söylemek için kapsam dışı bir satırı okumak gerekirdi.
 */
export function warehouseFilterOf(ctx: WarehouseContext, rawCode: string): WarehouseFilter {
  const options = ctx.warehouses.map(toOption);
  // Bağlam tek depodayken süzgeç YOKTUR; adresten gelen kod da uygulanmaz.
  const available = ctx.activeWarehouseId === null && options.length > 1;
  const code = rawCode.trim().toUpperCase();

  if (!code) return { warehouseIds: ctx.warehouseIds, active: null, dropped: null, available, options };

  if (!available) {
    // Tek depolu bağlamda gelen kod: kendi deposuysa gürültü (sessizce yok sayılır), başkasıysa
    // kullanıcı gerçekten başka bir evrenin bağlantısını açmıştır ve bunu bilmeli.
    const own = ctx.warehouses.find((w) => w.id === ctx.activeWarehouseId);
    const dropped = own && own.code === code ? null : code;
    return { warehouseIds: ctx.warehouseIds, active: null, dropped, available, options };
  }

  const match = options.find((o) => o.code === code) ?? null;
  return {
    warehouseIds: match ? [match.id] : ctx.warehouseIds,
    active: match,
    dropped: match ? null : code,
    available,
    options,
  };
}

function toOption(w: { id: string; code: string; name: string }): WarehouseOption {
  return { id: w.id, code: w.code, name: w.name };
}
