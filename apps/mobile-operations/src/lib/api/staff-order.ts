import type { z } from 'zod';
import {
  StaffAddressCreateResponseSchema,
  StaffAddressListSchema,
  StaffCompanyLookupSchema,
  StaffCustomerCreateResponseSchema,
  StaffCustomerPageSchema,
  StaffDeliveryContextSchema,
  StaffOrderOriginSchema,
  StaffOrderResponseSchema,
  StaffStockResponseSchema,
  StaffVariantPageSchema,
  StaffVariantScanSchema,
  type StaffAddressInput,
  type StaffCustomerInput,
  type StaffOrderRequest,
} from '@lezzet/types';

import { authorizedFetch } from '@lezzet/mobile-kit/src/lib/auth/authorized-fetch';
import { queryString, type ApiResult } from '@lezzet/mobile-kit/src/lib/api/client';

/*
  Personelin müşteri adına sipariş girişi (`/api/v1/staff-order/*`); şema sözleşmeden gelir, uç da aynı şemayla üretir. Siparişin
  deposu adresten çözüldüğü için cihazdaki depo seçimi bu isteklere yazılmaz.
*/

const BASE = '/api/v1/staff-order';

export function searchStaffCustomers(params: { q: string; cursor?: string }): Promise<ApiResult<z.infer<typeof StaffCustomerPageSchema>>> {
  return authorizedFetch(`${BASE}/customers${queryString({ q: params.q, cursor: params.cursor })}`, StaffCustomerPageSchema);
}

export function lookupStaffCompany(siret: string): Promise<ApiResult<z.infer<typeof StaffCompanyLookupSchema>>> {
  return authorizedFetch(`${BASE}/company${queryString({ siret })}`, StaffCompanyLookupSchema);
}

export function createStaffCustomer(body: StaffCustomerInput): Promise<ApiResult<z.infer<typeof StaffCustomerCreateResponseSchema>>> {
  return authorizedFetch(`${BASE}/customers`, StaffCustomerCreateResponseSchema, { method: 'POST', body });
}

export function fetchStaffAddresses(customerId: string): Promise<ApiResult<z.infer<typeof StaffAddressListSchema>>> {
  return authorizedFetch(`${BASE}/customers/${encodeURIComponent(customerId)}/addresses`, StaffAddressListSchema);
}

export function createStaffAddress(
  customerId: string,
  body: StaffAddressInput,
): Promise<ApiResult<z.infer<typeof StaffAddressCreateResponseSchema>>> {
  return authorizedFetch(`${BASE}/customers/${encodeURIComponent(customerId)}/addresses`, StaffAddressCreateResponseSchema, {
    method: 'POST',
    body,
  });
}

/** Adresin teslim bağlamı ve sepetin o anki tutarında ödeme seçenekleri; kalemler ön izlemedir. */
export function fetchStaffDeliveryContext(body: {
  customerId: string;
  addressId: string;
  lines: { totalCents: number; vatRate: number }[];
}): Promise<ApiResult<z.infer<typeof StaffDeliveryContextSchema>>> {
  return authorizedFetch(`${BASE}/context`, StaffDeliveryContextSchema, { method: 'POST', body });
}

export function fetchStaffVariants(params: {
  customerId: string;
  warehouseId: string | null;
  q?: string;
  cursor?: string;
}): Promise<ApiResult<z.infer<typeof StaffVariantPageSchema>>> {
  return authorizedFetch(
    `${BASE}/variants${queryString({ customerId: params.customerId, warehouseId: params.warehouseId ?? undefined, q: params.q, cursor: params.cursor })}`,
    StaffVariantPageSchema,
  );
}

export function scanStaffVariant(params: {
  customerId: string;
  warehouseId: string | null;
  code: string;
}): Promise<ApiResult<z.infer<typeof StaffVariantScanSchema>>> {
  return authorizedFetch(
    `${BASE}/variants/scan${queryString({ customerId: params.customerId, warehouseId: params.warehouseId ?? undefined, code: params.code })}`,
    StaffVariantScanSchema,
  );
}

/** Duraktan açılan siparişin müşterisi ve adresi; sunucu siparişten çözer. */
export function fetchStaffOrderOrigin(orderId: string): Promise<ApiResult<z.infer<typeof StaffOrderOriginSchema>>> {
  return authorizedFetch(`${BASE}/origin/${encodeURIComponent(orderId)}`, StaffOrderOriginSchema);
}

/** Sepetteki boyların siparişin deposundaki güncel kalanı; stok reddinden sonra okunur. */
export function fetchStaffStock(body: {
  warehouseId: string;
  variantIds: string[];
}): Promise<ApiResult<z.infer<typeof StaffStockResponseSchema>>> {
  return authorizedFetch(`${BASE}/stock`, StaffStockResponseSchema, { method: 'POST', body });
}

/** Pazarlıklı fiyat yalnız üstüne yazılan kalemde gider ve yalnız yöneticiden kabul edilir; ret gövdede cümlesiyle gelir. */
export function placeStaffOrder(body: StaffOrderRequest): Promise<ApiResult<z.infer<typeof StaffOrderResponseSchema>>> {
  return authorizedFetch(`${BASE}/orders`, StaffOrderResponseSchema, { method: 'POST', body });
}
