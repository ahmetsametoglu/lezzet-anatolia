import { captureError } from '@lezzet/observability';
import type { ProviderRefunder } from './effects';
import { refundRevolutOrder, type RevolutClient } from './revolut';

/**
 * Sağlayıcıya iade portu: paranın karta fiilen dönmesi. Her yüzey istemcisini ve hata kaynağını verir, gövde tektir; anahtar yoksa
 * `unavailable` döner, sessiz başarı değil.
 */
export function revolutRefunderWith(clientOf: () => Promise<RevolutClient | null>, source: string): ProviderRefunder {
  return async (input) => {
    const client = await clientOf();
    if (!client) return { status: 'unavailable' };

    try {
      const { refundOrderId } = await refundRevolutOrder(client, {
        orderRef: input.paymentRef,
        amountCents: input.amountCents,
        idempotencyKey: input.idempotencyKey,
      });
      return { status: 'ok', refundId: refundOrderId };
    } catch (error) {
      // Çağıran yalnız durumu okur; sağlayıcının söylediği sebep ancak bu izde kalır. Bağlam kimlik taşır.
      await captureError(error, { source, context: { paymentRef: input.paymentRef, idempotencyKey: input.idempotencyKey } });
      return { status: 'failed', error: error instanceof Error ? error.message : String(error) };
    }
  };
}
