'use server';

import { CartService, serviceDb } from '@lezzet/database';
import { hasLocale } from 'next-intl';
import { currentCustomerId } from '@/lib/guard';
import { customerErrorKey, type CustomerResult } from '@/lib/customer-error';
import { routing } from '@/i18n/routing';
import { readPlaceScope } from '@/lib/delivery/read-place';
import { recordEvent } from '@/lib/analytics/record';
import { getCartView } from './read';
import { cartBlockedAnalyticsReason, entryOf, entryOfItem, isSplitCart, itemOfEntry, storedPrices, type CartEntry, type CartSignal, type CartView } from './cart-types';

/**
 * Sepet server action'ları: sepet ve sonraya kaydedilenler tek turda taşınır, ayrı uçlarda "listeye taşı" yarıda kalıp kalemi iki
 * yerde ya da hiçbir yerde bırakırdı. Guard yoktur, sepet ziyaretçiye açıktır; kimin sepeti olduğunu oturum söyler, istemciden fiyat
 * ve müşteri kimliği alınmaz.
 */

/** İki listenin çözülmüş hâli — ekran ikisini de aynı anda gösterir (sepet + altındaki liste). */
interface CartPayload {
  view: CartView;
  /** Sonraya kaydedilenlerin çözülmüş görünümü; `lines` dışındaki toplamları anlamsızdır. */
  saved: CartView;
  /**
   * Sepet sunucuda mı yaşıyor (girişli müşteri): istemci tarayıcı deposunu buna göre yönetir, yoksa girişlide dolan depo bir sonraki
   * açılışta misafir sepeti sanılıp sunucudakinin üstüne eklenirdi.
   */
  serverCart: boolean;
}

/**
 * Sepetin ilk okunması ve misafir sepetinin devralınması: tarayıcıdaki kalemler sunucudakinin üstüne eklenir, giriş eklenmiş ürünü
 * kaybettirmemeli. Devralma olduysa `merged` döner ve istemci tarayıcı deposunu boşaltır, yoksa kalemler her açılışta yeniden eklenirdi.
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
  /** Turun künyesi — YALNIZ ölçüme akar (`CartSignal`). Kupon ve yer sürtünmeleri burada doğuyor. */
  signal: CartSignal | null = null,
): Promise<CustomerResult<CartPayload & { merged: boolean }>> {
  try {
    if (!hasLocale(routing.locales, locale)) throw new Error('Geçersiz dil');
    // Sepetin sahibi müşteri kimliğidir, auth kimliği değil: `cart.customer_id` `user_profiles`a bağlıdır ve auth kimliği devralmayı
    // yabancı anahtar ihlaliyle düşürürdü.
    const customerId = await currentCustomerId();
    if (!customerId) {
      const payload = await resolveBoth(locale, entries, saved, { couponCode });
      measureRead(payload.view, signal);
      return { data: { ...payload, merged: false, serverCart: false }, errorKey: null };
    }

    const cart = new CartService(serviceDb());
    const merged = entries.length > 0 || saved.length > 0;
    if (merged) {
      // Fiyat sunucunun çözdüğüdür; istemciden gelen fiyat kabul edilmez (0 yazılır, checkout çözer).
      if (entries.length > 0) await cart.takeOver(customerId, entries.map((e) => itemOfEntry(e)));
      // Liste devralınırken BİRLEŞTİRİLİR: sunucudakiler korunur, ziyaretçininkiler eklenir.
      if (saved.length > 0) {
        const current = (await cart.get(customerId)).savedItems;
        const incoming = saved.map((e) => itemOfEntry(e)).filter((row) => !current.some((c) => sameKey(c, row)));
        await cart.replaceSaved(customerId, [...current, ...incoming]);
      }
    }
    const stored = await cart.get(customerId);
    const payload = await resolveBoth(locale, stored.items.map(entryOfItem), stored.savedItems.map(entryOfItem), {
      previousPrices: storedPrices(stored.items),
      customerId,
      couponCode,
    });
    measureRead(payload.view, signal);
    return { data: { ...payload, merged, serverCart: true }, errorKey: null };
  } catch (err) {
    return { data: null, errorKey: customerErrorKey(err) };
  }
}

/**
 * İki listeyi verilen niyete eşitler; ekleme, adet değişimi, çıkarma ve "sonraya kaydet" aynı uçtur, çünkü istemci tam listeleri
 * tutar ve ayrı uçlar iki tarafın listelerini ayrıştırabilirdi.
 */
