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

export function fetchHome(locale: Locale): Promise<ApiResult<z.infer<typeof HomeSchema>>> {
  return apiFetch(`/api/v1/home?locale=${encodeURIComponent(locale)}`, HomeSchema);
}
