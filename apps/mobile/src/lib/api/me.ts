import type { z } from 'zod';
import { MeSchema } from '@lezzet/types';

import { authorizedFetch } from '../auth/authorized-fetch';
import type { ApiResult } from './client';

/*
  `/api/v1/me` — kimliği doğrulanmış kullanıcının profili.

  ŞEMA BURADA YAZILMAZ: `MeSchema` `@lezzet/types`ta yaşıyor ve UÇ DA onunla üretiyor (02-mimari
  §3.2 "sözleşme tek kaynak") — alan adı değişirse üreten ve tüketen aynı anda derlemede kırılır.
  Şemanın kendi künyesi `roles` alanının neden kümede olduğunu da yazıyor: uygulama kökü hangi
  kabuğu açacağına bu alanla karar verir.

  KORUNAN ÇAĞRI (`authorizedFetch`), çıplak `apiFetch` değil: uç Bearer'ın arkasında ve 401'de
  oturum bir kez tazelenip bir kez yeniden denenir. Oturum YOKSA çağrı ağa hiç çıkmaz, yerel
  kısa devreyle `401 unauthorized` döner — "oturumsuz kullanım = müşteri" kararının okunacağı yer
  burasıdır (02-mimari §4), veri katmanı yönlendirme YAPMAZ.

  TİP `z.infer` ile TÜRETİLİYOR: `Me` tipi `packages/types`tan bilerek ihraç edilmemişti ("ilk tip
  tüketicisi uygulama kabuğuyla gelecek, o gün tek satırla eklenir" — `me-api.schema.ts`). O gün
  BUGÜN, ama `packages/*` bu şeridin yazma alanı değil: tip şimdilik şemadan türetiliyor (aynı tek
  kaynak, sıfır duplikasyon) ve terfi ihtiyacı olarak raporlandı.
*/

/** Kabuğun okuduğu profil — alan kümesi `MeSchema`nın kendisi. */
export type Me = z.infer<typeof MeSchema>;

export function fetchMe(): Promise<ApiResult<Me>> {
  return authorizedFetch('/api/v1/me', MeSchema);
}
