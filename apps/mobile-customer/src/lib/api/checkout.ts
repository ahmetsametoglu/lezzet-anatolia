import type { z } from 'zod';
import {
  CheckoutOrderResultSchema,
  CheckoutOrderStatusSchema,
  CheckoutServicePointsSchema,
  CheckoutSnapshotSchema,
  type CheckoutOrderBodySchema,
  type CheckoutOrderResult,
  type CheckoutOrderStatus,
  type CheckoutServicePoints,
  type CheckoutSnapshot,
} from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';

import { authorizedFetch } from '@lezzet/mobile-kit/src/lib/auth/authorized-fetch';
import { queryString, type ApiResult } from '@lezzet/mobile-kit/src/lib/api/client';

/*
  Şema `@lezzet/types`ta ve uç da onunla üretir, alan değişirse iki taraf derlemede kırılır; oturum yoksa çağrı ağa çıkmaz ve `401` döner.
  Sipariş açma ucunun retleri `200` ile `data`da döner, `error` yalnız taşıma arızasıdır (ağ, bozuk gövde, kimliksizlik).
*/

/** Okumanın bağlamı: aynı sepet başka adreste başka yolla, ücretle ve ödeme yollarıyla döner. */
interface CheckoutQuery {
  locale: Locale;
  /** Seçili adres; `null` = sunucu varsayılanı (o da yoksa ilkini) seçer — ekran ikinci tur atmaz. */
  addressId: string | null;
  /** Sepette girilen kupon kodu; taşınmazsa checkout tam fiyat hesaplar. */
  coupon: string | null;
  /** Bölünmüş sepetin kargo yarısı mı; bayrak türetilmez, açıkça gelir. */
  shippingOrder: boolean;
  /** Gel-al seçimi (depo kimliği); `null` = adrese teslim. Sunucu izni ve depoyu doğrular. */
  pickupWarehouseId: string | null;
  /** Müşterinin seçtiği kargo servisi; `null` = sunucu eve giden en ucuzu seçer. Ücret servise bağlı, okuma onunla yenilenir. */
  shippingOptionCode: string | null;
}

/** `z.input`: varsayılanlı alanlar isteğe bağlı. */
type CheckoutOrderBody = z.input<typeof CheckoutOrderBodySchema>;

/** Boş dize = "yok" ile aynı kapıya çıkar: sunucuyu boş bir parametreyle meşgul etmeyiz. */
function present(value: string | null): string | undefined {
  const trimmed = value?.trim() ?? '';
  return trimmed === '' ? undefined : trimmed;
}

/**
 * Ekranın tek okuması: adresler, seçili adrese göre teslimat ve ödeme. Adres değiştikçe yeniden çağrılır; bölünseydi gün listesi yeni
 * adresin, ödeme yolları eskisinin olurdu.
 */
export function fetchCheckout(query: CheckoutQuery): Promise<ApiResult<CheckoutSnapshot>> {
  const path = `/api/v1/me/checkout${queryString({
    locale: query.locale,
    addressId: present(query.addressId),
    coupon: present(query.coupon),
    // Uç bayrağı `group=shipping` diye okuyor; kapalıyken parametre yazılmaz.
    group: query.shippingOrder ? 'shipping' : undefined,
    pickupWarehouseId: present(query.pickupWarehouseId),
    shippingOptionCode: present(query.shippingOptionCode),
  })}`;
  return authorizedFetch(path, CheckoutSnapshotSchema);
}

/** Adrese yakın teslim noktaları, istenen taşıyıcıların hepsi için; seçici açılınca bir kez okunur. Uç her yolda dili ister. */
export function fetchServicePoints(
  locale: Locale,
  addressId: string,
  carrierCodes: readonly string[],
): Promise<ApiResult<CheckoutServicePoints>> {
  return authorizedFetch(
    `/api/v1/me/checkout/service-points${queryString({ locale, addressId, carriers: carrierCodes.join(',') })}`,
    CheckoutServicePointsSchema,
  );
}

/**
 * Gövde yalnız seçim taşır, tutar ve kalem göndermez: istemcinin yazabildiği tutar siparişin parasını uygulamaya verirdi. `locale`
 * zorunlu, çünkü bildirim ve kalem adları o dilde yazılır.
 */
export function placeCheckoutOrder(locale: Locale, body: CheckoutOrderBody): Promise<ApiResult<CheckoutOrderResult>> {
  return authorizedFetch(`/api/v1/me/checkout/order${queryString({ locale })}`, CheckoutOrderResultSchema, {
    method: 'POST',
    body,
  });
}

/** Onay ekranının sipariş hâli; kart taslağında sunucu sağlayıcıya sorup ödenmişse siparişi o an onaylar. */
export function fetchCheckoutOrderStatus(locale: Locale, orderId: string): Promise<ApiResult<CheckoutOrderStatus>> {
  return authorizedFetch(`/api/v1/me/checkout/order/${encodeURIComponent(orderId)}/status${queryString({ locale })}`, CheckoutOrderStatusSchema);
}
