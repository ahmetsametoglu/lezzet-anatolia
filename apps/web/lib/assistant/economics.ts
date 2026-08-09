import 'server-only';
import { PriceService, ProductService, ProductVariantService, StockService, serviceDb } from '@lezzet/database';
import { markupPercent } from '@lezzet/domain-core';
import { removeVat } from '@lezzet/helper';
import type { AssistantProposal } from '@lezzet/types';

/**
 * ÖNERİNİN KÂRLILIĞI (22.7) — operasyon şeridinin talebi, harici denetimin bulgusuyla doğdu.
 *
 * ── NEDEN GEREKTİ ───────────────────────────────────────────────────────────
 * Harici bir MCP ajanı kârlılık hesabı yapıp **zararına bir paket** önerdi (maliyet 6,10 € · fiyat
 * 5,90 €) ve bunu "SKT'si yaklaşan malı eritme stratejisi" diye gerekçelendirdi. Öneri kuyruğa
 * düştü ve **ekran bunu söylemiyordu**: paket önizlemesi kalemleri, payları ve mutabakat rozetini
 * gösteriyor, maliyeti hiç göstermiyordu. Yani patron zararına bir paketi, zararına olduğunu
 * görmeden onaylayabilirdi.
 *
 * ── İKİ SAYI, ÇÜNKÜ İKİSİ AYRI ŞEY SÖYLER ───────────────────────────────────
 * Payload'daki fiyat **önerinin dayandığı gerçek**, buradaki maliyet **şu anki gerçek**. Ayrıştıkları
 * an bu başlı başına bir uyarıdır: öneri kurulduktan sonra alış fiyatı ya da liste değişmiş
 * demektir ve patron kararı eski gerçeğe göre veriyordur. Ekran ayrışmayı SÖYLER, sessizce
 * güncelini göstermez (operasyon şeridiyle mutabık, 09.08).
 *
 * ── KDV: ÇIKARMADAN ÖNCE AYNI TABANA ────────────────────────────────────────
 * Liste ve paket fiyatı b2c'dir, yani **KDV DAHİL**; alış maliyeti **HARİÇ**. İkisini doğrudan
 * çıkarmak marjı KDV oranı kadar şişirir — %5,5'te bile bu, zararı kâr gibi gösterebilecek bir
 * fark. Çevrim `removeVat` ile ve kalem başına kendi oranıyla yapılır (aynı pakette %5,5 ve %10
 * kalemler bir arada olabilir).
 *
 * ── BİLİNMEYEN MALİYET `null`, SIFIR DEĞİL ──────────────────────────────────
 * Alışı hiç girilmemiş varyantta maliyet `null` döner ve toplam da `null` olur (`CLAUDE §1`).
 * Sıfır yazsaydık ekran **"%100 kâr"** gösterirdi — en tehlikeli yanlış, çünkü ikna edicidir.
 */

/** Kalem başına kâr künyesi — paket önizlemesinin satırı. */
export interface EconomicsLine {
  productName: string;
  qty: number;
  /** Liste fiyatı, KDV DAHİL (b2c). `null` = bu varyantın kanal fiyatı yok. */
  listPriceCents: number | null;
  /** Son alış, KDV HARİÇ. `null` = hiç alış kaydı yok — sıfır değil. */
  costCents: number | null;
  vatRate: number;
}

/** Öneriye özel kâr blokları. `null` = bu tipte kârlılık kavramı yok ya da hesaplanamadı. */
export type ProposalEconomics =
  | {
      kind: 'bundle';
      lines: EconomicsLine[];
      /** Paket fiyatı KDV DAHİL (payload'dan) ve HARİÇ karşılığı — kalem oranlarıyla ağırlıklı. */
      priceCents: number;
      priceHtCents: number | null;
      costTotalCents: number | null;
      marginCents: number | null;
      marginPercent: number | null;
    }
  | {
      kind: 'offer';
      offerPriceCents: number;
      listPriceCents: number | null;
      costCents: number | null;
      /** Teklifin KDV hariç karşılığı — maliyetle aynı tabanda. */
      offerHtCents: number | null;
      marginCents: number | null;
      marginPercent: number | null;
    };

/**
 * Önerinin kâr künyesini kurar. Yalnız iki tip için anlamlı (`bundle_draft` · `batch_offer`);
 * ötekilerde `null` döner ve ekran o bloğu hiç çizmez.
 *
 * **Kuyruk okumasında satır satır çağrılmaz** — çağıran, sayfadaki bütün satırları toplayıp tek
 * turda sorabilsin diye tek öneri alır ama sorguları paralel atar. Kuyruk tavanı 50 satır ve bu
 * blok yalnız iki tipte doluyor; N+1 riski küçük ve ölçülebilir kaldı.
 */
export async function economicsOf(proposal: AssistantProposal): Promise<ProposalEconomics | null> {
  if (proposal.kind === 'bundle_draft') return bundleEconomics(proposal.payload);
  if (proposal.kind === 'batch_offer') return offerEconomics(proposal.payload);
  return null;
}

