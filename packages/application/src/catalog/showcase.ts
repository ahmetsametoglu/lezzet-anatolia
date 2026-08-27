import { AnalyticsProductDailyService, ProductListingService, SettingsService, type ProductListingScope } from '@lezzet/database';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Locale } from '@lezzet/i18n';
import type { AnalyticsProductSignal, ProductWithRelations } from '@lezzet/types';

import { EMPTY_PRODUCT_CONTEXT, toProduct } from './map';
import { loadProductContext } from './product-context';
import type { PricingViewer } from './pricing-viewer';
import type { PlaceWarehouses, StorefrontProduct } from './storefront-types';

/*
  VİTRİN SEÇKİSİ — İKİ YÜZEYİN TEK KAYNAĞI (terfi 27.08, kullanıcı kararı).

  ── NEDEN BURADA ────────────────────────────────────────────────────────────
  Kaynağı `apps/web/lib/storefront/home.ts`ti ve native uygulama onu KOPYALAMADI: mobil seçki
  kataloğun `sortOrder` sırasının ilk N'ini alıyordu (`readHomeFeatured`), yani başlığı
  *"Bu haftanın seçkisi"* diyen bir ray ne haftalık ne de seçilmişti. Açık `BEKLEYEN(21.14)` olarak
  aylardır kayıtlıydı; kullanıcı 27.08'de kapatılmasını istedi: *"bu web tarafındaki seçki konusu
  ortak bir yere taşınsın, mobil de bunu kullansın."*

  Kopyalamak seçenek değildi (CLAUDE §1): aynı ölçüt iki yerde yaşasaydı bir gün ayrışır ve aynı
  müşteri iki yüzeyde iki farklı "çok sevilen" listesi görürdü. `server-only` koruması düştü ve
  düşmesi şart — paket taşıma bilmez; kapı zaten `db`yi çağırandan alıyor.

  ── ÖLÇÜT ──────────────────────────────────────────────────────────────────
  Sıralama son N günün **görüntüleme + sepete ekleme** toplamından geliyor
  (`analytics_daily_product`). **Ham deftere DEĞİL günlük özete bağlı** (`ANALYTICS §5`): ham
  defterden okusaydık her açılış ayın tüm bölümünü tarardı ve sayfa her hafta biraz daha yavaşlardı.

  Yedek yalnız **veri birikmemişken** devrede — "en çok sevilen" iddiası ölçüt varken kuruluyor,
  yoksa katalogla doluyor. Bu bir uydurma sıralama değil, ilk gün hâlinin birinci sınıf karşılığı.

  **Seçki bir liste değil, tıklatma davetidir:** sayfalanmaz ama sabit sınırı vardır (`CLAUDE §1`).
*/

/**
 * Seçkinin penceresi (gün). Ayardan gelir — `DOMAIN §6`: eşik/süre kod sabiti değil işletme ayarı.
 *
 * Anahtar BURADA, `settings-keys.ts`'te değil: o dosya yalnız **iki yüzeyde birden** okunan,
 * müşteriye söz veren ayarları toplar (kendi künyesinin kuralı). Bu ayarı okuyan tek yer burası.
 *
 * Varsayılan 7 ve keyfi değil: bandın başlığı *"Bu hafta çok sevilenler"* diyor. Pencere ondan
 * uzun olsaydı ekran haftalık bir vaat verip aylık bir sıralama gösterirdi.
 */
const SHOWCASE_WINDOW_KEY = 'showcase_window_days';
const SHOWCASE_WINDOW_DEFAULT = 7;

/** Yüzey sınır vermezse: web anasayfasının dörtlü ızgarası (tasarımın kendi sayısı). */
export const SHOWCASE_LIMIT_DEFAULT = 4;

/**
 * Sinyal kapısından kaç satır istenir — sınırın katı.
 *
 * Sınırdan fazlası şart: sıralamanın başındaki ürün pasife çekilmiş ya da bu yerde satılamıyor
 * olabilir; tam sınır kadar isteseydik ray eksik kalırdı. Fırsat elemesi açıkken (aşağıdaki
 * `excludeOffers`) pay ayrıca işe yarar: elenen kartların yerini dolduracak satır kalır.
 */
const overfetchFor = (limit: number): number => limit * 5;

