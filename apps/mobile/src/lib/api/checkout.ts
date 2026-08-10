import type { z } from 'zod';
import {
  CheckoutOrderResultSchema,
  CheckoutSnapshotSchema,
  type CheckoutOrderBodySchema,
  type CheckoutOrderResult,
  type CheckoutSnapshot,
} from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';

import { authorizedFetch } from '../auth/authorized-fetch';
import type { ApiResult } from './client';

/*
  `/api/v1/me/checkout` — "Siparişi tamamla" ekranının OKUMASI + sipariş açan YAZMASI.

  ŞEMA BURADA YAZILMAZ (`me.ts`/`orders.ts` ile aynı gerekçe): sözleşme `@lezzet/types`ta ve UÇ DA
  aynı şemayla üretiyor (02-mimari §3.2) — alan adı değişirse üreten ve tüketen aynı anda
  derlemede kırılır. Bu dosyanın işi sorgu dizesini kurmak ve şemayı istemciye vermek.

  KORUNAN ÇAĞRI (`authorizedFetch`): iki uç da Bearer'ın arkasında. Sepet girişsiz doldurulabilir
  ama SİPARİŞ müşterinin kendisidir (adres, geçmiş, ödeme yetkisi hesaba bağlı) — oturum yoksa
  çağrı ağa hiç çıkmaz, yerel kısa devreyle `401 unauthorized` döner ve ekran giriş kapısı çizer
  (02-mimari §4: veri katmanı yönlendirme yapmaz).

  ── RET BİR HATA DEĞİL, BİR CEVAPTIR ────────────────────────────────────────
  Sipariş açma ucunun on beş ret hâli `200` ile ve zarfın `data`sında döner (uç künyesi): her ret
  müşteriden BAŞKA bir şey istiyor ve çoğu yapısal ayrıntı taşıyor. Yani `result.error === null`
  "sipariş açıldı" DEMEK DEĞİLDİR — çağıran `data.status`u okumak zorundadır. `error` tarafı
  yalnız taşıma arızasıdır (ağ, bozuk gövde, kimliksizlik).
*/

/**
 * Okumanın bağlamı. Dördü de İSTEĞİN parçasıdır, cevabın değil: aynı sepet başka adreste başka
 * bir yolla, başka bir ücretle ve başka ödeme yollarıyla döner.
 */
interface CheckoutQuery {
  locale: Locale;
  /** Seçili adres; `null` = sunucu varsayılanı (o da yoksa ilkini) seçer — ekran ikinci tur atmaz. */
  addressId: string | null;
  /** Sepette girilen kupon kodu; checkout'a KADAR taşınır (sözleşme künyesi: taşınmazsa tam fiyat). */
  coupon: string | null;
  /** Bölünmüş sepetin KARGO yarısı mı — bayrak türetilmez, açıkça gelir (19.15). */
  shippingOrder: boolean;
}

/** Gövde sözleşmeden TÜRER (`z.input`: varsayılanlı alanlar isteğe bağlı) — elle DTO yazılmaz. */
type CheckoutOrderBody = z.input<typeof CheckoutOrderBodySchema>;

/** Sorgu dizesi — verilmemiş parametre YAZILMAZ (`cart.ts`/`orders.ts` deseni). */
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

/**
 * Ekranın TEK okuması: adresler + seçili adrese göre teslimat + ödeme. Adres DEĞİŞTİKÇE yeniden
 * çağrılır — bölünseydi gün listesi yeni adresin, ödeme yolları eskisinin olurdu (sözleşme künyesi).
 */
export function fetchCheckout(query: CheckoutQuery): Promise<ApiResult<CheckoutSnapshot>> {
  const path = `/api/v1/me/checkout${queryOf({
    locale: query.locale,
    addressId: present(query.addressId),
    coupon: present(query.coupon),
    // Uç bayrağı `group=shipping` diye okuyor; kapalı hâlde parametre HİÇ yazılmaz.
    group: query.shippingOrder ? 'shipping' : undefined,
  })}`;
  return authorizedFetch(path, CheckoutSnapshotSchema);
}

/**
 * SİPARİŞİ AÇAR. Gövde yalnız SEÇİM taşır — tutar, kargo ücreti, indirim ve kalem listesi
 * GÖNDERİLMEZ (sözleşme künyesi): sepet sunucuda, tür adresten çözülür. İstemcinin yazabildiği bir
 * tutar, siparişin parasını uygulamanın eline verirdi.
 *
 * `locale` sorguda ve ZORUNLU: sipariş bildirimi ve kalem adları o dilde yazılır.
 */
export function placeCheckoutOrder(locale: Locale, body: CheckoutOrderBody): Promise<ApiResult<CheckoutOrderResult>> {
  return authorizedFetch(`/api/v1/me/checkout/order${queryOf({ locale })}`, CheckoutOrderResultSchema, {
    method: 'POST',
    body,
  });
}
