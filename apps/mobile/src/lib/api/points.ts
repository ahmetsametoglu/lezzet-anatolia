import type { z } from 'zod';
import { MePointsRedeemResultSchema, MePointsViewSchema, type MeCouponSchema } from '@lezzet/types';

import { authorizedFetch } from '../auth/authorized-fetch';
import type { ApiResult } from './client';

/*
  `/api/v1/me/points` — puan cüzdanı (21.17): bakiye + çevirme eşiği + kullanılabilir kuponlar.

  `points: null` B2B demektir, SIFIR DEĞİL (sözleşme künyesi): ekran bölümü hiç çizmez —
  "0 puan" yazmak, programa dahil olmayan müşteriye olmayan bir bakiye göstermek olurdu.

  Çevirme gövdesizdir: kaç puanın harcanacağını istemci söylemez, motor bakiyenin tamamını
  çevirir (web kararı, sözleşmede yazılı).
*/

export type MePointsView = z.infer<typeof MePointsViewSchema>;
export type MeCoupon = z.infer<typeof MeCouponSchema>;

export function fetchPoints(): Promise<ApiResult<MePointsView>> {
  return authorizedFetch('/api/v1/me/points', MePointsViewSchema);
}

export function redeemPoints(): Promise<ApiResult<z.infer<typeof MePointsRedeemResultSchema>>> {
  return authorizedFetch('/api/v1/me/points/redeem', MePointsRedeemResultSchema, { method: 'POST' });
}
