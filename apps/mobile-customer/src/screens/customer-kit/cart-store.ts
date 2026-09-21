import { useEffect, useSyncExternalStore } from 'react';
import { applyBestDiscount, meetsMinBasket } from '@lezzet/domain-core';
import type { Locale } from '@lezzet/i18n';
import type { CatalogImage, MeCartView, MeCartViewLine } from '@lezzet/types';

import {
  addCartItems,
  fetchCart,
  fetchGuestCartView,
  removeCartItem,
  setCartItemQty,
  takeOverCart,
  type CartItemWrite,
  type CartLineRef,
  type CartViewQuery,
} from '@/lib/api/cart';
import type { ApiResult } from '@lezzet/mobile-kit/src/lib/api/client';
import { useAppLocale } from '@lezzet/mobile-kit/src/lib/i18n/app-locale';
import { getOnboardingSnapshot, subscribeOnboarding } from '@/lib/onboarding/onboarding-store';
import { getSupabase } from '@lezzet/mobile-kit/src/lib/auth/supabase';

/*
  Sepet: niyet cihazda (misafir) ya da sunucuda (girişli, iki yüzeyde paylaşılır), görünüm her iki hâlde sunucuda çözülür ve
  ekranlar ayrımı bilmez; `useCart()` yan etkisizdir, sunucu turunun tek kapısı kökteki `useCartSync()`tir.
*/

/** Sepetteki tek ürün satırı — çeşit (varyant) seviyesinde. */
export interface CartProductLine {
  /** Satır kimliği: ürün + çeşit birleşimi. Aynı ürünün iki boyu İKİ satırdır. */
  id: string;
  /** Ürün detayına gitmek için (rota `/product/[slug]`). */
  slug: string;
  name: string;
  /** Çeşit etiketi — "500 g", "1 kg". */
  variantLabel: string;
  /** Birim fiyat (cent). */
  unitCents: number;
  quantity: number;
  /**
   * Katalog görseli; satır iki boyda çizilir ve her çizen kendi kutusuna yeten türevi seçer.
   */
  image: CatalogImage;
  /** İndirimli fiyattan geliyor — sepette rozetle söylenir. */
  discounted: boolean;
  /** Sepete girdikten SONRA tükendi: teslim edilemez, kaldırılması istenir (v3:437). */
  soldOut: boolean;
  /**
   * Sunucu sepetindeki adres, varyantın kimliği; satırı kuran ekranlar geçer.
   */
  variantId?: string;
  /** Teklif çıpası (parti) — satırın adresi bir ÇİFTTİR: varyant + parti (DOMAIN §5). */
  stockId?: string | null;
}

/** Sepetteki hazır paket satırı — koyu kartla ayrı çizilir (v3:411). */
export interface CartBundleLine {
  /**
   * PAKETİN UUID'Sİ (`bundle.id`), slug DEĞİL — sunucu sepetindeki adresi budur
   * (`cart.items[].bundleId`) ve görünüm satırı da onunla anılır (`cartLineId`). İki kimlik aynı
   * olunca cihazdaki kayıt ile sunucunun satırı aynı satır olarak tanınabiliyor; slug tutulsaydı
   * aynı paket iki kez çizilirdi.
   */
  id: string;
  name: string;
  /** İçerik özeti — "5 çeşit · börek, tatlı…". */
  contentLabel: string;
  unitCents: number;
  quantity: number;
  /** Paketin kapağı — ürün satırının `image`ı ile aynı kural. */
  image: CatalogImage;
}

/**
 * Sepete inen indirim, kod ve tutar; depo hesaplamaz, sunucunun görünümünden türetir. Kuponun hâli `view.discount`tadır.
 */
export interface CartCoupon {
  code: string;
  amountCents: number;
}

/**
 * Sepetin kaynağı: `device` misafir, `server` sunucu sepeti. Bayrak şart, yoksa girişli sepet misafir sanılıp tekrar eklenirdi.
 */
type CartSource = 'device' | 'server';

