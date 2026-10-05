import { DiscountService, type Db } from '@lezzet/database';
import { businessHasDiscounts } from '@lezzet/domain-core';
import type { Business, Discount, LocalizedText } from '@lezzet/types';

/*
  Kapsam kampanyasının tek kapısı: bu kategoride ya da koleksiyonda duyurulabilir bir kampanya var mı. Tutar değil kampanyanın
  kendisi döner, çünkü motor kazananı tüm sepet üzerinden seçip kalemlere oransal dağıtır ve kartta vaat edilen oran sepette
  tutmayabilir.
*/

export interface ScopeCampaign {
  /** Kampanyanın kimliği — yüzey aynı kampanyayı iki yerde anarken karşılaştırabilsin. */
  id: string;
  /** Müşteriye görünen ad; `null` = operatör yazmamış, yüzey adsız konuşur. */
  label: LocalizedText | null;
  type: 'percent' | 'fixed';
  /** `type === 'percent'` ise dolu (15 = %15), değilse `null`. */
  percent: number | null;
  /** `type === 'fixed'` ise dolu (cent), değilse `null`. */
  amountCents: number | null;
  /** Eşik (cent) — `null` = koşulsuz, kampanya her sepette geçerli. */
  minBasketCents: number | null;
}

export interface ScopeCampaigns {
  byCategory: Map<string, ScopeCampaign>;
  byCollection: Map<string, ScopeCampaign>;
}

export const EMPTY_SCOPE_CAMPAIGNS: ScopeCampaigns = { byCategory: new Map(), byCollection: new Map() };

/**
 * Verilen kategori/koleksiyon kimlikleri için yürürlükteki kampanyalar; kural tablosu operatörün kurduğu sınırlı küme olduğundan
 * tek okumayla gelir, süzme bellekte. Aynı hedefe birden çok kampanya uyarsa önce koşulsuz olan, eşitlikte daha yeni kural kazanır,
 * çünkü sepet yokken yüzde ile sabit tutar kıyaslanamaz.
 */
export async function readScopeCampaigns(
  db: Db,
  opts: { categoryIds?: readonly string[]; collectionIds?: readonly string[]; now?: Date; business: Business },
): Promise<ScopeCampaigns> {
  // İndirim geçmeyen işin vitrini kampanya duyurmaz, çünkü sepeti o indirimi vermez (`loadCartDiscountData`).
  if (!businessHasDiscounts(opts.business)) return EMPTY_SCOPE_CAMPAIGNS;
  const categoryIds = new Set(opts.categoryIds ?? []);
  const collectionIds = new Set(opts.collectionIds ?? []);
  if (categoryIds.size === 0 && collectionIds.size === 0) return EMPTY_SCOPE_CAMPAIGNS;

  const now = opts.now ?? new Date();
  const rows = await new DiscountService(db).listCandidates(null);

  const byCategory = new Map<string, ScopeCampaign>();
  const byCollection = new Map<string, ScopeCampaign>();
  for (const row of rows) {
    if (!announceable(row, now)) continue;
    if (row.scope === 'category' && row.categoryId && categoryIds.has(row.categoryId)) {
      put(byCategory, row.categoryId, row);
    } else if (row.scope === 'collection' && row.collectionId && collectionIds.has(row.collectionId)) {
      put(byCollection, row.collectionId, row);
    }
  }
  return { byCategory, byCollection };
}

/** Vitrinde duyurulabilir mi: kupon, kişiye özel ve ilk siparişe bağlı kural vitrini gören herkese vaat edilemez. */
function announceable(row: Discount, now: Date): boolean {
  if (row.trigger !== 'automatic') return false;
  if (!row.isActive) return false;
  if (row.customerId !== null) return false;
  if (row.firstOrderOnly) return false;
  if (row.validFrom && new Date(row.validFrom) > now) return false;
  if (row.validTo && new Date(row.validTo) < now) return false;
  // Değeri olmayan kural duyurulmaz: "%0 indirim" diye bir şey yoktur (motorun aynı korunması).
  return row.type === 'percent' ? row.percent != null : row.amountCents != null;
}

/**
 * Ürün başına kampanya: karışık listede (vitrin rayı, arama, benzer ürünler) başlık olmadığından rozeti kart taşır. Koleksiyon
 * kategoriyi yener (katalogdaki etkin kesit sırası); süzgeç ve üstünlük kuralı tek yerde kalsın diye aynı kapıdan geçer.
 */
export function campaignsByProduct(
  campaigns: ScopeCampaigns,
  products: readonly { id: string; categoryId: string | null }[],
  collectionsByProduct: ReadonlyMap<string, readonly string[]>,
): Map<string, ScopeCampaign> {
  const result = new Map<string, ScopeCampaign>();
  if (campaigns.byCategory.size === 0 && campaigns.byCollection.size === 0) return result;

  for (const product of products) {
    // Koleksiyon adayları önce: aralarındaki seçim `put`un kuralına bırakılır ki "hangi koleksiyon
    // kazandı" sorusu iki farklı yerde iki farklı cevap almasın.
    let won: ScopeCampaign | undefined;
    for (const collectionId of collectionsByProduct.get(product.id) ?? []) {
      const candidate = campaigns.byCollection.get(collectionId);
      if (candidate === undefined) continue;
      if (won === undefined || (won.minBasketCents !== null && candidate.minBasketCents === null)) won = candidate;
    }
    won ??= product.categoryId === null ? undefined : campaigns.byCategory.get(product.categoryId);
    if (won !== undefined) result.set(product.id, won);
  }
  return result;
}

function put(target: Map<string, ScopeCampaign>, key: string, row: Discount): void {
  const next = toCampaign(row);
  const current = target.get(key);
  if (current === undefined || (current.minBasketCents !== null && next.minBasketCents === null)) {
    target.set(key, next);
  }
}

function toCampaign(row: Discount): ScopeCampaign {
  return {
    id: row.id,
    label: labelOf(row),
    type: row.type,
    percent: row.type === 'percent' ? row.percent : null,
    amountCents: row.type === 'fixed' ? row.amountCents : null,
    minBasketCents: row.minBasketCents,
  };
}

/**
 * Müşteriye görünen ad — boş dilleri olan nesne (`{tr:''}`) form artığıdır, ad değildir.
 * Sepetteki `publicLabelOf` ile AYNI kural; ikisi ayrışırsa aynı kampanya iki yerde iki türlü anılır.
 */
function labelOf(row: Discount): LocalizedText | null {
  const label = row.publicLabel;
  if (!label) return null;
  return label.tr?.trim() || label.fr?.trim() || label.de?.trim() ? label : null;
}
