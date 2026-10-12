import type { z } from 'zod';
import {
  type OnSiteSaleQuoteRequest,
  type OnSiteSaleRequest,
  type SalePlace,
  OnSiteSaleQuoteResponseSchema,
  OnSiteSaleResponseSchema,
  RecentSalesResponseSchema,
  SaleCatalogPageSchema,
  SaleScanResponseSchema,
  SaleVariantsResponseSchema,
} from '@lezzet/types';

import { authorizedFetch } from '@lezzet/mobile-kit/src/lib/auth/authorized-fetch';
import { withWarehouseChoice } from '../operations/warehouse-choice';
import { queryString, type ApiFetchInit, type ApiResult } from '@lezzet/mobile-kit/src/lib/api/client';

/*
  Yerinde satış uçları (`/api/v1/sale/*`); şema sözleşmeden gelir, uç da aynı şemayla üretir. Olumsuz satış cevabı (yetersiz stok,
  kapalı kalem, vade freni) 200 ile gövdede gelir ve kararı ekran okur; telin gerçek hataları `ApiFail`dir.
*/

/** Satışın bağlamı: yer ve alıcı. İkisi de her isteğe yazılır ki katalog, okutma ve satış aynı yeri ve aynı fiyatı okusun. */
export interface SaleScope {
  place: SalePlace;
  /** Seçilen müşteri; `null` = anonim alıcı. */
  customerId: string | null;
}

/**
 * Tek çağrı kapısı. Tesis satışında cihazın seçili deposu adrese yazılır; araçta yazılmaz, çünkü kuryenin seçtiği tesis rota deposudur
 * ve aracını sunucu kapsamdan çözer.
 */
function saleFetch<TSchema extends z.ZodTypeAny>(
  path: string,
  scope: SaleScope,
  schema: TSchema,
  init: ApiFetchInit = {},
): Promise<ApiResult<z.infer<TSchema>>> {
  const buyer = scope.customerId === null ? '' : `&customerId=${encodeURIComponent(scope.customerId)}`;
  const addressed = `${path}${path.includes('?') ? '&' : '?'}place=${scope.place}${buyer}`;
  return authorizedFetch(scope.place === 'van' ? addressed : withWarehouseChoice(addressed), schema, init);
}

/** Bu depoda ne var: vitrin kartı ve kalan adet; arama sunucuda daraltır, sayfa `cursor` ile büyür. */
export function fetchSaleCatalog(params: {
  q?: string;
  cursor?: string;
  scope: SaleScope;
}): Promise<ApiResult<z.infer<typeof SaleCatalogPageSchema>>> {
  return saleFetch(
    `/api/v1/sale/catalog${queryString({ locale: 'tr', q: params.q, cursor: params.cursor })}`,
    params.scope,
    SaleCatalogPageSchema,
  );
}

/** Çok boylu ürünün boyları, fiyat ve kalan adetle. */
export function fetchSaleVariants(slug: string, scope: SaleScope): Promise<ApiResult<z.infer<typeof SaleVariantsResponseSchema>>> {
  return saleFetch(`/api/v1/sale/catalog/${encodeURIComponent(slug)}/variants?locale=tr`, scope, SaleVariantsResponseSchema);
}

/** Kodu karta ve boya çözer; araçta "burada duran mal" kuralı okutmada da geçerlidir (`not_here`). */
export function scanSaleCode(code: string, scope: SaleScope): Promise<ApiResult<z.infer<typeof SaleScanResponseSchema>>> {
  return saleFetch(`/api/v1/sale/scan${queryString({ locale: 'tr', code })}`, scope, SaleScanResponseSchema);
}

/** Satışın kesin tutarı, yazım yok: nakit ve kart bu tutarla alınır, satış ondan sonra yazılır. */
export function quoteOnSiteSale(
  body: OnSiteSaleQuoteRequest,
  scope: SaleScope,
): Promise<ApiResult<z.infer<typeof OnSiteSaleQuoteResponseSchema>>> {
  return saleFetch('/api/v1/sale/on-site/quote', scope, OnSiteSaleQuoteResponseSchema, { method: 'POST', body });
}

/** Satış tek çağrıda kapanır; pazarlıklı fiyat yalnız üstüne yazılan kalemde gider, öteki kalemin fiyatını sunucu çözer. */
export function sellOnSite(body: OnSiteSaleRequest, scope: SaleScope): Promise<ApiResult<z.infer<typeof OnSiteSaleResponseSchema>>> {
  return saleFetch('/api/v1/sale/on-site', scope, OnSiteSaleResponseSchema, { method: 'POST', body });
}

/** Bu satış yerinin kapı satışları, kim yazdıysa adıyla; liste alıcıdan bağımsızdır. */
export function fetchRecentSales(place: SalePlace): Promise<ApiResult<z.infer<typeof RecentSalesResponseSchema>>> {
  return saleFetch('/api/v1/sale/recent', { place, customerId: null }, RecentSalesResponseSchema);
}
