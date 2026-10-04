'use server';

import { revalidatePath } from 'next/cache';
import { DeliveryRunService, OrderService, serviceDb } from '@lezzet/database';
import { parisDateOf } from '@lezzet/helper';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { requireAdmin } from '@/lib/guard';

// Sevkiyatçının yazma yolları yöneticiye açıktır (`requireAdmin`); kuryenin dalı aynı sayfada ayrı kapıdan geçer. Toplu kurye ataması
// yoktur, çünkü kurye bilgisini seferin kendisi yazar (`docs/feature/sefer.md`); tek istisna aşağıdaki sefer devridir.

const PATH = '/operations/deliveries';

/**
 * **Seferi devret**: kurye hastalandı, telefon evde kaldı; sevkiyatçı açık seferi
 * başka kuryeye verir. Run + seferin sonuçlanmamış siparişleri tek transaction'da değişir
 * (`reassign_delivery_run`); teslim edilmiş durakların kuryesi tarihî gerçek olarak yerinde kalır.
 */
export async function reassignRunAction(runId: string, courierId: string): Promise<ActionResult<{ movedStops: number }>> {
  try {
    const admin = await requireAdmin();

    const result = await new DeliveryRunService(serviceDb()).reassign({ runId, courierId, actorId: admin.profileId });
    if (!result.ok) {
      throw new Error(
        result.reason === 'already_closed'
          ? 'Bu sefer kapanmış — mutabakatı yapılmış sefer devredilemez.'
          : result.reason === 'same_courier'
            ? 'Sefer zaten bu kuryede.'
            : 'Sefer bulunamadı.',
      );
    }

    revalidatePath(PATH);
    return { data: { movedStops: result.movedStops ?? 0 }, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/**
 * Siparişi başka güne taşımak istisna yoludur ve hedef gün bölgenin yaklaşan teslim günleriyle sınırlıdır, çünkü o gün oraya araç
 * gitmiyorsa sipariş teslim edilemezdi. Stok çıpasına dokunulmaz: ayrılmış mal siparişe bağlıdır, güne değil (ORDER_LIFECYCLE).
 */
export async function moveDeliveryDayAction(orderId: string, date: string): Promise<ActionResult<{ date: string }>> {
  try {
    await requireAdmin();
    const orders = new OrderService(serviceDb());

    const order = await orders.getById(orderId);
    if (!order) throw new Error('Sipariş bulunamadı.');
    // Yola çıkmış ya da sonuçlanmış siparişin günü değiştirilmez: mal artık araçta ya da müşteride.
    if (order.status !== 'confirmed' && order.status !== 'preparing' && order.status !== 'ready') {
      throw new Error('Bu sipariş yola çıkmış ya da sonuçlanmış — günü değiştirilemez.');
    }

    await orders.update({ id: orderId, deliveryDate: date });

    revalidatePath(PATH);
    return { data: { date }, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/**
 * Askıda kalmış siparişi bir güne yazar: teslim günü geçmişse `out_for_delivery` artık gerçeği anlatmaz ve önce `ready`ye çözülür; ana
 * yol sefer kapanışıdır, bu kapı sefer kapatılmadan unutulduğunda son çaredir. Bu bir sevkiyat kaydıdır, kapı kaydı değil: teslim, ret ya
 * da tahsilat buradan yazılmaz ve mal ayrılmış kalır.
 */
export async function bringForwardAction(orderId: string, date: string): Promise<ActionResult<{ date: string }>> {
  try {
    const admin = await requireAdmin();
    const orders = new OrderService(serviceDb());

    const order = await orders.getById(orderId);
    if (!order) throw new Error('Sipariş bulunamadı.');
    if (order.deliveryType !== 'route') throw new Error('Bu sipariş kargoyla gidiyor — teslim günü taşıyıcınındır.');

    const today = parisDateOf(new Date());
    // Bu eylem YALNIZ askıda kalanın kapısıdır. Günü gelmemiş bir sipariş için `moveDeliveryDayAction`
    // var; ikisini birbirinin yerine kullanmak, bugünün siparişinde `out_for_delivery` yasağını
    // sessizce delerdi.
    if (!order.deliveryDate || order.deliveryDate >= today) {
      throw new Error('Bu sipariş askıda değil — günü gelmemiş siparişin taşınması için "başka güne taşı" kullanılır.');
    }
    if (date < today) throw new Error('Geçmiş bir güne yazılamaz.');

    if (order.status === 'out_for_delivery') {
      const moved = await orders.transition({
        orderId,
        from: 'out_for_delivery',
        to: 'ready',
        actorId: admin.profileId,
        note: 'Sevkiyat: teslim günü kapandı, durak sonuçlanmadı — sipariş yeniden planlandı.',
      });
      // Araya biri girdiyse (kurye o sırada teslim işaretlediyse) yazma: onun kaydı daha yenidir.
      if (!moved.ok) throw new Error(`Sipariş bu sırada "${moved.currentStatus}" durumuna geçmiş — sayfayı yenileyin.`);
    }

    await orders.update({ id: orderId, deliveryDate: date });

    revalidatePath(PATH);
    return { data: { date }, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}
