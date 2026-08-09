/**
 * Karma sepet kararı (19.3) — DOMAIN §17 / C8. **Her kalem hangi yoldan gider?**
 *
 * ── YOLU STOK BELİRLER, MÜŞTERİ SEÇMEZ ───────────────────────────────────────
 * Müşterinin kendi deposunda BULUNAN her şey — kargolanabilir olsa bile — rota siparişiyle
 * araçtan gider: ücretsiz kapı teslimi varken paralı kargo seçtirmek ikinci bir karar noktası
 * açar ve karşılığı yoktur. Kendi deposunda OLMAYAN kargolanabilir ürün engellenmez; "kargoyla
 * gönderilir" işaretiyle satılır ve AYRI ÖDEMELİ ayrı bir kargo siparişine gider.
 *
 * İki checkout = iki sipariş = iki ödeme. Bu, "bir sipariş tek depodan çıkar" (K5) kuralının
 * bozulması değil KORUNMASIDIR: sipariş bölünmüyor, ikinci bir sipariş doğuyor. Para modeli
 * ("her ödeme bir siparişe") hiç değişmiyor.
 *
 * ── SOĞUK ZİNCİR ASLA DEPO DEĞİŞTİRMEZ ───────────────────────────────────────
 * `shippable: false` ürün kargoya çıkamaz (DOMAIN §6). Kendi deposunda yoksa cevabı "tükendi"dir —
 * kargo dolgusu ona açılmaz.
 *
 * ── "BURADA SATILMIYOR" ≠ "ŞU AN TÜKENDİ" ────────────────────────────────────
 * İkisi ayrı sonuçtur ve ekranda ayrı cümlelerdir: ilki kalıcı bir durumdur (başka bir yol öner),
 * ikincisi geçicidir (sonra tekrar dene). Tek bir "yok" mesajına indirgemek müşteriyi bekletir.
 *
 * Saf: stok sayılarını çağıran getirir, karar burada verilir.
 */
import type { CartLineRoute } from '@lezzet/types';

export interface CartLineInput {
  variantId: string;
  qty: number;
  /** Kargoyla gönderilebilir mi (`Product.shippable`) — soğuk zincir ürünlerde false. */
  shippable: boolean;
  /** Müşterinin deposunda kullanılabilir miktar. */
  localAvailable: number;
  /** Kargo deposunda kullanılabilir miktar. Kargo deposu yoksa 0 verilir. */
  shippingAvailable: number;
}

/**
 * Kalemin yolu — dört hâl, künyeleri tanımın yanında (`CartLineRouteEnum`, `@lezzet/types`).
 *
 * **Tanım burada DEĞİL, türetiliyor** (`StockStatus`un aynı yolu): mobil sözleşme şeması aynı
 * birliği zod olarak ifade etmek zorunda ve iki ayrı tanım bir gün ayrışırdı. Motorun dış API'si
 * değişmiyor — çağıran `CartLineRoute`u yine buradan alır.
 */
export type { CartLineRoute };

export interface CartLineDecision {
  variantId: string;
  route: CartLineRoute;
  /** Bu yoldan karşılanabilecek miktar — istenen kadar olmayabilir (kısmi). */
  fulfillableQty: number;
}

export interface CartWarehouseDecision {
  lines: readonly CartLineDecision[];
  /** Rota siparişine girecek kalemler. Boşsa rota checkout'u hiç açılmaz. */
  localLines: readonly CartLineDecision[];
  /** Ayrı kargo siparişine girecek kalemler. Boşsa ikinci checkout yok. */
  shippingLines: readonly CartLineDecision[];
  /**
   * Sepetin tamamı yerel-dışıysa true: salt-kargo siparişi KENDİLİĞİNDEN doğar, müşteriye
   * "iki sipariş vereceksiniz" denmez — verilecek tek sipariş vardır.
   */
  shippingOnly: boolean;
}

/**
 * Sepeti müşterinin deposuna göre değerlendirir.
 *
 * Kısmi karşılama korunur: 5 istenen üründen 3'ü yereldeyse satır `local`'dir ve 3 karşılanır —
 * kalan 2 için ikinci bir yol AÇILMAZ. Aynı kalemi iki siparişe bölmek, müşteriye tek bir ürün
 * için iki ödeme yaptırmak demektir; kabul edilebilir sınır kalem düzeyindedir, adet düzeyinde
 * değil.
 */
export function decideCartAgainstWarehouse(lines: readonly CartLineInput[]): CartWarehouseDecision {
  const decisions = lines.map((line): CartLineDecision => {
    if (line.localAvailable > 0) {
      return { variantId: line.variantId, route: 'local', fulfillableQty: Math.min(line.qty, line.localAvailable) };
    }
    if (!line.shippable) {
      // Soğuk zincir: yerelde yoksa yol yok. Kargo dolgusu bu ürün için hiç açılmaz.
      return { variantId: line.variantId, route: 'not_shippable_here', fulfillableQty: 0 };
    }
    if (line.shippingAvailable > 0) {
      return { variantId: line.variantId, route: 'shipping', fulfillableQty: Math.min(line.qty, line.shippingAvailable) };
    }
    // İki depoda da yok: "tükendi" demenin tek meşru hâli (C3).
    return { variantId: line.variantId, route: 'unavailable', fulfillableQty: 0 };
  });

  const localLines = decisions.filter((d) => d.route === 'local');
  const shippingLines = decisions.filter((d) => d.route === 'shipping');

  return {
    lines: decisions,
    localLines,
    shippingLines,
    shippingOnly: localLines.length === 0 && shippingLines.length > 0,
  };
}
