'use server';

import { revalidatePath } from 'next/cache';
import { OrderService, serviceDb } from '@lezzet/database';
import { canTransition, derivePaymentStatusForOrder, needsDedicatedGate, transitionOwner, type TransitionOwner } from '@lezzet/domain-core';
import {
  DEFAULT_PAGE_SIZE,
  ORDER_STATUS_LABELS,
  type FulfillmentAdjustment,
  type KeysetCursor,
  type OrderStatus,
} from '@lezzet/types';
import { requireAdmin } from '@/lib/guard';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { adjustFulfillment, cancelOrder, retryRefund, type RefundBlockReason } from '@/lib/order/refund';
import { transitionOrder } from '@/lib/order/transition';
import { readOrderDetail } from './[id]/order-detail-read';
import { readOrdersPage } from './orders-page-read';
import { ORDERS_PATH, parseOrdersUrl } from './orders-url';
import type { OrderPeek, OrdersData } from './orders-types';

// Sipariş ekranı server action'ları — 'use server' + requireAdmin ilk + servise devret +
// `{ data, error }` DÖNER (throw yok) + revalidatePath.

/**
 * Sonsuz kaydırmanın sonraki sayfası. Süzgeçler URL'den okunur (ekranın adresi neyse o) — client'ın
 * gönderdiği bir süzgeç kopyası olsaydı ikisi ayrışabilirdi.
 */
