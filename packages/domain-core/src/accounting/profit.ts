import { fromCents, toCents } from '@lezzet/helper';
import type { Channel, OrderSale } from '@lezzet/types';
import { buildExportRow } from './export';
import { lineNetCents, type AccountingLine } from './line';

/**
 * Kârlılık (12.6) — DOMAIN §12. **İki ayrı kavram, ayrı hesaplanır ve karıştırılmaz:**
 *
 * - **Ürün/sipariş kârlılığı = katkı payı.** Yalnız siparişin DOĞRUDAN giderleri düşülür (COGS,
 *   teslimat, komisyon, paketleme). Genel gider karışmaz — karışsaydı "bu ürünü satmalı mıyım"
 *   sorusu kiranın büyüklüğüne göre cevap değiştirirdi.
 * - **Şirket kârlılığı = tam P&L.** Katkı paylarının toplamından genel gider BİR KEZ düşülür,
 *   ürünlere dağıtılmaz.
 *
 * **Kâr HT üstünden hesaplanır** (`line.ts`): KDV ciro değildir, devlet adına tahsil edilir.
 *
 * **Eksik maliyet 0 sayılmaz.** Kapanmamış siparişin maliyet kalemleri henüz sabitlenmemiştir;
 * onları 0 sayarsak kâr şişer. Böyle satırlar kârdan DIŞLANIR ama sayı ve ciroyla raporda görünür
 * (DOMAIN §13'ün paket marjındaki kuralın aynısı).
 */

/** Siparişin doğrudan gider kalemleri — kapanışta SABİTLENİR (snapshot). */
export interface DirectCosts {
  cogs: number;
  delivery: number;
  paymentFee: number;
  packaging: number;
}

export interface OrderContribution {
  orderId: string;
  saleDate: string;
  channel: Channel;
  /** Patron ikramı da kârda sayılır — parayı patron öder (DOMAIN §9). Yalnız export'a girmez. */
  isGiftOrder: boolean;
  /** KDV hariç ciro — kalemler + kargo. */
  revenue: number;
  costs: DirectCosts;
  /** `revenue − doğrudan giderler`. Maliyet sabitlenmemişse `null`. */
  contribution: number | null;
  /** Katkı payının ciroya oranı (%). Ciro 0 ya da maliyet eksikse `null`. */
  marginPct: number | null;
  /**
   * Maliyet kalemleri kapanışta sabitlendi mi. `false` = sipariş henüz `completed` değil; kâr
   * hesaplanmaz, ciro raporda "fiyatlanmamış" olarak durur.
   */
  costsFixed: boolean;
}

export interface VariantProfit {
  variantId: string;
  /** Satılan (teslim edilen) adet. */
  qty: number;
  /** KDV hariç kalem cirosu — kargo GİRMEZ: kargo siparişin gideridir, ürünün değil. */
  revenue: number;
  cogs: number;
  /** `revenue − cogs` — ürünün brüt marjı. */
  grossProfit: number;
  /** Dönemde bu üründen fire olan adet (imha/hasar/sayım farkı). */
  lossQty: number;
  lossCost: number;
  /** **Fire düşülmüş net marj** — "bu üründen ne kazandım" değil, "ne kaldı" (DOMAIN §12). */
  netProfit: number;
  marginPct: number | null;
}

export interface ChannelProfit {
  channel: Channel;
  orderCount: number;
  revenue: number;
  directCosts: number;
  contribution: number;
  marginPct: number | null;
}

export interface CompanyProfit {
  from: string;
  to: string;
  /** KDV hariç toplam ciro (fiyatlanmış siparişler). */
  revenue: number;
  directCosts: number;
  /** Katkı payı — genel gider DÜŞÜLMEDEN. */
  contribution: number;
  /** Fire (StockAdjustment) maliyeti — ürün kârının içinde değil, şirket seviyesinde bir kez. */
  lossCost: number;
  /** Genel gider: kira, maaş, akaryakıt, reklam… (`expense` hareketleri). */
  overhead: number;
  /** `contribution − lossCost − overhead`. */
  netProfit: number;
  orderCount: number;
  /**
   * Maliyeti henüz sabitlenmemiş siparişler — kâra girmez ama **görünür**: sessiz dışlansaydı
   * dönemin cirosu ile rapordaki ciro arasındaki fark açıklanamaz kalırdı.
   */
  unpricedCount: number;
  unpricedRevenue: number;
  byChannel: ChannelProfit[];
}

