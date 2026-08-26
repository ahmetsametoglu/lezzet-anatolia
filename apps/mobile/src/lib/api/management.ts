import { ManagementHubSchema, type ManagementHub } from '@lezzet/types';

import { authorizedFetch } from '../auth/authorized-fetch';
import type { ApiResult } from './client';

/*
  YÖNETİM UÇLARI — `/api/v1/management/*` (21.12).

  ŞEMA BURADA YAZILMAZ: zarf `@lezzet/types`ın (`contracts/management-api.schema.ts`) ve uç da aynı
  şemayla üretiyor — alan değişirse üreten ve tüketen aynı anda derlemede kırılır (sale emsali).

  TEK ÇAĞRI, İKİ EKRAN: hub ve gün özeti aynı zarfı okur (uç künyesi — "kutu 3 diyor, özet 2"
  çelişkisi doğmasın). Rol kapısı `admin`; kabuk zaten yalnız admin'i bu bölüme sokuyor.
*/

export function fetchManagementHub(): Promise<ApiResult<ManagementHub>> {
  return authorizedFetch('/api/v1/management/hub', ManagementHubSchema);
}
