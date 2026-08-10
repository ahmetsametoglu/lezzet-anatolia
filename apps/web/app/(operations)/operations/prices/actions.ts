'use server';

import { revalidatePath } from 'next/cache';
import { CategoryService, DiscountService, PriceService, ProductService, serviceDb } from '@lezzet/database';
import { costOf } from '@lezzet/domain-core';
import { DEFAULT_PAGE_SIZE, resolveLocalizedText, type Channel, type KeysetCursor, type Price } from '@lezzet/types';
import { requireAdmin } from '@/lib/guard';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { searchCustomerOptions, type CustomerOption } from '@/lib/customer-options';
import { repriceAllAuto, repriceProduct } from '@/lib/pricing/auto-price';
import { readCostBasis } from '@/lib/pricing/cost-basis';
import { toPriceRows, type ChannelPriceMaps } from './prices-read';
import { parsePricesUrl, toPriceFilters, PRICES_PATH } from './prices-url';
import { titleOf } from '@/lib/catalog/title';
import { type PriceRow, type VariantOption } from './prices-types';

// Fiyat ekranı server action'ları — 'use server' + requireAdmin ilk + servise devret +
// `{ data, error }` DÖNER (throw yok) + revalidatePath.
//
// Guard `requireAdmin`: fiyat yazmak ve maliyet görmek yönetici işidir (brief §6). Ekranın düğmeyi
// göstermemesi bir güvence değildir — action kendi kapısını kendi tutar.

/**
 * Kanal liste fiyatını yazar. `setPrice` YENİ SATIR ekler, mevcut satırı değiştirmez: fiyat geçmişi
 * korunur ve verilmiş siparişler etkilenmez (fiyat sipariş anında sabitlenir).
 *
 * `null` tutar "bu kanalda fiyat yok" demektir ve bugün DESTEKLENMEZ: fiyat satırı silmek geçmişi de
 * silerdi, "satışa kapat" ise boyun kendi anahtarıdır (`is_active`). Ekran bu yüzden sıfır/boş
 * tutarı reddeder.
 *
 * `validFrom` İLERİ tarihli yazmayı açar (05.4'ün baştan beri desteklediği ama ekranı olmayan
 * yetenek): zam bugünden hazırlanır, o güne kadar eski fiyat geçerli kalır. Boşsa "şimdi".
 */
