import { useEffect, useSyncExternalStore } from 'react';
import { applyBestDiscount, meetsMinBasket } from '@lezzet/domain-core';
import type { Locale } from '@lezzet/i18n';
import type { MeCartView, MeCartViewLine } from '@lezzet/types';

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
import type { ApiResult } from '@/lib/api/client';
import { useAppLocale } from '@/lib/i18n/app-locale';
import { getOnboardingSnapshot, subscribeOnboarding } from '@/lib/onboarding/onboarding-store';
import { getSupabase } from '@/lib/auth/supabase';

/*
  SEPET — NİYET CİHAZDA, GÖRÜNÜM SUNUCUDA.

  Depo iki şey tutar ve ikisi AYNI ŞEY DEĞİLDİR:
  · NİYET (`products` · `bundles` · `couponCode`) — "ne istendi": varyant + adet + parti, kupon kodu.
    Misafirde bu liste sepetin TEK kaydıdır (cihazda yaşar, çevrimdışı çalışır); girişli müşteride
    aynı niyet SUNUCUDA yaşar (`/api/v1/me/cart`) ve iki yüzeyde PAYLAŞILIR (kullanıcı kararı 09.08).
  · GÖRÜNÜM (`view`) — "o niyetin BUGÜNKÜ karşılığı": ad · fiyat · indirim · asgari sepet · kargo
    eşiği · tükendi kararı. Bunu HER İKİ HÂLDE DE SUNUCU çözer: girişlide sepet uçlarının cevabı,
    misafirde `POST /api/v1/cart/view`. Sepetteki fiyat bağlayıcı değildir ve her okumada yeniden
    çözülür (DOMAIN §5); iki yüzeyde iki ayrı hesap bir gün iki farklı tutar gösterirdi.

  Ekranlar bu ayrımı BİLMEZ: `addProduct`/`setProductQuantity`/`removeProduct` her iki yolda da aynı
  çağrıdır; hangi deponun konuştuğuna burası karar verir.

  NEDEN BİR DEPO, EKRAN İÇİ `useState` DEĞİL: sepet ÜÇ ekranın ortak gerçeğidir — vitrindeki
  "Sepete +" sepet ekranını, sepet ekranı da checkout özetini ve yüzen düğmenin sayacını değiştirir.
  NEDEN CONTEXT DEĞİL: sağlayıcı kök layout'a takılırdı ve orası müşteri ile operasyon kabuklarının
  ORTAK dosyasıdır. Modül düzeyinde depo + `useSyncExternalStore` aynı sonucu kabuk sözleşmesine
  dokunmadan verir (React'in resmî dış-depo kapısı; `use-me.hook` de aynı kalıpta).

  ── OKUMA SAF, SUNUCU TURU TEK KAPIDA ───────────────────────────────────────
  `useCart()` YAN ETKİSİZDİR: abone olmak ağa çıkmaz, oturum okumaz. Sunucu turunu başlatan tek yer
  `useCartSync()`tir ve o MÜŞTERİ SEKME KABUĞUNDA takılı (`app/(tabs)/_layout`). Ayrım bilinçli:
  vitrin/ürün/paket ekranları sepeti yalnız SAYMAK için okuyor, o okumanın oturum altyapısına
  bağlanması gerekmez — ve `useCart`ı yan etkili yapmak, env istemeyen onlarca komponent testini
  `getSupabase()`e bağlardı (ölçüldü). Görünüm turu da AYNI KAPININ ardındadır: kapı kapalıyken
  (kabuk monte değilken) ağa çıkılmaz.

  ── FİYAT CENT'TİR ──────────────────────────────────────────────────────────
  Biçimleme okuyan tarafın işi (`formatPrice`), depo ham tam sayı taşır — ondalık aritmetiği sepette
  kuruş kaybettirir.
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
  photoUri: string | null;
  /** İndirimli fiyattan geliyor — sepette rozetle söylenir. */
  discounted: boolean;
  /** Sepete girdikten SONRA tükendi: teslim edilemez, kaldırılması istenir (v3:437). */
  soldOut: boolean;
  /**
   * SUNUCU SEPETİNDEKİ ADRESİ — varyantın kimliği (uuid). İsteğe bağlı çünkü satırı kuran ekranlar
   * (`product`/`recipe` detayları) bugün onu ayrı bir alan olarak GEÇMİYOR; kimliği `${slug}-${uuid}`
   * biçiminde birleşik `id`ye gömüyorlar (`recipe-api.schema.ts` bu biçimi sözleşmede yazıyor).
   * O yüzden çözüm iki adımlı (`variantIdOf`): alan varsa o, yoksa `id`nin sonundaki uuid.
   * BEKLEYEN(21.14): ekranlar `variantId`yi açıkça geçince ikinci adım silinir.
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
  photoUri: string | null;
}

/**
 * Sepete İNEN indirim — kod ve tutar (cent). Depo bunu HESAPLAMAZ, sunucunun görünümünden türetir
 * (`view.discount`): kupon geçerliliği, kampanya ve müşteri oranı motorun kararıdır.
 *
 * `code` müşteriye görünen künyedir: kuponda kodun kendisi, kendiliğinden inen indirimde
 * kampanyanın adı (adsız kampanyada boş). Kuponun HÂLİNİ (uygulandı/reddedildi) okuyan ekran
 * `view.discount`a bakar — bu alan yalnız "ne kadar indi" sorusunundur.
 */
