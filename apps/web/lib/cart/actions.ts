'use server';

import { CartService, serviceDb } from '@lezzet/database';
import { hasLocale } from 'next-intl';
import { getSessionUser } from '@/lib/guard';
import { getErrorMessage, type ActionResult } from '@/lib/error';
import { routing } from '@/i18n/routing';
import { getCartView } from './read';
import type { CartEntry, CartView } from './cart-types';

/**
 * Sepet server action'ları (08.4).
 *
 * **İki depo, tek arayüz.** Girişli müşterinin sepeti sunucuda kalıcıdır (`CartService`, 07.1);
 * ziyaretçininki tarayıcıda yaşar ve girişte devralınır (`takeOver`). Ekran bu ayrımı bilmez:
 * her iki yolda da niyet listesi gönderilir, çözülmüş görünüm döner.
 *
 * Guard YOK ve olmamalı: sepet ziyaretçiye de açıktır. Ama oturum VARSA yazma sunucuya gider —
 * yani "kimin sepeti" sorusunu istemci değil oturum cevaplar; istemciden gelen bir müşteri kimliği
 * asla kabul edilmez.
 *
 * Fiyat action'a girdi olarak ALINMAZ: istemciden gelen fiyat, istemcinin belirlediği fiyattır.
 * `CartService` fiyatı gösterim için saklar, bağlayıcı fiyat checkout'ta çözülür (DOMAIN §5) —
 * burada sunucunun kendi çözdüğü değer yazılır.
 */

/**
 * Sepetin ilk okunması — ve **misafir sepetinin devralınması**.
 *
 * Ziyaretçi tarayıcıda sepet doldurup sonra giriş yaparsa o kalemler sunucudakinin ÜSTÜNE eklenir
 * (`takeOver`, 07.1): giriş, daha önce eklenmiş bir ürünü sessizce kaybettirmemeli. Devralma
 * yapıldıysa `merged` döner ve istemci tarayıcı deposunu boşaltır — yoksa aynı kalemler her
 * açılışta yeniden eklenir ve adet katlanır.
 */
export async function readCartAction(locale: string, entries: CartEntry[]): Promise<ActionResult<{ view: CartView; merged: boolean }>> {
  try {
    if (!hasLocale(routing.locales, locale)) throw new Error('Geçersiz dil');
    const user = await getSessionUser();
    if (!user) return { data: { view: await getCartView(locale, entries), merged: false }, error: null };

    const cart = new CartService(serviceDb());
    const merged = entries.length > 0;
    if (merged) {
      // Fiyat sunucunun çözdüğüdür; istemciden gelen fiyat kabul edilmez (0 yazılır, checkout çözer).
      await cart.takeOver(user.id, entries.map((e) => ({ variantId: e.variantId, qty: e.qty, unitPrice: 0, stockId: e.stockId })));
    }
    const items = (await cart.get(user.id)).items.map(toEntry);
    return { data: { view: await getCartView(locale, items), merged }, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/**
 * Sepeti verilen niyet listesine EŞİTLER (ekleme, adet değişimi ve çıkarma aynı uç).
 *
 * Tek uç olmasının sebebi: istemci zaten tam listeyi tutuyor. Ayrı `add`/`setQty`/`remove` uçları,
 * iki tarafın listesinin ayrışabildiği üç ayrı yol açardı; eşitleme tek yön bırakır.
 */
export async function writeCartAction(locale: string, entries: CartEntry[]): Promise<ActionResult<CartView>> {
  try {
    if (!hasLocale(routing.locales, locale)) throw new Error('Geçersiz dil');
    const user = await getSessionUser();
    // Ziyaretçide yazacak yer yok — liste tarayıcıda kalır, burada yalnız çözülür.
    if (!user) return { data: await getCartView(locale, entries), error: null };

    // Sunucuya yazılacak fiyat SUNUCUNUN çözdüğüdür; istemciden fiyat kabul edilmez.
    const view = await getCartView(locale, entries);
    await new CartService(serviceDb()).replace(
      user.id,
      view.lines.map((l) => ({ variantId: l.variantId, qty: l.qty, unitPrice: (l.unitPriceCents ?? 0) / 100, stockId: l.stockId })),
    );
    return { data: view, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

function toEntry(item: { variantId: string; qty: number; stockId?: string | null }): CartEntry {
  return { variantId: item.variantId, qty: item.qty, stockId: item.stockId ?? null };
}
