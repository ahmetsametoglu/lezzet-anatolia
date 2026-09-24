import { planParcels, type ParcelBox, type ParcelItem, type PlannedParcel } from '@lezzet/domain-core';
import { ProductVariantService, ShippingBoxService, WarehouseService } from '@lezzet/database';
import type { ParcelSpec, ShippingQuote } from '@lezzet/sendcloud';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { RecipientAddress, SenderAddress, ShippingRateProvider } from './port';

/**
 * Kargo teklifinin tek kapısı: sepet, checkout ve sipariş taslağı buradan geçer ki gösterilen fiyatla tahsil edilen ayrışmasın.
 * Zincir: varyant ölçüleri + deponun kutuları → koli planı → sağlayıcı teklifi → çok koli süzgeci.
 */

export type ShippingQuoteOutcome =
  | { status: 'ok'; options: readonly ShippingQuote[]; parcelCount: number; totalWeightG: number; plan: readonly PlannedParcel[] }
  /** Bir ya da daha çok kalemin ambalaj ölçüsü yok — TAHMİN EDİLMEZ. */
  | { status: 'unmeasured'; variantIds: readonly string[] }
  /** Deponun aktif kargo kutusu yok — Depolar ekranından tanımlanmalı. */
  | { status: 'no_box' }
  /** Bir paket en büyük kutuya sığmıyor — operatör kararı gerekir. */
  | { status: 'too_large'; variantId: string }
  /** Deponun adresi eksik — gönderici olmadan teklif sorulamaz. */
  | { status: 'no_sender' }
  /** Sağlayıcı cevap veremedi; sabit yedek ücret yoktur, eşik altındaki kargo siparişi açılmaz. */
  | { status: 'provider_error'; message: string };

export interface ShippingQuoteInput {
  warehouseId: string;
  to: RecipientAddress;
  items: ReadonlyArray<{ variantId: string; qty: number }>;
}

/** Deponun `address` alanı serbest jsonb — okunuşu burada tek yerde. */
function senderOf(warehouse: { countryCode: string; address: Record<string, unknown> | null; name: string }): SenderAddress | null {
  const address = warehouse.address ?? {};
  const postalCode = typeof address.postalCode === 'string' ? address.postalCode : null;
  // Posta kodu ZORUNLU: tarife çıkış noktasına bağlı ve ülke tek başına yetmiyor (aynı ülkede
  // iki depo farklı fiyat alır). Yokluğu sessizce ülkeye düşürmek yanlış fiyat üretirdi.
  if (!postalCode) return null;
  return {
    countryCode: warehouse.countryCode,
    postalCode,
    city: typeof address.city === 'string' ? address.city : undefined,
    name: warehouse.name,
    addressLine1: typeof address.line1 === 'string' ? address.line1 : undefined,
  };
}

const toSpec = (weightG: number, box: ParcelBox): ParcelSpec => ({
  weightG,
  lengthMm: box.lengthMm,
  widthMm: box.widthMm,
  heightMm: box.heightMm,
});

export async function quoteShipping(
  db: SupabaseClient,
  provider: ShippingRateProvider,
  input: ShippingQuoteInput,
): Promise<ShippingQuoteOutcome> {
  const wanted = input.items.filter((i) => i.qty > 0);
  if (wanted.length === 0) return { status: 'ok', options: [], parcelCount: 0, totalWeightG: 0, plan: [] };

  const [warehouse, variants, boxes] = await Promise.all([
    new WarehouseService(db).getById(input.warehouseId),
    new ProductVariantService(db).listByIds(wanted.map((i) => i.variantId)),
    // **Yalnız AKTİF kutular**: kapalı kutu listede görünür ama seçilemez — kapalı bir kutuya
    // gönderi planlamak, olmayan bir kutuyu kullanmaktır.
    new ShippingBoxService(db).listForWarehouse(input.warehouseId, { onlyActive: true }),
  ]);

  if (!warehouse) return { status: 'no_sender' };
  const from = senderOf(warehouse);
  if (!from) return { status: 'no_sender' };

  const byId = new Map(variants.map((v) => [v.id, v]));
  const items: ParcelItem[] = wanted.map((i) => {
    const v = byId.get(i.variantId);
    return {
      variantId: i.variantId,
      qty: i.qty,
      // Varyantı bulunamayan kalem ÖLÇÜSÜZ sayılır, sıfır değil: kaybolmuş bir kayıttan ölçü
      // türetmek, olmayan bir malı tartmaktır.
      packedWeightG: v?.packedWeightG ?? null,
      packedLengthMm: v?.packedLengthMm ?? null,
      packedWidthMm: v?.packedWidthMm ?? null,
      packedHeightMm: v?.packedHeightMm ?? null,
    };
  });

  const plan = planParcels(items, boxes);
  if (!plan.ok) {
    if (plan.reason === 'unmeasured') return { status: 'unmeasured', variantIds: plan.unmeasured };
    if (plan.reason === 'no_box') return { status: 'no_box' };
    return { status: 'too_large', variantId: plan.variantId };
  }

  const parcels = plan.parcels.map((p) => toSpec(p.weightG, p.box));
  let options: ShippingQuote[];
  try {
    options = await provider.quote({ from, to: input.to, parcels });
  } catch (err) {
    // Hata sonuç olarak döner, çünkü eşik üstündeki sipariş fiyatsız da açılır; ötekini çağıran durdurur.
    return { status: 'provider_error', message: err instanceof Error ? err.message : String(err) };
  }

  // ⚠ ÇOK KUTU SÜZGECİ (yukarıdaki künye) — tek kutuda süzgeç yok, hepsi geçerli.
  const usable = plan.parcels.length > 1 ? options.filter((o) => o.multicollo) : options;

  return {
    status: 'ok',
    /*
      Fiyatsız ve sıfır fiyatlı seçenekler elenir: sağlayıcı her sorguya ücretsiz "mektup" kanalını da döndürür ve ucuzdan sıralı
      listede o başa geçerek koliyi mektup tarifesiyle işaretlerdi. Sevk kapısı (`quoteOrderShipment`) aynı kuralı uygular.
    */
    options: usable
      .filter((o): o is typeof o & { priceCents: number } => typeof o.priceCents === 'number' && o.priceCents > 0)
      .sort((a, b) => a.priceCents - b.priceCents),
    parcelCount: plan.parcels.length,
    totalWeightG: plan.parcels.reduce((sum, p) => sum + p.weightG, 0),
    plan: plan.parcels,
  };
}

/**
 * Teklifin neden alınamadığı: `carrier` taşıyıcıya ulaşılamadı ya da sağlayıcı kurulu değil (teklif hiç sorulmadı), geçicidir; `data`
 * ürün ya da depo verimiz eksik ve düzeltmesi bizde.
 */
export function quoteFailureOf(quote: ShippingQuoteOutcome | null): 'carrier' | 'data' | null {
  if (quote === null || quote.status === 'provider_error') return 'carrier';
  return quote.status === 'ok' ? null : 'data';
}

/** Teklifi durduran varyantlar: ölçüsü eksik olanlar ya da en büyük kutuya sığmayan. */
export function unshippableVariantsOf(quote: ShippingQuoteOutcome | null): readonly string[] {
  if (quote?.status === 'unmeasured') return quote.variantIds;
  return quote?.status === 'too_large' ? [quote.variantId] : [];
}
