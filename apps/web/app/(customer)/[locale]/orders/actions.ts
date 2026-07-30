'use server';

import type { KeysetCursor } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';
import { currentCustomerId } from '@/lib/guard';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { listCustomerOrders, type CustomerOrderPage } from '@/lib/order/customer-orders';
import { planReorder } from '@/lib/order/reorder';
import type { CartEntry } from '@/lib/cart/cart-types';

/**
 * Siparişler sayfasının yazma/sayfalama kapıları (08.5).
 *
 * **Kimlik her eylemde SUNUCUDA çözülür** (`currentCustomerId`); sipariş kimliği istemciden geliyor
 * ve bu kaçınılmaz, o yüzden sahiplik kontrolü kapının içinde (`planReorder`). Sormasaydık tarayıcı
 * konsolundan gönderilen bir kimlikle başkasının siparişi sepete kopyalanabilirdi.
 */

/** Sonraki sayfa — imleç URL'e yazılmaz, istemcide yaşar (liste kaydırdıkça uzar). */
export async function loadMoreOrdersAction(locale: Locale, cursor: KeysetCursor): Promise<ActionResult<CustomerOrderPage>> {
  try {
    const customerId = await currentCustomerId();
    if (!customerId) throw new Error('Oturum bulunamadı');
    return { data: await listCustomerOrders(locale, customerId, cursor), error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/**
 * Tekrar sipariş — sepete yazmaz, **niyet listesini döndürür.**
 *
 * Sebep: sepet ziyaretçide tarayıcıda, girişli müşteride sunucuda yaşıyor ve ikisini birleştiren
 * yer `CartProvider`. Action doğrudan yazsaydı istemcideki sepet durumu bundan habersiz kalır,
 * ekran eski sayıyı göstermeye devam ederdi. Aynı desen boş sepetteki "hepsini sepete al"da da
 * kullanılıyor (`addMany`) — ikinci bir akış yazılmadı.
 */
export async function reorderAction(
  locale: Locale,
  orderId: string,
): Promise<ActionResult<{ entries: readonly CartEntry[]; skipped: readonly string[] }>> {
  try {
    const customerId = await currentCustomerId();
    if (!customerId) throw new Error('Oturum bulunamadı');

    const plan = await planReorder(locale, customerId, orderId);
    // `null` = sipariş yok ya da başkasının. İkisi AYNI cevabı almalı: "yok" ile "senin değil"
    // arasındaki farkı söylemek, başkasının sipariş kimliğini doğrulatmak olurdu.
    if (!plan) throw new Error('Sipariş bulunamadı');

    return { data: { entries: plan.entries, skipped: plan.skipped }, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}
