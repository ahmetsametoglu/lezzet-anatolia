'use server';

import { reconcileDraftPayment } from '@lezzet/application';
import { OrderService, serviceDb } from '@lezzet/database';
import { currentCustomerId } from '@/lib/guard';
import { CustomerError, customerErrorKey, type CustomerResult } from '@/lib/customer-error';
import { orderIdOrNull } from '@/lib/order/order-id';
import { webPaymentEffects } from '@/lib/order/transition';
import { stripePaymentGateway } from '@/lib/stripe';

/**
 * **Onay sayfasının "sağlayıcıya sor" eylemi** (07.18) — ödeme olayı gelmediğinde siparişi webhook'la AYNI
 * yoldan netleştirir (`reconcileDraftPayment`): ödendiyse onaylar, ödeme gelmeyecekse kapatır, banka
 * işliyorsa bekler. Canlı bağ (`OrderWatch`) birkaç saniyede bir çağırır.
 *
 * Kimlik yoldan gelir, sahiplik burada sınanır: başkasının siparişi için sağlayıcıya soru sorulmaz ve cevap
 * "netleşti" döner — canlı bağ sussun, siparişin varlığı da doğrulanmasın.
 */
export async function verifyPaymentAction(orderId: string): Promise<CustomerResult<{ settled: boolean }>> {
  try {
    const customerId = await currentCustomerId();
    if (!customerId) throw new CustomerError('session_expired');
    const id = orderIdOrNull(orderId);
    const db = serviceDb();
    const order = id ? await new OrderService(db).getById(id) : null;
    if (!order || order.customerId !== customerId) return { data: { settled: true }, errorKey: null };

    const outcome = await reconcileDraftPayment(db, order.id, { gateway: stripePaymentGateway(), effects: webPaymentEffects });
    // "Netleşti": onaylandı, kapandı ya da artık sorulacak bir taslak değil. Sorulamayan hâllerde de
    // (anahtar yok) sormayı sürdürmenin anlamı yok — webhook ve zamanlayıcı yine çalışıyor. Tanınmayan bir
    // sağlayıcı durumunda sorular sürer: bir sonraki cevap tanıdık olabilir.
    const settled =
      outcome.status === 'confirmed' || outcome.status === 'cancelled' || (outcome.status === 'skipped' && outcome.reason !== 'unknown_status');
    return { data: { settled }, errorKey: null };
  } catch (err) {
    return { data: null, errorKey: customerErrorKey(err) };
  }
}