export async function loadMoreOrdersAction(search: string, cursor: KeysetCursor): Promise<ActionResult<OrdersData>> {
  try {
    await requireAdmin();
    const urlState = parseOrdersUrl(Object.fromEntries(new URLSearchParams(search)));
    const data = await readOrdersPage(serviceDb(), urlState, { cursor, limit: DEFAULT_PAGE_SIZE });
    return { data, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/**
 * Hızlı bakışın derinliği — satır açıldığında çekilir, çünkü elli satırın kalemlerini peşinen çekmek biri açılsın diye
 * ellisinin bedelini ödemektir. Okuma detay sayfasınınkidir (`readOrderDetail`); ikinci bir okuma aynı siparişi iki gerçekle gösterirdi.
 */
export async function loadOrderPeekAction(orderId: string): Promise<ActionResult<OrderPeek>> {
  try {
    await requireAdmin();
    const detail = await readOrderDetail(serviceDb(), orderId);
    if (!detail) throw new Error('Sipariş bulunamadı — liste tazelenmeli.');
    const { lines, payment, delivery, customer, links, fulfillmentSettled } = detail;
    return { data: { lines, payment, delivery, customer, links, fulfillmentSettled }, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/**
 * Karar penceresinin önizlemesi: aynı motor fonksiyonu (`derivePaymentStatusForOrder`) önerilen adetlerle çalışır.
 * İstemci kendi hesabını yapsaydı pencerede yazan tutar ile kaydedilen tutar ayrışabilirdi.
 */
export async function previewFulfillmentAction(
  orderId: string,
  lines: ReadonlyArray<{ orderItemId: string; fulfilledQty: number; goodwillQty: number }>,
): Promise<ActionResult<{ refundDueCents: number; amountToCollectCents: number; fulfilledAmountCents: number }>> {
  try {
    await requireAdmin();
    const found = await new OrderService(serviceDb()).getWithItems(orderId);
    if (!found) throw new Error('Sipariş bulunamadı.');

    const proposed = new Map(lines.map((l) => [l.orderItemId, l]));
    const derivation = derivePaymentStatusForOrder(
      found.order,
      found.items.map((item) => {
        const next = proposed.get(item.id);
        return next ? { ...item, fulfilledQty: next.fulfilledQty, goodwillQty: next.goodwillQty } : item;
      }),
      { collectedCents: found.order.amountCollectedCents, refundedCents: found.order.amountRefundedCents },
    );

    return {
      data: {
        refundDueCents: derivation.refundDueCents,
        amountToCollectCents: derivation.amountToCollectCents,
        fulfilledAmountCents: derivation.fulfilledAmountCents,
      },
      error: null,
    };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/**
 * Kısmi karşılama / iade — karar penceresinin yazma yolu. İş kuralı uygulama kapısında (mal → türetim → para); action'ın
 * işi guard, çeviri ve tazeleme.
 */
export async function adjustFulfillmentAction(
  orderId: string,
  lines: readonly FulfillmentAdjustment[],
  opts: { refundAccountId?: string | null } = {},
): Promise<ActionResult<{ refundedAmountCents: number; amountToCollectCents: number; refundNotice: string | null; refundBlocked: RefundBlockReason | null }>> {
  try {
    const actor = await requireAdmin();
    const result = await adjustFulfillment(orderId, lines, { actorId: actor.profileId, ...opts });

    if (result.status === 'not_found') throw new Error('Sipariş bulunamadı.');
    if (result.status === 'stale') {
      throw new Error(
        `Sipariş bu sırada "${ORDER_STATUS_LABELS[result.currentStatus]}" durumuna geçmiş — ekranı tazeleyin.`,
      );
    }
    /* İstenen adetler zaten yazılmış (bayat ekran ya da tekrar); hiçbir satır yazılmadı. Operatörün yapacağı şey sayfayı
       tazeleyip kalan adetleri görmek. */
    if (result.status === 'already_marked') {
      throw new Error('Bu adetler bu arada başka bir kayıtla yazılmış — hiçbir şey değişmedi; sayfayı tazeleyip kalan adetlerle yeniden deneyin.');
    }

    revalidatePath(`${ORDERS_PATH}/${orderId}`);
    revalidatePath(ORDERS_PATH);
    return {
      data: {
        refundedAmountCents: result.refundedAmountCents,
        amountToCollectCents: result.amountToCollectCents,
        refundNotice: refundNotice(result.refundBlocked),
        refundBlocked: result.refundBlocked ?? null,
      },
      error: null,
    };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/** **İptal** — ayrılan mal serbest kalır, tahsil edilmişse tamamı iadeye devrolur. */
export async function cancelOrderAction(
  orderId: string,
  opts: { refundAccountId?: string | null } = {},
): Promise<ActionResult<{ refundedAmountCents: number; refundNotice: string | null; refundBlocked: RefundBlockReason | null }>> {
  try {
    const actor = await requireAdmin();
    // Sebep `staff`: iptali operasyon istedi; müşterinin kendi iptali ayrı sebep ve ayrı kapıdır, tek kova "neden" sorusunu
    // cevapsız bırakırdı.
    const result = await cancelOrder(orderId, { actorId: actor.profileId, reason: 'staff', ...opts });

    if (result.status === 'not_found') throw new Error('Sipariş bulunamadı.');
    if (result.status === 'forbidden') {
      throw new Error(
        result.reason === 'terminal'
          ? 'Bu sipariş kapandı, iptal edilemez.'
          : 'Bu sipariş iptal edilemez — teslim edilmişse iade yoluna girer.',
      );
    }
    if (result.status === 'stale') {
      throw new Error(
        `Sipariş bu sırada "${ORDER_STATUS_LABELS[result.currentStatus]}" durumuna geçmiş — ekranı tazeleyin.`,
      );
    }

    revalidatePath(`${ORDERS_PATH}/${orderId}`);
    revalidatePath(ORDERS_PATH);
    return {
      data: {
        refundedAmountCents: result.refundedAmountCents,
        refundNotice: refundNotice(result.refundBlocked),
        refundBlocked: result.refundBlocked ?? null,
      },
      error: null,
    };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/**
 * İadeyi yeniden dene — sağlayıcı çağrısı düştüğünde tek çıkış: düzeltme/iptal zaten yazıldığı için yalnız para ayağı
 * tekrar denenir. Borç yeniden türetilir, saklanmaz.
 */
export async function retryRefundAction(
  orderId: string,
  opts: { refundAccountId?: string | null } = {},
): Promise<ActionResult<{ refundedAmountCents: number; refundNotice: string | null; refundBlocked: RefundBlockReason | null }>> {
  try {
    await requireAdmin();
    const result = await retryRefund(orderId, opts);
    if (result.status === 'not_found') throw new Error('Sipariş bulunamadı.');

    revalidatePath(`${ORDERS_PATH}/${orderId}`);
    revalidatePath(ORDERS_PATH);
    return {
      data: {
        refundedAmountCents: result.refundedAmountCents,
        refundNotice: refundNotice(result.refundBlocked),
        refundBlocked: result.refundBlocked ?? null,
      },
      error: null,
    };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/**
 * İade yazılamadıysa operatöre söylenecek cümle: hata değil, çünkü düzeltme kaydedildi ve tekrar denenirse ikinci kez
 * uygulanırdı; sessiz de değil, çünkü sıfır iade "borç yoktu" gibi görünürdü. Her cümle ne yapılacağını söyler.
 */
function refundNotice(reason: RefundBlockReason | undefined): string | null {
  if (!reason) return null;

  const notices: Record<RefundBlockReason, string> = {
    no_account: 'İade yazılamadı: bu siparişte tahsilat kaydı yok, para hangi hesaptan çıkacağı belirlenemedi. Para hareketini elle girin.',
    provider_ref_missing:
      'İade yazılamadı: kart ödemesinin sağlayıcı künyesi kayıtlı değil, hangi ödemenin üzerinden dönüleceği bilinmiyor. Stripe panelinden iade edin.',
    provider_unavailable: 'İade yazılamadı: ödeme sağlayıcısı bu ortamda tanımlı değil.',
    /* Para birden çok hesaba girmiş: otomatik bölme yok, parayı almamış hesaptan iade yazmak o hesabın bakiyesini bozardı.
       Çare "tekrar dene" değil. */
    split_payment:
      'İade yazılamadı: bu siparişin parası birden çok hesaba girmiş (ör. kartla kapora + kapıda nakit). İadeyi hesap başına, o hesabı seçerek yazın.',
    provider_failed: 'İade yazılamadı: sağlayıcı çağrısı başarısız oldu. Para ÇIKMADI — tekrar deneyin ya da Stripe panelinden iade edin.',
  };
  return notices[reason];
}

/**
 * Durum ilerletme — uygulama kapısından (`transitionOrder`), ki test edilen yol operatörün yürüdüğü yolla aynı olsun ve
 * kapı denetimi atlanmasın. Ekran yalnız ofisin geçişlerini sunar; buradaki kontrol bayat sekmeye karşı ikinci kattır ve
 * müşteri haberi `webOrderEffects` ile teslimat ekranındakiyle aynı gider.
 */
export async function advanceOrderStatusAction(
  orderId: string,
  from: OrderStatus,
  to: OrderStatus,
): Promise<ActionResult<{ status: OrderStatus }>> {
  try {
    const actor = await requireAdmin();

    // Sahiplik: kurallara uyan ve düz kapıdan geçen ama anı sahanın ya da sistemin olan geçiş burada durur; kurallara aykırı
    // istek kapıya gider, cümlesini `gecisReddiCumlesi` seçer.
    const owner = transitionOwner(from, to);
    if (owner !== 'office' && canTransition(from, to).allowed && !needsDedicatedGate(from, to)) {
      throw new Error(sahiplikReddiCumlesi(owner));
    }

    // `from` = ekranın gördüğü durum: iyimser kilit onunla kurulur, yoksa bayat bir sekmeden gelen
    // istek operatörün beklediğinden başka bir durumdan ilerleyebilirdi.
    const result = await transitionOrder({ orderId, to, expectedFrom: from, actorId: actor.profileId });

    if (result.status === 'not_found') throw new Error('Sipariş bulunamadı.');
    if (result.status === 'forbidden') throw new Error(gecisReddiCumlesi(result.reason, result.gate));
    // `stale` = araya biri girdi (başka bir ekran ilerletti). Ezmek yerine gerçeği söyleriz.
    if (result.status === 'stale') {
      throw new Error(`Sipariş bu sırada "${ORDER_STATUS_LABELS[result.currentStatus]}" durumuna geçmiş — ekranı tazeleyin.`);
    }

    revalidatePath(ORDERS_PATH);
    return { data: { status: result.to }, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/**
 * Reddin operatöre söylenecek hâli: "yapılamaz" yolun kapalı olduğunu, "başka kapıdan" yolun başka olduğunu söyler. Aynı
 * cümle operatöre işi yapamayacağını söylerdi, oysa doğru düğme ekranın altında duruyor.
 */
function gecisReddiCumlesi(reason: 'same_status' | 'terminal' | 'not_allowed' | 'needs_dedicated_gate', gate?: string): string {
  if (reason === 'terminal') return 'Bu sipariş kapandı, durumu değişmez.';
  if (reason === 'same_status') return 'Sipariş zaten bu durumda.';
  if (reason === 'not_allowed') return 'Bu geçiş izinli değil.';
  return gate === 'deliver_order'
    ? 'Teslim bu ekrandan verilmez — kurye uygulamasından işaretlenir (stok düşümü ve kapıdaki tahsilat orada yazılıyor).'
    : gate === 'quick_sale'
      ? 'Kapı önü satışı hızlı satış ekranından kapatılır.'
      : 'İptal bu düğmeden yapılmaz — aşağıdaki "Siparişi iptal et" kararını kullanın (ayrılmış mal ve para iadesi orada işlenir).';
}

/**
 * Anı sahanın ya da sistemin olan geçişin reddi: cümle o anı hangi uygulamanın yazdığını söyler (depo ve kurye
 * uygulamaları, kargoda taşıyıcının takibi).
 */
function sahiplikReddiCumlesi(owner: Exclude<TransitionOwner, 'office'>): string {
  return owner === 'field'
    ? 'Bu adım sahadan yazılır: hazırlık depo uygulamasında (kutu ve eksik beyanıyla), yola çıkış ve kapıdaki sonuç kurye uygulamasında — kargoda taşıyıcının takibinden.'
    : 'Bu adımı sistem yazar: onay ödeme ya da sipariş verme akışından gelir, terk edilen sepet kendiliğinden süpürülür.';
}
