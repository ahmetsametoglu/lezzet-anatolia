'use server';

import { revalidatePath } from 'next/cache';
import { productIdOfCode, readCostBasis } from '@lezzet/application';
import { CategoryService, DiscountService, PriceGroupService, PriceService, ProductService, serviceDb } from '@lezzet/database';
import { costOf } from '@lezzet/domain-core';
import { DEFAULT_PAGE_SIZE, resolveLocalizedText, type Channel, type KeysetCursor, type Price } from '@lezzet/types';
import { requireAdmin } from '@/lib/guard';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { searchCustomerOptions, type CustomerOption } from '@/lib/customer-options';
import { repriceAllAuto } from '@/lib/pricing/auto-price';
import { toPriceRows, type ChannelPriceMaps } from '@/lib/pricing/price-rows';
import { parsePricesUrl, toPriceFilters, PRICES_PATH } from './prices-url';
import { titleOf } from '@/lib/catalog/title';
import { type PriceRow, type VariantOption } from './prices-types';

// Guard `requireAdmin`: fiyat yazmak ve maliyet görmek yönetici işidir; ekranın düğmeyi gizlemesi güvence değildir.

// Kanal fiyatı ve otomatik fiyat eylemleri `lib/prices/price-actions`ta, çünkü fiyat diyaloğu ürünler önizlemesinden de açılır.

/**
 * Katalogdaki tüm otomatik ürünleri hedefe çeker; olay beklemeden, maliyeti değişmiş ama açılmamış ürünleri hizalar.
 */
