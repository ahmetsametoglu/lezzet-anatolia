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
 * **İKİ LİSTE birlikte taşınır:** sepet ve sonraya kaydedilenler (K35). Ayrı uçlardan gitselerdi
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
): Promise<ActionResult<CartPayload & { merged: boolean }>> {
  try {
    if (!hasLocale(routing.locales, locale)) throw new Error('Geçersiz dil');
    const user = await getSessionUser();
    if (!user) return { data: { ...(await resolveBoth(locale, entries, saved)), merged: false }, error: null };

    const cart = new CartService(serviceDb());
    const merged = entries.length > 0 || saved.length > 0;
    if (merged) {
      // Fiyat sunucunun çözdüğüdür; istemciden gelen fiyat kabul edilmez (0 yazılır, checkout çözer).
      if (entries.length > 0) await cart.takeOver(user.id, entries.map(toItem));
      // Liste devralınırken BİRLEŞTİRİLİR: sunucudakiler korunur, ziyaretçininkiler eklenir.
      if (saved.length > 0) {
        const current = (await cart.get(user.id)).savedItems;
        const incoming = saved.map(toItem).filter((row) => !current.some((c) => sameKey(c, row)));
        await cart.replaceSaved(user.id, [...current, ...incoming]);
      }
    }
    const stored = await cart.get(user.id);
    return {
      data: { ...(await resolveBoth(locale, stored.items.map(toEntry), stored.savedItems.map(toEntry))), merged },
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
export async function writeCartAction(locale: string, entries: CartEntry[], saved: CartEntry[] = []): Promise<ActionResult<CartPayload>> {
  try {
    if (!hasLocale(routing.locales, locale)) throw new Error('Geçersiz dil');
    const user = await getSessionUser();
    const payload = await resolveBoth(locale, entries, saved);
    // Ziyaretçide yazacak yer yok — listeler tarayıcıda kalır, burada yalnız çözülür.
    if (!user) return { data: payload, error: null };

    // Sunucuya yazılacak fiyat SUNUCUNUN çözdüğüdür; istemciden fiyat kabul edilmez.
    const cart = new CartService(serviceDb());
    await cart.replace(
      user.id,
      payload.view.lines.map((l) => ({ ...toItem(l), unitPrice: (l.unitPriceCents ?? 0) / 100 })),
    );
    await cart.replaceSaved(user.id, payload.saved.lines.map((l) => ({ ...toItem(l), unitPrice: (l.unitPriceCents ?? 0) / 100 })));
    return { data: payload, error: null };
  } catch (err) {
    return { data: null, error: getErrorMessage(err) };
  }
}

/**
 * İki listeyi TEK turda çözer. Sepetin okuması ayarları ve fiyat bağlamını zaten getiriyor; ikinci
 * bir çağrı aynı işi tekrar yapardı — ama listeler ayrı çözülmek zorunda, çünkü toplam ve asgari
 * sepet kararı yalnız SEPETE ait.
 */
async function resolveBoth(locale: 'tr' | 'fr' | 'de', entries: CartEntry[], saved: CartEntry[]): Promise<CartPayload> {
  const [view, savedView] = await Promise.all([getCartView(locale, entries), getCartView(locale, saved)]);
  return { view, saved: savedView };
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
