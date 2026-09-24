'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { diffCartByPlace } from '@lezzet/domain-core';
import type { Locale } from '@lezzet/i18n';
import type { CartLineChange } from '@lezzet/types';
import { readCartAction, writeCartAction } from '@/lib/cart/actions';
import { clearGuestCart, mergeEntry, readGuestCart, setEntryQty, writeGuestCart } from '@/lib/cart/cart-store';
import { clearSaved, readSaved, writeSaved } from '@/lib/cart/saved-store';
import { readCoupon, writeCoupon } from '@/lib/cart/coupon-store';
import {
  EMPTY_CART,
  cartKey,
  entryOf,
  isSplitCart,
  viewWithEntries,
  type AddToCartIntent,
  type CartEntry,
  type CartRef,
  type CartView,
} from '@/lib/cart/cart-types';
import { useDeliveryPlace } from '@/components/customer/delivery/place-context';
import { CartUndo } from './cart-undo';
import { CartWriteFailed } from './cart-write-failed';

/** Silinen kalemin geri alma penceresi (tasarım: "geri al snackbar'ı 5 sn görünür"). */
const UNDO_MS = 5000;

/**
 * Sepet durumunun tek sahibi: sayaç, kart üstündeki "+", ürün detayının çubuğu ve sepet sayfası aynı anda doğru olmalı. Niyet
 * (`entries`) anında, görünüm (`view`) sunucudan ilerler; deponun oturuma göre tarayıcı ya da sunucu olduğunu bileşenler bilmez.
 */
interface CartContextValue {
  /**
   * Sunucunun çözdüğü satırlar ve bugünkü niyetin adetleri; adet değişimi sunucu turunu beklemez. `pending` bayrağı yoktur, çünkü
   * tek kalemin turu bütün sepetin düğmelerini kilitlerdi; yarışı yanıt bileti çözer.
   */
  view: CartView;
  /** İlk okuma tamamlanana kadar sayaç gösterilmez — yanlış sayı göstermektense hiç göstermemek. */
  ready: boolean;
  /**
   * İlk okuma başarısız mı; ayrı bayrak, çünkü `view` boşken `entries` dolu kalır ve rozet "4" derken sayfa "sepetiniz boş" çizerdi.
   * Boş sepet bir durum, ulaşılamayan sepet bir arızadır.
   */
  failed: boolean;
  /**
   * Sepeti sunucudan yeniden okur: başarısız okumanın "tekrar dene"si ve sipariş sonrası tazeleme, çünkü sipariş sunucudaki sepeti
   * boşaltır ve sayaç da onu görmeli.
   */
  reload: () => void;
  /** Girilen kupon kodu (niyet). Sonucu `view.discount`tadır — ikisi karıştırılmamalı. */
  coupon: string | null;
  /** Kodu dener: yazar ve okumayı yeniden tetikler. Boş dize kodu KALDIRIR. */
  applyCoupon: (code: string) => void;
  clearCoupon: () => void;
  add: (entry: CartEntry) => void;
  /** Tekrar sipariş: birçok kalem TEK turda girer — tek tek eklemek N sunucu turu demekti. */
  /**
   * `skipped`: eklenemeyen kalem sayısı — çağıran bilir (tekrar siparişte tükenmiş kalemler
   * peşinen düşülür), sağlayıcı yalnız TAŞIR.
   */
  addMany: (entries: readonly CartEntry[], skipped?: number) => void;
  /**
   * Tekrar siparişte eklenemeyen kalem sayısı ("N kalem şu an mevcut değil"); sağlayıcıda durur, çünkü uyarıyı doğuran boş sepet
   * ekranı eklemeden hemen sonra sökülür. Bir sonraki sepet değişikliğinde temizlenir.
   */
  addSkipped: number | null;
  /**
   * Bu varyant ya da paket sepette mi, kaç adet: sepetteyse kartlar "Sepete ekle" yerine adet seçicisi çizer. Varyantta eşleşme
   * yalnız varyantla kurulur, çünkü soru "hangi partiden" değil "bu üründen kaç".
   */
  lineOf: (ref: { variantId: string } | { bundleId: string }) => { qty: number; stockId: string | null; limitCap: number | null } | null;
  /** 0 verilirse satır SİLİNİR ve 5 sn'lik geri alma penceresi açılır (tasarım: onay istenmez). */
  setQty: (ref: CartRef, qty: number) => void;
  /**
   * Az önce bir kalem çıkarıldı mı (geri alma penceresi açık). Sepet bu yüzden boşaldıysa boş ekran
   * başlığı "şu an boş" değil "boşaldı" olur — tasarım ikisini ayırıyor, çünkü biri durum, diğeri
   * müşterinin az önce yaptığı işin sonucu.
   */
  justRemoved: boolean;
  /** Sonraya kaydedilenler, çözülmüş satırlar; toplamları anlamsızdır, liste gösterilir. */
  saved: CartView;
  /**
   * Kalemi sepetten listeye taşır, silmez: gönderilemeyen ürün vazgeçilmiş değildir, yalnız bugün alınamıyordur. Geri alma şeridi
   * açılmaz, çünkü kalem gözden kaybolmaz.
   */
  saveForLater: (refs: readonly CartRef[]) => void;
  /** Listeden sepete geri alır (aynı adetle). Liste tarafındaki tek aksiyon budur. */
  restoreToCart: (ref: CartRef) => void;
  /**
   * Yer değişince sepette ne değişti, kalem kalem; `null` iken söylenecek bir şey yok. Sağlayıcıda durur, çünkü yer başlıktaki
   * haptan da değişir ve sepet o sırada monte değilse fark hiç hesaplanmazdı.
   */
  placeChange: CartLineChange[] | null;
  /** Kartı kapatır — "anladım". Bir sonraki yer değişimine kadar bir daha çizilmez. */
  dismissPlaceChange: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart yalnız CartProvider içinde kullanılır');
  return ctx;
}

