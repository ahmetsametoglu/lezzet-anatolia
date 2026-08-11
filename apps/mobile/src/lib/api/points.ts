import type { z } from 'zod';
import { MePointsRedeemResultSchema, MePointsViewSchema } from '@lezzet/types';

import { authorizedFetch } from '../auth/authorized-fetch';
import type { ApiResult } from './client';

/*
  `/api/v1/me/points` — puan cüzdanı (21.17): bakiye + çevirme eşiği + kullanılabilir kuponlar.

  `points: null` B2B demektir, SIFIR DEĞİL (sözleşme künyesi): ekran bölümü hiç çizmez —
  "0 puan" yazmak, programa dahil olmayan müşteriye olmayan bir bakiye göstermek olurdu.

  Çevirme gövdesizdir: kaç puanın harcanacağını istemci söylemez, motor bakiyenin tamamını
  çevirir (web kararı, sözleşmede yazılı).
*/

/*
  Kupon satırının ayrı bir takma adı YOK: kuponlar cüzdanın içinde geliyor ve ekran onları
  `MePointsView['coupons']` üzerinden çıkarımla okuyor (`account-screen`). `MeCouponSchema`dan
  ikinci bir ad türetmek, aynı şekle iki isim vermek olurdu (CLAUDE §1) — gerekirse görünümden
  indekslenerek alınır, yeniden türetilmez.
*/
export type MePointsView = z.infer<typeof MePointsViewSchema>;

export function fetchPoints(): Promise<ApiResult<MePointsView>> {
  return authorizedFetch('/api/v1/me/points', MePointsViewSchema);
}

export function redeemPoints(): Promise<ApiResult<z.infer<typeof MePointsRedeemResultSchema>>> {
  return authorizedFetch('/api/v1/me/points/redeem', MePointsRedeemResultSchema, { method: 'POST' });
}
