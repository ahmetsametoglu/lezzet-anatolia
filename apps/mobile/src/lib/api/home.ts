import type { z } from 'zod';
import { HomeSchema } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';

import { apiFetch, type ApiResult } from './client';

/*
  VİTRİN OKUMASI — `/api/v1/home`. Üç bölüm TEK turda gelir (bantlar · fırsatlar · tarifler);
  şema `@lezzet/types`ın (`home-api.schema.ts`), uç da AYNI şemayla üretiyor — alan adı değişirse
  iki taraf birden derlemede kırılır (katalog istemcisinin kuralı, birebir).

  `locale` zorunlu: uç dilsiz çağrıyı 400'le reddediyor. Sayfalama/limit parametresi YOK —
  vitrin rayları sabit sınırlı editoryal seçkidir (CLAUDE §1).
*/

export function fetchHome(locale: Locale, postalCode?: string | null): Promise<ApiResult<z.infer<typeof HomeSchema>>> {
  /* POSTA KODU YERİN SORUSUDUR, cevabı değil: depo kimliğini sunucu çözer (uç künyesi
     `catalog.ts` → `readPlace`). Kod yoksa parametre HİÇ gönderilmez — boş bir `postalCode=`
     sunucuda "yer bilinmiyor"a düşer ama isteği de gereksiz kirletir.

     BUNSUZ FIRSAT GELMİYOR (kullanıcı bulgusu 09.08): teklif tutarı bir partiye, parti bir depoya
     bağlı; yer bilinmezken hiç okunmuyor ve şerit boş kalıyordu. Ölçüldü: kodsuz `offers=0`,
     `postalCode=67000` ile `offers=2`. */
  const query = new URLSearchParams({ locale });
  if (postalCode !== undefined && postalCode !== null && postalCode !== '') query.set('postalCode', postalCode);
  return apiFetch(`/api/v1/home?${query.toString()}`, HomeSchema);
}
