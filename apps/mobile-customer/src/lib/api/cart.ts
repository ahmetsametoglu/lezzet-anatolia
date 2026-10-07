import type { z } from 'zod';
import {
  MeCartReorderSchema,
  MeCartViewSchema,
  type CartViewBodySchema,
  type MeCartItemWriteSchema,
  type MeCartReorder,
  type MeCartView,
  type Country,
} from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';

import { authorizedFetch } from '@lezzet/mobile-kit/src/lib/auth/authorized-fetch';
import { apiFetch, type ApiResult } from '@lezzet/mobile-kit/src/lib/api/client';

/*
  Sepet uçları: girişli sepet `/api/v1/me/cart`, misafirin görünümü `/api/v1/cart/view`. Görünüm (ad, fiyat, indirim, kargo eşiği)
  hep sunucuda çözülür ve gövde fiyat taşımaz, çünkü iki yüzeyde iki ayrı hesap bir gün iki farklı tutar gösterirdi.
*/

/** Yazma gövdesinin tek kalemi; sözleşmeden türer. */
export type CartItemWrite = z.output<typeof MeCartItemWriteSchema>;

/** Görünümü çözen bağlam (dil, yer, kupon niyeti); üçü de isteğin parçasıdır, aynı sepet başka yerde başka yolla döner. */
export interface CartViewQuery {
  locale: Locale;
  /** Cihazda kayıtlı posta kodu; `null` = hiç girilmemiş → parametre YAZILMAZ (katalog kuralı). */
  postalCode: string | null;
  /** Kodun seçilen ülkesi; aynı kod iki ülkede varsa yer ancak bununla çözülür. */
  country?: Country | null;
  /** Uygulanmak İSTENEN kupon kodu; `null` = kupon denenmiyor. */
  coupon: string | null;
  /** Gel-al seçimi: görünüm seçilen deponun stoğuyla çözülür; sunucu kimliği teklif kapısından geçirir, geçemeyeni yok sayar. */
  pickupWarehouseId: string | null;
}

/** Sorgu dizesi — verilmemiş parametre YAZILMAZ; boş dize meşru bir değerdir (`catalog.ts` deseni). */
function queryOf(params: Record<string, string | undefined>): string {
  const pairs = Object.entries(params)
    .filter((entry): entry is [string, string] => entry[1] !== undefined)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`);
  return pairs.length === 0 ? '' : `?${pairs.join('&')}`;
}

/** Boş dize = "yok" ile aynı kapıya çıkar: sunucuyu boş bir parametreyle meşgul etmeyiz. */
function present(value: string | null): string | undefined {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? undefined : trimmed;
}

function viewQuery(query: CartViewQuery, extra: Record<string, string | undefined> = {}): string {
  return queryOf({
    locale: query.locale,
    postalCode: present(query.postalCode),
    country: present(query.postalCode) === undefined ? undefined : (query.country ?? undefined),
    pickupWarehouseId: present(query.pickupWarehouseId),
    coupon: present(query.coupon),
    ...extra,
  });
}

/**
 * Satırın adresi: varyant satırında `/items/:variantId?stock=…`, paket satırında `/items/:bundleId?kind=bundle`, çünkü paketin varyantı
 * yoktur, satılan paketin kendisidir.
 */
export interface CartLineRef {
  variantId?: string;
  stockId?: string | null;
  bundleId?: string;
}

function linePath(ref: CartLineRef, query: CartViewQuery): string {
  const bundle = ref.bundleId !== undefined;
  const id = bundle ? ref.bundleId! : ref.variantId!;
  const extra = bundle ? { kind: 'bundle' } : { stock: present(ref.stockId ?? null) };
  return `/api/v1/me/cart/items/${encodeURIComponent(id)}${viewQuery(query, extra)}`;
}

export function fetchCart(query: CartViewQuery): Promise<ApiResult<MeCartView>> {
  return authorizedFetch(`/api/v1/me/cart${viewQuery(query)}`, MeCartViewSchema);
}

/**
 * Satır(lar) ekler; aynı adres sepetteyse adet birleşir. Gövde tek ürün için bile listedir, çünkü sepet sunucuda tek satırda yaşar ve
 * eşzamanlı iki ekleme birbirini ezerdi.
 */
export function addCartItems(items: readonly CartItemWrite[], query: CartViewQuery): Promise<ApiResult<MeCartView>> {
  return authorizedFetch(`/api/v1/me/cart/items${viewQuery(query)}`, MeCartViewSchema, {
    method: 'POST',
    body: { items },
  });
}

/** Adet belirler; SIFIR satırı siler (sunucunun aynı kuralı — "−" ile sıfıra inmek çıkarmaktır). */
export function setCartItemQty(ref: CartLineRef, qty: number, query: CartViewQuery): Promise<ApiResult<MeCartView>> {
  return authorizedFetch(linePath(ref, query), MeCartViewSchema, { method: 'PATCH', body: { qty } });
}

export function removeCartItem(ref: CartLineRef, query: CartViewQuery): Promise<ApiResult<MeCartView>> {
  return authorizedFetch(linePath(ref, query), MeCartViewSchema, { method: 'DELETE' });
}

/**
 * Misafir sepetinin devri: cihazdaki satırlar sunucudakiyle birleşir ve devir bir kez yapılır, çünkü aynı satırlar ikinci kez
 * gönderilse adetler katlanırdı.
 */
export function takeOverCart(items: CartItemWrite[], query: CartViewQuery): Promise<ApiResult<MeCartView>> {
  return authorizedFetch(`/api/v1/me/cart/takeover${viewQuery(query)}`, MeCartViewSchema, {
    method: 'POST',
    body: { items },
  });
}

/**
 * Misafirin görünümü oturumsuz uçtan, niyet gövdeden gider; girişli kullanıcının sepeti sunucudadır ve gövdeden gelen bir niyet onu
 * gölgelerdi.
 */
export function fetchGuestCartView(
  items: readonly CartItemWrite[],
  couponCode: string | null,
  locale: Locale,
  postalCode: string | null,
  country: Country | null = null,
): Promise<ApiResult<MeCartView>> {
  const body: z.input<typeof CartViewBodySchema> = { items: [...items], couponCode: present(couponCode) ?? null };
  const place = present(postalCode);
  return apiFetch(`/api/v1/cart/view${queryOf({ locale, postalCode: place, country: place === undefined ? undefined : (country ?? undefined) })}`, MeCartViewSchema, {
    method: 'POST',
    body,
  });
}

/** Geçmiş siparişin eklenebilen kalemlerini sunucu sepetine yazar; sipariş numarayla gider, sepet görünümün yeriyle okunur. */
export function reorderCart(orderReference: string, query: CartViewQuery): Promise<ApiResult<MeCartReorder>> {
  return authorizedFetch(`/api/v1/me/cart/reorder${viewQuery(query)}`, MeCartReorderSchema, {
    method: 'POST',
    body: { orderReference },
  });
}