/** Yüzde marj — ciro 0 ise `null`; sıfıra bölmek yerine "hesaplanamaz" demek dürüsttür. */
function marj(contributionCents: number, revenueCents: number): number | null {
  if (revenueCents === 0) return null;
  return Math.round((contributionCents / revenueCents) * 1000) / 10;
}

/**
 * Siparişin KDV hariç cirosu (cent) — kalemler + kargo.
 *
 * **Export satırının HT'si ile AYNI hesaptır, çünkü aynı fonksiyondan gelir.** Kargonun KDV oranı
 * malın oranını izler ve bu kural tek yerde (export satırı) yaşar. Burada ikinci bir formül
 * yazsaydık aynı siparişin cirosu muhasebe dosyasında başka, kâr raporunda başka çıkardı — ve
 * hangisinin doğru olduğu tartışılırdı.
 */
function revenueCents(sale: OrderSale, items: readonly AccountingLine[]): number {
  return toCents(buildExportRow(sale, items).net);
}

/**
 * Bir siparişin katkı payı. Maliyetler **kapanışta sabitlenmiş snapshot'lardır** — geçmiş kârın
 * rakamı sonradan değişen oran/birim maliyetten etkilenmesin (fiyat sabitlemeyle aynı mantık).
 */
export function orderContribution(sale: OrderSale, items: readonly AccountingLine[]): OrderContribution {
  const ciro = revenueCents(sale, items);
  // `cogs_amount` kapanışta yazılır; null ise sipariş teslim edilmiş ama kapanmamıştır.
  const costsFixed = sale.cogsAmount !== null;

  const costs: DirectCosts = {
    cogs: sale.cogsAmount ?? 0,
    delivery: sale.deliveryCost ?? 0,
    paymentFee: sale.paymentFee ?? 0,
    packaging: sale.packagingCost ?? 0,
  };
  const giderCents = toCents(costs.cogs) + toCents(costs.delivery) + toCents(costs.paymentFee) + toCents(costs.packaging);
  const katkiCents = ciro - giderCents;

  return {
    orderId: sale.id,
    saleDate: sale.saleDate,
    channel: sale.channel,
    isGiftOrder: sale.isGiftOrder,
    revenue: fromCents(ciro),
    costs,
    contribution: costsFixed ? fromCents(katkiCents) : null,
    marginPct: costsFixed ? marj(katkiCents, ciro) : null,
    costsFixed,
  };
}

/** Bir varyantın dönemdeki fire kaydı — `StockAdjustmentService.lossSummary` çıktısı. */
export interface VariantLoss {
  variantId: string;
  qty: number;
  costCents: number;
}

/** Satılan kalem + o kalemin GERÇEK maliyeti (fiilen çıkan partilerin alışı, cent). */
export interface SoldLine {
  variantId: string;
  item: AccountingLine;
  /** `OrderItemBatch` × `Stock.purchase_price`. Parti kaydı yoksa `null` — 0 DEĞİL. */
  costCents: number | null;
  zeroRated?: boolean;
}

/**
 * Ürün (varyant) kârlılığı — **fire düşülmüş net marj** (DOMAIN §12).
 *
 * Kargo/komisyon/paketleme BURAYA GİRMEZ: onlar siparişin gideridir, ürünün değil. Ürüne
 * dağıtsaydık "iki kalemlik siparişte gelen ürün kârlı, tek kalemlikte gelen kârsız" gibi
 * anlamsız bir tablo çıkardı.
 *
 * **Maliyeti bilinmeyen kalem cirosuyla birlikte DIŞLANIR** (`costCents === null`): eksiği 0 saymak
 * marjı şişirir.
 */