interface CartProviderProps {
  locale: Locale;
  children: ReactNode;
}

export function CartProvider({ locale, children }: CartProviderProps) {
  // Yer sağlayıcısı BU sağlayıcıyı sarıyor (`(customer)/layout`), yani buradan okunabilir —
  // tersi mümkün değildi ve olması da gerekmiyor: sepet yeri izler, yer sepeti değil.
  const { place, ready: placeReady, unresolved, pickup } = useDeliveryPlace();
  /**
   * Yer karşılanamıyor mu; farkın `no_delivery` kararı okuma dönünce verilir ve o anki değer gerekir. `ref`, çünkü okumayı yeniden
   * kurmamalı.
   */
  const unresolvedNow = useRef(unresolved);
  useEffect(() => {
    unresolvedNow.current = unresolved;
  }, [unresolved]);
  const [entries, setEntries] = useState<CartEntry[]>([]);
  const [savedEntries, setSavedEntries] = useState<CartEntry[]>([]);
  const [view, setView] = useState<CartView>(EMPTY_CART);
  const [savedView, setSavedView] = useState<CartView>(EMPTY_CART);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  /** Girilen kupon kodu, yalnız niyet: sonucu `view.discount` ile sunucudan gelir ve kod değişince okuma yeniden koşar. */
  const [coupon, setCoupon] = useState<string | null>(null);
  /**
   * Sepet sunucuda mı yaşıyor; bunu sunucu söyler (`serverCart`), istemci "kimin sepeti" sorusunu cevaplayamaz. `ref`, çünkü `sync`
   * içinde okunur ve state olsaydı her yazmada bağımlılık zinciri yeniden kurulurdu.
   */
  const serverCart = useRef(false);
  /**
   * Sunucunun onayladığı son niyet, yazma düşünce iyimser adetin geri sarılacağı yer; `view`den türetilemez, çünkü o çözülmüş
   * satırları taşır. `ref`, çünkü `sync` onu okur ve state olsaydı her okuma yeni bir `sync` doğururdu.
   */
  const serverEntries = useRef<{ cart: CartEntry[]; saved: CartEntry[] }>({ cart: [], saved: [] });
  /** Yazma düştü mü — şerit bunu gösterir. Okumanın `failed`'i ile AYRI: o blok, bu haber. */
  const [writeFailed, setWriteFailed] = useState(false);
  // Silinen kalem, geri alınana ya da pencere kapanana kadar burada bekler.
  const [undo, setUndo] = useState<{ entry: CartEntry; name: string } | null>(null);
  /** Tekrar siparişte eklenemeyen kalem sayısı — uyarıyı doğuran ekran sökülse de yaşar. */
  const [addSkipped, setAddSkipped] = useState<number | null>(null);
  /**
   * Yer değişimi bildirimi; `compareTo` bir sonraki okumanın kıyaslanacağı eski görünümü taşır, yalnız yer değişince dolar ve okuma
   * dönünce boşalır. Ref, çünkü okumanın içinden okunur ve değişmesi yeni bir çizim doğurmamalı.
   */
  const [placeChange, setPlaceChange] = useState<CartLineChange[] | null>(null);
  const compareTo = useRef<CartView | null>(null);
  /**
   * Son okumada geçerli olan kupon kodu, ölçüm için. `ref`, çünkü state olsaydı `load`un bağımlılığı olur ve her kupon denemesi iki
   * tur koşardı.
   */
  const couponAtLastRead = useRef<string | null>(null);
  /**
   * Sepet şu an bölünmüş mü, ölçüm için. `ref`, çünkü `load` onu okur ve her okumada `view`i güncellediği için state bir okuma
   * döngüsü doğururdu.
   */
  const splitNow = useRef(false);
  // Yarışı kesmek için: geç dönen eski yanıt yeni durumu ezmesin.
  const seq = useRef(0);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Yazma düşünce iyimser adet geri sarılır, çünkü ekranla sunucu ayrıştığında doğru olan sunucuyu göstermektir. Yalnız girişli
   * müşteride: ziyaretçide niyet tarayıcıya zaten yazılmıştır ve geri sarmak kaybolmamış bir değişikliği silerdi.
   */
  const rollback = useCallback(() => {
    if (!serverCart.current) return;
    setEntries(serverEntries.current.cart);
    setSavedEntries(serverEntries.current.saved);
    setWriteFailed(true);
  }, []);

  /** Niyeti yazar ve çözülmüş görünümü alır. Ziyaretçide tarayıcıya, girişlide sunucuya gider. */
  const sync = useCallback(
    /**
     * `added` yalnız ölçüm içindir, çünkü "neyi eklediğim" bilgisi yalnız burada vardır. Geri alma ve listeden geri taşıma onu geçmez;
     * ikisi yeni ekleme değil düzeltmedir.
     */
    (next: CartEntry[], nextSaved: CartEntry[], added?: AddToCartIntent[]) => {
      // Bölünme GEÇİŞİNİ ölçebilmek için turun ÖNCESİNDEKİ hâl gerekiyor; sunucu onu bilemez.
      const wasSplit = splitNow.current;
      setEntries(next);
      setSavedEntries(nextSaved);
      // Tarayıcı deposu yalnız ziyaretçide yazılır: girişlide dolan depo bir sonraki açılışta misafir sepeti sanılıp sunucudakinin
      // üstüne eklenir ve adetler katlanırdı.
      if (!serverCart.current) {
        writeGuestCart(next);
        writeSaved(nextSaved);
      }
      const ticket = ++seq.current;
      void writeCartAction(locale, next, nextSaved, coupon, { trigger: added ? 'add' : undefined, added, wasSplit })
        .then(({ data }) => {
          // Bilet eskiyse kullanıcı bu arada bir şey daha yaptı: eski cevap YOK SAYILIR. Kilide gerek
          // bırakmayan şey bu — arayüz açık kalır, sonuncu yazma kazanır.
          if (ticket !== seq.current) return;
          if (!data) return rollback();
          splitNow.current = isSplitCart(data.view);
          setView(data.view);
          setSavedView(data.saved);
          // Sunucu satırı düşürdüyse (ürün silinmiş) niyet listeleri de ona uyar.
          const confirmed = data.view.lines.map(entryOf);
          const confirmedSaved = data.saved.lines.map(entryOf);
          serverEntries.current = { cart: confirmed, saved: confirmedSaved };
          setEntries(confirmed);
          setSavedEntries(confirmedSaved);
        })
        .catch(() => {
          if (ticket === seq.current) rollback();
        });
    },
    [locale, coupon, rollback],
  );

  const closeUndo = useCallback(() => {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndo(null);
  }, []);

  useEffect(
    () => () => {
      if (undoTimer.current) clearTimeout(undoTimer.current);
    },
    [],
  );

  // İlk yükleme niyeti sunucuya sorar; girişlide kalemler sunucudakinin üstüne eklenir ve bunu action oturuma bakarak bilir. Okuma
  // düşerse tarayıcı depoları korunur ve `failed` kalkar, çünkü niyet elimizdeki tek gerçektir.
  const load = useCallback(() => {
    const guest = readGuestCart();
    const guestSaved = readSaved();
    /**
     * Kod depodan ilk okumada alınır ve state'e de yazılır, yoksa `sync` kodsuz gider ve adet değişince indirim sessizce kaybolurdu.
     * Değer aynıysa `setCoupon` çağrılmaz, çünkü `load` kendini tetiklerdi.
     */
    const code = coupon ?? readCoupon();
    if (code !== coupon) setCoupon(code);
    /**
     * Niyet tarayıcı deposundan yalnız sepet tarayıcıda yaşarken kurulur: sunucu sepetinde depo bilerek boştur ve ondan kurmak her
     * okumada satırları bir an düşürüp sepet sayfasındaki durumu (açık adres penceresi dahil) sıfırlardı.
     */
    if (!serverCart.current) {
      setEntries(guest);
      setSavedEntries(guestSaved);
    }
    setFailed(false);
    // Yeniden okuma, düşen yazmanın haberini de kapatır: şerit "tekrar dene" diyor ve denenen bu.
    setWriteFailed(false);
    const ticket = ++seq.current;
    /**
     * Turun sebebi ölçüm içindir: okuma ilk açılışta, kupon denemesinde ve yer değişiminde koşar, sürtünme yalnız kendi turunda
     * sayılır. Sebep taşınmasaydı reddedilmiş kupon her açılışta yeniden sayılırdı.
     */
    const trigger = compareTo.current ? ('place' as const) : code !== couponAtLastRead.current ? ('coupon' as const) : undefined;
    couponAtLastRead.current = code;
    void readCartAction(locale, guest, guestSaved, code, { trigger, wasSplit: splitNow.current })
      .then(({ data }) => {
        if (ticket !== seq.current) return;
        if (!data) return setFailed(true);
        serverCart.current = data.serverCart;
        // Sepet sunucuda yaşıyorsa tarayıcı deposu devralma olsun olmasın boşaltılır, yoksa sonraki yazmalar onu doldurur ve bir
        // sonraki açılışta aynı kalemler ikinci kez devralınır.
        if (data.serverCart) {
          clearGuestCart();
          clearSaved();
        }
        // Yer değiştiği için okunduysa fark BURADA çıkar: iki görünüm de aynı kaynaktan, biri eski
        // biri yeni yer bağlamıyla çözülmüş. Fark boşsa kart hiç çizilmez — "hiçbir şey değişmedi"
        // demek için bir kutu açmak, olmayan bir olayı haber yapmaktır.
        if (compareTo.current) {
          const changes = diffCartByPlace(compareTo.current.lines, data.view.lines, cartKey, {
            noDelivery: unresolvedNow.current !== null,
          });
          compareTo.current = null;
          setPlaceChange(changes.length > 0 ? changes : null);
        }
        splitNow.current = isSplitCart(data.view);
        setView(data.view);
        setSavedView(data.saved);
        // Geri sarma noktası da BURADA doğar: okuma, sunucunun onayladığı ilk hâldir.
        const confirmed = data.view.lines.map(entryOf);
        const confirmedSaved = data.saved.lines.map(entryOf);
        serverEntries.current = { cart: confirmed, saved: confirmedSaved };
        setEntries(confirmed);
        setSavedEntries(confirmedSaved);
      })
      .catch(() => {
        if (ticket === seq.current) setFailed(true);
      })
      .finally(() => {
        if (ticket === seq.current) setReady(true);
      });
  }, [locale, coupon]);

  useEffect(() => load(), [load]);

  /**
   * Yer değişince sepet yeniden okunur, çünkü satırların yolu ve fiyatı yerden çözülür. İlk kare atlanır: açılışta yerin gelmesi bir
   * değişim değil cevaptır.
   */
  // Gel-al da bir yer değişimidir: depo seçilince sepet deponun stoğuyla yeniden okunmalı, yoksa satırlar adresin yolunu gösterir.
  const placeKey = pickup?.selectedWarehouseId ? `pickup:${pickup.selectedWarehouseId}` : place ? `${place.country}:${place.postalCode}` : '';
  const lastPlaceKey = useRef<string | null>(null);
  useEffect(() => {
    if (!placeReady) return;
    if (lastPlaceKey.current === null) {
      lastPlaceKey.current = placeKey;
      return;
    }
    if (lastPlaceKey.current === placeKey) return;
    lastPlaceKey.current = placeKey;
    // Kıyas noktası, o ana kadar EKRANDA olan görünüm. `view` (ham sunucu okuması) alınır,
    // `displayView` değil: fark iki sunucu cevabı arasındadır, iyimser adet güncellemeleri
    // arasında değil.
    compareTo.current = view;
    load();
  }, [placeKey, placeReady, load, view]);

  // Görünüm sunucudan, adetler niyetten. İkisini birleştiren tek yer burası.
  const displayView = useMemo(() => viewWithEntries(view, entries), [view, entries]);

  const value = useMemo<CartContextValue>(
    () => ({
      view: displayView,
      ready,
      failed,
      reload: load,
      placeChange,
      dismissPlaceChange: () => setPlaceChange(null),
      coupon,
      // Kod DEĞİŞTİRİLİR, sonuç sorulmaz: state değişince `load` yeniden koşar ve cevabı sunucu
      // verir. İstemcinin "bu kupon geçerli mi" diye bir görüşü yok.
      applyCoupon: (code) => {
        const next = code.trim().toUpperCase() || null;
        writeCoupon(next);
        setCoupon(next);
      },
      clearCoupon: () => {
        writeCoupon(null);
        setCoupon(null);
      },
      add: (entry) => {
        closeUndo();
        setAddSkipped(null);
        sync(mergeEntry(entries, entry), savedEntries, [intentOf(entry)]);
      },
      addMany: (incoming, skipped) => {
        closeUndo();
        setAddSkipped(skipped && skipped > 0 ? skipped : null);
        sync(
          incoming.reduce<CartEntry[]>((acc, entry) => mergeEntry(acc, entry), entries),
          savedEntries,
          incoming.map(intentOf),
        );
      },
      addSkipped,
      justRemoved: undo !== null,
      // Adet NİYETTEN okunur (katalogdan yeni eklenen ürünün henüz çözülmüş satırı yok, ama düğme
      // hemen seçiciye dönmeli); tavan çözülmüş satırdan gelir — onu istemci bilemez.
      lineOf: (ref) => {
        const match = 'bundleId' in ref ? (e: CartEntry) => e.bundleId === ref.bundleId : (e: CartEntry) => e.variantId === ref.variantId;
        const entry = entries.find(match);
        if (!entry) return null;
        const line = view.lines.find(match);
        return { qty: entry.qty, stockId: entry.stockId ?? null, limitCap: line?.limitCap ?? null };
      },
      saved: savedView,
      // Birden çok kalem TEK turda taşınır: döngüyle tek tek çağırmak her seferinde aynı (bayat)
      // listeyi okur ve yalnız sonuncusu uygulanırdı — "hepsini ayır" düğmesi tek kalem taşırdı.
      saveForLater: (refs) => {
        const keys = new Set(refs.map(cartKey));
        const moving = entries.filter((e) => keys.has(cartKey(e)));
        if (moving.length === 0) return;
        // Geri alma şeridi KAPANIR ama açılmaz: bu bir silme değil taşıma, kalem gözden kaybolmuyor.
        closeUndo();
        sync(
          entries.filter((e) => !keys.has(cartKey(e))),
          moving.reduce<CartEntry[]>((acc, entry) => mergeEntry(acc, entry), savedEntries),
        );
      },
      restoreToCart: (ref) => {
        const key = cartKey(ref);
        const moving = savedEntries.find((e) => cartKey(e) === key);
        if (!moving) return;
        sync(mergeEntry(entries, moving), savedEntries.filter((e) => cartKey(e) !== key));
      },
      setQty: (ref, qty) => {
        // Müşteri artık kendi eylemine bakıyor: tekrar siparişin "N kalem eklenmedi" uyarısı düşer.
        setAddSkipped(null);
        if (qty <= 0) {
          // Silmeden ÖNCE yakala: sync'ten sonra ne adet ne ad elimizde kalır.
          const key = cartKey(ref);
          const gone = entries.find((e) => cartKey(e) === key);
          const named = view.lines.find((l) => cartKey(l) === key);
          if (gone) {
            if (undoTimer.current) clearTimeout(undoTimer.current);
            setUndo({ entry: gone, name: named?.name ?? '' });
            undoTimer.current = setTimeout(() => setUndo(null), UNDO_MS);
          }
        } else {
          closeUndo();
        }
        sync(setEntryQty(entries, ref, qty), savedEntries);
      },
    }),
    [displayView, view, savedView, ready, failed, load, entries, savedEntries, sync, closeUndo, undo, coupon, placeChange],
  );

  return (
    <CartContext.Provider value={value}>
      {children}
      {/* Geri alma şeridi KÖKTEDİR, sepet sayfasında değil: silme sepet dışında da olabilir ve her
          yüzeye ayrı şerit koymak aynı bileşenin kopyalarını çoğaltırdı. */}
      <CartUndo
        locale={locale}
        name={undo?.name ?? ''}
        open={undo !== null}
        onUndo={() => {
          if (!undo) return;
          const entry = undo.entry;
          closeUndo();
          sync(mergeEntry(entries, entry), savedEntries);
        }}
        onClose={closeUndo}
      />
      {/* Yazma şeridi de kökte: adet sepet dışında da değişiyor (katalog kartı, ürün detayı). */}
      <CartWriteFailed locale={locale} open={writeFailed} onRetry={load} onClose={() => setWriteFailed(false)} />
    </CartContext.Provider>
  );
}

/**
 * Ekleme niyetinin ölçüm karşılığı: `CartEntry` ürünü değil varyantı tanır ve defterin `subjectId`si de o varyanttır; ürün kırılımı
 * gerektiğinde varyant tablosundan çözülür.
 */
function intentOf(entry: CartEntry): AddToCartIntent {
  return entry.kind === 'bundle'
    ? { subjectType: 'bundle', subjectId: entry.bundleId, qty: entry.qty }
    : { subjectType: 'variant', subjectId: entry.variantId, qty: entry.qty };
}
