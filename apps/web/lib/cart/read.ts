import 'server-only';
import { ProductService, ProductVariantService, SettingsService, serviceDb } from '@lezzet/database';
import { meetsMinBasket } from '@lezzet/domain-core';
import { CROP_CENTER, resolveLocalizedText } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';
import { EMPTY_PRODUCT_CONTEXT, imageOf, toVariant } from '@/lib/storefront/map';
import { loadProductContext } from '@/lib/storefront/read-context';
import { EMPTY_CART, type CartEntry, type CartLine, type CartView } from './cart-types';

/**
 * Sepet okuması (08.4) — NİYETİ bugünkü görünüme çevirir.
 *
 * Girdi yalnız `{variantId, qty, stockId}` üçlüsüdür; ad, fiyat, stok ve tavan burada YENİDEN
 * çözülür. Sebep DOMAIN §5: sepetteki fiyat bağlayıcı değildir, gösterimdir. Sepet aylarca
 * bekleyebilir — fiyat da stok da o arada değişir.
 *
 * Tek turda okur: varyantlar → ürünler → fiyat/stok/teklif bağlamı. Sepette 20 kalem olsa da sorgu
 * sayısı sabittir (kalem başına sorgu N+1 doğurur).
 *
 * **Çıpalı parti kontrolü:** teklif kalemi eklendiği partiye bağlıdır. O parti tükendiyse indirim
 * başka partiye TAŞINMAZ; satır bugünkü çözümde teklifsiz görünür ve fiyatı normale döner
 * (müşteriye checkout'ta bildirilir — 07.4'ün işi).
 */
export async function getCartView(locale: Locale, entries: readonly CartEntry[]): Promise<CartView> {
  const db = serviceDb();
  const settings = new SettingsService(db);
  // İkisi de DOMAIN §6'ya göre PARAMETRİK — kod sabiti değil, işletme ayarı. Ayar satırı yoksa
  // varsayılan burada, çağrı yerinde bildirilir (servis koda sabit yazdırmaz).
  //
  // Ücretsiz kargo varsayılanı 60,00 €: soğuk zincir kargosunun kendisi ~7-8 € tuttuğu için eşik
  // onun belirgin üstünde olmalı, yoksa her sepet ücretsiz olur. Admin ayarı geldiğinde bu değer
  // hiç okunmaz — burada durması, ayar girilmeden de ekranın doğru davranması içindir.
  const [minBasketCents, freeShippingCents] = await Promise.all([
    settings.getNumber('min_basket_cents', 0),
    settings.getNumber('free_shipping_cents', 6000),
  ]);
  if (entries.length === 0) return { ...EMPTY_CART, freeShippingCents, ...meets(0, minBasketCents) };

  const variants = await new ProductVariantService(db).listByIds([...new Set(entries.map((e) => e.variantId))]);
  const byVariant = new Map(variants.map((v) => [v.id, v]));
  const productIds = [...new Set(variants.map((v) => v.productId))];

  const page = await new ProductService(db).listWithRelations({ filters: { ids: productIds }, limit: productIds.length });
  const byProduct = new Map(page.rows.map((p) => [p.id, p]));
  const context = await loadProductContext(db, page.rows);

  const lines: CartLine[] = [];
  for (const entry of entries) {
    const variant = byVariant.get(entry.variantId);
    const product = variant ? byProduct.get(variant.productId) : undefined;
    // Varyant ya da ürün kaybolduysa (silinmiş/pasifleşmiş) satır SESSİZCE DÜŞMEZ: müşteri neyi
    // kaybettiğini görmeli. Elimizdeki tek şey kimlik, o yüzden adsız ama engelleyen satır kurulur.
    if (!variant || !product) {
      lines.push(orphanLine(entry));
      continue;
    }

    const ctx = context.get(product.id) ?? EMPTY_PRODUCT_CONTEXT;
    const view = toVariant(variant, locale, ctx);
    // Sepetteki çıpa bugünkü teklifle uyuşmuyorsa teklif bu satırda GEÇERSİZDİR.
    const offerHolds = entry.stockId !== null && view.stockId === entry.stockId;
    const unitPriceCents = view.priceCents;

    lines.push({
      ...entry,
      slug: product.slug,
      name: resolveLocalizedText(product.name, locale),
      image: imageOf(product),
      unitLabel: view.label,
      unitPriceCents,
      wasCents: offerHolds ? view.wasCents : undefined,
      limitCap: offerHolds && view.limitLabel ? Number(view.limitLabel) : null,
      lineTotalCents: unitPriceCents === null ? null : unitPriceCents * entry.qty,
      // Satışa kapalı ya da tükendi → çıkarılmadan devam edilemez.
      blocked: unitPriceCents === null || view.soldOut,
    });
  }

  const subtotalCents = lines.reduce((sum, l) => sum + (l.lineTotalCents ?? 0), 0);
  return {
    lines,
    subtotalCents,
    itemCount: lines.reduce((sum, l) => sum + l.qty, 0),
    hasBlocked: lines.some((l) => l.blocked),
    freeShippingCents,
    ...meets(subtotalCents, minBasketCents),
  };
}

function meets(subtotalCents: number, minBasketCents: number) {
  const { ok, missingCents } = meetsMinBasket(subtotalCents, minBasketCents);
  return { minBasketOk: ok, missingForMinBasketCents: missingCents, minBasketCents };
}

/** Kaynağı kaybolmuş satır — adı yok ama sepette duruyor; çıkarılmadan devam edilemez. */
function orphanLine(entry: CartEntry): CartLine {
  return {
    ...entry,
    slug: '',
    name: '',
    image: { url: null, crop: CROP_CENTER },
    unitLabel: '',
    unitPriceCents: null,
    limitCap: null,
    lineTotalCents: null,
    blocked: true,
  };
}