export interface ShowcaseOptions {
  /** Kaç kart — yüzeyin tasarımı belirler (web 4 · native 6). */
  limit?: number;
  /**
   * FIRSATLI ürünü seçkiden eler (native uygulamanın kararı, 27.08 · kullanıcı bulgusu).
   *
   * Native vitrinde fırsat şeridi seçkinin hemen ÜSTÜNDE duruyor ve ölçüldü: seçkinin ilk iki
   * kartı şeridin aynı iki ürünüydü. İki ray iki ayrı soru sorar (*"bugün ne ucuz"* ·
   * *"ne öneriyorsunuz"*); aynı cevabı verirlerse ikinci ray bir seçki değil bir yankıdır.
   *
   * Web'de varsayılan KAPALI ve bu bilinçli: eleme bir SUNUM kararıdır, iki yüzeyin bant düzeni
   * aynı değil ve web'in kendi kararı web şeridinindir (not bırakıldı). Ölçüt kartın kendisinde:
   * `wasCents` motorun teklifi kazandırdığının teli.
   */
  excludeOffers?: boolean;
}

/**
 * **Vitrin seçkisi** — anasayfanın "çok sevilenler" bandı, boş sepetin öneri alanı ve native
 * vitrinin seçki rayı AYNI dörtlüyü/altılıyı okur. Ayrı yazılsalardı müşteri her ekranda başka bir
 * "seçki" görürdü.
 */
export async function readShowcase(
  db: SupabaseClient,
  locale: Locale,
  place: PlaceWarehouses,
  viewer: PricingViewer,
  options: ShowcaseOptions = {},
): Promise<StorefrontProduct[]> {
  const limit = options.limit ?? SHOWCASE_LIMIT_DEFAULT;
  const rows = await showcaseRows(db, { warehouseId: place.warehouseId, channel: viewer.channel }, limit, options);
  const context = await loadProductContext(db, rows, place, viewer);
  const products = rows.map((p) => toProduct(p, locale, context.get(p.id) ?? EMPTY_PRODUCT_CONTEXT));
  /* FIRSAT ELEMESİ ANCAK BURADA YAPILABİLİR: `wasCents` bir satır özelliği değil, motorun
     KARARIDIR (teklif normal fiyatı yendi mi) ve o karar `toProduct`ta veriliyor. Bu yüzden
     `showcaseRows` fazladan satır çekiyor — eleme sonrası ray yine dolsun diye. */
  return options.excludeOffers === true ? products.filter((p) => p.wasCents === undefined).slice(0, limit) : products;
}

/**
 * Seçkinin ürün satırları: önce ölçüt, eksik kalırsa katalogla tamamlanır.
 *
 * **Kaynak `product_listing` görünümü** (08.46, 24.08), ham `product` tablosu değil: bant kartlarda
 * FİYAT gösteriyor ve kanalında satılamayan ürün orada fiyatsız bir kart olarak çiziliyordu.
 *
 * Süzgeç okuma SONRASINDA olamazdı — `similar`/`family`den ayrılan yer burası: bant sabit sayıda
 * kart ister (`topUp`) ve elemeyi sonradan yapsaydık bant eksilirdi. *"Eksik bir band, tasarımın
 * ızgarasını bozar"* kuralı; süzgeç kaynağa taşınınca `topUp` yeniden doldurabiliyor.
 */
async function showcaseRows(
  db: SupabaseClient,
  scope: ProductListingScope,
  limit: number,
  options: ShowcaseOptions,
): Promise<ProductWithRelations[]> {
  const products = new ProductListingService(db);
  /* Fırsat elemesi açıkken hedef büyütülür: elenecek kartların yerini dolduracak satır kalsın.
     Kaç fırsat olduğu önden bilinemez (karar motorda), o yüzden pay sabit bir KATTIR. */
  const target = options.excludeOffers === true ? limit * 3 : limit;
  const overfetch = overfetchFor(target);
  const ranked = await rankedProductIds(db, overfetch);
  if (!ranked.length) {
    // **İlk gün hâli birinci sınıf:** sinyal birikmeden band boş kalmaz, katalogla dolar. Bu bir
    // uydurma sıralama değil — "en çok sevilen" iddiası yalnız ölçüt varken kuruluyor.
    return (await products.list({ filters: { status: 'active' }, limit: target, ...scope })).rows;
  }

  const page = await products.list({ filters: { ids: ranked, status: 'active' }, limit: overfetch, ...scope });
  const picked = orderByRank(page.rows, ranked);
  if (picked.length >= target) return picked.slice(0, target);

  // Ölçütü olan ürünlerin bir kısmı pasifleşmişse band yine dolmak ister: kalanı katalogdan.
  // Eksik bir band, tasarımın ızgarasını bozar ve müşteriye "bir şeyler eksik" dedirtir.
  const filler = await products.list({ filters: { status: 'active' }, limit: target + picked.length, ...scope });
  return topUp(picked, filler.rows, target);
}

