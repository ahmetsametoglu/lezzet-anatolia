import { StaffScopeSchema, type StaffScope } from '@lezzet/types';

import { authorizedFetch } from '../auth/authorized-fetch';
import type { ApiResult } from './client';

/*
  OPERASYON KABUĞUNUN UCU — `/api/v1/operations/*` (30.08).

  Bölüm istemcilerinden (`warehouse` · `money` · `management` · `sale`) AYRI, çünkü sorusu
  bölüm-üstü: "bu personel nerede çalışıyor, nerelerde çalışabilir". Kabuk KAPIDA bir kez okur ve
  bağlamla altına dağıtır; ekran başına bir uçuş olsaydı beş üstbaşlık aynı soruyu beş kez sorar
  ve iki cevap ayrıştığında iki ekran iki farklı tesis adı yazardı (`sections-context.ts`
  künyesi: tek okuma, tek doğruluk).

  BU ÇAĞRIYA SEÇİM EKLENMEZ (`withWarehouseChoice` yok) ve bu bilinçli: seçimin kendisi bu
  cevaptan doğuyor. Kapsamı sorarken seçili depoyu göndermek, cevabı soruya bağlamak olurdu.

  ŞEMA BURADA YAZILMAZ: `StaffScopeSchema` `@lezzet/types`ta ve UÇ DA onunla üretiyor
  (02-mimari §3.2 "sözleşme tek kaynak") — alan adı değişirse üreten ve tüketen aynı anda
  derlemede kırılır.
*/

/**
 * **Personelin depo kapsamı.** `resolvedId === null` = kapsam tek bir tesis değil; istemci
 * seçmeli ve seçtiğini `?warehouseId=` ile göndermeli (`lib/operations/warehouse-choice.ts`).
 */
export function fetchStaffScope(): Promise<ApiResult<StaffScope>> {
  return authorizedFetch('/api/v1/operations/scope', StaffScopeSchema);
}
