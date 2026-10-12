import { PriceService, ProductService, ProductVariantService, ProductVatRateService, SettingsService, type Db } from '@lezzet/database';
import {
  AUTO_PRICE_STEP_DEFAULT,
  AUTO_PRICE_STEP_KEY,
  applicableVatRate,
  autoPriceCents,
  countryAutoPrice,
  distanceSaleDecision,
  resolveVatTreatment,
  targetMarginFor,
} from '@lezzet/domain-core';
import { groupBy } from '@lezzet/helper';
import { CountryEnum, SELLER_COUNTRY, type Channel, type Country, type Price } from '@lezzet/types';
import { readDistanceSaleBasis } from '../accounting/distance-sale-threshold';
import { readCostBasis } from '../catalog/cost-basis';

/**
 * Otomatik fiyatlandırma: `auto_price` açık ürünün fiyatını maliyetten hedef marja çeker; karar motordadır (`autoPriceCents`,
 * `countryAutoPrice`). Mal kabul, fiyat penceresi, toplu hizalama ve eşik işi aynı fonksiyona iner ki yollar farklı fiyat üretmesin.
 */

// Dışa verilmez: tüketicilerin sorusu "kaç fiyat değişti", satırın kendisi bu modülün içinde kalır.
interface AutoPriceChange {
  variantId: string;
  channel: Channel;
  /** Ülke satırı; `null` genel liste. */
  country: Country | null;
  fromCents: number | null;
  /** Yeni fiyat; `null` ülke satırı kaldırıldı. */
  toCents: number | null;
}

interface RepriceOutcome {
  /** Hedefe çekilen fiyatlar. */
  changes: AutoPriceChange[];
  /** Maliyeti sıçradığı için dokunulmayan boylar; sayan çağıran otomatik fiyatın durduğunu ekranda söyleyebilsin. */
  heldVariantIds: string[];
}

const CHANNELS: readonly Channel[] = ['b2c', 'b2b'];

/** Satıcının ülkesi dışındaki ülkeler; otomatik tüketici fiyatı bunlarda ülke satırı alabilir. */
const FOREIGN: readonly Country[] = CountryEnum.options.filter((country) => country !== SELLER_COUNTRY);

/**
 * Verilen varyantların otomatik fiyatlarını hedefe çeker ve değişenleri döner. Fiyatı olmayan kanal açılmaz, çünkü yokluk "satışa
 * kapalı" demektir; değişmeyen fiyat yazılmaz ki fiyat geçmişi kopyalarla şişmesin.
 */