export interface CartState {
  /** NİYET — bu cihazın eklediği ürün satırları (girişlide sunucunun cevabıyla eşitlenir). */
  products: CartProductLine[];
  bundles: CartBundleLine[];
  /** Uygulanmak İSTENEN kupon kodu; geçerliliği sunucunun kararı (`view.discount`). */
  couponCode: string | null;
  /** Sepete İNEN indirim — `view.discount`tan türer, elle yazılmaz. */
  coupon: CartCoupon | null;
  /** SUNUCUNUN çözdüğü görünüm — ekranın çizdiği her tutar buradan okunur. */
  view: MeCartView;
  /** Görünüm turu havada mı — niyet dolu ama görünüm henüz boşken ekran "boş sepet" demesin. */
  resolving: boolean;
  source: CartSource;
  /** Son sunucu turunun REDDİ (anahtar, cümle değil); ekran satır altında söyler. */
  error: string | null;
}

/**
 * BOŞ SEPETİN GÖRÜNÜMÜ — uydurulmuş bir hesap değil, tanım: kalemi olmayan sepetin toplamı da
 * indirimi de yoktur. Eşikler (`minBasketCents`, `freeShippingCents`) burada SIFIRDIR çünkü boş
 * sepette bilinmiyorlar; ekran onları yalnız dolu sepette çizer (sıfır eşik = "eşik tanımsız",
 * sözleşmenin kendi hükmü).
 */
const EMPTY_VIEW: MeCartView = {
  lines: [],
  subtotalCents: 0,
  discount: { status: 'none' },
  // Boş sepette eşiğe "az kalmış" bir kampanya da yoktur: kapsamda kalem olmadan cümle kurulamaz.
  reachableDiscount: null,
  totalCents: 0,
  itemCount: 0,
  /* Boş sepette kural TAŞINMAZ — kalem yokken indirim de yoktur; ilk gerçek okumada dolar. */
  discountRules: [],
  isFirstOrder: false,
  hasBlocked: false,
  /* Teslim edilemeyen kalemlerin tutarı; boş sepette sıfır, çünkü kalem yok. */
  undeliverableSubtotalCents: 0,
  minBasketOk: false,
  missingForMinBasketCents: 0,
  minBasketCents: 0,
  freeShippingCents: 0,
  shippingSubtotalCents: 0,
  shippingTariffCents: 0,
  shippingOnly: false,
  /* Kargo grubunun çözülmüş ücreti ve eşiğe kalan — boş sepette ikisi de sıfır: ödenecek kargo
     yok, aşılacak eşik yok. */
  shippingGroupFeeCents: 0,
  shippingFreeRemainingCents: 0,
};

const EMPTY_CART: CartState = {
  products: [],
  bundles: [],
  couponCode: null,
  coupon: null,
  view: EMPTY_VIEW,
  resolving: false,
  source: 'device',
  error: null,
};

let state: CartState = EMPTY_CART;

/** Abone ekranlar. `Set` çünkü aynı ekran iki kez abone olmaz ve çıkış O(1) olmalı. */
const listeners = new Set<() => void>();

function publish(next: CartState): void {
  state = next;
  for (const listener of listeners) listener();
}

/**
 * Sunucu cevabı aynıysa yayın yapılmaz: iyimser yama ekranı zaten doğru değere getirdi, aynı değeri yeniden yayınlamak
 * aboneleri boşuna çizdirirdi. Bir alan bile farklıysa sunucunun sözü geçer.
 */
function sameView(a: MeCartView, b: MeCartView): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** `useSyncExternalStore`in okuma kapısı — DAİMA aynı nesneyi döndürür (referans kararlılığı şart). */
function getSnapshot(): CartState {
  return state;
}

/**
 * Sepeti yerelde boşaltır; sunucu sepetine dokunmaz, çünkü sipariş sonrası silme seçicidir ve onu sunucu yapar.
 * Havadaki turlar `revision` ile geçersiz kılınır ki eski cevap boş sepeti doldurmasın.
 */
export function resetCart(): void {
  revision += 1;
  publish(EMPTY_CART);
}

/**
 * Sepeti sunucudan tazeler, silmez: sipariş yalnız kendi kalemlerini düşürdüğü için doğru hareket sunucuya sormaktır.
 * Kabuk takılı değilken hiçbir şey yapmaz.
 */
export function refreshCart(): void {
  refreshView();
}

// ── GÖRÜNÜMÜN BAĞLAMI (dil + yer) ───────────────────────────────────────────

interface ViewContext {
  locale: Locale;
  postalCode: string | null;
}

