'use server';

import { CartService, serviceDb } from '@lezzet/database';
import { hasLocale } from 'next-intl';
import { currentCustomerId } from '@/lib/guard';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { routing } from '@/i18n/routing';
import type { CartItem } from '@lezzet/types';
import { readPlaceWarehouses } from '@/lib/delivery/read-place';
import { getCartView } from './read';
import { cartKey, type CartEntry, type CartView } from './cart-types';

/**
 * Sepet server action'ları (08.4).
 *
 * **İki depo, tek arayüz.** Girişli müşterinin sepeti sunucuda kalıcıdır (`CartService`, 07.1);
 * ziyaretçininki tarayıcıda yaşar ve girişte devralınır (`takeOver`). Ekran bu ayrımı bilmez:
 * her iki yolda da niyet listesi gönderilir, çözülmüş görünüm döner.
 *
 * **İKİ LİSTE birlikte taşınır:** sepet ve sonraya kaydedilenler (K33). Ayrı uçlardan gitselerdi
 * "kalemi sepetten listeye taşı" iki ayrı tura bölünür ve arada biri başarısız olursa kalem ya iki
 * yerde birden ya da hiçbir yerde kalırdı. Tek tur, tek karar.
 *
 * Guard YOK ve olmamalı: sepet ziyaretçiye de açıktır. Ama oturum VARSA yazma sunucuya gider —
 * yani "kimin sepeti" sorusunu istemci değil oturum cevaplar; istemciden gelen bir müşteri kimliği
 * asla kabul edilmez.
 *
 * Fiyat action'a girdi olarak ALINMAZ: istemciden gelen fiyat, istemcinin belirlediği fiyattır.
 * `CartService` fiyatı gösterim için saklar, bağlayıcı fiyat checkout'ta çözülür (DOMAIN §5) —
 * burada sunucunun kendi çözdüğü değer yazılır.
 */

/** İki listenin çözülmüş hâli — ekran ikisini de aynı anda gösterir (sepet + altındaki liste). */
interface CartPayload {
  view: CartView;
  /** Sonraya kaydedilenlerin çözülmüş görünümü; `lines` dışındaki toplamları anlamsızdır. */
  saved: CartView;
  /**
   * Sepet SUNUCUDA mı yaşıyor (girişli müşteri) — istemci tarayıcı deposunu ona göre yönetir.
   *
   * Şart, çünkü istemci "kimin sepeti" sorusunu kendi cevaplayamaz. Bu bayrak yokken sağlayıcı
   * her yazmada tarayıcı deposunu da dolduruyordu; girişli müşteride depo yeniden doluyor, bir
   * sonraki açılışta `readCartAction` onu misafir sepeti sanıp sunucudakinin ÜSTÜNE ekliyordu.
   * Sonuç: her yenilemede adetler katlanıyordu — 4 kalem 8 oluyordu (29.07).
   */
  serverCart: boolean;
}

/**
 * Sepetin ilk okunması — ve **misafir sepetinin devralınması**.
 *
 * Ziyaretçi tarayıcıda sepet doldurup sonra giriş yaparsa o kalemler sunucudakinin ÜSTÜNE eklenir
 * (`takeOver`, 07.1): giriş, daha önce eklenmiş bir ürünü sessizce kaybettirmemeli. Devralma
 * yapıldıysa `merged` döner ve istemci tarayıcı deposunu boşaltır — yoksa aynı kalemler her
 * açılışta yeniden eklenir ve adet katlanır.
 */
