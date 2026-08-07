'use server';

import { CartService, serviceDb } from '@lezzet/database';
import { hasLocale } from 'next-intl';
import { currentCustomerId } from '@/lib/guard';
import { customerErrorKey, type CustomerResult } from '@/lib/customer-error';
import { routing } from '@/i18n/routing';
import { readPlaceWarehouses } from '@/lib/delivery/read-place';
import { recordEvent } from '@/lib/analytics/record';
import { getCartView } from './read';
import { cartBlockedAnalyticsReason, entryOf, entryOfItem, isSplitCart, itemOfEntry, storedPrices, type CartEntry, type CartSignal, type CartView } from './cart-types';

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
 *
 * **Hata kapısı müşteriye ait** (`customerErrorKey`, denetim H1/H2 · 03.08): dönen şey metin değil
 * ANAHTAR. Burada müşteriye SÖYLENECEK bilinen bir hâl yok — sepet okuması ya çalışır ya arızadır,
 * ikincisini bağlam kendi bayrağıyla anlatıyor (`failed` → `CartUnreachable`). Yani her hata
 * `unexpected`e iner ve ham mesaj yalnız `error_log`'a gider; eskiden bu dize ekrana hiç
 * ulaşmadığı için iç mesaj görünmüyordu ama funnel da yanlıştı: bir gün gösterilseydi sızacaktı.
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
  /** Turun künyesi — YALNIZ ölçüme akar (`CartSignal`). Kupon ve yer sürtünmeleri burada doğuyor. */
  signal: CartSignal | null = null,
): Promise<CustomerResult<CartPayload & { merged: boolean }>> {
  try {
    if (!hasLocale(routing.locales, locale)) throw new Error('Geçersiz dil');
    // Sepetin sahibi MÜŞTERİ kimliğidir, auth kimliği değil (`currentCustomerId`): `cart.customer_id`
    // `user_profiles`'a FK'lidir. Burada auth kimliği yazılıyordu ve giriş yapan müşterinin sepeti
    // sessizce kayboluyordu — devralma FK ihlaliyle düşüyor, action `{data:null}` dönüyor, ekran
    // boş sepet çiziyordu (28.07).
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
  /**
   * **ÖLÇÜM İÇİN, yazma için değil** (08.9 · `ANALYTICS §3`). Uç bir "ekleme" ucu değil eşitleme
   * ucudur: sunucuya tam liste gelir, niyet gelmez. Farkı sunucuda hesaplamak yalnız girişli
   * müşteride mümkün (ziyaretçide saklanmış liste yok) ve o zaman huninin "sepete ekleme" adımı
   * sistematik olarak yalnız girişlileri sayardı — oysa huninin asıl sorusu ziyaretçinin nerede
   * düştüğü.
   *
   * Bu yüzden niyeti İSTEMCİ BEYAN EDER. Beyan edilmiş olay gözlenen olay değildir: sayısı sepet
   * satırlarıyla tutmaz ve **bu bir arıza değildir.** Parametre yazma nesnesine hiç girmez.
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
 * Sepet turunun ölçümü (08.9) — iki olay, tek yer.
 *
 * **`cart_blocked` bir DURUM değil bir AN olarak yazılıyor:** engel her okumada var olabilir, ama
 * burası müşterinin sepetini DEĞİŞTİRDİĞİ an. Her okumada atsaydık defter aynı engeli onlarca kez
 * sayar ve huninin en kıymetli olayı gürültüye dönerdi; hiç atmasaydık terkin sebebi ölçülemezdi.
 *
 * Ölçüm akışı kesmez: `void`, ve kapı zaten fırlatmıyor.
 */
function measureWrite(view: CartView, signal: CartSignal | null): void {
  for (const item of signal?.added ?? []) {
    void recordEvent({ type: 'add_to_cart', subjectType: item.subjectType, subjectId: item.subjectId, productId: null, qty: item.qty });
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
  const [view, savedView] = await Promise.all([
    getCartView(locale, entries, { previousPrices: opts.previousPrices, customerId: opts.customerId, couponCode: opts.couponCode, ...(await readPlaceWarehouses()) }),
    // Sonraya kaydedilenlerde zam işareti gösterilmez: o liste bir satın alma niyeti değil, bir
    // hatırlatmadır — orada onay istenecek bir karar yok.
    getCartView(locale, saved),
  ]);
  return { view, saved: savedView };
}

/** Devralmada çakışma kontrolü — `CartService.sameLine` ile aynı kural (paket kendi kimliğiyle). */
type LineKey = { variantId?: string | null; bundleId?: string | null; stockId?: string | null };

function sameKey(a: LineKey, b: LineKey): boolean {
  if (a.bundleId || b.bundleId) return (a.bundleId ?? null) === (b.bundleId ?? null);
  return (a.variantId ?? null) === (b.variantId ?? null) && (a.stockId ?? null) === (b.stockId ?? null);
}