/**
 * Görünümü çözen bağlam. `null` = kabuk henüz monte değil; o hâlde ağ turu YAPILMAZ — uydurulmuş
 * bir dille sepet okumak, ürün adlarını kullanıcının seçmediği bir dilde getirmek olurdu
 * (`app-locale` künyesi: dil cihazın dayattığı olgu değil, kullanıcının cevabı).
 */
let context: ViewContext | null = null;

/**
 * Satın alma yeri: kayıtlı teslimat adresinin posta kodu, `null` bilinmiyor. Görünüm tek yerde çözülür, ekranın seçeceği
 * ikinci bir görünüm yoktur.
 */
let purchasePostalCode: string | null = null;

/** Görünümün çözüleceği yer — adres biliniyorsa o, yoksa gezinme kodu (künye: `purchasePostalCode`). */
function placeNow(): string | null {
  return purchasePostalCode ?? context?.postalCode ?? null;
}

function queryNow(): CartViewQuery | null {
  if (context === null) return null;
  return { locale: context.locale, postalCode: placeNow(), coupon: state.couponCode };
}

/**
 * Satın alma yerini bildirir; değişince görünüm yeniden çözülür, `null` gezinme koduna döner.
 */
export function setPurchasePlace(postalCode: string | null): void {
  if (purchasePostalCode === postalCode) return;
  purchasePostalCode = postalCode;
  refreshView();
}

// ── SUNUCU TURU ─────────────────────────────────────────────────────────────

/** Adres anahtarının uuid biçimi. */
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
/** Adres anahtarının biçimi — `variantId` ya da `variantId@stockId` (`cartLineId` üretir). */
const ADDRESS_KEY = new RegExp(`^(${UUID})(?:@(${UUID}))?$`, 'i');

/**
 * Satırın varyant kimliği; alan opsiyonel olduğu için `null` dönebilir ve o satır sunucuya gitmez, yerelde kalır.
 */
function variantIdOf(line: CartProductLine): string | null {
  return line.variantId ?? null;
}

/**
 * Satırın sunucudaki adresi, varyant + parti; `kind` açıkça yazılır, çünkü `string` alanla daraltma yapılamaz.
 */
function addressOf(line: CartProductLine): CartItemWrite | null {
  const variantId = variantIdOf(line);
  return variantId === null ? null : { kind: 'variant', variantId, qty: line.quantity, stockId: line.stockId ?? null };
}

function addressesOf(lines: readonly CartProductLine[]): CartItemWrite[] {
  return lines.map(addressOf).filter((item) => item !== null);
}

/**
 * Niyetin tamamı, ürünler ve paketler; misafir görünümü ve devir gövdesi bunu gönderir.
 */
function intentOf(cart: CartState): CartItemWrite[] {
  return [
    ...addressesOf(cart.products),
    ...cart.bundles.map((bundle): CartItemWrite => ({ kind: 'bundle', bundleId: bundle.id, qty: bundle.quantity })),
  ];
}

/**
 * Görünüm satırının depo kimliği: ekran sunucunun görünümünü çizer ve orada bu cihazın görmediği satırlar da vardır,
 * kimlikleri adresleridir.
 */
export function cartLineId(line: MeCartViewLine): string {
  if (line.kind === 'bundle') return line.bundleId;
  return line.stockId === null ? line.variantId : `${line.variantId}@${line.stockId}`;
}

/** Yazma kapısına gelen `id`nin çözümü — yerel satır, adres ya da hiçbiri. */
interface Located {
  /** Kimliğe karşılık gelen yerel niyet satırı; sunucu-yalnız satırda `undefined`. */
  line: CartProductLine | undefined;
  variantId: string | null;
  stockId: string | null;
}

function locate(id: string): Located {
  const line = state.products.find((product) => product.id === id);
  if (line !== undefined) return { line, variantId: variantIdOf(line), stockId: line.stockId ?? null };

  const address = ADDRESS_KEY.exec(id);
  if (address === null) return { line: undefined, variantId: null, stockId: null };

  const variantId = address[1] ?? null;
  const stockId = address[2] ?? null;
  const known = state.products.find(
    (product) => variantIdOf(product) === variantId && (product.stockId ?? null) === stockId,
  );
  return { line: known, variantId, stockId };
}

