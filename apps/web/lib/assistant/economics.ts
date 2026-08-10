import 'server-only';
import {
  PriceService,
  ProductService,
  ProductVariantService,
  StockService,
  SupplierProductService,
  WarehouseService,
  serviceDb,
} from '@lezzet/database';
import { bundleEconomics as bundleEngine, markupPercent } from '@lezzet/domain-core';
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
  /**
   * Öneride kaleme ATANAN birim fiyat, KDV DAHİL. Liste fiyatından ayrı: paket indirimi burada
   * yaşar. `null` = dilekçe payı taşımıyor (o zaman motor çağrılamaz, marj hesaplanamaz).
   */
  allocatedUnitPriceCents: number | null;
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
      /** Dilekçedeki paket fiyatı, KDV DAHİL. */
      priceCents: number;
      /**
       * Kalem paylarının toplamı (KDV dahil). `priceCents`ten AYRI tutuluyor: mutabakat kuralı
       * servis kapısında koşuyor, öneri aşamasında değil — ikisi ayrışabilir ve ekran bunu söyler.
       */
      allocatedTotalCents: number | null;
      /** KDV hariç satış — motor her kalemi KENDİ oranıyla indirdi (ortalama oran DEĞİL). */
      priceHtCents: number | null;
      costTotalCents: number | null;
      marginCents: number | null;
      marginPercent: number | null;
      /** Maliyeti bilinmeyen kalem sayısı — ekran neyin eksik olduğunu söyleyebilsin. */
      unknownCostLines: number;
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
      /**
       * Ürünün KDV oranı (YÜZDE — `product.vat_rate` ile aynı birim).
       *
       * **Künyeye 22.8'de eklendi ve gerekçesi kuyruğun içinde DÜZENLEMEye geçmesi:** buradaki
       * `marginCents` öneri fiyatına göre hesaplanmış SABİT bir sayı; operatör fiyatı kartın içinde
       * değiştirdiği an marj yeniden hesaplanmalı ve bu KDV oranı olmadan yapılamaz. Orandan geriye
       * türetmek (`offerPrice / offerHt`) tam sayı kuruşlarda kayıplı: 1,40 / 1,33 → %5,26 çıkar,
       * gerçeği %5,5'tir — ve o fark doğrudan marja yazılırdı.
       *
       * Zaten burada okunuyor (`vatByVariant`), yani yeni bir sorgu değil; künyeye taşınan mevcut
       * bir değer.
       */
      vatRate: number;
    }
  | {
      /**
       * TEDARİK SİPARİŞİ — dilekçenin taşımadığı iki şey BUGÜNKÜ kayıttan (22.11).
       *
       * ── NEDEN PAYLOAD YETMİYOR ────────────────────────────────────────────
       * `warehouseCode` ve satır fiyatları dilekçeye 22.11'de eklendi; kuyrukta onlardan ÖNCE
       * yazılmış öneriler var ve kart onlarda "—" ile "14 kalemde fiyat yok" gösteriyordu. Oysa
       * ikisi de biliniyor: depo `warehouse` kaydında, fiyat `supplier_product`ta. Bilinen bir
       * şeyi "bilinmiyor" diye göstermek, eksikliği önerinin kusuru gibi okutur.
       *
       * ── BUGÜNKÜ FİYAT ZATEN DAHA DOĞRU ────────────────────────────────────
       * `batch_offer`daki ayrımın aynısı: payload önerinin dayandığı gerçeği taşır, buradaki değer
       * BUGÜNKÜ. Sipariş üç gün kuyrukta beklediyse onay anında geçerli olan fiyat budur — kart
       * ikisini de görüyor ve bugünküyü tercih ediyor.
       */
      kind: 'supply';
      /** Deponun kodu (`STR` · `KEHL`); depo kaydı silinmişse `null`. */
      warehouseCode: string | null;
      /**
       * Varyant → bu TEDARİKÇİDEN son alış (cent, KDV hariç). Eşlemesi olmayan varyant listede yok
       * — sıfır yazmak, bedava mal ısmarlamak gibi okunurdu (`CLAUDE §1`).
       *
       * `Map` değil düz nesne: künye istemciye serileşerek gidiyor.
       */
      unitCostByVariant: Record<string, number>;
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
  if (proposal.kind === 'purchase_order') return supplyEconomics(proposal.payload);
  return null;
}

