'use server';

import { revalidatePath } from 'next/cache';
import { PriceService, ProductService, serviceDb } from '@lezzet/database';
import type { Channel } from '@lezzet/types';
import { requireAdmin } from '@/lib/guard';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { repriceProduct } from '@/lib/pricing/auto-price';

// Fiyat yazma yolu — İKİ yüzeyin ortak eylemi (16.08): fiyat ekranının düzenleme diyaloğu artık
// ürünler önizlemesinin fiyat bakışından da açılıyor. Server action'lar kural gereği sayfa
// klasöründe kolokasyon eder; bu ikisi artık tek sayfaya ait olmadığı için `lib/`'e taşındı
// (desen: `lib/prices/discount-actions` · `lib/stock/offer-actions`).

/** Fiyat ekranının yolu; fiyat yazılınca liste tazelenir. */
const PRICES_PATH = '/operations/prices';

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
  /** B2B'ye özel hedef (15.08) — `null` = ortak hedef B2B'de de geçerli. */
  targetMarginB2bPercent: number | null,
): Promise<ActionResult<{ changed: number; held: number }>> {
  try {
    await requireAdmin();
    // Ortak hedef otomatikte ZORUNLU kalır (B2B hedefi tek başına yetmez): ortak hedef B2C'nin de
    // hedefi ve hedefsiz kanalın fiyatı sessizce donardı.
    if (autoPrice && (targetMarginPercent === null || !Number.isFinite(targetMarginPercent))) {
      throw new Error('Otomatik fiyat için hedef marj girilmeli.');
    }
    if (targetMarginPercent !== null && targetMarginPercent < 0) {
      throw new Error('Hedef marj negatif olamaz.');
    }
    if (targetMarginB2bPercent !== null && (!Number.isFinite(targetMarginB2bPercent) || targetMarginB2bPercent < 0)) {
      throw new Error('B2B hedef marjı negatif olamaz.');
    }

    const db = serviceDb();
    await new ProductService(db).updateDetails(productId, { autoPrice, targetMarginPercent, targetMarginB2bPercent });
    // Anahtar kapatıldıysa fiyata dokunulmaz: elle yönetime dönen ürünün son otomatik fiyatı
    // geçerli fiyatıdır, "eski elle fiyata dön" diye bir kayıt yoktur.
    const outcome = autoPrice ? await repriceProduct(db, productId) : null;
    revalidatePath(PRICES_PATH);
    return { data: { changed: outcome?.changes.length ?? 0, held: outcome?.heldVariantIds.length ?? 0 }, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}
