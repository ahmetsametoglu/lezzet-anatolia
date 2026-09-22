import 'server-only';
import { serviceDb } from '@lezzet/database';
import { deliverOrder as deliverOrderFor } from '@lezzet/application';
import { webOrderEffects } from './transition';

/** Teslim köprüsü: gövde `@lezzet/application`da; web'in etki portu tek olduğu için burada ikinci bir etki nesnesi kurulmaz. */
export function deliverOrder(orderId: string, opts: { actorId?: string | null; deliveryProof?: Record<string, unknown> | null } = {}) {
  return deliverOrderFor(serviceDb(), orderId, { ...opts, effects: webOrderEffects });
}