/** Tedarik siparişinin bugünkü künyesi: deponun kodu + tedarikçinin son alış fiyatları. */
async function supplyEconomics(raw: unknown): Promise<ProposalEconomics | null> {
  const payload = raw as { warehouseId?: string; supplierId?: string | null; lines?: Array<{ variantId?: string }> };
  const lines = Array.isArray(payload.lines) ? payload.lines : [];
  if (lines.length === 0) return null;

  const db = serviceDb();
  const wanted = new Set(lines.flatMap((l) => (typeof l.variantId === 'string' ? [l.variantId] : [])));
  const [warehouse, catalog] = await Promise.all([
    payload.warehouseId ? new WarehouseService(db).getById(payload.warehouseId) : Promise.resolve(null),
    // Tedarikçinin TÜM kataloğu tek sorguda; satır başına sorgu on dört kalemde on dört gidiş dönüş.
    payload.supplierId ? new SupplierProductService(db).listBySupplier(payload.supplierId) : Promise.resolve([]),
  ]);

  const unitCostByVariant: Record<string, number> = {};
  for (const item of catalog) {
    if (item.lastPurchasePriceCents !== null && wanted.has(item.variantId)) {
      unitCostByVariant[item.variantId] = item.lastPurchasePriceCents;
    }
  }

  return { kind: 'supply', warehouseCode: warehouse?.code ?? null, unitCostByVariant };
}

async function bundleEconomics(raw: unknown): Promise<ProposalEconomics | null> {
  const payload = raw as {
    items?: Array<{ variantId?: string; productName?: string; qty?: number; allocatedUnitPrice?: number }>;
    totalPrice?: number;
  };
  const items = Array.isArray(payload.items) ? payload.items : [];
  const priceCents = typeof payload.totalPrice === 'number' ? Math.round(payload.totalPrice * 100) : null;
  if (items.length === 0 || priceCents === null) return null;

  const variantIds = items.flatMap((i) => (typeof i.variantId === 'string' ? [i.variantId] : []));
  const { costByVariant, vatByVariant, listByVariant } = await marketOf(variantIds);

  const lines: EconomicsLine[] = items.map((item) => ({
    productName: item.productName ?? '—',
    qty: typeof item.qty === 'number' ? item.qty : 1,
    allocatedUnitPriceCents: typeof item.allocatedUnitPrice === 'number' ? Math.round(item.allocatedUnitPrice * 100) : null,
    listPriceCents: item.variantId ? (listByVariant.get(item.variantId) ?? null) : null,
    costCents: item.variantId ? (costByVariant.get(item.variantId) ?? null) : null,
    vatRate: (item.variantId ? vatByVariant.get(item.variantId) : undefined) ?? 5.5,
  }));

  // ── HESAP MOTORUN, BURASI YALNIZ VERİYİ TOPLAR (denetim K3-2, 10.08) ────────
  // Bu blok bir tur kendi KDV indirimini yapıyordu: paket fiyatını kalemlerin AĞIRLIKLI ORTALAMA
  // oranıyla bölüyordu. Motor (`domain-core/pricing/bundleEconomics`) ise kalem kalem indiriyor ve
  // **doğru olan o**: ortalama oranla bölmek karışık KDV'li pakette marjı sistematik olarak DÜŞÜK
  // gösterir (ölçüldü: %5,5+%20 karışımında %18,27 ↔ gerçek %18,73). Uygulama iş kuralını kendi
  // hesaplayamaz, motora sorar (CLAUDE §1).
  const engine =
    lines.every((l) => l.allocatedUnitPriceCents !== null) && lines.length > 0
      ? bundleEngine(
          lines.map((l) => ({
            qty: l.qty,
            allocatedUnitPriceCents: l.allocatedUnitPriceCents!,
            vatRate: l.vatRate,
            unitCostCents: l.costCents,
          })),
        )
      : null;

  // Payların toplamı paket fiyatını tutmayabilir — mutabakat kuralı servis KAPISINDA koşuyor,
  // öneri aşamasında değil. Ayrışmayı ekran söyler; sessizce birini ötekinin yerine koymayız.
  const allocatedTotalCents = engine?.revenueTtcCents ?? null;

  return {
    kind: 'bundle',
    lines,
    priceCents,
    allocatedTotalCents,
    priceHtCents: engine?.revenueHtCents ?? null,
    costTotalCents: engine?.costCents ?? null,
    marginCents: engine?.profitCents ?? null,
    marginPercent: engine?.marginPercent ?? null,
    unknownCostLines: engine?.unknownCostLines ?? lines.filter((l) => l.costCents === null).length,
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
    vatRate,
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
