import {
  B2bCheckResponseSchema,
  B2bDecisionResponseSchema,
  B2bQueueResponseSchema,
  B2bSummaryResponseSchema,
  ComplaintDraftResponseSchema,
  ComplaintResponseSchema,
  ComplaintsResponseSchema,
  ExceptionAskResponseSchema,
  ExceptionsResponseSchema,
  ManagementHubSchema,
  OfferCandidatesResponseSchema,
  OfferOpenResponseSchema,
  SupplyDraftResponseSchema,
  SupplyResponseSchema,
  type B2bCheckResponse,
  type B2bDecisionResponse,
  type B2bQueueResponse,
  type B2bSummaryResponse,
  type ComplaintDraftResponse,
  type ComplaintResponse,
  type ComplaintsResponse,
  type ExceptionAskResponse,
  type ExceptionsResponse,
  type ManagementHub,
  type OfferCandidatesResponse,
  type OfferOpenRequest,
  type OfferOpenResponse,
  type SupplyDraftRequest,
  type SupplyDraftResponse,
  type SupplyResponse,
  type TicketActionResponse,
  TicketActionResponseSchema,
  type TicketHandler,
  type TicketStatus,
  type TicketType,
} from '@lezzet/types';

import { authorizedFetch } from '../auth/authorized-fetch';
import { queryString, type ApiResult } from './client';

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

/* ── Y1 · Şikâyet / talep ───────────────────────────────────────────────────── */

/**
 * Talep listesi (21.281) — süzgeç + keyset sayfası.
 *
 * `cursor` telde OPAK: istemci onu yorumlamaz, sunucudan aldığını aynen geri verir (sosyal gelen
 * kutusunun aynı kuralı). Süzgeç ile tür ayrı iki parametre ama ekran ikisini birden GÖNDERMEZ —
 * şerit tek seçimlidir.
 */
export function fetchComplaints(params: {
  cursor?: string;
  filter?: 'all' | 'awaiting' | 'resolved';
  type?: TicketType;
}): Promise<ApiResult<ComplaintsResponse>> {
  return authorizedFetch(
    `/api/v1/management/complaints${queryString({ cursor: params.cursor, filter: params.filter, type: params.type })}`,
    ComplaintsResponseSchema,
  );
}

/** `ticketId` verilmezse cevap bekleyen EN TAZE talep — hub'ın karar satırı parametresiz de açılır. */
export function fetchComplaint(ticketId?: string): Promise<ApiResult<ComplaintResponse>> {
  const path = ticketId === undefined ? '/api/v1/management/complaints/next' : `/api/v1/management/complaints/${ticketId}`;
  return authorizedFetch(path, ComplaintResponseSchema);
}

export function replyComplaint(ticketId: string, body: string): Promise<ApiResult<TicketActionResponse>> {
  return authorizedFetch(`/api/v1/management/complaints/${ticketId}/reply`, TicketActionResponseSchema, {
    method: 'POST',
    body: { body },
  });
}

/**
 * Durum geçişi — `claimComplaint`in yerine geçti (21.276): hedef artık gövdede, ekranın niyeti
 * uçta sabitlenmiş değil. "Üstlen" bu kapının `in_progress` çağrısıdır.
 */
export function setComplaintStatus(ticketId: string, to: TicketStatus): Promise<ApiResult<TicketActionResponse>> {
  return authorizedFetch(`/api/v1/management/complaints/${ticketId}/status`, TicketActionResponseSchema, {
    method: 'POST',
    body: { to },
  });
}

/** Yürütücü modu — çekmecenin "ASİSTAN MODU" bölümü. */
export function setComplaintMode(ticketId: string, mode: TicketHandler): Promise<ApiResult<TicketActionResponse>> {
  return authorizedFetch(`/api/v1/management/complaints/${ticketId}/mode`, TicketActionResponseSchema, {
    method: 'POST',
    body: { mode },
  });
}