export interface CartCoupon {
  code: string;
  amountCents: number;
}

/**
 * Sepetin KAYNAĞI. `device` = misafir (ya da henüz okunmamış oturum): niyet yalnız cihazda.
 * `server` = sunucu sepeti okundu ve yazmalar oraya gidiyor.
 *
 * Bayrak şart, çünkü istemci "kimin sepeti" sorusunu kendi cevaplayamaz. Web'de bu bayrak yokken
 * girişli müşteride tarayıcı deposu da doluyor ve bir sonraki açılışta misafir sepeti sanılıp
 * sunucudakinin ÜSTÜNE ekleniyordu — her yenilemede adetler katlanıyordu (29.07).
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
  customerDiscountPercent: null,
  isFirstOrder: false,
  hasBlocked: false,
  /* Teslim edilemeyen kalemlerin tutarı — boş sepette sıfır, çünkü kalem yok. Asgari sepet bu
     tutarı MATRAHTAN düşüyor (kullanıcı kararı 10.08): sipariş edilemeyecek bir kalemle eşiği
     geçmiş görünen müşteri, kasada geri düşerdi. */
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
 * SUNUCU CEVABI AYNIYSA YAYIN YAPILMAZ (kullanıcı kararı 20.08: *"değişiklik varsa değiştiririz,
 * yoksa gereksiz bir state değişikliği oluşturmayız"*).
 *
 * İyimser yama ekranı zaten doğru değere getirdi; sunucu aynı şeyi söylüyorsa yeni bir nesne
 * yayınlamak bütün aboneleri boşuna yeniden çizdirir ve müşterinin gördüğü sayı iki kez "değişir"
 * (aynı değere). Karşılaştırma GÖRÜNÜMÜN TAMAMI üzerinde: bir alan bile farklıysa sunucunun sözü
 * geçerlidir ve olduğu gibi uygulanır — yani bu bir süzgeç değil, gereksiz turun elenmesi.
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
 * Sepeti YERELDE boşaltır — testlerin `beforeEach`i ve misafir devrinin temizliği.
 *
 * SUNUCU SEPETİNE DOKUNMAZ ve bu bilinçli — gerekçe 27.08'de değişti, kural değişmedi. Eski
 * gerekçe "checkout henüz sipariş oluşturmuyor"du; artık oluşturuyor ve sepeti SUNUCU kapatıyor
 * (`placeOrder` → `clearOrderedLines`, sipariş yazımıyla aynı pencerede). Yeni gerekçe daha da
 * bağlayıcı: silme SEÇİCİDİR — o siparişin kalemleri düşer, iki gruplu sepette kargo yarısı
 * yerinde kalır. Buradan toptan silmek, müşterinin henüz sipariş etmediği kalemleri silmek
 * olurdu; checkout onayı da bu yüzden `resetCart` değil `refreshCart` çağırıyor
 * (`checkout-screen` → `finish` künyesi, 21.29a).
 *
 * Havadaki turlar GEÇERSİZ kılınır (`revision`): boşaltmadan önce başlamış bir cevabın sepeti geri
 * doldurması, kullanıcının gördüğü boş sepeti sessizce bozardı.
 */
export function resetCart(): void {
  revision += 1;
  publish(EMPTY_CART);
}

/**
 * SEPETİ SUNUCUDAN TAZELE (21.29a) — silmez, YENİDEN OKUR.
 *
 * ── NEDEN `resetCart` DEĞİL ─────────────────────────────────────────────────
 * Sipariş verildiğinde sunucu sepeti kendisi kapatıyor ve **yalnız siparişe giren kalemleri**
 * düşürüyor (`clearOrderedLines`, `placeOrder` içinden): iki gruplu sepette kargo yarısı yerinde
 * kalır. `resetCart()` çağırmak o yarıyı da silerdi — müşterinin henüz sipariş etmediği kalemleri.
 * Doğru hareket sunucuya sormaktır; cevabı zaten o biliyor.
 *
 * ── NEDEN AYRI BİR KAPI GEREKTİ ─────────────────────────────────────────────
 * Depo sunucu turunu bugüne kadar YALNIZ kendi tetiklediği anlarda atıyordu (dil, yer ya da oturum
 * değişimi). Sipariş bunların hiçbiri değil: sunucudaki sepet değişti ama depo bunu bilmiyor ve
 * ekranın rozeti eski sayıyı göstermeye devam ediyordu (kullanıcı bulgusu 10.08: *"siparişi
 * tamamladığım zaman sepetim temizlenmedi"*). Kayıp sunucuda değil, istemcinin haberinde.
 *
 * `refreshView` misafir sepetini de doğru karşılıyor (yerel çözüm) — bu kapı onun dışa açık yüzü,
 * ikinci bir mantık yazılmadı. Kabuk takılı değilken (`watchers === 0`) sessizce hiçbir şey yapmaz:
 * görünmeyen bir ekranın turu, cevabı kimsenin okumayacağı bir istektir.
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
 * SATIN ALMA YERİ — kayıtlı teslimat adresinin posta kodu; `null` = bilinmiyor, gezinme kodu geçerli.
 *
 * 10.08'deki karar şuydu: *"satın alma tarafının tamamı ADRESLE çözülür, gezinme kodu vitrinde
 * kalır."* O gün bu, sepet ekranına İKİNCİ bir okuma eklenerek uygulandı (`useAddressCartView`) ve
 * arıza oradan doğdu: yazma turları deponun görünümünü tazeliyor, ekran ise o ikinci okumayı
 * çiziyordu ve o okuma yalnız dil/adres/kupon değişince yenileniyordu. Adet bunlardan hiçbiri —
 * ekran donuyordu (ölçüldü cihazda 20.08: veritabanı 3, ekran 2, başlık "3 ürün"; aynı ekran kendi
 * kendini yalanlıyordu).
 *
 * Doğrusu ikinci bir okuma değil, TEK okumanın doğru yere sorulmasıydı. Yer buraya yazılır, görünüm
 * yine tek yerde çözülür; ekranların seçeceği iki görünüm kalmaz.
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
 * Satın alma yerini bildirir — sepet ve checkout, kayıtlı adresi çözer çözmez çağırır.
 *
 * Değişince görünüm yeniden çözülür; aynıysa hiçbir şey olmaz (her render'da tur açmamak için).
 * `null` yazmak "adres bilinmiyor"dur ve gezinme koduna döner — müşteri çıkış yaptığında ya da
 * kayıtlı adresi kalmadığında olan budur.
 */
export function setPurchasePlace(postalCode: string | null): void {
  if (purchasePostalCode === postalCode) return;
  purchasePostalCode = postalCode;
  refreshView();
}

// ── SUNUCU TURU ─────────────────────────────────────────────────────────────

/**
 * `${slug}-${uuid}` biçimli satır kimliğinin kuyruğundaki varyant kimliği. Biçim uydurma değil,
 * bugün iki çağıranın da yazdığı biçim (`product-detail-screen`, `recipe-detail-screen` — sonuncusu
 * sözleşmede de yazılı). Eşleşmezse satır sunucuya GİTMEZ: yanlış bir kimlikle yazmaktansa yerel
 * kalması iyidir (bozuk yazım sessiz değil — `variantIdOf` null döndüğü an satır senkron dışıdır).
 */
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const TRAILING_UUID = new RegExp(`${UUID}$`, 'i');
/** Adres anahtarının biçimi — `variantId` ya da `variantId@stockId` (`cartLineId` üretir). */
const ADDRESS_KEY = new RegExp(`^(${UUID})(?:@(${UUID}))?$`, 'i');

function variantIdOf(line: CartProductLine): string | null {
  if (line.variantId !== undefined) return line.variantId;
  return TRAILING_UUID.exec(line.id)?.[0] ?? null;
}

/**
 * Satırın sunucudaki adresi — varyant + parti çifti; varyantı çözülemeyen satırın adresi yoktur.
 *
 * `kind` AÇIKÇA yazılır: gövde artık ayrık bir birlik (varyant ⟷ paket) ve türü kimlik alanının
 * VARLIĞINDAN çıkarmak yasak — `string` birim tip değildir, TypeScript onunla daraltma yapmaz
 * (`MeCartItemWriteSchema` künyesi).
 */
function addressOf(line: CartProductLine): CartItemWrite | null {
  const variantId = variantIdOf(line);
  return variantId === null ? null : { kind: 'variant', variantId, qty: line.quantity, stockId: line.stockId ?? null };
}

function addressesOf(lines: readonly CartProductLine[]): CartItemWrite[] {
  return lines.map(addressOf).filter((item) => item !== null);
}

/**
 * NİYETİN TAMAMI — ürünler VE paketler. Misafirin görünümü ile devrin gövdesi bunu gönderir.
 *
 * Paketler 20.08'e kadar buraya girmiyordu ve bedeli ölçülmüştü: misafirin görünümünde paket hiç
 * çözülmüyor, girişte devrolan sepette paket kayboluyordu. Aynı kök, sepet toplamının paketi
 * saymamasıyla aynı (künye: `setQty` → `CartRef`).
 */
function intentOf(cart: CartState): CartItemWrite[] {
  return [
    ...addressesOf(cart.products),
    ...cart.bundles.map((bundle): CartItemWrite => ({ kind: 'bundle', bundleId: bundle.id, qty: bundle.quantity })),
  ];
}

/**
 * GÖRÜNÜM SATIRININ DEPO KİMLİĞİ — yazma kapılarına (`setProductQuantity`/`removeProduct`)
 * verilecek `id`.
 *
 * NEDEN GEREKLİ: sepet ekranı artık YEREL niyet listesini değil SUNUCUNUN görünümünü çiziyor ve o
 * listede bu cihazın hiç görmediği satırlar da var (webden ya da başka bir telefondan eklenmiş).
 * Onların yerel bir `id`si yok; kimlikleri ADRESLERİDİR. Anahtar bu yüzden adresten kurulur ve
 * yazma kapıları iki biçimi de tanır (yerel `id` ⟷ adres anahtarı).
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
 * İYİMSER GÖRÜNÜM YAMASI — parmak kalkar kalkmaz ekranda değişen şey (kullanıcı kararı 20.08:
 * *"view-first; önce arayüzü günceller, beklenmedik bir durum olursa eski hâline alırsın"*).
 *
 * Yazma turu zaten iyimserdi (`commit`) ama yamayı YANLIŞ YERE koyuyordu: yalnız yerel niyet
 * listesini (`products`) güncelliyordu, oysa ekran görünümün satırlarını çiziyor. Yani desen
 * "iyimser" adını taşıyıp davranışı bekleyendi; sunucu cevabı ~300 ms sonra gelip düzelttiği için
 * fark edilmiyordu. Yama artık ekranın gerçekten okuduğu yere yazılıyor.
 *
 * ── NE YAMANIR, NE YAMANMAZ ────────────────────────────────────────────────
 * YAMANIR — hepsi sözleşmenin KENDİ alanları üzerinde düz aritmetik, hiçbiri iş kuralı değil:
 * · adet — kullanıcının kendi girdisi
 * · satır toplamı — birim fiyat × adet; birim fiyatı zaten sunucu çözdü
 * · `itemCount` — satır adetlerinin toplamı
 * · ara toplam — satır toplamlarının toplamı
 * · genel toplam — ara toplam eksi İNDİRİM; indirim HESAPLANMAZ, sunucunun son cevabından olduğu
 *   gibi taşınır (`subtotal − total` farkı). Yani istemci kampanya seçmez, oran uygulamaz; yalnız
 *   bir kez öğrendiği tutarı bir sonraki cevaba kadar taşır.
 * · asgari sepet — eşik ve matrah sözleşmeden gelir (`minBasketCents`, `undeliverableSubtotalCents`),
 *   burada yalnız çıkarma yapılır
 *
 * YAMANMAZ: indirimin KENDİSİ (hangi kampanya kazandı, ne kadar), ulaşılabilir kampanya cümlesi ve
 * kargo. Kampanyayı motor tüm sepet üzerinden tek-en-büyük seçip kalemlere oransal dağıtıyor;
 * istemcide tahmin etmek −%15 vaat edip %8 uygulamak olurdu (CLAUDE §1). Onlar sunucunun sözünü
 * bekler — ölçülen tur 207–336 ms — ve cevap geldiğinde tamamı onunla değişir.
 *
 * Fiyatı bilinmeyen satırda (`unitPriceCents === null`, satışa kapalı) toplam `null` KALIR:
 * ölçülemeyen değer sıfır değildir; ara toplama da 0 olarak girer, çünkü tahsil edilecek bir tutarı
 * yoktur.
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
  /* Eşik kuralı MOTORDAN sorulur, burada yeniden yazılmaz — web'in aynı satırı (`viewWithEntries`)
     de öyle yapıyor. Elle bir karşılaştırma yazmak, iki yüzeyin eşiği bir gün farklı okuması
     demekti. Eşik tanımsızsa (`0` = "bilinmiyor") sunucunun kararı korunur. */
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
 * İNDİRİM YENİDEN ÇÖZÜLÜR — SUNUCUNUNKİYLE AYNI MOTORLA (kullanıcı kararı 20.08: *"her basışta
 * fiyatlarda zıplama oluyor, bu hâliyle kabul edilemez"*).
 *
 * Önceki hâl sunucunun TUTARINI taşıyordu ve oran tabanlı bir kampanyada sepet büyüdükçe o tutar
 * eskiyordu: ölçüldü, bar 34,05 € gösterip cevap gelince 33,53 €'ya düşüyordu. İkinci bir hesap
 * yazmak çare değil (iki yüzey ayrışır); çare **motorun kendisini çağırmak** —
 * `applyBestDiscount`, `@lezzet/domain-core`, sunucunun `resolveCartDiscount`u da onu çağırıyor.
 * Kurallar sözleşmeyle taşınıyor (`view.discountRules`; künyesi `MeCartDiscountRuleSchema`).
 *
 * ── KUPON YOLUNDA MOTOR ÇALIŞTIRILMAZ ───────────────────────────────────────
 * Kupon kuralları kodlarını taşır ve o kodlar istemciye GÖNDERİLMEZ; havuz yalnız kendiliğinden
 * inen kampanyaları içeriyor. Kupon uygulanmış (ya da kupon yüzünden bir karar doğmuş) bir sepette
 * motorun eksik havuzla vereceği cevap YANLIŞ olurdu — o hâlde sunucunun son tutarı taşınır ve
 * ~300 ms sonra tazelenir. Kupon nadir, kampanya her sepette.
 *
 * Matrah muafiyetleri (paket kalemi, teklif satırı) motorun kendi kuralı; burada tekrarlanmaz —
 * satırlar olduğu gibi verilir, ayıklamayı `applyBestDiscount` yapar.
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
    })),
    view.discountRules.map((rule) => ({ ...rule, trigger: 'automatic' as const })),
    { customerDiscountPercent: view.customerDiscountPercent, isFirstOrder: view.isFirstOrder },
  );
  const cents = winner?.amountCents ?? 0;

  /* İNDİRİM SATIRI DA TAZELENİR — yoksa aynı karede "ara toplam − indirim ≠ toplam" olurdu
     (ölçüldü cihazda 20.08: toplam anında 64,08 € doğru, indirim satırı hâlâ −4,18 € yazıyordu).
     Toplamı düzeltip satırı bırakmak, çelişkiyi gizlemek değil GÖRÜNÜR kılmak olurdu. */
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
    photoUri: line.image.url ?? known.photoUri,
    discounted: line.wasCents !== undefined,
    soldOut: line.blocked,
  };
}