/** Kimliğin işaret ettiği yerel satırı seçen süzgeç — yerel satır yoksa hiçbir şeyi seçmez. */
function matcher(found: Located): (line: CartProductLine) => boolean {
  const target = found.line;
  return target === undefined ? () => false : (line) => line.id === target.id;
}

/** Görünümün indirimi → checkout'un okuduğu `coupon` alanı. Hesap yok, çeviri var. */
function couponOf(view: MeCartView): CartCoupon | null {
  const discount = view.discount;
  if (discount.status === 'applied') return { code: discount.code, amountCents: discount.amountCents };
  if (discount.status === 'automatic') return { code: discount.label ?? '', amountCents: discount.amountCents };
  /* `rejected` hâlinde de bir indirim İNMİŞ olabilir (`appliedInsteadCents`) — kupon tutmadı diye
     müşteri hak ettiğini kaybetmez. Künyesi kuponun değil kampanyanın adıdır. */
  if (discount.status === 'rejected' && discount.appliedInsteadCents > 0) {
    return { code: discount.appliedInstead?.label ?? '', amountCents: discount.appliedInsteadCents };
  }
  return null;
}

/**
 * İyimser görünüm yaması: adet, satır toplamı, sayaç, ara ve genel toplam ile asgari sepet sözleşmenin kendi alanlarıyla düz
 * aritmetikle yamanır. İndirimin kendisi, ulaşılabilir kampanya ve kargo yamanmaz, sunucunun sözünü bekler.
 */
function viewWithQty(view: MeCartView, ref: CartLineRef | null, quantity: number): MeCartView {
  if (ref === null) return view;
  const hit = (line: MeCartViewLine): boolean =>
    ref.bundleId === undefined
      ? line.kind === 'variant' && line.variantId === ref.variantId && line.stockId === (ref.stockId ?? null)
      : line.kind === 'bundle' && line.bundleId === ref.bundleId;
  if (!view.lines.some(hit)) return view;

  const lines = view.lines
    .filter((line) => quantity > 0 || !hit(line))
    .map((line) =>
      hit(line)
        ? { ...line, qty: quantity, lineTotalCents: line.unitPriceCents === null ? null : line.unitPriceCents * quantity }
        : line,
    );

  const subtotalCents = lines.reduce((total, line) => total + (line.lineTotalCents ?? 0), 0);
  /* Eşik kuralı motordan sorulur (`meetsMinBasket`), web'in `viewWithEntries`i gibi. */
  const basket = meetsMinBasket(subtotalCents - view.undeliverableSubtotalCents, view.minBasketCents);
  const settled = settleDiscount(view, lines, subtotalCents);

  return {
    ...view,
    lines,
    itemCount: lines.reduce((total, line) => total + line.qty, 0),
    subtotalCents,
    ...settled,
    minBasketOk: view.minBasketCents > 0 ? basket.ok : view.minBasketOk,
    missingForMinBasketCents: view.minBasketCents > 0 ? basket.missingCents : view.missingForMinBasketCents,
  };
}

/**
 * İndirim sunucununkiyle aynı motorla (`applyBestDiscount`) yeniden çözülür ki adet değişince toplam zıplamasın. Kupon
 * yolunda motor çalıştırılmaz, çünkü kupon kuralları istemciye gelmez; sunucunun son tutarı taşınır.
 */
