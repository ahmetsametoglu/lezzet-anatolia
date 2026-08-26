import {
  ManagementHubSchema,
  OfferCandidatesResponseSchema,
  OfferOpenResponseSchema,
  SupplyDraftResponseSchema,
  SupplyResponseSchema,
  type ManagementHub,
  type OfferCandidatesResponse,
  type OfferOpenRequest,
  type OfferOpenResponse,
  type SupplyDraftRequest,
  type SupplyDraftResponse,
  type SupplyResponse,
} from '@lezzet/types';

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

export function fetchOfferCandidates(): Promise<ApiResult<OfferCandidatesResponse>> {
  return authorizedFetch('/api/v1/management/offer-candidates', OfferCandidatesResponseSchema);
}

/** Onay: seçili partiler operatörün SON fiyatıyla teklife açılır; akıbet satır satır gövdede. */
export function openOffers(body: OfferOpenRequest): Promise<ApiResult<OfferOpenResponse>> {
  return authorizedFetch('/api/v1/management/offers', OfferOpenResponseSchema, { method: 'POST', body });
}

export function fetchSupplyGroups(): Promise<ApiResult<SupplyResponse>> {
  return authorizedFetch('/api/v1/management/supply', SupplyResponseSchema);
}

/** Grup onayı → taslak TS. Kalem listesi GÖNDERİLMEZ — sunucu öneriyi onay anında tazeler (sözleşme künyesi). */
export function createSupplyDraft(body: SupplyDraftRequest): Promise<ApiResult<SupplyDraftResponse>> {
  return authorizedFetch('/api/v1/management/supply/draft', SupplyDraftResponseSchema, { method: 'POST', body });
}