async function bundleEconomics(raw: unknown): Promise<ProposalEconomics | null> {
  const payload = raw as { items?: Array<{ variantId?: string; productName?: string; qty?: number }>; totalPrice?: number };
  const items = Array.isArray(payload.items) ? payload.items : [];
  const priceCents = typeof payload.totalPrice === 'number' ? Math.round(payload.totalPrice * 100) : null;
  if (items.length === 0 || priceCents === null) return null;

  const variantIds = items.flatMap((i) => (typeof i.variantId === 'string' ? [i.variantId] : []));
  const { costByVariant, vatByVariant, listByVariant } = await marketOf(variantIds);

  const lines: EconomicsLine[] = items.map((item) => ({
    productName: item.productName ?? '—',
    qty: typeof item.qty === 'number' ? item.qty : 1,
    listPriceCents: item.variantId ? (listByVariant.get(item.variantId) ?? null) : null,
    costCents: item.variantId ? (costByVariant.get(item.variantId) ?? null) : null,
    vatRate: (item.variantId ? vatByVariant.get(item.variantId) : undefined) ?? 5.5,
  }));

  // Bir kalemin maliyeti bile bilinmiyorsa TOPLAM uydurulmaz: eksik veriyi 0 saymak paketi
  // olduğundan kârlı gösterirdi (`amountCentsOf`un mal kabul kuralının aynısı).
  const costTotalCents = lines.some((l) => l.costCents === null)
    ? null
    : lines.reduce((sum, l) => sum + (l.costCents ?? 0) * l.qty, 0);

  // Paket fiyatının KDV hariç karşılığı: kalemlerin liste değerine göre ağırlıklı. Tek oran
  // varsaymak, karışık KDV'li bir pakette marjı sessizce kaydırırdı.
  const priceHtCents = weightedHt(priceCents, lines);
  const marginCents = costTotalCents !== null && priceHtCents !== null ? priceHtCents - costTotalCents : null;

  return {
    kind: 'bundle',
    lines,
    priceCents,
    priceHtCents,
    costTotalCents,
    marginCents,
    marginPercent: costTotalCents !== null && priceHtCents !== null ? markupPercent(priceHtCents, costTotalCents) : null,
  };
}

async function offerEconomics(raw: unknown): Promise<ProposalEconomics | null> {
  const payload = raw as { variantId?: string; offerPriceCents?: number; listPriceCents?: number | null };
  if (typeof payload.variantId !== 'string' || typeof payload.offerPriceCents !== 'number') return null;

  const { costByVariant, vatByVariant, listByVariant } = await marketOf([payload.variantId]);
  const costCents = costByVariant.get(payload.variantId) ?? null;
  const vatRate = vatByVariant.get(payload.variantId) ?? 5.5;
  const offerHtCents = removeVat(payload.offerPriceCents, vatRate);
  const marginCents = costCents === null ? null : offerHtCents - costCents;

  return {
    kind: 'offer',
    offerPriceCents: payload.offerPriceCents,
    // Payload'daki liste ÖNERİ ANININKİ; buradaki ŞU ANKİ. Ayrışma ekranın söyleyeceği bir şey.
    listPriceCents: listByVariant.get(payload.variantId) ?? payload.listPriceCents ?? null,
    costCents,
    offerHtCents,
    marginCents,
    marginPercent: costCents === null ? null : markupPercent(offerHtCents, costCents),
  };
}

/** Varyantların ŞU ANKİ piyasa künyesi: son alış · KDV oranı · liste fiyatı. */
async function marketOf(variantIds: string[]) {
  const empty = { costByVariant: new Map<string, number>(), vatByVariant: new Map<string, number>(), listByVariant: new Map<string, number>() };
  if (variantIds.length === 0) return empty;

  const db = serviceDb();
  const [variants, batches, priceMap] = await Promise.all([
    new ProductVariantService(db).listByIds(variantIds),
    new StockService(db).listInStockDetailed(variantIds),
    new PriceService(db).findApplicableMap(variantIds, 'b2c'),
  ]);

  const products = await new ProductService(db).listByIds([...new Set(variants.map((v) => v.productId))]);
  const vatByProduct = new Map(products.map((p) => [p.id, Number(p.vatRate)]));

  const costByVariant = new Map<string, number>();
  // Son alış = en YENİ parti. Ortalama bilerek değil: paket fiyatı bugünkü yenileme maliyetine
  // göre kurulur, geçmişin ortalamasına göre değil (`catalog_lookup` ile aynı kural).
  for (const b of [...batches].sort((a, z) => a.createdAt.localeCompare(z.createdAt))) {
    if (b.purchasePriceCents !== null) costByVariant.set(b.variantId, b.purchasePriceCents);
  }

  return {
    costByVariant,
    vatByVariant: new Map(variants.map((v) => [v.id, vatByProduct.get(v.productId) ?? 5.5])),
    listByVariant: new Map(
      variants.flatMap((v) => {
        const amount = priceMap.get(v.id)?.channelPrice?.amountCents;
        return typeof amount === 'number' ? [[v.id, amount] as const] : [];
      }),
    ),
  };
}

/**
 * Paket fiyatının KDV hariç karşılığı — kalemlerin LİSTE değerine göre ağırlıklı.
 *
 * Liste fiyatı bilinmeyen kalem varsa ağırlık kurulamaz; o zaman kalemlerin oranları eşitse tek
 * oran, değilse `null`. Uydurma bir ortalama, marjı sessizce kaydıran türden bir hatadır.
 */
function weightedHt(priceCents: number, lines: EconomicsLine[]): number | null {
  const rates = [...new Set(lines.map((l) => l.vatRate))];
  if (rates.length === 1) return removeVat(priceCents, rates[0]!);

  const weights = lines.map((l) => (l.listPriceCents ?? 0) * l.qty);
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0 || lines.some((l) => l.listPriceCents === null)) return null;

  const blended = lines.reduce((sum, l, i) => sum + l.vatRate * (weights[i]! / total), 0);
  return removeVat(priceCents, blended);
}