export async function repriceVariants(db: Db, variantIds: readonly string[]): Promise<RepriceOutcome> {
  const ids = [...new Set(variantIds)];
  if (ids.length === 0) return EMPTY;

  const variants = await new ProductVariantService(db).listByIds(ids);
  if (variants.length === 0) return EMPTY;

  const products = await new ProductService(db).listByIds([...new Set(variants.map((v) => v.productId))]);
  // Yalnız otomatik ve hedefi olan ürünler: hedefsiz otomatik ürün eylemde reddedilir, veri elle bozulmuşsa fiyat uydurulmaz.
  const autoProducts = new Map(
    products.filter((p) => p.autoPrice && (p.targetMarginPercent != null || p.targetMarginB2bPercent != null)).map((p) => [p.id, p]),
  );
  const targets = variants.filter((v) => autoProducts.has(v.productId));
  if (targets.length === 0) return EMPTY;

  const targetIds = targets.map((v) => v.id);
  const priceSvc = new PriceService(db);
  const [costs, b2cLists, b2bLists, stepCents, countryRates, rateCountries] = await Promise.all([
    readCostBasis(db, targetIds),
    priceSvc.findListPricesMap(targetIds, 'b2c'),
    priceSvc.findListPricesMap(targetIds, 'b2b'),
    new SettingsService(db).getNumber(AUTO_PRICE_STEP_KEY, AUTO_PRICE_STEP_DEFAULT),
    new ProductVatRateService(db).listByProducts([...autoProducts.keys()]),
    consumerRateCountries(db),
  ]);
  const listsOf = (channel: Channel) => (channel === 'b2c' ? b2cLists : b2bLists);
  const ratesByProduct = groupBy(countryRates, (rate) => rate.productId);

  const changes: AutoPriceChange[] = [];
  const held: string[] = [];
  for (const variant of targets) {
    const product = autoProducts.get(variant.productId)!;
    const basis = costs.get(variant.id);
    if (!basis || basis.status === 'unknown') continue; // Maliyetsiz ürün: fiyat uydurulmaz.
    // Aykırı fren: son alış geçmişten belirgin sapıyorsa fiyat sessizce oynamaz; zamla tek seferlik pazarlığı ayıran bilgi yöneticide.
    if (basis.status === 'outlier') {
      held.push(variant.id);
      continue;
    }

    for (const channel of CHANNELS) {
      const lists = listsOf(channel).get(variant.id);
      const current = lists?.general;
      if (!current) continue;

      // Kanalın kendi hedefi, yoksa ortak hedef; hedefi olmayan kanala dokunulmaz.
      const channelTarget = targetMarginFor(channel, product.targetMarginPercent, product.targetMarginB2bPercent);
      if (channelTarget === null) continue;

      const next = autoPriceCents({
        channel,
        costCents: basis.costCents,
        targetMarginPercent: channelTarget,
        vatRate: product.vatRate,
        stepCents,
      });
      if (next === null) continue;
      if (next !== current.amountCents) {
        await priceSvc.setPrice({ variantId: variant.id, channel, amountCents: next, customerId: null });
        changes.push({ variantId: variant.id, channel, country: null, fromCents: current.amountCents, toCents: next });
      }
      // İşletme fiyatı KDV hariçtir, ülkenin oranı onu değiştirmez; ülke satırı yalnız tüketici fiyatındadır.
      if (channel !== 'b2c') continue;
      const rates = { vatRate: product.vatRate, countryRates: ratesByProduct.get(product.id) ?? [] };
      for (const country of FOREIGN) {
        const decision = countryAutoPrice({
          costCents: basis.costCents,
          targetMarginPercent: channelTarget,
          stepCents,
          countryVatRate: applicableVatRate(rateCountries.get(country) ?? country, rates),
          generalCents: next,
        });
        const change = await applyCountryPrice(priceSvc, variant.id, country, decision, lists.byCountry[country] ?? null);
        if (change) changes.push(change);
      }
    }
  }
  return { changes, heldVariantIds: held };
}

/** Ülke satırını karara eşitler; değişmeyen satır yazılmaz. */
async function applyCountryPrice(
  priceSvc: PriceService,
  variantId: string,
  country: Country,
  decision: ReturnType<typeof countryAutoPrice>,
  current: Price | null,
): Promise<AutoPriceChange | null> {
  const fromCents = current?.amountCents ?? null;
  if (decision.action === 'remove') {
    if (!current) return null;
    await priceSvc.removeCountryPrice(variantId, 'b2c', country);
    return { variantId, channel: 'b2c', country, fromCents, toCents: null };
  }
  if (decision.amountCents === fromCents) return null;
  await priceSvc.setPrice({ variantId, channel: 'b2c', amountCents: decision.amountCents, customerId: null, country });
  return { variantId, channel: 'b2c', country, fromCents, toCents: decision.amountCents };
}

/**
 * Satıcının ülkesi dışındaki ülkelerde tüketiciye uygulanan oranın ülkesi: eşik aşıldıysa varış ülkesi, değilse satıcınınki. Eşik
 * bütün AB'ye ortaktır, karar bir kez okunur.
 */
async function consumerRateCountries(db: Db): Promise<Map<Country, Country>> {
  const basis = await readDistanceSaleBasis(db);
  const { destinationTaxation } = distanceSaleDecision({ ...basis, orderNetCents: 0 });
  const entries = FOREIGN.flatMap((country) => {
    const decision = resolveVatTreatment({ channel: 'b2c', originCountry: SELLER_COUNTRY, deliveryCountry: country, destinationTaxation });
    return decision.ok && decision.rateCountry ? [[country, decision.rateCountry] as const] : [];
  });
  return new Map(entries);
}

const EMPTY: RepriceOutcome = { changes: [], heldVariantIds: [] };

/** Tek ürünün boyları; fiyat penceresinde bayrak ya da hedef değişince. */
export async function repriceProduct(db: Db, productId: string): Promise<RepriceOutcome> {
  const variants = await new ProductVariantService(db).listByProduct(productId);
  return repriceVariants(
    db,
    variants.map((v) => v.id),
  );
}

/** Toplu hizalamanın tavanı; liste sayfalanmaz, aşılırsa çağıran bilir. */
const AUTO_REPRICE_LIMIT = 500;

/** Katalogdaki tüm otomatik ürünler: elle toplu hizalama ve eşik durumu değişince eşik işi. */
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
