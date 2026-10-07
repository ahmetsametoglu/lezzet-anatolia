import 'server-only';
import { refundRevolutOrder, type ProviderRefunder } from '@lezzet/application';
import { captureError, SOURCES } from '@lezzet/observability';
import { webRevolutClient } from '../revolut';

/**
 * Sağlayıcıya iade: paranın karta fiilen dönmesi. Port ortak katmanda (`ProviderRefunder`), sıra ve başarısızlık davranışı test
 * sahtesiyle sınanır; anahtar yoksa `unavailable`, sessiz başarı değil.
 */
export function revolutRefunder(): ProviderRefunder {
  return async (input) => {
    const client = await webRevolutClient();
    if (!client) return { status: 'unavailable' };

    try {
      const { refundOrderId } = await refundRevolutOrder(client, {
        orderRef: input.paymentRef,
        amountCents: input.amountCents,
        idempotencyKey: input.idempotencyKey,
      });
      return { status: 'ok', refundId: refundOrderId };
    } catch (error) {
      // Tek çağıran yalnız durumu okur; sağlayıcının söylediği sebep ancak bu izde kalır. Bağlam kimlik taşır.
      await captureError(error, {
        source: SOURCES.webAction,
        context: { paymentRef: input.paymentRef, idempotencyKey: input.idempotencyKey },
      });
      return { status: 'failed', error: error instanceof Error ? error.message : String(error) };
    }
  };
}