function settleDiscount(
  view: MeCartView,
  lines: readonly MeCartViewLine[],
  subtotalCents: number,
): Pick<MeCartView, 'discount' | 'totalCents'> {
  const carried = Math.max(0, view.subtotalCents - view.totalCents);
  const asIs = (cents: number): Pick<MeCartView, 'discount' | 'totalCents'> => ({
    discount: view.discount,
    totalCents: Math.max(0, subtotalCents - cents),
  });

  const couponInPlay = view.discount.status === 'applied' || view.discount.status === 'rejected';
  if (couponInPlay || view.discountRules.length === 0) return asIs(Math.min(carried, subtotalCents));

  const winner = applyBestDiscount(
    lines.map((line) => ({
      variantId: line.kind === 'variant' ? line.variantId : '',
      qty: line.qty,
      unitPriceCents: line.unitPriceCents ?? 0,
      categoryId: line.kind === 'variant' ? line.categoryId : null,
      collectionIds: line.kind === 'variant' ? line.collectionIds : [],
      bundleId: line.kind === 'bundle' ? line.bundleId : null,
      /* Teklif satırı kendi özel fiyatındadır ve matraha girmez (DOMAIN §5). Sözleşme ayrı bir
         `offerStockId` taşımıyor; teklifin işareti `wasCents`in dolu olmasıdır (üstü çizilen
         referans fiyat) ve o an satırın partisi çıpadır. */
      offerStockId: line.kind === 'variant' && line.wasCents !== undefined ? line.stockId : null,
      // Müşteriye özel fiyatlı kalem de matraha girmez; sunucu aynı işareti taşır.
      specialPrice: line.kind === 'variant' && line.specialPrice === true,
    })),
    view.discountRules.map((rule) => ({ ...rule, trigger: 'automatic' as const })),
    { isFirstOrder: view.isFirstOrder },
  );
  const cents = winner?.amountCents ?? 0;

  /* İndirim satırı da tazelenir, yoksa aynı karede "ara toplam − indirim ≠ toplam" olurdu. */
  if (view.discount.status === 'automatic') {
    return cents === 0
      ? { discount: { status: 'none' }, totalCents: subtotalCents }
      : { discount: { ...view.discount, amountCents: cents }, totalCents: Math.max(0, subtotalCents - cents) };
  }

  /* HENÜZ İNDİRİMİ OLMAYAN sepette kampanya doğuyorsa BEKLENİR: kazananın ADI kurallarla gelmiyor
     (havuz yalnız motorun ihtiyacını taşıyor, künye orada) ve adsız bir "İndirim" satırı yazmak,
     müşteriye hangi kampanyayı kazandığını söylememek olurdu. Eşiği yeni geçen sepette ~300 ms
     sonra hem tutar hem AD birlikte gelir — orada zıplama değil, kazanılmış bir haber var. */
  return asIs(0);
}

/**
 * Yerel niyet satırını sunucunun çözdüğü satırla TAZELER — ad, boy, fiyat ve rozetler sunucudan.
 * Fiyat `null` ise (satışa kapalı) son bilinen değer korunur: bilinmeyeni sıfıra düşürmek,
 * ölçülemeyen değeri ölçülmüş gibi göstermek olurdu (CLAUDE §1).
 */
function refreshed(known: CartProductLine, line: MeCartViewLine): CartProductLine {
  return {
    ...known,
    name: line.name,
    slug: line.slug,
    variantLabel: line.unitLabel === '' ? known.variantLabel : line.unitLabel,
    unitCents: line.unitPriceCents ?? known.unitCents,
    quantity: line.qty,
    image: line.image.url === null ? known.image : line.image,
    discounted: line.wasCents !== undefined,
    soldOut: line.blocked,
  };
}

/**
 * Sunucu sepetinin cevabı benimsenir: yerel niyet listesi ona göre kurulur, sunucuda olmayan yerel satır düşer, adresi
 * çözülemeyen yerel satır korunur. Paket satırları dokunulmadan kalır, çünkü ekran onları görünümden çizer.
 */
function adopted(current: CartState, view: MeCartView): CartState {
  const products: CartProductLine[] = [];

  for (const line of view.lines) {
    if (line.kind !== 'variant') continue;
    const known = current.products.find(
      (product) => variantIdOf(product) === line.variantId && (product.stockId ?? null) === line.stockId,
    );
    if (known === undefined) continue;
    products.push({ ...refreshed(known, line), variantId: line.variantId, stockId: line.stockId });
  }
  products.push(...current.products.filter((product) => variantIdOf(product) === null));

  return { ...current, products, view, coupon: couponOf(view), resolving: false, source: 'server', error: null };
}

/**
 * Misafirin cevabı benimsenir; niyet listesi dokunulmadan kalır, satırlar fiyat değiştiyse tazelenir.
 */
function resolved(current: CartState, view: MeCartView): CartState {
  const products = current.products.map((product) => {
    const line = view.lines.find(
      (candidate) =>
        candidate.kind === 'variant' &&
        candidate.variantId === variantIdOf(product) &&
        candidate.stockId === (product.stockId ?? null),
    );
    return line === undefined ? product : refreshed(product, line);
  });
  return { ...current, products, view, coupon: couponOf(view), resolving: false, error: null };
}