/** Talep türünün düzeltilmesi — çekmecenin "TALEP TÜRÜ" bölümü. */
export function setComplaintType(ticketId: string, type: TicketType): Promise<ApiResult<TicketActionResponse>> {
  return authorizedFetch(`/api/v1/management/complaints/${ticketId}/type`, TicketActionResponseSchema, {
    method: 'POST',
    body: { type },
  });
}

/** İade damgası — gövdesiz; tutar ve akıbet siparişte seçilir. */
export function triggerComplaintReturn(ticketId: string): Promise<ApiResult<TicketActionResponse>> {
  return authorizedFetch(`/api/v1/management/complaints/${ticketId}/return`, TicketActionResponseSchema, {
    method: 'POST',
    body: {},
  });
}

export function consumeComplaintDraft(ticketId: string, send: boolean): Promise<ApiResult<ComplaintDraftResponse>> {
  return authorizedFetch(`/api/v1/management/complaints/${ticketId}/draft`, ComplaintDraftResponseSchema, {
    method: 'POST',
    body: { send },
  });
}

/* ── Y2 · Sipariş istisnaları ───────────────────────────────────────────────── */

export function fetchExceptions(): Promise<ApiResult<ExceptionsResponse>> {
  return authorizedFetch('/api/v1/management/exceptions', ExceptionsResponseSchema);
}

export function askException(orderItemId: string): Promise<ApiResult<ExceptionAskResponse>> {
  return authorizedFetch(`/api/v1/management/exceptions/${orderItemId}/ask`, ExceptionAskResponseSchema, {
    method: 'POST',
    body: {},
  });
}

/* ── KURUMSAL HESAP BAŞVURUSU (21.217) ─────────────────────────────────────── */

/**
 * Onay kuyruğu — iki sekme. Cevap İKİ SEKMENİN sayacını birden taşıyor: okunmayan sekmenin sayısı
 * boş kalırsa operatör oraya basmadan ne olduğunu bilemez.
 */
export function fetchB2bQueue(params: { filter?: 'pending' | 'decided'; cursor?: string } = {}): Promise<
  ApiResult<B2bQueueResponse>
> {
  return authorizedFetch(
    `/api/v1/management/b2b${queryString({ filter: params.filter, cursor: params.cursor })}`,
    B2bQueueResponseSchema,
  );
}

/** Kontrol kartı — açılışta dış servisleri tazeliyor (künyesi uçta), o yüzden liste değil DETAY okuması. */
export function fetchB2bCheck(customerId: string): Promise<ApiResult<B2bCheckResponse>> {
  return authorizedFetch(`/api/v1/management/b2b/${customerId}`, B2bCheckResponseSchema);
}

/**
 * Asistan özeti — karttan AYRI okunuyor: model çağrısı saniye mertebesinde ve kartın açılışı onu
 * beklememeli. Uç üretilememeyi de 200 + `summary: null` diye söylüyor (sözleşme künyesi).
 */
export function fetchB2bSummary(customerId: string): Promise<ApiResult<B2bSummaryResponse>> {
  return authorizedFetch(`/api/v1/management/b2b/${customerId}/summary`, B2bSummaryResponseSchema);
}

export function approveB2bApplication(customerId: string): Promise<ApiResult<B2bDecisionResponse>> {
  return authorizedFetch(`/api/v1/management/b2b/${customerId}/approve`, B2bDecisionResponseSchema, { method: 'POST' });
}

/** Ret SEBEPSİZ gönderilmez — uç da boş sebebi `invalid_body` ile reddediyor (sözleşme künyesi). */
export function rejectB2bApplication(customerId: string, reason: string): Promise<ApiResult<B2bDecisionResponse>> {
  return authorizedFetch(`/api/v1/management/b2b/${customerId}/reject`, B2bDecisionResponseSchema, {
    method: 'POST',
    body: { reason },
  });
}