export async function writeCartAction(
  locale: string,
  entries: CartEntry[],
  saved: CartEntry[] = [],
  couponCode: string | null = null,
  /**
   * Yalnız ölçüm için, yazmaya girmez: uç eşitleme ucudur ve farkı sunucuda hesaplamak yalnız girişlide mümkün olurdu, huni ziyaretçiyi
   * saymazdı. Niyeti istemci beyan eder; beyan gözlenen olay olmadığından sayısı sepet satırlarıyla tutmaz ve bu arıza değildir.
   */
  signal: CartSignal | null = null,
): Promise<CustomerResult<CartPayload>> {
  try {
    if (!hasLocale(routing.locales, locale)) throw new Error('Geçersiz dil');
    const customerId = await currentCustomerId();
    // Ziyaretçide yazacak yer yok — listeler tarayıcıda kalır, burada yalnız çözülür.
    if (!customerId) {
      const payload = await resolveBoth(locale, entries, saved, { couponCode });
      measureWrite(payload.view, signal);
      return { data: { ...payload, serverCart: false }, errorKey: null };
    }

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
      payload.view.lines.map((l) => (itemOfEntry(entryOf(l), (l.unitPriceCents ?? 0) / 100))),
    );
    await cart.replaceSaved(customerId, payload.saved.lines.map((l) => (itemOfEntry(entryOf(l), (l.unitPriceCents ?? 0) / 100))));
    measureWrite(payload.view, signal);
    return { data: { ...payload, serverCart: true }, errorKey: null };
  } catch (err) {
    return { data: null, errorKey: customerErrorKey(err) };
  }
}

/**
 * Sepet turunun ölçümü: `cart_blocked` bir durum değil, müşterinin sepeti değiştirdiği an olarak yazılır, her okumada yazılsaydı aynı
 * engel onlarca kez sayılırdı. Ölçüm akışı kesmez.
 */
function measureWrite(view: CartView, signal: CartSignal | null): void {
  for (const item of signal?.added ?? []) {
    /* Ürün kimliği görünümden doldurulur, çünkü ürün kırılımı özeti kimliksiz satırları eler ve `cart_count` sıfır kalırdı; istemci
       yalnız varyant beyan eder. Paket satırında `null` doğrudur, paket bir ürün değildir. */
    const line = view.lines.find((l) => (l.kind === 'variant' ? l.variantId : l.bundleId) === item.subjectId);
    void recordEvent({
      type: 'add_to_cart',
      subjectType: item.subjectType,
      subjectId: item.subjectId,
      productId: line?.productId ?? null,
      qty: item.qty,
    });
  }
  const reason = cartBlockedAnalyticsReason(view);
  if (reason) void recordEvent({ type: 'cart_blocked', reason });
  measureSplit(view, signal);
}

/**
 * OKUMA turunun ölçümü — **engeller burada sayılmaz.**
 *
 * Okuma her sayfa açılışında koşuyor; engel süregelen bir hâl olduğu için buradan da saysaydık tek
 * bir engelli sepet, müşteri sayfayı her açtığında yeniden sayılırdı. Burada yalnız **o turda
 * doğan** sürtünmeler var ve üçü de tetikleyicisine bağlı.
 */
function measureRead(view: CartView, signal: CartSignal | null): void {
  // Kupon SONUCU okuma turunda doğuyor: kod değişince sepet yeniden okunuyor (`cart-context`),
  // yazma turu değil. Yalnız denendiği turda sayılır — sonraki adet değişimlerinde reddedilmiş kod
  // hâlâ oradadır ama yeni bir bilgi değildir.
  if (signal?.trigger === 'coupon' && view.discount.status === 'rejected') {
    void recordEvent({ type: 'cart_blocked', reason: 'coupon_invalid' });
  }
  // Yer değişince kalem düştü mü. İstemci farkı kendisi hesaplıyor (`diffCartByPlace`) ama burada
  // sonucu sunucu okuyor: yeni yerde gönderilemeyen satır varsa müşteri bir şey kaybetti.
  if (signal?.trigger === 'place' && view.hasBlocked) {
    void recordEvent({ type: 'cart_blocked', reason: 'place_change' });
  }
  measureSplit(view, signal);
}

/** Bölünme GEÇİŞİ — hâl değil. Önceki durumu yalnız istemci bilir, o yüzden künyeden okunur. */
function measureSplit(view: CartView, signal: CartSignal | null): void {
  if (signal?.wasSplit === false && isSplitCart(view)) void recordEvent({ type: 'cart_blocked', reason: 'split' });
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
  // Yer eksenleri `readPlaceScope`tan tek parça gelir; bölge kimliği çerezden değil çözümden okunur, çünkü uydurulmuş çerez hangi
  // asgari sepetin uygulanacağını belirlememeli.
  const scope = await readPlaceScope();
  const [view, savedView] = await Promise.all([
    getCartView(locale, entries, { previousPrices: opts.previousPrices, customerId: opts.customerId, couponCode: opts.couponCode, ...scope }),
    // Sonraya kaydedilenlerde zam işareti gösterilmez: o liste bir satın alma niyeti değil, bir
    // hatırlatmadır — orada onay istenecek bir karar yok.
    getCartView(locale, saved, { business: scope.business }),
  ]);
  return { view, saved: savedView };
}

/** Devralmada çakışma kontrolü — `CartService.sameLine` ile aynı kural (paket kendi kimliğiyle). */
type LineKey = { variantId?: string | null; bundleId?: string | null; stockId?: string | null };

function sameKey(a: LineKey, b: LineKey): boolean {
  if (a.bundleId || b.bundleId) return (a.bundleId ?? null) === (b.bundleId ?? null);
  return (a.variantId ?? null) === (b.variantId ?? null) && (a.stockId ?? null) === (b.stockId ?? null);
}
