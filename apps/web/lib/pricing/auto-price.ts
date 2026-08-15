import 'server-only';
import { PriceService, ProductService, ProductVariantService, type Db } from '@lezzet/database';
import { autoPriceCents, targetMarginFor } from '@lezzet/domain-core';
import { readCostBasis } from './cost-basis';
import type { Channel } from '@lezzet/types';

/**
 * OTOMATİK FİYATLANDIRMANIN KABLOSU (DOMAIN §"Maliyet ve hedef marj", 09.5).
 *
 * `Product.auto_price` bir bayraktı: açınca ekran fiyat alanlarını kilitliyor, hedef marjı zorunlu
 * kılıyordu — ama fiyatı hedefe göre güncelleyen hiçbir şey yoktu. Sonuç, sözün TERSİydi: otomatik
 * açmak fiyatı otomatikleştirmiyor, donduruyordu. Bu modül o boşluğu kapatır.
 *
 * Katman: **uygulama** (STACK §4). Karar motorda (`domain-core/autoPriceCents`), satırlar
 * `database`'te; ikisini burası buluşturur. Hesabın bir satırı bile burada tekrarlanmaz.
 *
 * ÜÇ TETİK, TEK YOL: maliyet değişimi (mal kabul), bayrak/hedef değişimi (fiyat diyaloğu) ve elle
 * toplu hizalama aynı fonksiyona iner — üçü ayrı yazılsaydı biri diğerinden farklı fiyat üretirdi.
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
 * Verilen varyantların otomatik fiyatlarını hedefe çeker; **değişen** satırları döndürür.
 *
 * İki sessiz kural:
 * - **Fiyatı olmayan kanal AÇILMAZ.** Fiyat satırının yokluğu "o kanalda satışa kapalı" demektir
 *   (bkz. `tightestMargin`); otomatik fiyat kapalı bir kanalı kendiliğinden açsaydı ürün, kimsenin
 *   kararı olmadan toptan listesine düşerdi.
 * - **Değişmeyen fiyat YAZILMAZ.** `setPrice` her çağrıda yeni satır ekler (fiyat geçmişi); her mal
 *   kabulde aynı tutarı tekrar yazmak geçmişi anlamsız kopyalarla şişirirdi.
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

      // Kanalın KENDİ hedefi (15.08): B2B'ye özel hedef varsa o, yoksa ortak. Hedefi olmayan
      // kanala dokunulmaz — yalnız B2B hedefi girilmiş üründe B2C fiyatı elle kalır.
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
 * Katalogdaki TÜM otomatik ürünler — elle toplu hizalama.
 *
 * Neden gerekli: diğer iki tetik olaya bağlıdır (mal kabul, diyalog kaydı). Bayrağın motorsuz
 * yaşadığı dönemden kalan ürünler hiçbir olayı beklemeden sapmış durumdadır; onları hedefe çekmek
 * için tek tek diyalog açmak gerekirdi.
 *
 * Sayfalanmaz ama SINIRSIZ da değil: otomatik ürün kümesi katalogla büyür, katalog da admin'in
 * eliyle (CLAUDE.md §1). Tavan aşınırsa çağıran bunu bilir — sessizce kırpılmaz.
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
