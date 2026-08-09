import type { z } from 'zod';
import { MeAddressListSchema, type AddressWriteSchema, type MeAddressSchema } from '@lezzet/types';

import { authorizedFetch } from '../auth/authorized-fetch';
import type { ApiResult } from './client';

/*
  `/api/v1/me/addresses` — hesap ekranının adres bölümü + v3 `shAddr` çekmecesi (21.15).

  ŞEMA BURADA YAZILMAZ (`me.ts` ile aynı gerekçe): sözleşme `@lezzet/types`ta, uç da aynı şemayla
  üretiyor. HER çağrının cevabı GÜNCEL LİSTEDİR — yazma dahil; gerekçe sözleşme dosyasında
  (varsayılan devri komşu satırları da oynatır). Ekran bu yüzden tek tip günceller: ne dönerse liste odur.

  KORUNAN ÇAĞRI (`authorizedFetch`): uçlar Bearer'ın arkasında; oturum yoksa ağa çıkmadan
  `401 unauthorized` döner — misafir hesapta bu modül hiç çağrılmaz (ekran zaten giriş kapısında).
*/

/** Ekranın okuduğu adres — alan kümesi sözleşmenin kendisi. */
export type MeAddress = z.infer<typeof MeAddressSchema>;
/** Çekmecenin gönderdiği gövde — create ve update AYNI form (v3 `shAddr`). */
export type AddressWrite = z.input<typeof AddressWriteSchema>;

export function fetchAddresses(): Promise<ApiResult<MeAddress[]>> {
  return authorizedFetch('/api/v1/me/addresses', MeAddressListSchema);
}

export function createAddress(input: AddressWrite): Promise<ApiResult<MeAddress[]>> {
  return authorizedFetch('/api/v1/me/addresses', MeAddressListSchema, { method: 'POST', body: input });
}

export function updateAddress(id: string, input: AddressWrite): Promise<ApiResult<MeAddress[]>> {
  return authorizedFetch(`/api/v1/me/addresses/${id}`, MeAddressListSchema, { method: 'PATCH', body: input });
}

export function deleteAddress(id: string): Promise<ApiResult<MeAddress[]>> {
  return authorizedFetch(`/api/v1/me/addresses/${id}`, MeAddressListSchema, { method: 'DELETE' });
}

/** Varsayılan seçimi kendi ucudur — gövde alanı değil (sözleşme künyesindeki "iki varsayılan" dersi). */
export function makeDefaultAddress(id: string): Promise<ApiResult<MeAddress[]>> {
  return authorizedFetch(`/api/v1/me/addresses/${id}/default`, MeAddressListSchema, { method: 'POST' });
}