export async function setChannelPriceAction(
  variantId: string,
  channel: Channel,
  amountCents: number,
  validFrom?: string | null,
): Promise<ActionResult> {
  try {
    await requireAdmin();
    if (!Number.isFinite(amountCents) || amountCents <= 0) throw new Error('Fiyat sıfırdan büyük olmalı.');

    await new PriceService(serviceDb()).setPrice({
      variantId,
      channel,
      amountCents: Math.round(amountCents),
      customerId: null,
      validFrom: validFrom ?? undefined,
    });
    revalidatePath(PRICES_PATH);
    return { data: null, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/**
 * Ürünün otomatik fiyat anahtarı + hedef marjı. İkisi TEK action'da, çünkü tek karardır: otomatik
 * fiyat açıksa hedef marj zorunlu girdidir — açıp hedefi boş bırakmak, motoru hesaplayamayacağı bir
 * durumda bırakırdı.
 *
 * **Anahtar açıksa fiyat AYNI ANDA hedefe çekilir.** Niyeti kaydedip hesabı bir sonraki mal kabule
 * bırakmak, "otomatik" dediğimiz ürünü stok girene kadar donmuş fiyatta bırakırdı — bayrağın
 * motorsuz yaşadığı dönemin hatası buydu. Dönen sayı kaç fiyatın değiştiğidir; ekran onu söyler,
 * çünkü otomatik de olsa fiyat değişimi sürpriz olmamalı (tasarım notu).
 */
export async function setAutoPriceAction(
  productId: string,
  autoPrice: boolean,
  targetMarginPercent: number | null,
): Promise<ActionResult<{ changed: number; held: number }>> {
  try {
    await requireAdmin();
    if (autoPrice && (targetMarginPercent === null || !Number.isFinite(targetMarginPercent))) {
      throw new Error('Otomatik fiyat için hedef marj girilmeli.');
    }
    if (targetMarginPercent !== null && targetMarginPercent < 0) {
      throw new Error('Hedef marj negatif olamaz.');
    }

    const db = serviceDb();
    await new ProductService(db).updateDetails(productId, { autoPrice, targetMarginPercent });
    // Anahtar kapatıldıysa fiyata dokunulmaz: elle yönetime dönen ürünün son otomatik fiyatı
    // geçerli fiyatıdır, "eski elle fiyata dön" diye bir kayıt yoktur.
    const outcome = autoPrice ? await repriceProduct(db, productId) : null;
    revalidatePath(PRICES_PATH);
    return { data: { changed: outcome?.changes.length ?? 0, held: outcome?.heldVariantIds.length ?? 0 }, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/**
 * Katalogdaki tüm otomatik ürünleri hedefe çeker — elle toplu hizalama.
 *
 * Diğer iki tetik olaya bağlıdır (mal kabul, diyalog kaydı); bu, olay beklemeden çalıştırılan
 * bakım eylemidir. Maliyeti değişmiş ama henüz kimsenin açmadığı ürünler burada hizalanır.
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
 * Müşteriye özel fiyat yazar/günceller. Kanal fiyatıyla AYNI yol (`setPrice`): yeni satır eklenir,
 * eskisi geçmişte kalır. Fark tek bir alanda — `customerId` dolu.
 *
 * Özel fiyatın liste fiyatından YÜKSEK olması engellenmez: nadir ama gerçek bir durum (küçük
 * miktarlı özel üretim, taşıma zorluğu). Ekran uyarır, yol kapatmaz — kural uydurmak, operatörün
 * bildiği bir istisnayı sisteme rağmen yapmasına yol açardı.
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
 * Boy seçicisinin kaynağı — **arama SUNUCUDA**, katalogun tamamı indirilmez.
 *
 * Önce havuz tek seferde çekiliyordu (500 ürün tavanıyla): katalog o tavanı aşınca seçici, eksik
 * olduğunu söylemeden eksik liste gösterirdi — CLAUDE.md §1'in "veriyle büyüyen küme" kuralına
 * aykırı sessiz bir kırpma. Artık yazılan terim aranır; boş terimde hiçbir şey okunmaz.
 *
 * Okuma `listPriceRows`: dar alanlı (beyan/besin metinleri gelmez) ve zaten sorgu süzgecini
 * destekliyor — seçici için ayrı bir okuma yolu açmak, aynı işin ikinci kopyası olurdu.
 * Arama ÜRÜN ADINDA yapılır ve eşleşen ürünün tüm boyları döner; "baklava" yazan, baklavanın
 * boylarını arıyordur.
 */
const VARIANT_SEARCH_LIMIT = 20;

export async function searchVariantsAction(term: string): Promise<ActionResult<VariantOption[]>> {
  try {
    await requireAdmin();
    const query = term.trim();
    if (!query) return { data: [], error: null };

    const db = serviceDb();
    const page = await new ProductService(db).listPriceRows({ filters: { query }, limit: VARIANT_SEARCH_LIMIT });
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

// `saveDiscountAction` BURADA DEĞİL, `lib/prices/discount-actions.ts`'te (22.10): eylem artık iki
// yüzeyin ortağı (fiyat ekranı + asistan kuyruğu) ve sayfa klasöründe kalsaydı kuyruk onu kardeş
// sayfadan import etmek zorunda kalırdı — `STACK §7`'nin yasakladığı bağ. Aynı devir teklif yazma
// yolunda da yaşandı (`lib/stock/offer-actions`).

/**
 * Aktiflik anahtarı. Kural SİLİNMEZ, kapatılır: süresi dolmuş kuponun geçmişi (kimin kullandığı,
 * ne kadar indirim dağıtıldığı) raporun malıdır.
 */
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
