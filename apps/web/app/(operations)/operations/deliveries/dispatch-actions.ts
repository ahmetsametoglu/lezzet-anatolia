'use server';

import { revalidatePath } from 'next/cache';
import { DeliveryRunService, OrderService, serviceDb } from '@lezzet/database';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { requireAdmin } from '@/lib/guard';

// Sevkiyatçının yazma yolları (09.15) — 'use server' + guard ilk + `{ data, error }` döner.
//
// Tasarım §1 kullanıcıyı yöneticide sabitliyor; guard da o yüzden `requireAdmin`. Kuryenin kendi
// dalı aynı sayfada ama ayrı kapıdan geçiyor (`requireCourier`).
//
// **TOPLU KURYE ATAMASI SÖKÜLDÜ (K2, 18.08 — `docs/feature/sefer.md`).** `assignCourierAction`
// sipariş seçip kurye dağıtıyordu; kullanıcının kararı: *"arayüzden atama saçma — kurye rotayı
// alır ve sürer."* Kurye bilgisini artık seferin kendisi yazar (`start_delivery_run` claim'i).
// Kalan tek istisna aşağıdaki DEVİR: sefer-seviyesinde, sipariş-seviyesinde değil.

const PATH = '/operations/deliveries';

/**
 * **Seferi devret** (K2 istisnası) — kurye hastalandı, telefon evde kaldı: sevkiyatçı AÇIK seferi
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

/**
 * **Askıda kalmış siparişi bir güne yazma** (kullanıcı kararı 16.08 — "görünür devir").
 *
 * `moveDeliveryDayAction`tan AYRI, çünkü fazladan bir iş yapıyor: durum `out_for_delivery`de
 * TAKILI kalmışsa önce onu çözüyor. Aynı fonksiyona koymak olmazdı — taşıma bugünün siparişine
 * uygulanan bir istisna yolu ve orada `out_for_delivery` yasağı DOĞRU: kutu araçta, kurye yolda,
 * altından günü değiştirmek kaydı gerçekten koparır.
 *
 * ── NEDEN BURADA AYNI YASAK GEÇERLİ DEĞİL ──────────────────────────────────
 * Teslim günü GEÇMİŞSE `out_for_delivery` artık gerçeği anlatmıyor: araç döndü. Durum bayat ve
 * yasak, süresi dolmuş bir gerçeği koruyor. Ölçüldü (16.08): bu hâlden çıkışın üç kapısı da kurye
 * eylemi ister, hiçbir zamanlanmış iş/trigger siparişe dokunmuyor, kuryenin web ekranı yalnız
 * BUGÜNÜ okuyor — yani sipariş hiçbir rolün ulaşamadığı bir kilitte kalıyordu.
 *
 * **18.08'den beri ANA YOL sefer kapanışı:** `close_delivery_run` takılı durakları kapanış anında
 * kendisi çözüyor (K4) — bu dalın normal akışta işi kalmadı. Yine de SÖKÜLMEDİ: sefer hiç
 * kapatılmadan unutulursa (kurye kapanışı atlar) kilit yeniden doğar ve sevkiyatçının son çaresi
 * budur. Sefer disiplini oturunca bu dal ölçülüp sökülebilir.
 *
 * ── KURYENİN İŞİNİ YAPMIYOR ────────────────────────────────────────────────
 * Yazılan geçiş `out_for_delivery → ready`, yani motorun **"ulaşılamadı"** kenarı: *mal ayrılmış
 * kalır, stok HİÇ değişmez* (ORDER_LIFECYCLE). Kapıdaki gerçekler — teslim edildi, reddedildi,
 * para alındı — buradan YAZILAMAZ ve yazılmamalı (tasarım §6). Bu bir kapı kaydı değil bir
 * **sevkiyat kaydı**: "gün kapandı, bu durak sonuçlanmadı". Not da öyle yazılıyor ki durum
 * geçmişine bakan, bunu kuryenin kapıda verdiği bir hüküm sanmasın.
 */
export async function bringForwardAction(orderId: string, date: string): Promise<ActionResult<{ date: string }>> {
  try {
    const admin = await requireAdmin();
    const orders = new OrderService(serviceDb());

    const order = await orders.getById(orderId);
    if (!order) throw new Error('Sipariş bulunamadı.');
    if (order.deliveryType !== 'route') throw new Error('Bu sipariş kargoyla gidiyor — teslim günü taşıyıcınındır.');

    const today = new Date().toISOString().slice(0, 10);
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
