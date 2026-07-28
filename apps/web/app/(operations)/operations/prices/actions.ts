'use server';

import { revalidatePath } from 'next/cache';
import {
  CategoryService,
  DiscountService,
  PriceService,
  ProductService,
  StockService,
  UserProfileService,
  VARIANT_POOL_LIMIT,
  serviceDb,
} from '@lezzet/database';
import { fromCents } from '@lezzet/helper';
import { DEFAULT_PAGE_SIZE, resolveLocalizedText, type Channel, type KeysetCursor, type Price } from '@lezzet/types';
import { requireAdmin } from '@/lib/guard';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { toPriceRows, type ChannelPriceMaps } from './prices-read';
import { parsePricesUrl, toPriceFilters, PRICES_PATH } from './prices-url';
import { titleOf, type CustomerOption, type DiscountFormInput, type PriceRow, type VariantOption } from './prices-types';

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
 */
export async function setChannelPriceAction(
  variantId: string,
  channel: Channel,
  amountCents: number,
): Promise<ActionResult> {
  try {
    await requireAdmin();
    if (!Number.isFinite(amountCents) || amountCents <= 0) throw new Error('Fiyat sıfırdan büyük olmalı.');

    await new PriceService(serviceDb()).setPrice({
      variantId,
      channel,
      amount: fromCents(Math.round(amountCents)),
      customerId: null,
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
 * **Bu action fiyatı YENİDEN HESAPLAMAZ.** Otomatik fiyatın tetikleyicisi maliyet değişimidir ve o
 * stok girişine bağlıdır (modül 10) — bugün anahtar niyeti kaydeder, uyarıyı besler.
 */
export async function setAutoPriceAction(
  productId: string,
  autoPrice: boolean,
  targetMarginPercent: number | null,
): Promise<ActionResult> {
  try {
    await requireAdmin();
    if (autoPrice && (targetMarginPercent === null || !Number.isFinite(targetMarginPercent))) {
      throw new Error('Otomatik fiyat için hedef marj girilmeli.');
    }
    if (targetMarginPercent !== null && targetMarginPercent < 0) {
      throw new Error('Hedef marj negatif olamaz.');
    }

    await new ProductService(serviceDb()).updateDetails(productId, { autoPrice, targetMarginPercent });
    revalidatePath(PRICES_PATH);
    return { data: null, error: null };
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
      amount: fromCents(Math.round(amountCents)),
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
 * Özel fiyat formunun boy havuzu — DİYALOG AÇILINCA okunur (paket formunun deseni). Sayfa açılışında
 * okunsaydı, kanal sekmesine bakan admin hiç açmayacağı bir formun katalogunu da öderdi.
 */
export async function loadVariantPoolAction(): Promise<ActionResult<VariantOption[]>> {
  try {
    await requireAdmin();
    const pool = await new ProductService(serviceDb()).listPool(VARIANT_POOL_LIMIT);
    const options = pool.flatMap((product) =>
      product.variants.map((variant) => ({
        variantId: variant.id,
        title: titleOf(resolveLocalizedText(product.name), resolveLocalizedText(variant.label)),
        // Pasif/aday ürün ya da kapalı boy: seçilebilir ama ekran söyler — özel fiyat, satışa
        // açılmadan önce hazırlanabilen bir anlaşmadır.
        sellable: product.status === 'active' && variant.isActive,
      })),
    );
    return { data: options, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/** Müşteri arama (özel fiyat seçicisi) — ad · telefon · e-posta; sonuç tavanlı. */
export async function searchCustomersAction(term: string): Promise<ActionResult<CustomerOption[]>> {
  try {
    await requireAdmin();
    const rows = await new UserProfileService(serviceDb()).search(term);
    return {
      data: rows.map((r) => ({
        id: r.id,
        name: r.name || r.phone || r.email || r.id.slice(0, 8),
        // İkinci satır KİMLİĞİ ayırt eder: aynı adlı iki müşteri telefonuyla ayrılır.
        hint: [r.phone, r.email].filter(Boolean).join(' · ') || 'iletişim bilgisi yok',
        isCompany: Boolean(r.companyInfo),
      })),
      error: null,
    };
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
      new StockService(db).unitCostMap(variantIds),
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

/**
 * İndirim/kupon yazar ya da günceller. `id` doluysa güncelleme.
 *
 * Doğrulamanın SON EMNİYETİ veritabanındadır (0031 kısıtları: kodsuz kupon, hedefsiz kapsam, ters
 * tarih, %100 üstü yüzde, tekil kod). Burada yalnız operatöre okunur hata verecek kadarı kontrol
 * edilir — kuralı iki yerde tam olarak yazmak, ikisinin ayrışması demektir.
 *
 * Sabit tutar KURUŞTAN euroya çevrilir (STACK §8: ekranda cent, DB'de euro).
 */
export async function saveDiscountAction(input: DiscountFormInput): Promise<ActionResult> {
  try {
    await requireAdmin();
    const svc = new DiscountService(serviceDb());

    const payload = {
      name: input.name.trim(),
      trigger: input.trigger,
      code: input.trigger === 'coupon' ? input.code.trim().toUpperCase() : null,
      type: input.type,
      value: input.type === 'fixed' ? fromCents(Math.round(input.valueCents)) : input.valueCents,
      scope: input.scope,
      categoryId: input.scope === 'category' ? input.targetId : null,
      collectionId: input.scope === 'collection' ? input.targetId : null,
      minBasket: input.minBasketCents === null ? null : fromCents(Math.round(input.minBasketCents)),
      firstOrderOnly: input.firstOrderOnly,
      validFrom: input.validFrom,
      validTo: input.validTo,
      customerId: input.customerId,
      maxUses: input.maxUses,
      perCustomerLimit: input.perCustomerLimit,
      isActive: input.isActive,
    };

    if (!payload.name) throw new Error('Ad girilmeli — listede kuralı bu adla tanıyacaksınız.');
    if (payload.trigger === 'coupon' && !payload.code) throw new Error('Kupon kodu girilmeli.');
    if (!Number.isFinite(input.valueCents) || input.valueCents <= 0) throw new Error('İndirim değeri sıfırdan büyük olmalı.');
    if (payload.scope !== 'cart' && !input.targetId) throw new Error('Kapsam hedefi seçilmeli (kategori ya da koleksiyon).');

    if (input.id) await svc.update({ id: input.id, ...payload });
    else await svc.insert(payload);

    revalidatePath(PRICES_PATH);
    return { data: null, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

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
