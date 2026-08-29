import { planParcels, type ParcelBox, type ParcelItem } from '@lezzet/domain-core';
import { ProductVariantService, ShippingBoxService, WarehouseService } from '@lezzet/database';
import type { ParcelSpec, ShippingQuote } from '@lezzet/sendcloud';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { RecipientAddress, SenderAddress, ShippingRateProvider } from './port';

/**
 * **KARGO TEKLİFİ — TEK KAPI** (07.12).
 *
 * Sepet ekranı da checkout da sipariş yaratma da BURAYI çağırır. İki yerde ayrı kurulsaydı,
 * müşterinin gördüğü fiyat ile tahsil edilen fiyat ayrışabilirdi — referans projede bu, kaydı
 * tutulmuş bir sömürü kapısıydı (`priceEur=0` payload'ı). Fiyat daima SUNUCUDA hesaplanır;
 * istemci yalnız hangi SEÇENEĞİ seçtiğini söyler.
 *
 * ── ZİNCİR ──────────────────────────────────────────────────────────────────
 *   varyant ölçüleri + deponun kutuları → koli planı → sağlayıcı teklifi → süzgeç
 *
 * ── ⚠ ÇOK KUTU SÜZGECİ, canlı ölçümün bulgusu (28.08) ───────────────────────
 * Seçeneklerin hepsi çok koli desteklemiyor: gerçek hesapta 17'nin 10'u destekliyor ve
 * **Mondial Relay'in hiçbiri desteklemiyor** — üstelik en ucuz üç seçeneğin ikisi o. Süzgeç
 * olmasaydı müşteri en ucuzu seçer, etiket satın alma anında sağlayıcı reddeder ve sipariş
 * SEVK EDİLEMEZ hâlde kalırdı. Sıra bu yüzden zorunlu: plan → süzgeç → teklif.
 */

export type ShippingQuoteOutcome =
  | { status: 'ok'; options: readonly ShippingQuote[]; parcelCount: number; totalWeightG: number }
  /** Bir ya da daha çok kalemin ambalaj ölçüsü yok — TAHMİN EDİLMEZ. */
  | { status: 'unmeasured'; variantIds: readonly string[] }
  /** Deponun aktif kargo kutusu yok — Depolar ekranından tanımlanmalı. */
  | { status: 'no_box' }
  /** Bir paket en büyük kutuya sığmıyor — operatör kararı gerekir. */
  | { status: 'too_large'; variantId: string }
  /** Deponun adresi eksik — gönderici olmadan teklif sorulamaz. */
  | { status: 'no_sender' }
  /** Sağlayıcı cevap veremedi — çağıran sabit tarifeye DÜŞER ve düştüğünü söyler. */
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
  if (wanted.length === 0) return { status: 'ok', options: [], parcelCount: 0, totalWeightG: 0 };

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
    // Sağlayıcı düştüğünde teklif YOK — ama sipariş yolu kapanmaz: çağıran sabit tarifeye düşer
    // ve DÜŞTÜĞÜNÜ söyler. Sessizce sabit tarife uygulamak, müşteriye "canlı fiyat" diye
    // hesaplanmamış bir sayı göstermek olurdu.
    return { status: 'provider_error', message: err instanceof Error ? err.message : String(err) };
  }

  // ⚠ ÇOK KUTU SÜZGECİ (yukarıdaki künye) — tek kutuda süzgeç yok, hepsi geçerli.
  const usable = plan.parcels.length > 1 ? options.filter((o) => o.multicollo) : options;

  return {
    status: 'ok',
    /*
      **FİYATI OLMAYAN VE SIFIR OLAN SEÇENEKLER ELENİR.**

      `null` = tarife hesaplanamadı: tıklanabilir ama tutarı olmayan bir satır, müşteriye
      cevaplayamayacağımız bir soru sordurur.

      **Sıfır ise gerçek bir kargo hizmeti DEĞİLDİR** — ve bu ölçülmüş bir arızanın düzeltmesidir
      (28.08, mobil şeridin tespiti): sağlayıcı her sorguya ücretsiz `sendcloud:letter` kanalını da
      döndürüyor, liste ucuzdan sıralı ve seçim yapılmadığında ilk sıra alınıyordu. Sonuç: **her
      kargo siparişinde ücret 0,00 € hesaplanıyor** ve 15 kg'lık koli mektup tarifesiyle
      işaretleniyordu. Canlı ölçüm (FR 67000 → FR 75001, 5 kg): `0,00 € sendcloud:letter` ·
      `7,74 € chronopost:shop2shop` — yani sipariş başına kaçan tutar 7,74 €.

      **"Kampanya tarifesi de düşer" itirazı geçerli değil** (notta öyle deniyordu): bu liste bizim
      MALİYETİMİZ, müşteriden aldığımız ücret değil. Ücretsiz kargo bizim kararımızdır ve eşik
      mantığında yaşar (`resolveShippingFee` → `freeReason: 'threshold'`); taşıyıcının 15 kg'ı
      sıfıra taşıması diye bir şey yok. Sıfır, "bu kanalı fiyatlamıyorum" demektir — fiyatlamadığı
      bir kanalın maliyetini de biz bilemeyiz.

      Aynı kural sevk kapısında da uygulanıyor (`dispatch.ts` → `quoteOrderShipment`): iki kapı
      ayrı davransaydı, checkout'ta görünen seçenek satın alma anında reddedilirdi.
    */
    options: usable
      .filter((o): o is typeof o & { priceCents: number } => typeof o.priceCents === 'number' && o.priceCents > 0)
      .sort((a, b) => a.priceCents - b.priceCents),
    parcelCount: plan.parcels.length,
    totalWeightG: plan.parcels.reduce((sum, p) => sum + p.weightG, 0),
  };
}
