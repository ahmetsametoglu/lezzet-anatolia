import 'server-only';
import { PriceService, ProductService, ProductVariantService, type Db } from '@lezzet/database';
import { autoPriceCents, targetMarginFor } from '@lezzet/domain-core';
import { readCostBasis } from '@lezzet/application';
import type { Channel } from '@lezzet/types';

/**
 * Otomatik fiyatlandırma: `auto_price` açık ürünün fiyatını maliyetten hedef marja çeker; karar motorda (`autoPriceCents`).
 * Mal kabul, diyalog kaydı ve toplu hizalama aynı fonksiyona iner ki üç yol farklı fiyat üretmesin.
 */

// Dışa verilmez: tüketicilerin sorusu "kaç fiyat değişti" — satırın kendisi bu modülün içinde kalır.
interface AutoPriceChange {
  variantId: string;
  channel: Channel;
  /** Önceki fiyat (kuruş). */
  fromCents: number;
  /** Yeni fiyat (kuruş). */
  toCents: number;
}

// Dışa verilmez: çağıranlar iki SAYIYI kullanıyor (kaç değişti, kaç bekliyor), tipin adını değil.
interface RepriceOutcome {
  /** Hedefe çekilen fiyatlar. */
  changes: AutoPriceChange[];
  /**
   * Maliyeti sıçradığı için DOKUNULMAYAN boylar. Sessizce atlamak, otomatik fiyatın sessizce
   * durduğu anlamına gelirdi; sayan çağıran bunu ekranda söyleyebilsin.
   */
  heldVariantIds: string[];
}

const CHANNELS: readonly Channel[] = ['b2c', 'b2b'];

/**
 * Verilen varyantların otomatik fiyatlarını hedefe çeker ve değişenleri döner. Fiyatı olmayan kanal açılmaz, çünkü
 * yokluk "satışa kapalı" demektir; değişmeyen fiyat yazılmaz ki fiyat geçmişi kopyalarla şişmesin.
 */
export async function repriceVariants(db: Db, variantIds: readonly string[]): Promise<RepriceOutcome> {
  const ids = [...new Set(variantIds)];
  if (ids.length === 0) return EMPTY;

  const variants = await new ProductVariantService(db).listByIds(ids);
  if (variants.length === 0) return EMPTY;

  const products = await new ProductService(db).listByIds([...new Set(variants.map((v) => v.productId))]);
  // Yalnız otomatik VE hedefi olan ürünler: hedefsiz otomatik ürün diye bir şey yok (eylem onu
  // zorunlu tutuyor), ama veri elle bozulmuşsa fiyat uydurmak yerine dokunmuyoruz. Hedef kanal
  // başına çözülür (`targetMarginFor`) — burada yalnız "hiç hedef var mı" elenir.
  const autoProducts = new Map(
    products
      .filter((p) => p.autoPrice && (p.targetMarginPercent != null || p.targetMarginB2bPercent != null))
      .map((p) => [p.id, p]),
  );
  const targets = variants.filter((v) => autoProducts.has(v.productId));
  if (targets.length === 0) return EMPTY;

  const targetIds = targets.map((v) => v.id);
  const priceSvc = new PriceService(db);
  const [costs, b2cMap, b2bMap] = await Promise.all([
    readCostBasis(db, targetIds),
    priceSvc.findApplicableMap(targetIds, 'b2c'),
    priceSvc.findApplicableMap(targetIds, 'b2b'),
  ]);
  const currentOf = (channel: Channel) => (channel === 'b2c' ? b2cMap : b2bMap);

  const changes: AutoPriceChange[] = [];
  const held: string[] = [];
  for (const variant of targets) {
    const product = autoProducts.get(variant.productId)!;
    const basis = costs.get(variant.id);
    if (!basis || basis.status === 'unknown') continue; // Maliyetsiz ürün: fiyat uydurulmaz.
    // AYKIRI FRENİ: son alış geçmişten belirgin sapıyorsa fiyat SESSİZCE oynamaz. Gerçek bir zam
    // da olabilir, tek seferlik bir pazarlık da; ikisini ayıran bilgi admin'de (DOMAIN).
    if (basis.status === 'outlier') {
      held.push(variant.id);
      continue;
    }

    for (const channel of CHANNELS) {
      const current = currentOf(channel).get(variant.id)?.channelPrice;
      if (!current) continue;

      // Kanalın kendi hedefi, yoksa ortak hedef; hedefi olmayan kanala dokunulmaz.
      const channelTarget = targetMarginFor(channel, product.targetMarginPercent, product.targetMarginB2bPercent);
      if (channelTarget === null) continue;

      const next = autoPriceCents({
        channel,
        costCents: basis.costCents,
        targetMarginPercent: channelTarget,
        vatRate: product.vatRate,
      });
      const currentCents = current.amountCents;
      if (next === null || next === currentCents) continue;

      await priceSvc.setPrice({ variantId: variant.id, channel, amountCents: next, customerId: null });
      changes.push({ variantId: variant.id, channel, fromCents: currentCents, toCents: next });
    }
  }
  return { changes, heldVariantIds: held };
}

const EMPTY: RepriceOutcome = { changes: [], heldVariantIds: [] };

/** Tek ürünün boyları — fiyat diyaloğunda bayrak/hedef değişince. */
export async function repriceProduct(db: Db, productId: string): Promise<RepriceOutcome> {
  const variants = await new ProductVariantService(db).listByProduct(productId);
  return repriceVariants(
    db,
    variants.map((v) => v.id),
  );
}

/**
 * Katalogdaki tüm otomatik ürünler, elle toplu hizalama için. Sayfalanmaz ama tavanlıdır; aşılırsa çağıran bilir.
 */
const AUTO_REPRICE_LIMIT = 500;

export async function repriceAllAuto(db: Db): Promise<RepriceOutcome & { truncated: boolean }> {
  const products = await new ProductService(db).listAutoPriced(AUTO_REPRICE_LIMIT + 1);
  const truncated = products.length > AUTO_REPRICE_LIMIT;
  const scope = truncated ? products.slice(0, AUTO_REPRICE_LIMIT) : products;

  const variants = await new ProductVariantService(db).listByProducts(scope.map((p) => p.id));
  const outcome = await repriceVariants(
    db,
    variants.map((v) => v.id),
  );
  return { ...outcome, truncated };
}