export async function repriceAutoAction(): Promise<ActionResult<{ changed: number; held: number; truncated: boolean }>> {
  try {
    await requireAdmin();
    const { changes, heldVariantIds, truncated } = await repriceAllAuto(serviceDb());
    revalidatePath(PRICES_PATH);
    return { data: { changed: changes.length, held: heldVariantIds.length, truncated }, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/**
 * Müşteriye özel fiyat yazar: kanal fiyatıyla aynı yol, `customerId` dolu. Listeden yüksek olması engellenmez, çünkü
 * operatörün bildiği gerçek istisnalar var; ekran uyarır.
 */
export async function setCustomerPriceAction(
  customerId: string,
  variantId: string,
  channel: Channel,
  amountCents: number,
): Promise<ActionResult> {
  try {
    await requireAdmin();
    if (!customerId) throw new Error('Müşteri seçilmeli.');
    if (!variantId) throw new Error('Boy seçilmeli.');
    if (!Number.isFinite(amountCents) || amountCents <= 0) throw new Error('Fiyat sıfırdan büyük olmalı.');

    await new PriceService(serviceDb()).setPrice({
      variantId,
      channel,
      customerId,
      amountCents: Math.round(amountCents),
    });
    revalidatePath(PRICES_PATH);
    return { data: null, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/**
 * Özel fiyatı kaldırır — müşteri o boyda kanal listesine döner. Servis o üçlünün TÜM satırlarını
 * siler; tek satır silmek altındaki eski özel fiyatı yürürlüğe sokardı (bkz. `removeCustomerPrice`).
 */
export async function removeCustomerPriceAction(
  customerId: string,
  variantId: string,
  channel: Channel,
): Promise<ActionResult> {
  try {
    await requireAdmin();
    await new PriceService(serviceDb()).removeCustomerPrice(variantId, channel, customerId);
    revalidatePath(PRICES_PATH);
    return { data: null, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/**
 * Boy seçicisinin kaynağı: arama sunucuda, çünkü katalog veriyle büyür ve tavanlı havuz sessizce eksik liste gösterirdi.
 * Arama ürün adında yapılır ve eşleşen ürünün tüm boyları döner.
 */
const VARIANT_SEARCH_LIMIT = 20;

export async function searchVariantsAction(term: string): Promise<ActionResult<VariantOption[]>> {
  try {
    await requireAdmin();
    const query = term.trim();
    if (!query) return { data: [], error: null };

    const db = serviceDb();
    // Terim barkod, SKU ya da tedarikçi koduysa ürün koddan bulunur, çünkü kod kesin kimliktir; değilse ad araması.
    const codeProductId = await productIdOfCode(db, query);
    const page = await new ProductService(db).listPriceRows({
      filters: codeProductId ? { ids: [codeProductId] } : { query },
      limit: VARIANT_SEARCH_LIMIT,
    });
    const variantIds = page.rows.flatMap((p) => p.variants.map((v) => v.id));

    // Liste fiyatları ve maliyet AYNI turda: özel fiyat verirken "indirim mi zam mı, ne kâr
    // kalıyor" sorusu ancak bunlarla yanıtlanır ve seçim değiştikçe ayrı tur atmak, her tuşta
    // sunucuya gitmek olurdu. Maliyet tabanı ekranın geri kalanıyla aynı (`readCostBasis`).
    const priceSvc = new PriceService(db);
    const [b2cMap, b2bMap, costs] = await Promise.all([
      priceSvc.findApplicableMap(variantIds, 'b2c'),
      priceSvc.findApplicableMap(variantIds, 'b2b'),
      readCostBasis(db, variantIds),
    ]);
    const listOf = (map: Map<string, { channelPrice: Price | null }>, id: string): number | null => {
      return map.get(id)?.channelPrice?.amountCents ?? null;
    };

    const options = page.rows.flatMap((product) =>
      product.variants.map((variant) => ({
        variantId: variant.id,
        title: titleOf(resolveLocalizedText(product.name), resolveLocalizedText(variant.label)),
        // Pasif/aday ürün ya da kapalı boy: seçilebilir ama ekran söyler — özel fiyat, satışa
        // açılmadan önce de hazırlanabilen bir anlaşmadır.
        sellable: product.status === 'active' && variant.isActive,
        listCents: { b2c: listOf(b2cMap, variant.id), b2b: listOf(b2bMap, variant.id) },
        costCents: costOf(costs.get(variant.id) ?? { status: 'unknown' as const }),
        vatRate: product.vatRate,
        targetMarginPercent: product.targetMarginPercent,
      })),
    );
    return { data: options, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/** Müşteri seçicisi — satırın biçimi ORTAK (`lib/customer-options`), burada kalan guard ve sarmal. */
export async function searchCustomersAction(term: string): Promise<ActionResult<CustomerOption[]>> {
  try {
    await requireAdmin();
    return { data: await searchCustomerOptions(term), error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/**
 * Fiyat listesinin SONRAKİ sayfası. Süzgeçler adresten okunur (`search`), böylece devam eden sayfa
 * ilk sayfayla aynı ölçüte uyar — client'ın süzgeci ayrıca taşımasına gerek kalmaz.
 */
export async function loadMorePricesAction(
  search: string,
  cursor: KeysetCursor,
): Promise<ActionResult<{ rows: PriceRow[]; nextCursor: KeysetCursor | null }>> {
  try {
    await requireAdmin();
    const urlState = parsePricesUrl(Object.fromEntries(new URLSearchParams(search)));

    const db = serviceDb();
    const [page, categories] = await Promise.all([
      new ProductService(db).listPriceRows({ filters: toPriceFilters(urlState), cursor, limit: DEFAULT_PAGE_SIZE }),
      new CategoryService(db).list(),
    ]);

    const variantIds = page.rows.flatMap((p) => p.variants.map((v) => v.id));
    const priceSvc = new PriceService(db);
    const [b2c, b2b, costs] = await Promise.all([
      priceSvc.findApplicableMap(variantIds, 'b2c'),
      priceSvc.findApplicableMap(variantIds, 'b2b'),
      readCostBasis(db, variantIds),
    ]);

    const pick = (map: Map<string, { channelPrice: Price | null }>): Map<string, Price> =>
      new Map([...map].flatMap(([id, { channelPrice }]) => (channelPrice ? [[id, channelPrice] as const] : [])));
    const prices: ChannelPriceMaps = { b2c: pick(b2c), b2b: pick(b2b) };

    const rows = toPriceRows({
      products: page.rows,
      prices,
      costs,
      categoryNames: new Map(categories.map((c) => [c.id, resolveLocalizedText(c.name)])),
    });
    return { data: { rows, nextCursor: page.nextCursor }, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

// `saveDiscountAction` `lib/prices/discount-actions.ts`te, çünkü asistan kuyruğu da çağırır ve kardeş sayfadan import yasak.

/**
 * Fiyat grubu yazar; yüzde değişimi anında tüm üyelere yansır, çünkü grup fiyatı saklanmaz, listeden türetilir.
 */
export async function savePriceGroupAction(
  id: string | null,
  name: string,
  percentOff: number,
): Promise<ActionResult> {
  try {
    await requireAdmin();
    const svc = new PriceGroupService(serviceDb());
    if (id) await svc.update({ id, name, percentOff });
    else await svc.insert({ name, percentOff });
    revalidatePath(PRICES_PATH);
    return { data: null, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/**
 * Fiyat grubunu siler. Üyesi olan grubu DB `restrict` FK'si korur — hata yutulmaz, operatöre
 * "önce müşterileri taşı" cümlesi olarak döner (`getErrorMessage` funnel'ı kısıt mesajını çevirir).
 */
export async function deletePriceGroupAction(id: string): Promise<ActionResult> {
  try {
    await requireAdmin();
    await new PriceGroupService(serviceDb()).delete(id);
    revalidatePath(PRICES_PATH);
    return { data: null, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

export async function setDiscountActiveAction(id: string, isActive: boolean): Promise<ActionResult> {
  try {
    await requireAdmin();
    await new DiscountService(serviceDb()).setActive(id, isActive);
    revalidatePath(PRICES_PATH);
    return { data: null, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}
