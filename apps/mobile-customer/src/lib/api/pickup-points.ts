import { CheckoutPickupSchema, type CheckoutPickup } from '@lezzet/types';
import { authorizedFetch } from '@lezzet/mobile-kit/src/lib/auth/authorized-fetch';
import type { ApiResult } from '@lezzet/mobile-kit/src/lib/api/client';

/*
  `/api/v1/me/pickup-points` — adres seçicideki "depodan teslim al" kartının kaynağı. Teklif sunucunundur (müşteri izni ×
  gel-al deposu); `null` = teklif yok, kart çizilmez. Şema `@lezzet/types`ta: checkout'un `pickup` dilimiyle aynı sözleşme.
*/
export type PickupPoint = CheckoutPickup['warehouses'][number];

export function fetchPickupPoints(): Promise<ApiResult<CheckoutPickup | null>> {
  return authorizedFetch('/api/v1/me/pickup-points', CheckoutPickupSchema.nullable());
}
