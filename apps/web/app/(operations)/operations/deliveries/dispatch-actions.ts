'use server';

import { revalidatePath } from 'next/cache';
import { OrderService, serviceDb } from '@lezzet/database';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { requireAdmin } from '@/lib/guard';

// Sevkiyatçının iki yazma yolu (09.15) — 'use server' + guard ilk + `{ data, error }` döner.
//
// Tasarım §1 kullanıcıyı yöneticide sabitliyor; guard da o yüzden `requireAdmin`. Kuryenin kendi
// dalı aynı sayfada ama ayrı kapıdan geçiyor (`requireCourier`) — atama buradan yapılır, kurye
// kendi listesini kendi yüzeyinde görür.

const PATH = '/operations/deliveries';

/**
 * **Kurye ataması — TOPLU.** Sevkiyatçı sabah on beş teslimatı iki kuryeye böler; satır satır atama
 * on beş tur eder ve ekran ortasında yarım kalmış bir plan bırakır.
 *
 * `courierId: null` atamayı KALDIRIR — yanlış kuryeye düşen bir günü geri almanın yolu olmalı.
 *
 * Yazım tek tek yapılıyor (toplu bir servis metodu yok) ama **kısmi başarı yutulmuyor**: kaç satır
 * yazıldığı dönüyor ve biri düşerse hata cümlesi kaç tanesinin yazıldığını söylüyor. "Hepsi ya da
 * hiçbiri" bir transaction ister; sessizce yarısını yazmak ise en kötüsü olurdu.
 */
export async function assignCourierAction(
  orderIds: string[],
  courierId: string | null,
): Promise<ActionResult<{ assigned: number }>> {
  try {
    await requireAdmin();
    if (orderIds.length === 0) throw new Error('Önce sipariş seçin.');

    const orders = new OrderService(serviceDb());
    let assigned = 0;
    for (const orderId of orderIds) {
      await orders.update({ id: orderId, courierId });
      assigned += 1;
    }

    revalidatePath(PATH);
    return { data: { assigned }, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/**
 * **Siparişi başka güne taşıma** — istisna yolu ("müşteri aradı, yarın olsun").
 *
 * Hedef gün SERBEST DEĞİL: ekran yalnız bölgenin yaklaşan teslim günlerini sunuyor
 * (`upcomingDeliveryDates`). Serbest tarih, o gün oraya araç gitmediği için teslim edilemeyecek bir
 * sipariş yaratırdı — ve o hatanın faturası müşteriye çıkardı.
 *
 * **Stok çıpasına dokunulmuyor ve dokunulmamalı:** ayrılmış mal siparişe bağlıdır, güne değil
 * (ORDER_LIFECYCLE) — gün değişince rezervasyon aynı kalır, mal müşterinin adına ayrılmış durur.
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
