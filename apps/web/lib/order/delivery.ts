import { resolveDelivery as resolveDeliveryFor } from '@lezzet/application';
import type { DeliveryResolution, ResolveDeliveryInput } from '@lezzet/application';
import { serviceDb } from '@lezzet/database';
import { readDeliveryInputs } from '@/lib/delivery/inputs';

/**
 * Checkout teslimat çözümünün web köprüsü: kural `@lezzet/application`'ın `order/delivery`sindedir, burada yalnız web'e özgü istek
 * kapsamlı liste önbelleği (`lib/delivery/inputs`) eklenir, çünkü aynı istekte sepet ile katalog aynı depoyu görmeli.
 */
export async function resolveDelivery(input: Omit<ResolveDeliveryInput, 'inputs'>): Promise<DeliveryResolution> {
  return resolveDeliveryFor(serviceDb(), { ...input, inputs: await readDeliveryInputs() });
}
