import type { z } from 'zod';
import { MeCartViewSchema, type CartViewBodySchema, type MeCartItemWriteSchema, type MeCartView } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';

import { authorizedFetch } from '../auth/authorized-fetch';
import { apiFetch, type ApiResult } from './client';

/*
  SEPET UÇLARI — `/api/v1/me/cart` (girişli) + `/api/v1/cart/view` (misafir).

  CEVAP ARTIK SATIR DEĞİL, GÖRÜNÜM (`MeCartView`): sepetin adı · fiyatı · indirimi · asgari sepet
  kararı · kargo eşiği hep SUNUCUDA çözülür. Gerekçe sözleşmede yazılı (`cart-api.schema.ts`):
  sepetteki fiyat bağlayıcı değildir (DOMAIN §5), her okumada yeniden çözülür ve iki yüzeyde İKİ
  ayrı hesap bir gün iki farklı tutar gösterirdi. İstemcinin tek işi çizmek.

  MİSAFİR DE SUNUCUDAN OKUR (yeni): niyet listesi cihazda kalır ama görünümü `POST /cart/view`
  çözer — aynı sepet misafirken bir, giriş yapınca başka bir tutar göstermesin. Uç oturumsuzdur,
  Bearer istemez; girişli kullanıcının niyeti gövdeden ASLA alınmaz (onunki sunucudaki sepettir).

  ÜÇ SORGU PARAMETRESİ HER OKUMADA:
  · `locale` ZORUNLU — ürün adı ve kampanya adı seçili dilde çözülür (katalog uçlarının aynı kuralı).
  · `postalCode` VARSA — yol/stok/fiyat kararı DEPOYA bağlı; kod gitmezse sunucu "yer bilinmiyor"
    hükmüyle çalışır ve satırların `route`u null döner.
  · `coupon` VARSA — kupon bir NİYETTİR; geçerliliği ve indirimi sunucunun kararıdır
    (`discount.status`), istemci kod sözlüğü tutmaz.

  GÖVDE FİYAT TAŞIMAZ: satırın yalnız ADRESİ ve adedi gider — varyant satırında
  `{kind:'variant', variantId, qty, stockId}`, paket satırında `{kind:'bundle', bundleId, qty}`.
  İstemcinin yazabildiği bir tutar siparişin parasını belirleyemez.

  TÜR KENDİ BAYRAĞINI TAŞIR (`kind`), kimlik alanının varlığından çıkarılmaz: `string` birim tip
  değildir ve TypeScript onunla daraltma yapamaz — o yoldan gidilseydi her okuma yerinde elle
  kontrol gerekirdi (`MeCartItemWriteSchema` künyesi).

  ── PAKET SATIRININ YAZMA YOLU YARIM (ölçüldü 21.21, canlı `:3002`) ─────────
  `POST /items` paket satırını EKLİYOR ve aynı paket ikinci kez gelirse adet birleşiyor (ölçüm:
  1 + 2 → qty 3). Ama `PATCH`/`DELETE` yolu `/items/:variantId?stock=` ile adresleniyor ve paketin
  varyantı YOK: paket kimliğiyle atılan `DELETE` satırı bulamıyor, sepet aynen dönüyor (ölçüldü).
  Yani paket satırı sunucudan AZALTILAMIYOR ve SİLİNEMİYOR. Çözüm `CartService.setQty`/`removeItem`
  imzasının satır anahtarına (`CartRef`) geçmesidir — `packages/database` kararı. BEKLEYEN(21.14).
*/

/** Yazma gövdesinin tek kalemi — sözleşmeden TÜRER, elle DTO yazılmaz (02-mimari §3.2). */
export type CartItemWrite = z.output<typeof MeCartItemWriteSchema>;

/**
 * Görünümü çözen bağlam — dil + yer + kupon niyeti. Üçü de İSTEĞİN parçasıdır, cevabın değil:
 * aynı sepet başka dilde başka adlarla, başka posta kodunda başka bir yolla döner.
 */
export interface CartViewQuery {
  locale: Locale;
  /** Cihazda kayıtlı posta kodu; `null` = hiç girilmemiş → parametre YAZILMAZ (katalog kuralı). */
  postalCode: string | null;
  /** Uygulanmak İSTENEN kupon kodu; `null` = kupon denenmiyor. */
  coupon: string | null;
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
    coupon: present(query.coupon),
    ...extra,
  });
}

/**
 * SATIRIN ADRESİ — varyant satırında `/items/:variantId?stock=…` (çift kimlik, tek adres), paket
 * satırında `/items/:bundleId?kind=bundle`. Paketin varyantı yoktur; satılan paketin kendisidir
 * (DOMAIN §13).
 *
 * Paket dalı 20.08'de açıldı ve sebebi ölçülmüş bir zarardı: paket sunucuya hiç yazılmadığı için
 * sepetin toplamına girmiyordu (cihazda 96,92 €'luk sepette bar 14,85 € yazıyordu).
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
 * Satır(lar) ekler; aynı adres zaten sepetteyse ADET BİRLEŞİR (kural sunucuda — `CartService.addItems`).
 *
 * **GÖVDE HER ZAMAN LİSTE, tek ürün bile** (09.08): sepet sunucuda tek satırda yaşıyor ve her
 * ekleme onu okuyup geri yazıyor — eşzamanlı iki istek aynı başlangıcı okur, son yazan ötekini
 * siler. Tarif ekranının "Malzemeleri sepete ekle"si üç isteği birden atıyordu ve sunucuda bir
 * tanesi kalıyordu (ölçüldü: sırayla 3 satır, eşzamanlı 1–2 satır). Bir kullanıcı eylemi = bir
 * istek; gerekçenin tamamı sözleşmede (`MeCartAddBodySchema`).
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
 * Misafir sepetinin DEVRİ — cihazdaki satırlar müşterinin sepetiyle BİRLEŞİR (sunucudaki korunur,
 * gelenler eklenir, çakışanda adetler toplanır). Devir bir kez yapılır ve cihazdaki kopya
 * temizlenir: aynı satırlar ikinci kez gönderilseydi adetler katlanırdı (web'de ölçülmüş arıza,
 * 29.07 — `serverCart` bayrağının doğuş sebebi).
 */
export function takeOverCart(items: CartItemWrite[], query: CartViewQuery): Promise<ApiResult<MeCartView>> {
  return authorizedFetch(`/api/v1/me/cart/takeover${viewQuery(query)}`, MeCartViewSchema, {
    method: 'POST',
    body: { items },
  });
}

/**
 * MİSAFİRİN GÖRÜNÜMÜ — oturumsuz uç, niyet gövdeden gider.
 *
 * `apiFetch` (Bearer'sız) bilinçli: bu yol yalnız misafirde koşar; girişli kullanıcının sepeti
 * sunucudadır ve gövdeden gelen bir niyet onun sepetini gölgelerdi. Kupon kodu SORGUDA değil
 * GÖVDEDE, çünkü sözleşme onu gövdeye koydu (`CartViewBodySchema`) — kod bir niyettir ve niyetin
 * tamamı tek yerde durur.
 */
export function fetchGuestCartView(
  items: readonly CartItemWrite[],
  couponCode: string | null,
  locale: Locale,
  postalCode: string | null,
): Promise<ApiResult<MeCartView>> {
  const body: z.input<typeof CartViewBodySchema> = { items: [...items], couponCode: present(couponCode) ?? null };
  return apiFetch(`/api/v1/cart/view${queryOf({ locale, postalCode: present(postalCode) })}`, MeCartViewSchema, {
    method: 'POST',
    body,
  });
}