export async function readCartAction(
  locale: string,
  entries: CartEntry[],
  saved: CartEntry[] = [],
  /**
   * Müşterinin girdiği kupon kodu — sepet kalemleri gibi bir NİYETTİR, tutar değil. İndirimin
   * geçerli olup olmadığına, ne kadar indireceğine ve hatta kuponun kazanıp kazanmadığına sunucu
   * karar verir (`resolveCartDiscount`); istemci yalnız "şu kodu denedim" der.
   */
  couponCode: string | null = null,
): Promise<ActionResult<CartPayload & { merged: boolean }>> {
  try {
    if (!hasLocale(routing.locales, locale)) throw new Error('Geçersiz dil');
    // Sepetin sahibi MÜŞTERİ kimliğidir, auth kimliği değil (`currentCustomerId`): `cart.customer_id`
    // `user_profiles`'a FK'lidir. Burada auth kimliği yazılıyordu ve giriş yapan müşterinin sepeti
    // sessizce kayboluyordu — devralma FK ihlaliyle düşüyor, action `{data:null}` dönüyor, ekran
    // boş sepet çiziyordu (28.07).
    const customerId = await currentCustomerId();
    if (!customerId) {
      return { data: { ...(await resolveBoth(locale, entries, saved, { couponCode })), merged: false, serverCart: false }, error: null };
    }

    const cart = new CartService(serviceDb());
    const merged = entries.length > 0 || saved.length > 0;
    if (merged) {
      // Fiyat sunucunun çözdüğüdür; istemciden gelen fiyat kabul edilmez (0 yazılır, checkout çözer).
      if (entries.length > 0) await cart.takeOver(customerId, entries.map(toItem));
      // Liste devralınırken BİRLEŞTİRİLİR: sunucudakiler korunur, ziyaretçininkiler eklenir.
      if (saved.length > 0) {
        const current = (await cart.get(customerId)).savedItems;
        const incoming = saved.map(toItem).filter((row) => !current.some((c) => sameKey(c, row)));
        await cart.replaceSaved(customerId, [...current, ...incoming]);
      }
    }
    const stored = await cart.get(customerId);
    return {
      data: {
        ...(await resolveBoth(locale, stored.items.map(toEntry), stored.savedItems.map(toEntry), {
          previousPrices: storedPrices(stored.items),
          customerId,
          couponCode,
        })),
        merged,
        serverCart: true,
      },
      error: null,
    };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/**
 * İki listeyi verilen niyete EŞİTLER (ekleme, adet değişimi, çıkarma ve "sonraya kaydet" aynı uç).
 *
 * Tek uç olmasının sebebi: istemci zaten tam listeleri tutuyor. Ayrı uçlar, iki tarafın listelerinin
 * ayrışabildiği birden çok yol açardı; eşitleme tek yön bırakır.
 */
export async function writeCartAction(
  locale: string,
  entries: CartEntry[],
  saved: CartEntry[] = [],
  couponCode: string | null = null,
): Promise<ActionResult<CartPayload>> {
  try {
    if (!hasLocale(routing.locales, locale)) throw new Error('Geçersiz dil');
    const customerId = await currentCustomerId();
    // Ziyaretçide yazacak yer yok — listeler tarayıcıda kalır, burada yalnız çözülür.
    if (!customerId) return { data: { ...(await resolveBoth(locale, entries, saved, { couponCode })), serverCart: false }, error: null };

    // Sunucuya yazılacak fiyat SUNUCUNUN çözdüğüdür; istemciden fiyat kabul edilmez.
    const cart = new CartService(serviceDb());
    // Saklanan fiyatlar YAZIMDAN ÖNCE okunur: yazım onları bugünkü değerle ezecek. Sonra okunsaydı
    // karşılaştırma her zaman "değişmedi" derdi.
    const payload = await resolveBoth(locale, entries, saved, {
      previousPrices: storedPrices((await cart.get(customerId)).items),
      customerId,
      couponCode,
    });
    await cart.replace(
      customerId,
      payload.view.lines.map((l) => ({ ...toItem(l), unitPrice: (l.unitPriceCents ?? 0) / 100 })),
    );
    await cart.replaceSaved(customerId, payload.saved.lines.map((l) => ({ ...toItem(l), unitPrice: (l.unitPriceCents ?? 0) / 100 })));
    return { data: { ...payload, serverCart: true }, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/**
 * İki listeyi TEK turda çözer. Sepetin okuması ayarları ve fiyat bağlamını zaten getiriyor; ikinci
 * bir çağrı aynı işi tekrar yapardı — ama listeler ayrı çözülmek zorunda, çünkü toplam ve asgari
 * sepet kararı yalnız SEPETE ait.
 */
async function resolveBoth(
  locale: 'tr' | 'fr' | 'de',
  entries: CartEntry[],
  saved: CartEntry[],
  // `customerId` de buradan geçer: kişisel kupon ve müşterinin genel oranı onsuz görünmez —
  // sepet checkout'tan farklı bir indirim gösterirdi.
  opts: { previousPrices?: ReadonlyMap<string, number>; customerId?: string | null; couponCode?: string | null } = {},
): Promise<Omit<CartPayload, 'serverCart'>> {
  const [view, savedView] = await Promise.all([
    getCartView(locale, entries, { previousPrices: opts.previousPrices, customerId: opts.customerId, couponCode: opts.couponCode, ...(await readPlaceWarehouses()) }),
    // Sonraya kaydedilenlerde zam işareti gösterilmez: o liste bir satın alma niyeti değil, bir
    // hatırlatmadır — orada onay istenecek bir karar yok.
    getCartView(locale, saved),
  ]);
  return { view, saved: savedView };
}

/**
 * Sunucu sepetinde saklanan fiyatlar (`cartKey` → cent) — bugünkü çözümle karşılaştırılır (DOMAIN §5).
 *
 * Ziyaretçide böyle bir harita YOKTUR ve olmamalı: niyet listesi bilerek fiyatsızdır, tarayıcıdan
 * gelen bir "önceki fiyat" da müşterinin belirlediği fiyat olurdu.
 */
function storedPrices(items: readonly CartItem[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of items) {
    if (!item.unitPrice) continue; // 0 = henüz çözülmemiş, geçerli bir "önceki" değil
    map.set(cartKey(toEntry(item)), Math.round(item.unitPrice * 100));
  }
  return map;
}

/**
 * Niyet → sunucu sepeti kalemi. Fiyat 0 girer ve bu doğrudur: istemciden gelen fiyat kabul edilmez,
 * çağıran gerekiyorsa kendi çözdüğü değeri üstüne yazar (`writeCartAction`).
 */
function toItem(entry: CartEntry): { variantId: string | null; bundleId: string | null; qty: number; unitPrice: number; stockId: string | null } {
  return {
    variantId: entry.variantId ?? null,
    bundleId: entry.bundleId ?? null,
    qty: entry.qty,
    unitPrice: 0,
    stockId: entry.stockId ?? null,
  };
}

function toEntry(item: { variantId?: string | null; bundleId?: string | null; qty: number; stockId?: string | null }): CartEntry {
  return item.bundleId
    ? { kind: 'bundle', bundleId: item.bundleId, qty: item.qty }
    : { kind: 'variant', variantId: item.variantId ?? '', qty: item.qty, stockId: item.stockId ?? null };
}

/** Devralmada çakışma kontrolü — `CartService.sameLine` ile aynı kural (paket kendi kimliğiyle). */
type LineKey = { variantId?: string | null; bundleId?: string | null; stockId?: string | null };

function sameKey(a: LineKey, b: LineKey): boolean {
  if (a.bundleId || b.bundleId) return (a.bundleId ?? null) === (b.bundleId ?? null);
  return (a.variantId ?? null) === (b.variantId ?? null) && (a.stockId ?? null) === (b.stockId ?? null);
}