/**
 * İYİMSER YAZIM SAYACI — yalnız EN SON turun cevabı sepete uygulanır (`use-me.hook`un `generation`
 * kalıbı). İki "+" arka arkaya basıldığında birincinin geç dönen cevabı ikincinin adedini geri
 * almamalı; aynı sayaç, ret hâlindeki GERİ ALMAYI da arada başka bir değişiklik olmadıysa yapar —
 * yoksa geri alma, kullanıcının o arada yaptığı işi de silerdi.
 */
let revision = 0;

/**
 * Yerel değişiklik anında uygulanır, sonra sunucuya yazılır; ret gelirse eski hâle dönülür ve anahtar `error`a yazılır.
 * Misafirde yazma yoktur, yalnız görünüm tazelenir.
 */
function commit(next: CartState, call: (query: CartViewQuery) => Promise<ApiResult<MeCartView>>): void {
  const previous = state;
  publish(next);

  const query = previous.source === 'server' ? queryNow() : null;
  if (query === null) {
    refreshView();
    return;
  }

  const mine = ++revision;
  void call(query).then((result) => {
    if (mine !== revision) return;
    if (result.error !== null) {
      /* 401 oturum bitti demektir, yazma hatası değil: değişiklik korunur, kaynak cihaza düşer ve görünüm misafir yolundan çözülür. */
      if (result.status === 401) {
        publish({ ...next, source: 'device', error: null });
        refreshView();
        return;
      }
      publish({ ...previous, error: result.error });
      return;
    }
    /* İyimser yama tuttuysa yeni bir yayın YOK — künye: `sameView`. Hata bayrağı da zaten temizdi;
       tutmadıysa sunucunun cevabı olduğu gibi geçer. */
    if (sameView(state.view, result.data) && state.error === null) return;
    publish(adopted(state, result.data));
  });
}

/**
 * Sunucu sepetini okur, misafir sepeti varsa önce bir kez devreder. 401 misafir demektir; öteki retlerde yerel sepete
 * dokunulmaz ve anahtar `error`a yazılır.
 */
async function hydrateCart(query: CartViewQuery): Promise<void> {
  const handover = state.source === 'device' ? intentOf(state) : [];
  const mine = ++revision;
  publish({ ...state, resolving: true });

  const result = handover.length > 0 ? await takeOverCart(handover, query) : await fetchCart(query);
  if (mine !== revision) return;

  if (result.error !== null) {
    if (result.status === 401) {
      publish({ ...state, resolving: false, source: 'device', error: null });
      refreshView();
      return;
    }
    publish({ ...state, resolving: false, error: result.error });
    return;
  }
  publish(adopted(state, result.data));
}

/** Misafirin görünümü — niyet gövdeden gider, tutarı SUNUCU çözer. */
async function resolveGuestView(query: CartViewQuery): Promise<void> {
  const items = intentOf(state);
  const mine = ++revision;
  publish({ ...state, resolving: true });

  const result = await fetchGuestCartView(items, query.coupon, query.locale, query.postalCode);
  if (mine !== revision) return;

  if (result.error !== null) {
    publish({ ...state, resolving: false, error: result.error });
    return;
  }
  publish(resolved(state, result.data));
}

/**
 * Görünümü yeniden çözdürür; boş niyet ve kapalı kapı ağa çıkmaz.
 */
function refreshView(): void {
  if (state.source !== 'server' && intentOf(state).length === 0) {
    if (state.view.lines.length === 0 && !state.resolving) return;
    // Havadaki tur GEÇERSİZ: boşalan sepete geç gelen bir cevap satırları geri getirirdi.
    revision += 1;
    publish({ ...state, view: EMPTY_VIEW, coupon: null, resolving: false });
    return;
  }

  const query = queryNow();
  if (query === null || watchers === 0) return;
  if (state.source === 'server') {
    void hydrateCart(query);
    return;
  }
  void resolveGuestView(query);
}

/**
 * Oturum dinleyicisi — TEK abone yeter. `onAuthStateChange` abone olur olmaz `INITIAL_SESSION` ile
 * bir kez tetiklenir, yani ilk okuma da buradan gelir (ayrı bir "mount'ta çek" adımı yok).
 */
