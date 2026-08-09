import type { CartLineRoute } from './cart-warehouse';

/**
 * **Paketin yol kararı** (19.22) — `decideCartAgainstWarehouse`'un paket ikizi.
 *
 * ── NEDEN AYRI BİR MOTOR ─────────────────────────────────────────────────────
 * Varyant motoru kalem başına karar verir; paket ise **bölünemez**. "Paketi ikiye böl" diye bir şey
 * yok (`DOMAIN §13`, K5): paket bütün olarak TEK depodan gider. Yani kalemlerini varyant motoruna
 * tek tek versek üç kalemli bir paket için üç ayrı yol çıkardı ve hiçbiri paketin cevabı olmazdı.
 *
 * ── KULLANICI KARARI 08.08: "ÜRÜNLE AYNI KURAL" ──────────────────────────────
 * Karma sepet kuralı (C8) paketin BÜTÜNÜNE uygulanır:
 *   · tüm kalemler müşterinin deposunda yeterliyse            → rota (`local`)
 *   · değilse, paket kargolanabilirse VE tüm kalemler kargo
 *     deposunda yeterliyse                                    → kargo (`shipping`)
 *   · paket kargolanamıyorsa (bir kalem bile soğuk zincir)    → `not_shippable_here`
 *   · hiçbir havuz tam takım veremiyorsa                      → `unavailable`
 *
 * Sıra varyant motorunun sırasıyla birebir aynı ve bu bilinçli: yerel önce (ücretsiz kapı teslimi
 * varken paralı kargo seçtirmek ikinci bir karar noktası açar), sonra soğuk zincir kapısı, sonra
 * kargo. İki motor farklı sıralasaydı aynı sepette ürün ile paket birbirine ters cevap verirdi.
 *
 * ── "TAM TAKIM" ÖLÇÜSÜ: EN ZAYIF KALEM ───────────────────────────────────────
 * Bir havuzdan kaç paket çıkacağı `min⌊mevcut ÷ kalem-adedi⌋`'dir. Bölme ŞART, çıkarma değil: iki
 * "Bayram Sofrası" iki kat malzeme demektir (`expandToOrderItems` da `item.qty * line.qty` yazıyor).
 * Kalem adedini yok sayıp "var mı" diye baksaydık, 2 baklava kalan stokta 3 paket satılabilirdi.
 *
 * ── KISMİ KARŞILAMA VARYANTTAKİYLE AYNI ──────────────────────────────────────
 * 5 paket istenip 2 yapılabiliyorsa yol yine `local`'dir ve 2 karşılanır; kalan 3 için ikinci bir
 * yol AÇILMAZ. Aynı paketi iki siparişe bölmek, müşteriye tek bir şey için iki ödeme yaptırmaktır.
 *
 * ── SAF ──────────────────────────────────────────────────────────────────────
 * Stok sayılarını çağıran getirir. Bu dosya DB bilmez (`STACK §4`).
 */

export interface BundleItemInput {
  variantId: string;
  /** Paketin BİR adedinde bu kalemden kaç tane var (`bundle_item.qty`). */
  qty: number;
  /** Müşterinin deposunda kullanılabilir miktar. */
  localAvailable: number;
  /** Kargo deposunda kullanılabilir miktar. Kargo deposu yoksa 0 verilir. */
  shippingAvailable: number;
}

export interface BundleDecisionInput {
  items: readonly BundleItemInput[];
  /** Sepette istenen PAKET adedi. */
  qty: number;
  /**
   * Paketin tamamı kargolanabilir mi — **bir kalem bile soğuk zincirse false** (`inRouteOnly`).
   * Kural paketin kendisinde değil kalemlerinde yaşıyor ve çağıran onu zaten türetiyor (05.5);
   * burada yeniden hesaplamak aynı kuralın ikinci nüshası olurdu.
   */
  shippable: boolean;
}

export interface BundleDecision {
  route: CartLineRoute;
  /**
   * Seçilen havuzdan **kaç PAKET** yapılabilir (istenen adetten bağımsız tavan).
   *
   * `fulfillableQty` bu soruyu cevaplayamaz: o `min(istenen, tavan)` — 2 isteyip 2 bulan satır ile
   * 5 isteyip 2 bulan satır aynı sayıyı üretir, "tavana dayandım mı" ondan okunamaz. Olumsuz
   * yollarda 0.
   */
  maxBundles: number;
  /** Bu yoldan karşılanabilecek paket adedi — istenen kadar olmayabilir (kısmi). */
  fulfillableQty: number;
}

/** Bir havuzdan kaç paket çıkar — en zayıf kalem belirler. */
function bundlesFrom(items: readonly BundleItemInput[], pool: (item: BundleItemInput) => number): number {
  let cap = Number.POSITIVE_INFINITY;
  for (const item of items) {
    // Adedi 0 (ya da bozuk) olan kalem tavanı SONSUZ yapardı — paket o kalemden bağımsızmış gibi
    // davranırdı. Veri hatası sessizce "sınırsız stok"a çevrilmemeli: paket satılamaz sayılır.
    if (item.qty <= 0) return 0;
    cap = Math.min(cap, Math.floor(pool(item) / item.qty));
    if (cap === 0) return 0;
  }
  return Number.isFinite(cap) ? cap : 0;
}

export function decideBundleAgainstWarehouse(input: BundleDecisionInput): BundleDecision {
  // Kalemsiz paket satılamaz. `listSellable` bunu zaten eliyor; burada savunma amaçlı — boş kümede
  // `min` sonsuz döner ve paket "sınırsız stokta" görünürdü.
  if (input.items.length === 0) return { route: 'unavailable', maxBundles: 0, fulfillableQty: 0 };

  const localCap = bundlesFrom(input.items, (i) => i.localAvailable);
  if (localCap > 0) {
    return { route: 'local', maxBundles: localCap, fulfillableQty: Math.min(input.qty, localCap) };
  }

  // Soğuk zincir: yerelde tam takım yoksa yol yok. Kargo havuzuna hiç bakılmaz — bakılsaydı
  // "kargoyla gelir" diyen bir cevap üretir, sonra taşıyıcı onu taşıyamazdı.
  if (!input.shippable) return { route: 'not_shippable_here', maxBundles: 0, fulfillableQty: 0 };

  const shippingCap = bundlesFrom(input.items, (i) => i.shippingAvailable);
  if (shippingCap > 0) {
    return { route: 'shipping', maxBundles: shippingCap, fulfillableQty: Math.min(input.qty, shippingCap) };
  }

  // Hiçbir havuz tam takım veremiyor: "tükendi" demenin tek meşru hâli (C3).
  return { route: 'unavailable', maxBundles: 0, fulfillableQty: 0 };
}