/**
 * SUNUCU SEPETİNİN cevabı benimsenir — görünüm olduğu gibi alınır, yerel niyet listesi ona göre
 * kurulur.
 *
 * Eşleşen satır sunucunun değerleriyle tazelenir; yerelde olup sunucuda olmayan satır DÜŞER —
 * sunucu ne diyorsa sepet odur ("iki listeyi birleştirme" yalnız DEVİR anında olur ve onu da sunucu
 * yapar). Adresi çözülemeyen yerel satır KORUNUR: sunucuya hiç gitmediği için sunucunun listesinde
 * olmaması silindiği anlamına gelmez.
 *
 * Sunucuda OLUP yerelde karşılığı olmayan satır artık bir sorun değil: görünüm onun adını da
 * fiyatını da taşıyor, ekran doğrudan `view.lines`ı çiziyor. Yerel liste yalnız devir ve misafir
 * yolu için tutulur.
 *
 * Paket satırları dokunulmadan kalır ve GEREKÇE 27.08'de değişti: eskiden paket sunucuya hiç
 * yazılamıyordu (uuid'si paket detay sözleşmesinde yoktu); 20.08'den beri yazılıyor, çözülüyor ve
 * toplama giriyor. Bugünkü sebep varyant satırındakiyle aynı değil: paketin yerel kaydı ekranın
 * çizdiği şey DEĞİL — ekran `view.lines`ı çiziyor ve paket satırı adıyla, fiyatıyla oradan geliyor.
 * Yerel liste yalnız devir ve misafir yolu için tutuluyor, tazelenecek bir gösterimi yok.
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
 * MİSAFİRİN cevabı benimsenir. Niyet listesi DOKUNULMADAN kalır — misafirde sepetin tek kaydı odur
 * ve sunucu onu "bilmiyor", yalnız çözüyor. Satırlar yine de tazelenir: fiyat değiştiyse yerel
 * kopyanın eski fiyatı taşıması, checkout özetinde iki farklı sayı demekti.
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
 * Yerel değişikliği ANINDA uygular, sonra sunucuya yazar (hesap ekranındaki iyimser-yazım deseni).
 * Ret gelirse ESKİ hâle dönülür ve anahtar `error`a yazılır — kaydedilmemiş bir adedi kaydedilmiş
 * göstermek, müşteriye sepetinde olmayan bir ürünü var gibi okutur.
 *
 * MİSAFİRDE YAZMA YOKTUR, sadece görünüm tazelenir: niyet zaten cihazdadır ve onu bir ağ arızası
 * geri alamaz — geri alınacak bir yazma yok.
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
      /* 401 = OTURUM BİTTİ, yazma hatası DEĞİL — `hydrateCart`in aynı ayrımı, burada eksikti
         (ölçüldü 09.08: iki yol aynı anahtarı iki farklı şeye yoruyordu). Süresi dolmuş oturumla
         "+" basan müşteri kırmızı bir "eşitlenemedi" uyarısı görüyor ve dokunuşu geri alınıyordu;
         oysa doğru cevap sepetin CİHAZ sepetine dönmesidir — misafirin sepeti nasıl çalışıyorsa
         öyle. Değişiklik KORUNUR (`next`), kaynak cihaza düşer, uyarı yazılmaz; görünüm de misafir
         yolundan yeniden çözülür. */
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
 * Sunucu sepetini okur; misafir sepeti VARSA önce devreder.
 *
 * DEVİR YALNIZ BİR KEZ: `source === 'device'` iken gönderilir. İkinci bir devir aynı satırları
 * sunucudakinin üstüne bir kez daha eklerdi (adetler katlanır — web'de ölçülmüş arıza, 29.07).
 * Devirden sonra yerel liste sunucunun cevabıyla YENİDEN KURULUR, yani "yerel kopya temizlenir"
 * kuralı ayrı bir silme adımı değil, tek yönlü eşitlemenin doğal sonucudur.
 *
 * 401 = MİSAFİR, hata değil (`authorizedFetch` oturumsuzken ağa hiç çıkmaz): sepet cihazda kalır ve
 * görünümü misafir ucundan çözülür. Öteki retler ölçülemedi demektir — yerel sepete DOKUNULMAZ,
 * anahtar `error`a yazılır; sunucuyu okuyamadık diye müşterinin sepetini boşaltmak, olmayan bir
 * bilgiyi bilgi saymak olurdu.
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
 * Görünümü YENİDEN ÇÖZDÜRÜR — niyet, dil ya da yer değiştiğinde çağrılır.
 *
 * BOŞ NİYET AĞA ÇIKMAZ: kalemi olmayan sepetin görünümü tanım gereği boştur ve sunucuya sormak,
 * uygulamanın her açılışında karşılıksız bir istek demekti.
 *
 * KAPI KAPALIYKEN de çıkmaz (`watchers === 0`): sunucu turunun tek kapısı `useCartSync`tir
 * (dosya künyesi) — ürün/tarif ekranlarının testleri o kapıyı açmıyor ve sepete ekleme onları
 * ağa bağlamamalı.
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
 * Sunucu turunu AÇAN kapı — ekran bunu takınca sepet oturumu izlemeye başlar (giriş → devir + okuma,
 * çıkış → temizlik) ve görünümün bağlamını (dil + posta kodu) depoya bağlar. `useCart`tan ayrı
 * durmasının gerekçesi dosya künyesinde.
 *
 * DİL VE YER BURADAN GEÇER, depo onları kendi okumaz: ikisi de HOOK kaynaklı (`useAppLocale`,
 * onboarding deposu) ve modül düzeyinde bir depo hook çağıramaz. Kapı zaten kabukta takılı, yani
 * değer değiştiği an burada görünür.
 */
export function useCartSync(): void {
  const locale = useAppLocale();
  const onboarding = useSyncExternalStore(subscribeOnboarding, getOnboardingSnapshot);
  const postalCode = onboarding?.postalCode ?? null;

  useEffect(() => {
    startWatching();
    return stopWatching;
  }, []);

  useEffect(() => {
    setViewContext({ locale, postalCode });
  }, [locale, postalCode]);
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
 * BİRDEN ÇOK satırı TEK turda ekler — tarifin "Malzemeleri sepete ekle"si.
 *
 * **Neden tek tur** (ölçüldü 09.08): eskiden ekran döngüyle `addProduct` çağırıyordu ve her çağrı
 * ayrı bir istek atıyordu. Sepet sunucuda TEK satırda yaşıyor; eşzamanlı üç istek aynı başlangıcı
 * okuyup üstüne yazınca yalnız sonuncusu kalıyordu — üç malzemeden biri sepete giriyor, üstelik
 * hangisinin girdiği belirsiz oluyordu (bildirim ise "3 kalem eklendi" diyordu). İkinci bir kayıp
 * daha vardı ve o istemcideydi: iyimser yazım sayacı yalnız SON turun cevabını uyguluyor, o cevap
 * da eksik listeyi taşıyınca `adopted` yereldeki öteki satırları eliyordu.
 *
 * Tek tur ikisini birden kapatır: bir kullanıcı eylemi, bir istek, bir cevap.
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
 * Adedi değiştirir. SIFIRA düşen satır sepetten ÇIKAR: "0 adet ürün" diye bir şey yok ve sıfırda
 * duran satır toplamı bozmadan listeyi kirletirdi (v3'ün `−` düğmesi de böyle davranıyor; sunucu
 * ucu da sıfırı silme olarak okur).
 *
 * `id` iki biçimden biri olabilir: ekranların kurduğu yerel kimlik ya da görünüm satırının adres
 * anahtarı (`cartLineId`) — künyesi orada.
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
  PAKET KAPILARI SUNUCUYA BAĞLI (20.08) — aşağıdaki üçü varyant kapılarıyla AYNI yoldan geçer:
  iyimser yazım + `revision` sayacı + 401 dalı.

  ── BURASI BİR TARİH KAYDI: iki engelin ikisi de ödendi ─────────────────────
  Kapılar bir süre YEREL kaldı ve sebebi ölçülmüştü (21.21, canlı `:3002`):

  1. SATIR ÇÖZÜLEMİYORDU. `getCartView`in paket kapısı (`CartBundlePort`) mobil uçlarda
     geçilemiyordu — kapıyı besleyecek okuma `apps/web`te ve `server-only`ydi. Kapısız paket satırı
     `orphanLine`a düşüyordu: `name: ""`, `unitPriceCents: null`, `blocked: true` ve tutar toplama
     hiç girmiyordu. ÖDENDİ: okuma `@lezzet/application`a terfi etti (`getPackagesByIds`) ve
     `readCartView` kapıyı geçiyor (`cart-view.ts` künyesi) — vitrin, sepet ve checkout artık aynı
     paketi aynı stok ve yol kararıyla görüyor.

  2. SATIR AZALTILAMIYOR/SİLİNEMİYORDU. `PATCH`/`DELETE` yolu varyant + parti ile adresliyordu;
     paket kimliğiyle atılan `DELETE` satırı bulamıyordu. ÖDENDİ: `CartService.setQty`/`removeItem`
     satır anahtarına geçti (`CartRef` — varyant+parti ya da paket) ve uç paket dalını
     `?kind=bundle` ile adresliyor (`lib/api/cart.ts` → `linePath`).

  Kayıt duruyor çünkü kararın kendisi buradan okunuyor: paketin sepetteki adresi SLUG DEĞİL UUID'dir
  ve bu üç kapı o kimliği taşıyor.
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
 * Kupon kodunu NİYET olarak yazar ve görünümü yeniden çözdürür — kodun geçerliliğini, indirimini ve
 * hangi kampanyanın kazandığını SUNUCU söyler (`view.discount`).
 *
 * İSTEMCİ SÖZLÜĞÜ YOK: eskiden ekran iki demo kodu yerel bir tablodan doğruluyordu; o tablo hem
 * gerçek kuponları tanımıyor hem de tanıdıklarına yanlış indirim veriyordu. Ret sebebi de artık
 * gerçek: `CartCouponFailureEnum` (süresi dolmuş ⟷ asgari sepet ⟷ hakkı bitmiş — üçü farklı şey ve
 * ikincisinde müşteri sepetine ürün ekleyerek kuponu kullanabilir).
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
 * Sepetteki toplam ADET — yüzen düğmenin ve başlık sayacının okuduğu sayı.
 *
 * SUNUCU SAYAR (`view.itemCount`): başka bir cihazdan eklenmiş kalemler de o sayının içindedir.
 * Görünüm henüz çözülmemişse (kapı kapalı, ağ yok) cihazın kendi niyeti sayılır — sepetinde ürün
 * dururken "0" göstermek, ölçülemeyen değeri sıfır saymak olurdu (CLAUDE §1).
 *
 * PAKET SATIRLARI AYRICA EKLENİR çünkü sunucu sepetine yazılamıyorlar (künye yukarıda) ve
 * görünümde hiç görünmüyorlar; saymamak, müşteriye eksik bir sepet göstermek olurdu.
 */
export function cartCount(cart: CartState): number {
  /* Görünüm varsa SAYAN ODUR — paketler dahil. Eskiden görünümün sayısına yerel paket adetleri
     EKLENİYORDU çünkü sunucu paketi hiç görmüyordu; 20.08'de paket sunucuya bağlanınca o toplama
     çift sayım oldu (künye: `setQty` → `CartRef`). Görünüm yokken (misafirin ilk karesi, ağ turu
     henüz dönmemiş) niyet sayılır. */
  if (cart.view.lines.length > 0) return cart.view.itemCount;
  const bundles = cart.bundles.reduce((total, line) => total + line.quantity, 0);
  return cart.products.reduce((total, line) => total + line.quantity, bundles);
}

/* `cartSubtotalCents`/`cartTotalCents` SİLİNDİ (27.08). Künyeleri "tek çağıranı checkout ekranı,
   kendi görünümüne bağlanınca silinir" diyordu; checkout o görünüme bağlandı (özet artık sunucunun
   anlık görüntüsünden çiziliyor, 21.08) ve iki kapı çağıransız kaldı. Bir toplamı okumanın ikinci
   yolu, ayrıştığı gün ekranla kasayı ayırır. Tutar isteyen `cart.view`i okur. */

/** Ekranların okuma seam'i — depo değişince abone ekran yeniden çizilir. YAN ETKİSİZ (künye). */
export function useCart(): CartState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