let authSubscription: { unsubscribe: () => void } | null = null;
let watchers = 0;

function startWatching(): void {
  watchers += 1;
  if (authSubscription !== null) return;

  const { data } = getSupabase().auth.onAuthStateChange((_event, session) => {
    if (session === null) {
      /* ÇIKIŞ: sunucu sepetiyse ekrandan kalkar — telefonu bir sonraki kullanan, önceki müşterinin
         sepetini görmemeli. Misafir sepetine DOKUNULMAZ: oturumsuz açılışta da bu dal koşuyor
         (`INITIAL_SESSION`, oturum yok) ve müşterinin az önce doldurduğu sepeti silmek olurdu —
         onun görünümü misafir ucundan çözülür. */
      if (state.source === 'server') publish(EMPTY_CART);
      refreshView();
      return;
    }
    const query = queryNow();
    if (query !== null) void hydrateCart(query);
  });
  authSubscription = data.subscription;
}

function stopWatching(): void {
  watchers -= 1;
  if (watchers > 0) return;
  authSubscription?.unsubscribe();
  authSubscription = null;
}

/**
 * Bağlamı günceller ve DEĞİŞTİYSE görünümü yeniden çözdürür. Dil değişince ürün adları, posta kodu
 * değişince yol/fiyat/stok kararı değişir — eski görünümü ekranda bırakmak, kullanıcının az önce
 * yaptığı seçimi yok saymaktır.
 */
function setViewContext(next: ViewContext): void {
  const changed = context === null || context.locale !== next.locale || context.postalCode !== next.postalCode;
  context = next;
  if (changed) refreshView();
}

/**
 * Sunucu turunu açan kapı: oturumu izler ve dil ile yeri depoya bağlar; tek yerde, kökte takılır. `enabled` kapıyı kapatır,
 * çünkü personel kabuğu ve jetonlu ziyaretçi yollarında sepet yoktur ve Supabase oturumu açılmamalı.
 */
export function useCartSync(enabled = true): void {
  const locale = useAppLocale();
  const onboarding = useSyncExternalStore(subscribeOnboarding, getOnboardingSnapshot);
  const postalCode = onboarding?.postalCode ?? null;

  useEffect(() => {
    if (!enabled) return undefined;
    startWatching();
    return stopWatching;
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    setViewContext({ locale, postalCode });
  }, [enabled, locale, postalCode]);
}

// ── YAZMA KAPILARI (ekranlar yalnız bunları çağırır) ────────────────────────

/**
 * Ürünü sepete ekler; aynı satır zaten varsa ADEDİNİ artırır (yeni satır AÇMAZ — aynı ürünün iki
 * kez listelenmesi müşteriye "iki farklı şey aldım" derdi). Sunucu da aynı kuralı uyguluyor
 * (`CartService.addItem`), yani iki depo aynı sonuca varır.
 */
export function addProduct(line: Omit<CartProductLine, 'quantity'>, quantity = 1): void {
  addProducts([{ ...line, quantity }]);
}

/**
 * Birden çok satırı tek turda ekler (tarifin "Malzemeleri sepete ekle"si): sepet sunucuda tek satırda yaşar ve eşzamanlı
 * ayrı istekler birbirini ezerdi.
 */
export function addProducts(lines: readonly CartProductLine[]): void {
  let products = state.products;
  for (const line of lines) {
    const existing = products.find((product) => product.id === line.id);
    products = existing
      ? products.map((product) =>
          product.id === line.id ? { ...product, quantity: product.quantity + line.quantity } : product,
        )
      : [...products, line];
  }
  const next: CartState = { ...state, products };

  // Adresi çözülemeyen satır sunucuya gitmez; yerelde yaşar (künye: `variantIdOf`). Karışık listede
  // çözülenler yine gider — biri yüzünden hepsini yerelde bırakmak, sepeti sessizce ayrıştırırdı.
  const addresses = addressesOf(lines);
  if (addresses.length === 0) {
    publish(next);
    refreshView();
    return;
  }
  commit(next, (query) => addCartItems(addresses, query));
}

/**
 * Adedi değiştirir; sıfıra düşen satır çıkar. `id` yerel kimlik ya da görünüm satırının adres anahtarıdır (`cartLineId`).
 */