/**
 * Satırları ÖLÇÜT sırasına dizer — servisin döndürdüğü sıra veritabanınındır, seçkinin değil.
 *
 * Sıralamada olmayan satır sona düşer (`Infinity`): kapı yalnız `ranked` içindeki kimlikleri
 * istedi, yine de savunmacı — bir gün süzgeç genişlerse seçki sessizce rastgele sıralanmasın.
 */
export function orderByRank<T extends { id: string }>(rows: readonly T[], ranked: readonly string[]): T[] {
  const order = new Map(ranked.map((id, index) => [id, index]));
  return [...rows].sort((a, b) => (order.get(a.id) ?? Infinity) - (order.get(b.id) ?? Infinity));
}

/** Eksik kalan bandı tamamlar — zaten seçilmiş ürün ikinci kez girmez. */
export function topUp<T extends { id: string }>(picked: readonly T[], filler: readonly T[], limit: number): T[] {
  const seen = new Set(picked.map((p) => p.id));
  return [...picked, ...filler.filter((p) => !seen.has(p.id))].slice(0, limit);
}

/**
 * Sinyalleri seçkinin ölçütüne göre sıralar: **görüntüleme + sepete ekleme.**
 *
 * Sepete ekleme görüntülemeden daha güçlü bir "sevme" beyanıdır ama ayrı ağırlık VERİLMEDİ: ağırlık
 * seçmek, ölçüsü olmayan bir katsayıyı ekrana yansıtmak olurdu. Toplam yeterince dürüst — ve
 * değiştirmek gerekirse tek satır.
 */
export function rankSignals(signals: readonly AnalyticsProductSignal[]): string[] {
  return signals
    .slice()
    .sort((a, b) => b.viewCount + b.cartCount - (a.viewCount + a.cartCount))
    .map((s) => s.productId);
}

/**
 * Ölçüte göre sıralı ürün kimlikleri; sinyal yoksa boş dizi.
 *
 * **Kesme ile sıralama aynı ölçüt değil ve bu bilinçli:** kapı ilk N'i SQL'de görüntülemeye göre
 * kesiyor (`STACK §13` — türetilmiş oran uygulamada toplanamaz), biz elimizdeki satırı
 * `görüntüleme + sepete ekleme` ile yeniden sıralıyoruz. Yani "az bakılıp çok sepete atılan" bir
 * ürün, ilk N'e giremiyorsa seçkiye de giremez. Yaklaşıklık kabul edilebilir: seçkinin sorusu
 * "kim çok isteniyor", en ince ölçüm değil.
 *
 * **Ölçüm düşerse seçki de düşmez:** hata yutulur ve yedek devreye girer (`CLAUDE §1` — sessiz
 * catch yok, gerekçe burada). Analitik bir yan üründür; vitrinin açılmasını engelleyemez.
 */
async function rankedProductIds(db: SupabaseClient, overfetch: number): Promise<string[]> {
  try {
    const days = await new SettingsService(db).getNumber(SHOWCASE_WINDOW_KEY, SHOWCASE_WINDOW_DEFAULT);
    const to = new Date();
    const from = new Date(to.getTime() - days * 24 * 60 * 60 * 1000);
    return rankSignals(await new AnalyticsProductDailyService(db).signals(day(from), day(to), overfetch));
  } catch {
    // Sinyal okunamadı (tablo yok, RPC düştü): seçki yedeğe düşer, müşteri farkı görmez.
    return [];
  }
}

const day = (value: Date): string => value.toISOString().slice(0, 10);
