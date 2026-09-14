import type { z } from 'zod';
import { PlaceNoticeResultSchema, type PlaceNoticeResult, type StockNoticeBodySchema } from '@lezzet/types';

import { authorizedFetch } from '@lezzet/mobile-kit/src/lib/auth/authorized-fetch';
import type { ApiResult } from '@lezzet/mobile-kit/src/lib/api/client';

/*
  `POST /api/v1/me/stock-notices` — "gelince haber ver" kaydı (21.306).

  KORUNAN ÇAĞRI (`authorizedFetch`): misafir kaydı bırakmadan önce çekmecede hesabını doğrular
  (bölge talebinin 10.08 akışı); e-postayı SUNUCU profilden çözer, gövdede adres yok. Cevap bölge
  kaydının dört hâlli sözleşmesidir — iki kayıt aynı soruları soruyor (sözleşme künyesi).
*/
export function submitStockNotice(body: z.input<typeof StockNoticeBodySchema>): Promise<ApiResult<PlaceNoticeResult>> {
  return authorizedFetch('/api/v1/me/stock-notices', PlaceNoticeResultSchema, { method: 'POST', body });
}