export function setProductQuantity(id: string, quantity: number): void {
  const found = locate(id);
  const mine = matcher(found);
  const { variantId, stockId } = found;
  const next: CartState = {
    ...state,
    products:
      quantity <= 0
        ? state.products.filter((product) => !mine(product))
        : state.products.map((product) => (mine(product) ? { ...product, quantity } : product)),
    view: viewWithQty(state.view, variantId === null ? null : { variantId, stockId }, quantity),
  };

  if (variantId === null) {
    publish(next);
    refreshView();
    return;
  }
  commit(next, (query) => setCartItemQty({ variantId, stockId }, Math.max(0, quantity), query));
}

export function removeProduct(id: string): void {
  const found = locate(id);
  const mine = matcher(found);
  const { variantId, stockId } = found;
  const next: CartState = {
    ...state,
    products: state.products.filter((product) => !mine(product)),
    view: viewWithQty(state.view, variantId === null ? null : { variantId, stockId }, 0),
  };

  if (variantId === null) {
    publish(next);
    refreshView();
    return;
  }
  commit(next, (query) => removeCartItem({ variantId, stockId }, query));
}

/*
  Paket kapıları varyant kapılarıyla aynı yoldan geçer (iyimser yazım + `revision` + 401 dalı); paketin sepetteki adresi
  slug değil uuid'dir.
*/

/**
 * Hazır paketi sepete ekler; aynı paket zaten varsa ADEDİNİ artırır (`addProduct`un aynı kuralı —
 * v3 `addPkg` de böyle: `cartPkgs`ta satır varsa `qty` toplanır, yeni satır açılmaz).
 */
export function addBundle(line: Omit<CartBundleLine, 'quantity'>, quantity = 1): void {
  const existing = state.bundles.find((bundle) => bundle.id === line.id);
  const next: CartState = {
    ...state,
    bundles: existing
      ? state.bundles.map((bundle) =>
          bundle.id === line.id ? { ...bundle, quantity: bundle.quantity + quantity } : bundle,
        )
      : [...state.bundles, { ...line, quantity }],
  };
  commit(next, (query) => addCartItems([{ kind: 'bundle', bundleId: line.id, qty: quantity }], query));
}

export function setBundleQuantity(id: string, quantity: number): void {
  const next: CartState = {
    ...state,
    bundles:
      quantity <= 0
        ? state.bundles.filter((bundle) => bundle.id !== id)
        : state.bundles.map((bundle) => (bundle.id === id ? { ...bundle, quantity } : bundle)),
    view: viewWithQty(state.view, { bundleId: id }, quantity),
  };
  commit(next, (query) => setCartItemQty({ bundleId: id }, Math.max(0, quantity), query));
}

export function removeBundle(id: string): void {
  const next: CartState = {
    ...state,
    bundles: state.bundles.filter((bundle) => bundle.id !== id),
    view: viewWithQty(state.view, { bundleId: id }, 0),
  };
  commit(next, (query) => removeCartItem({ bundleId: id }, query));
}

/**
 * Kupon kodunu niyet olarak yazar ve görünümü yeniden çözdürür; geçerliliği ve indirimi sunucu söyler.
 */
export function applyCoupon(code: string): void {
  const trimmed = code.trim();
  publish({ ...state, couponCode: trimmed === '' ? null : trimmed });
  refreshView();
}

export function removeCoupon(): void {
  publish({ ...state, couponCode: null });
  refreshView();
}

// ── TÜRETİLMİŞ OKUMALAR ─────────────────────────────────────────────────────

/**
 * Sepetteki toplam adet: görünüm varsa sunucunun sayısı (paketler dahil), yoksa cihazın niyeti, çünkü ürün dururken
 * "0" göstermek ölçülemeyeni sıfır saymak olurdu.
 */
export function cartCount(cart: CartState): number {
  if (cart.view.lines.length > 0) return cart.view.itemCount;
  const bundles = cart.bundles.reduce((total, line) => total + line.quantity, 0);
  return cart.products.reduce((total, line) => total + line.quantity, bundles);
}

/** Ekranların okuma seam'i — depo değişince abone ekran yeniden çizilir. YAN ETKİSİZ (künye). */
export function useCart(): CartState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