export function variantProfit(lines: readonly SoldLine[], losses: readonly VariantLoss[] = []): VariantProfit[] {
  const kova = new Map<string, { qty: number; revenue: number; cogs: number }>();

  for (const line of lines) {
    if (line.costCents === null) continue;
    const mevcut = kova.get(line.variantId) ?? { qty: 0, revenue: 0, cogs: 0 };
    mevcut.qty += line.item.fulfilledQty;
    mevcut.revenue += lineNetCents(line.item, line.zeroRated ?? false);
    mevcut.cogs += line.costCents;
    kova.set(line.variantId, mevcut);
  }

  // Fire, satışı olmayan üründe de raporlanır: hiç satılmadan çöpe giden mal en pahalı olandır.
  for (const loss of losses) {
    if (!kova.has(loss.variantId)) kova.set(loss.variantId, { qty: 0, revenue: 0, cogs: 0 });
  }

  const fire = new Map(losses.map((l) => [l.variantId, l]));

  return [...kova.entries()]
    .map(([variantId, t]) => {
      const kayip = fire.get(variantId);
      const brut = t.revenue - t.cogs;
      const net = brut - (kayip?.costCents ?? 0);
      return {
        variantId,
        qty: t.qty,
        revenue: fromCents(t.revenue),
        cogs: fromCents(t.cogs),
        grossProfit: fromCents(brut),
        lossQty: kayip?.qty ?? 0,
        lossCost: fromCents(kayip?.costCents ?? 0),
        netProfit: fromCents(net),
        marginPct: marj(net, t.revenue),
      };
    })
    .sort((a, b) => b.netProfit - a.netProfit);
}

/**
 * Şirket kârlılığı — tam P&L. Katkı paylarının toplamından **fire** ve **genel gider** birer kez
 * düşülür.
 *
 * **Stok alımı (`purchase`) genel gidere GİRMEZ:** malın maliyeti satıldığı anda COGS olarak zaten
 * düşülüyor. İkisini de saysaydık aynı parayı iki kez gider yazar, kârı olduğundan düşük
 * gösterirdik — ve depoda bekleyen mal, satılmadan şirketi zarara sokmuş görünürdü.
 */
export function companyProfit(
  period: { from: string; to: string },
  contributions: readonly OrderContribution[],
  input: { lossCost: number; overhead: number },
): CompanyProfit {
  const fiyatli = contributions.filter((c) => c.costsFixed);
  const fiyatsiz = contributions.filter((c) => !c.costsFixed);

  const ciroCents = fiyatli.reduce((s, c) => s + toCents(c.revenue), 0);
  const giderCents = fiyatli.reduce(
    (s, c) => s + toCents(c.costs.cogs) + toCents(c.costs.delivery) + toCents(c.costs.paymentFee) + toCents(c.costs.packaging),
    0,
  );
  const katkiCents = ciroCents - giderCents;
  const fireCents = toCents(input.lossCost);
  const genelCents = toCents(input.overhead);

  const kanallar = new Map<Channel, { orderCount: number; revenue: number; costs: number }>();
  for (const c of fiyatli) {
    const mevcut = kanallar.get(c.channel) ?? { orderCount: 0, revenue: 0, costs: 0 };
    mevcut.orderCount += 1;
    mevcut.revenue += toCents(c.revenue);
    mevcut.costs += toCents(c.costs.cogs) + toCents(c.costs.delivery) + toCents(c.costs.paymentFee) + toCents(c.costs.packaging);
    kanallar.set(c.channel, mevcut);
  }

  return {
    from: period.from,
    to: period.to,
    revenue: fromCents(ciroCents),
    directCosts: fromCents(giderCents),
    contribution: fromCents(katkiCents),
    lossCost: fromCents(fireCents),
    overhead: fromCents(genelCents),
    netProfit: fromCents(katkiCents - fireCents - genelCents),
    orderCount: fiyatli.length,
    unpricedCount: fiyatsiz.length,
    unpricedRevenue: fromCents(fiyatsiz.reduce((s, c) => s + toCents(c.revenue), 0)),
    byChannel: [...kanallar.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([channel, t]) => ({
        channel,
        orderCount: t.orderCount,
        revenue: fromCents(t.revenue),
        directCosts: fromCents(t.costs),
        contribution: fromCents(t.revenue - t.costs),
        marginPct: marj(t.revenue - t.costs, t.revenue),
      })),
  };
}
