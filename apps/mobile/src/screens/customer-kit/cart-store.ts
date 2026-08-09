import { useSyncExternalStore } from 'react';

/*
  SEPET — UYGULAMA ÖMRÜ BOYUNCA TEK DURUM (21.14 ilk etap: UI-only).

  Neden bir depo, ekran içi `useState` değil: sepet ÜÇ ekranın ortak gerçeğidir — vitrindeki
  "Sepete +" sepet ekranını, sepet ekranı da checkout özetini ve yüzen düğmenin sayacını değiştirir.
  Üç ekran kendi kopyasını tutsaydı "sepete eklendi" yalanı ekranda kalır, sepet boş açılırdı.

  NEDEN CONTEXT DEĞİL: sağlayıcı (provider) kök layout'a takılırdı ve kök layout müşteri ile
  operasyon kabuklarının ORTAK dosyasıdır — müşteri ekranlarının durumu için operasyon ağacını
  sarmalamak yanlış yere yazmak olurdu. Modül düzeyinde bir depo + `useSyncExternalStore` aynı
  sonucu kabuk sözleşmesine hiç dokunmadan verir (React'in resmî dış-depo kapısı).

  BU DEPO GEÇİCİ DEĞİL, ERKEN: gerçek uç geldiğinde (sonraki etap) değişecek olan `seedCart`
  çağrısı ve yazma yollarıdır; ekranların okuduğu seam (`useCart`) aynı kalır.

  FİYAT CENT'TİR (`@lezzet/types` boyunca aynı disiplin): biçimleme okuyan tarafın işi
  (`formatPrice`), depo ham tam sayı taşır — ondalık aritmetiği sepette kuruş kaybettirir.
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
}

/** Sepetteki hazır paket satırı — koyu kartla ayrı çizilir (v3:411). */
export interface CartBundleLine {
  id: string;
  name: string;
  /** İçerik özeti — "5 çeşit · börek, tatlı…". */
  contentLabel: string;
  unitCents: number;
  quantity: number;
  photoUri: string | null;
}

/** Uygulanmış kupon — kod ve indirim tutarı (cent). */
export interface CartCoupon {
  code: string;
  amountCents: number;
}

export interface CartState {
  products: CartProductLine[];
  bundles: CartBundleLine[];
  coupon: CartCoupon | null;
}

const EMPTY_CART: CartState = { products: [], bundles: [], coupon: null };

let state: CartState = EMPTY_CART;

/** Abone ekranlar. `Set` çünkü aynı ekran iki kez abone olmaz ve çıkış O(1) olmalı. */
const listeners = new Set<() => void>();

function publish(next: CartState): void {
  state = next;
  for (const listener of listeners) listener();
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
 * Sepeti bilinen bir başlangıç durumuna kurar (fixture · ilk etap; sonraki etapta sunucu cevabı).
 * Testler de bunu çağırır — her test kendi sepetini kurar, koşu sırası birbirine karışmaz.
 */
export function seedCart(next: CartState): void {
  publish(next);
}

/** Sepeti boşaltır — sipariş tamamlandığında ve testlerin `beforeEach`inde. */
export function resetCart(): void {
  publish(EMPTY_CART);
}

/**
 * Ürünü sepete ekler; aynı satır zaten varsa ADEDİNİ artırır (yeni satır AÇMAZ — aynı ürünün iki
 * kez listelenmesi müşteriye "iki farklı şey aldım" derdi).
 */
export function addProduct(line: Omit<CartProductLine, 'quantity'>, quantity = 1): void {
  const existing = state.products.find((product) => product.id === line.id);
  publish({
    ...state,
    products: existing
      ? state.products.map((product) =>
          product.id === line.id ? { ...product, quantity: product.quantity + quantity } : product,
        )
      : [...state.products, { ...line, quantity }],
  });
}

/**
 * Adedi değiştirir. SIFIRA düşen satır sepetten ÇIKAR: "0 adet ürün" diye bir şey yok ve
 * sıfırda duran satır toplamı bozmadan listeyi kirletirdi (v3'ün `−` düğmesi de böyle davranıyor).
 */
export function setProductQuantity(id: string, quantity: number): void {
  publish({
    ...state,
    products:
      quantity <= 0
        ? state.products.filter((product) => product.id !== id)
        : state.products.map((product) => (product.id === id ? { ...product, quantity } : product)),
  });
}

export function removeProduct(id: string): void {
  publish({ ...state, products: state.products.filter((product) => product.id !== id) });
}

/**
 * Hazır paketi sepete ekler; aynı paket zaten varsa ADEDİNİ artırır (`addProduct`un aynı kuralı —
 * v3 `addPkg` de böyle: `cartPkgs`ta satır varsa `qty` toplanır, yeni satır açılmaz).
 */
export function addBundle(line: Omit<CartBundleLine, 'quantity'>, quantity = 1): void {
  const existing = state.bundles.find((bundle) => bundle.id === line.id);
  publish({
    ...state,
    bundles: existing
      ? state.bundles.map((bundle) =>
          bundle.id === line.id ? { ...bundle, quantity: bundle.quantity + quantity } : bundle,
        )
      : [...state.bundles, { ...line, quantity }],
  });
}

export function setBundleQuantity(id: string, quantity: number): void {
  publish({
    ...state,
    bundles:
      quantity <= 0
        ? state.bundles.filter((bundle) => bundle.id !== id)
        : state.bundles.map((bundle) => (bundle.id === id ? { ...bundle, quantity } : bundle)),
  });
}

export function removeBundle(id: string): void {
  publish({ ...state, bundles: state.bundles.filter((bundle) => bundle.id !== id) });
}

export function applyCoupon(coupon: CartCoupon): void {
  publish({ ...state, coupon });
}

export function removeCoupon(): void {
  publish({ ...state, coupon: null });
}

/** Sepetteki toplam ADET (ürün + paket) — yüzen düğmenin ve başlık sayacının okuduğu sayı. */
export function cartCount(cart: CartState): number {
  const products = cart.products.reduce((total, line) => total + line.quantity, 0);
  return cart.bundles.reduce((total, line) => total + line.quantity, products);
}

/** İndirim ÖNCESİ toplam (cent). */
export function cartSubtotalCents(cart: CartState): number {
  const products = cart.products.reduce((total, line) => total + line.unitCents * line.quantity, 0);
  return cart.bundles.reduce((total, line) => total + line.unitCents * line.quantity, products);
}

/**
 * Ödenecek toplam (cent). Kupon ara toplamı AŞAMAZ: sepetin negatife düşmesi para iadesi demek
 * olurdu ve o bir sipariş kararı değil, bir hata olurdu.
 */
export function cartTotalCents(cart: CartState): number {
  const subtotal = cartSubtotalCents(cart);
  return cart.coupon === null ? subtotal : Math.max(0, subtotal - cart.coupon.amountCents);
}

/** Ekranların okuma seam'i — depo değişince abone ekran yeniden çizilir. */
export function useCart(): CartState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
