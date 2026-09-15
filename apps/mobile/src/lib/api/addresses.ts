import type { z } from 'zod';
import type { Locale } from '@lezzet/i18n';
import {
  AddressCheckResultSchema,
  AddressLookupCheckResultSchema,
  AddressLookupResolvedSchema,
  AddressLookupSuggestResultSchema,
  MeAddressListSchema,
  type AddressCheckResult,
  type AddressLookupAddressSchema,
  type AddressLookupCheckBodySchema,
  type AddressLookupOptionSchema,
  type AddressLookupPointSchema,
  type AddressWriteSchema,
  type Country,
  type MeAddressSchema,
} from '@lezzet/types';

import { authorizedFetch } from '@lezzet/mobile-kit/src/lib/auth/authorized-fetch';
import type { ApiResult } from '@lezzet/mobile-kit/src/lib/api/client';

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

/**
 * Fatura adresi seçimi — `/default`ün ikizi, AYRI uç (kullanıcı kararı 08.09).
 *
 * Tek uçta birleştirilmedi çünkü iki ayrı soru: varsayılan adres "malı nereye götürelim", fatura
 * adresi "fatura nereye kesilecek". Biri ötekini düşürmüyor; çoğu işletmede ikisi aynı satır.
 */
export function makeBillingAddress(id: string): Promise<ApiResult<MeAddress[]>> {
  return authorizedFetch(`/api/v1/me/addresses/${id}/billing`, MeAddressListSchema, { method: 'POST' });
}

/**
 * ADRES DOĞRULAMASI — `POST /api/v1/me/addresses/:id/check` (11.11 · native bağı 21.308).
 *
 * Sipariş ANINDA sorulur (kullanıcı kararı 02.09) ve cevap o an ekranda yaşar — listeye alan olarak
 * girmez (sözleşme künyesi: istemci bayat bir cevabı taze sanardı). Uç hiçbir hâlde 4xx dönmez;
 * servis düşerse `unknown` gelir ve ekran susar.
 */
export function checkAddress(id: string): Promise<ApiResult<AddressCheckResult>> {
  return authorizedFetch(`/api/v1/me/addresses/${id}/check`, AddressCheckResultSchema, { method: 'POST' });
}

/** Öneri satırı — alan kümesi sözleşmenin kendisi; `address` doluysa seçim ikinci adım istemez. */
export type AddressOption = z.infer<typeof AddressLookupOptionSchema>;
/** Açılmış adres — sokak, kod, şehir ve kaynağıyla nokta. */
export type LookupAddress = z.infer<typeof AddressLookupAddressSchema>;
/** Doğrulanan nokta — kayda ADAY olarak gider, kaynağıyla (BAN / Google). */
export type CheckedPoint = z.infer<typeof AddressLookupPointSchema>;

/*
  ADRES ARAMA (21.313) — TEK KAPI, ülke parametre: sağlayıcıyı (FR BAN · DE Google) sunucu seçer
  (`/me/addresses/lookup/*`, kullanıcı kararı 14.09). Üçü de başarısızlığı BİR DEĞER olarak döndürür:
  öneri yoksa boş liste, açılış ya da doğrulama yoksa `null` — çekmece elle girişe düşer, kayıt
  hiçbir hâlde engellenmez (10.08).

  `sessionToken` Google'ın ücret oturumudur: yazma boyunca aynı, seçimle biter (çekmece üretir).
*/
export function suggestAddressOptions(input: {
  country: Country;
  query: string;
  sessionToken: string;
  locale: Locale;
}): Promise<ApiResult<z.infer<typeof AddressLookupSuggestResultSchema>>> {
  const params = new URLSearchParams({
    country: input.country,
    query: input.query,
    session: input.sessionToken,
    locale: input.locale,
  });
  return authorizedFetch(`/api/v1/me/addresses/lookup/suggest?${params.toString()}`, AddressLookupSuggestResultSchema);
}

export function resolveAddressOption(input: {
  country: Country;
  id: string;
  sessionToken: string;
  locale: Locale;
}): Promise<ApiResult<LookupAddress | null>> {
  const params = new URLSearchParams({ country: input.country, id: input.id, session: input.sessionToken, locale: input.locale });
  return authorizedFetch(`/api/v1/me/addresses/lookup/resolve?${params.toString()}`, AddressLookupResolvedSchema);
}

/** Elle girilen adresi kaydetmeden önce doğrular (FR BAN · DE Google Address Validation). */
export function locateAddress(input: z.input<typeof AddressLookupCheckBodySchema>): Promise<ApiResult<CheckedPoint | null>> {
  return authorizedFetch('/api/v1/me/addresses/lookup/check', AddressLookupCheckResultSchema, { method: 'POST', body: input });
}
