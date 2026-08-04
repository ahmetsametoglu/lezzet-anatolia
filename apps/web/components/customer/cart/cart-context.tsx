'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Locale } from '@lezzet/i18n';
import { readCartAction, writeCartAction } from '@/lib/cart/actions';
import { clearGuestCart, mergeEntry, readGuestCart, setEntryQty, writeGuestCart } from '@/lib/cart/cart-store';
import { clearSaved, readSaved, writeSaved } from '@/lib/cart/saved-store';
import { readCoupon, writeCoupon } from '@/lib/cart/coupon-store';
import { EMPTY_CART, cartKey, entryOf, viewWithEntries, type AddToCartIntent, type CartEntry, type CartRef, type CartView } from '@/lib/cart/cart-types';
import { diffCartByPlace, type CartLineChange } from '@/lib/cart/place-change';
import { useDeliveryPlace } from '@/components/customer/delivery/place-context';
import { CartUndo } from './cart-undo';
import { CartWriteFailed } from './cart-write-failed';

/** Silinen kalemin geri alma penceresi (tasarım: "geri al snackbar'ı 5 sn görünür"). */
const UNDO_MS = 5000;

/**
 * Sepet bağlamı (08.4) — sepet durumunun TEK sahibi.
 *
 * Neden bağlam: sepet üç ayrı yerde birden görünür ve hepsi aynı anda doğru olmalı — başlıktaki
 * sayaç, kart üstündeki "+", ürün detayın sabit çubuğu ve sepet sayfası. Her biri kendi state'ini
 * tutsaydı ekle-çıkar sonrası sayaç ile sayfa ayrışırdı.
 *
 * **Niyet ve görünüm ayrı ilerler.** `entries` (ne istendiği) anında güncellenir, `view` (bugünkü
 * karşılığı) sunucudan gelir. Böylece "+" basınca sayaç beklemeden artar; fiyat ve tükendi bilgisi
 * yanıtla birlikte tazelenir. Sunucu cevabı gecikse de arayüz donmaz.
 *
 * **Depo oturuma göre değişir, arayüz bilmez:** girişli müşteride sunucu (`Cart`), ziyaretçide
 * tarayıcı. Hangisi olduğunu action söyler; bileşenler yalnız `add`/`setQty` görür.
 */
interface CartContextValue {
  /**
   * Ekranın gördüğü görünüm: sunucunun çözdüğü satırlar + BUGÜNKÜ niyetin adetleri. Adet değişimi
   * sunucu turunu beklemez (tasarım: "anında güncellenir").
   *
   * `pending` diye bir bayrak YOK ve olmamalı: bir satırın adedi değişirken bütün satırların
   * düğmelerini kilitlemek, tek bir kalemin sunucu turunu bütün sepete ödetmekti (28.07). Yarışı
   * kilit değil, yanıt bileti çözer — geç dönen eski cevap sessizce düşer.
   */
  view: CartView;
  /** İlk okuma tamamlanana kadar sayaç gösterilmez — yanlış sayı göstermektense hiç göstermemek. */
  ready: boolean;
  /**
   * İlk okuma BAŞARISIZ oldu mu (sunucu yanıtı gelmedi ya da hata döndü).
   *
   * Ayrı bir bayrak olması şart: `view` boş, `entries` dolu kalıyor — yani rozet niyetten sayıp
   * "4" derken sayfa çözülmüş satır bulamayıp "sepetiniz boş" çiziyordu. İki ekran aynı durumdan
   * iki farklı sonuç çıkarıyordu ve arada kimse hatayı görmüyordu; action `{data, error}` döndüğü
   * için tarayıcı konsolunda da bir iz yoktu (28.07 — sepetin kaybolduğu hata).
   *
   * Boş sepet ile ULAŞILAMAYAN sepet farklı şeylerdir: birincisi bir durum, ikincisi bir arıza.
   */
  failed: boolean;
  /**
   * Sepeti sunucudan YENİDEN okur. İki yerde kullanılır: başarısız okumanın "tekrar dene"si ve
   * sipariş verildikten sonra tazeleme — sipariş kesinleşince sunucudaki sepet boşalıyor, ekrandaki
   * sayaç da onu görmeli. Yoksa müşteri sipariş verip sepetinde hâlâ kalem görüyordu.
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
   * "N kalem şu an mevcut değil, eklenmedi" — tekrar siparişin sessizce eksik geldiğini söyler.
   *
   * Sağlayıcıda durmasının sebebi: uyarıyı doğuran ekran (boş sepet) eklemeden hemen sonra
   * SÖKÜLÜYOR. Kendi state'inde tutulduğu sürece cümle ekranla birlikte kayboluyor ve müşteri hiç
   * okumuyordu — oysa tasarım onu **sepette** göstermeyi söylüyor. Bir sonraki sepet değişikliğinde
   * temizlenir: o noktada müşteri artık kendi eylemine bakıyor.
   */
  addSkipped: number | null;
  /**
   * Bu varyant/paket sepette mi, kaç adet? Katalog kartı, ürün detayı ve paket detayı buna bakar:
   * sepetteyse "Sepete ekle" yerine adet seçicisi çizer (K19).
   *
   * Varyantta eşleşme YALNIZ varyantla kurulur — sorusu "bu üründen sepette kaç var", "hangi
   * partiden" değil; azaltma da o satırın kendi çıpasına gider. Pakette çıpa zaten yok.
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
  /** Sonraya kaydedilenler (K33) — çözülmüş satırlar; toplamları anlamsızdır, liste gösterilir. */
  saved: CartView;
  /**
   * Kalemi sepetten listeye TAŞIR. Silmez: teslimat yerine gönderilemeyen ürün vazgeçilmiş değildir,
   * yalnız bugün alınamıyordur (tasarım §7: "alışveriş ölmez, sepet bölünür").
   *
   * Geri alma şeridi AÇILMAZ — silme değil taşıma; kalem gözden kaybolmuyor, hemen altta duruyor.
   */
  saveForLater: (refs: readonly CartRef[]) => void;
  /** Listeden sepete geri alır (aynı adetle). Liste tarafındaki tek aksiyon budur. */
  restoreToCart: (ref: CartRef) => void;
  /**
   * Yer değişince sepette ne değişti (19.7) — kalem kalem, `null` iken bildirilecek bir şey yok.
   *
   * Sağlayıcıda durur çünkü yer sepet sayfasında DEĞİL, başlıktaki haptan da değiştirilebiliyor:
   * anasayfada kodunu giren müşteri sepete geldiğinde farkı görmeli. Ekranın kendi state'inde
   * tutulsaydı, sepet o sırada monte olmadığı için fark hiç hesaplanmazdı.
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
  const { place, ready: placeReady } = useDeliveryPlace();
  const [entries, setEntries] = useState<CartEntry[]>([]);
  const [savedEntries, setSavedEntries] = useState<CartEntry[]>([]);
  const [view, setView] = useState<CartView>(EMPTY_CART);
  const [savedView, setSavedView] = useState<CartView>(EMPTY_CART);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  /**
   * Girilen kupon kodu. Sonucu (uygulandı / reddedildi / geçildi) BURADA tutulmaz — o `view.discount`
   * ile sunucudan gelir. Burada yalnız niyet var; kodu değiştirmek okumayı yeniden tetikler
   * (`load` bağımlılığı), yani ekran cevabı her zaman sunucudan alır.
   */
  const [coupon, setCoupon] = useState<string | null>(null);
  /**
   * Sepet sunucuda mı yaşıyor. Sunucu söyler (`serverCart`) — istemci "kimin sepeti" sorusunu
   * kendi cevaplayamaz. `ref`, çünkü `sync` içinde OKUNUYOR ve state olsaydı her yazmada
   * yeniden kurulan bir bağımlılık zinciri doğardı.
   */
  const serverCart = useRef(false);
  /**
   * Sunucunun ONAYLADIĞI son niyet — yazma düşünce iyimser adetin geri sarılacağı yer.
   *
   * `ref`, çünkü `sync` bunu okumak zorunda ve state olsaydı her okuma yeni bir `sync` doğurup
   * bağımlılık zincirini kırardı. `view`den türetilemezdi: `view` çözülmüş SATIRLARI taşır, geri
   * sarılacak olan ise niyet listesi.
   */
  const serverEntries = useRef<{ cart: CartEntry[]; saved: CartEntry[] }>({ cart: [], saved: [] });
  /** Yazma düştü mü — şerit bunu gösterir. Okumanın `failed`'i ile AYRI: o blok, bu haber. */
  const [writeFailed, setWriteFailed] = useState(false);
  // Silinen kalem, geri alınana ya da pencere kapanana kadar burada bekler.
  const [undo, setUndo] = useState<{ entry: CartEntry; name: string } | null>(null);
  /** Tekrar siparişte eklenemeyen kalem sayısı — uyarıyı doğuran ekran sökülse de yaşar. */
  const [addSkipped, setAddSkipped] = useState<number | null>(null);
  /**
   * Yer değişimi bildirimi (19.7). `compareTo` bir sonraki okumanın kıyaslanacağı ESKİ görünümü
   * taşır; yalnız yer değiştiğinde dolar, okuma dönünce boşalır. Ref çünkü okumanın içinden
   * okunuyor ve değişmesi yeni bir render doğurmamalı.
   */
  const [placeChange, setPlaceChange] = useState<CartLineChange[] | null>(null);
  const compareTo = useRef<CartView | null>(null);
  // Yarışı kesmek için: geç dönen eski yanıt yeni durumu ezmesin.
  const seq = useRef(0);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /**
   * Yazma düştü → iyimser adet GERİ SARILIR (akış denetimi #12).
   *
   * Öncesinde yazma sessizce düşüyordu: ekran "3 kg" gösteriyor, sunucuda 2 kg duruyordu ve müşteri
   * bunu ancak checkout'ta görüyordu. Ekranın söylediği ile sunucudakinin ayrıştığı yerde doğru
   * davranış, sunucuyu göstermektir.
   *
   * **Yalnız GİRİŞLİ müşteride.** Ziyaretçide sepet tarayıcıda yaşar ve niyet oraya `sync`in ilk
   * satırında zaten yazılmıştır; sunucudan istenen tek şey fiyatın çözülmesiydi. Orada geri sarmak,
   * gerçekte kaybolmamış bir değişikliği silmek olurdu — ekran yalnız fiyatı bir tur eski gösterir,
   * adet doğrudur.
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
     * `added` YALNIZ ölçüm için (08.9): uç eşitleme ucudur, "neyi eklediğim" bilgisi yalnız burada
     * var. Geri alma (`undo`) ve "sonraya kaydedilenden geri taşıma" bunu GEÇMİYOR — ikisi de yeni
     * bir ekleme değil, bir düzeltme; sayılsalardı aynı ürün defterde iki kez eklenmiş görünürdü.
     */
    (next: CartEntry[], nextSaved: CartEntry[], added?: AddToCartIntent[]) => {
      setEntries(next);
      setSavedEntries(nextSaved);
      // Tarayıcı deposu YALNIZ ziyaretçide yazılır. Girişli müşteride de yazılıyordu: depo
      // yeniden doluyor, bir sonraki açılışta `readCartAction` onu misafir sepeti sanıp
      // sunucudakinin ÜSTÜNE ekliyordu — her yenilemede adetler katlanıyordu (29.07).
      if (!serverCart.current) {
        writeGuestCart(next);
        writeSaved(nextSaved);
      }
      const ticket = ++seq.current;
      void writeCartAction(locale, next, nextSaved, coupon, added ?? null)
        .then(({ data }) => {
          // Bilet eskiyse kullanıcı bu arada bir şey daha yaptı: eski cevap YOK SAYILIR. Kilide gerek
          // bırakmayan şey bu — arayüz açık kalır, sonuncu yazma kazanır.
          if (ticket !== seq.current) return;
          if (!data) return rollback();
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

  // İlk yükleme: tarayıcıdaki niyet sunucuya sorulur. Girişli müşteride kalemler sunucudakinin
  // üstüne EKLENİR (devralma) — action oturuma bakar, istemci "kimin sepeti" sorusunu cevaplamaz.
  //
  // Okuma DÜŞERSE tarayıcı depoları KORUNUR ve `failed` kalkar: niyet elimizdeki tek gerçek, onu
  // silmek müşterinin sepetini gerçekten kaybettirirdi. Ekran boş sepet değil arıza gösterir.
  const load = useCallback(() => {
    const guest = readGuestCart();
    const guestSaved = readSaved();
    /**
     * Kod depodan İLK okumada alınır ve **state'e de yazılır**. Yazılmasaydı `sync` (adet değişimi)
     * `coupon` state'ini `null` görüp sunucuya kodsuz gidiyordu: sayfayı yenileyen müşteri
     * indirimini görüyor, sonra bir adet değiştirdiğinde indirim sessizce kayboluyordu (29.07
     * denetimi). Değer aynıysa `setCoupon` çağrılmaz — aksi hâlde `load` kendini tetiklerdi.
     */
    const code = coupon ?? readCoupon();
    if (code !== coupon) setCoupon(code);
    setEntries(guest);
    setSavedEntries(guestSaved);
    setFailed(false);
    // Yeniden okuma, düşen yazmanın haberini de kapatır: şerit "tekrar dene" diyor ve denenen bu.
    setWriteFailed(false);
    const ticket = ++seq.current;
    void readCartAction(locale, guest, guestSaved, code)
      .then(({ data }) => {
        if (ticket !== seq.current) return;
        if (!data) return setFailed(true);
        serverCart.current = data.serverCart;
        // Sepet sunucuda yaşıyorsa tarayıcı deposu BOŞALTILIR — devralma yapılmış olsun ya da
        // olmasın. Yalnız `merged` hâlinde temizlemek yetmiyordu: sonraki yazmalar depoyu
        // yeniden dolduruyor ve bir sonraki açılışta o kalemler ikinci kez devralınıyordu.
        if (data.serverCart) {
          clearGuestCart();
          clearSaved();
        }
        // Yer değiştiği için okunduysa fark BURADA çıkar: iki görünüm de aynı kaynaktan, biri eski
        // biri yeni yer bağlamıyla çözülmüş. Fark boşsa kart hiç çizilmez — "hiçbir şey değişmedi"
        // demek için bir kutu açmak, olmayan bir olayı haber yapmaktır.
        if (compareTo.current) {
          const changes = diffCartByPlace(compareTo.current, data.view);
          compareTo.current = null;
          setPlaceChange(changes.length > 0 ? changes : null);
        }
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
   * **Yer değişti → sepet yeniden okunur.** Şart: satırların yolu (`route`) ve fiyatı müşterinin
   * deposundan çözülüyor; okunmazsa ekran eski yerin gruplarını göstermeye devam eder ve müşteri
   * checkout'a kadar öyle sanır.
   *
   * İLK KARE atlanır: sayfa açılırken yer "yok"tan "var"a geçiyor ve bu bir değişim değil, cevabın
   * gelmesi. Atlanmasaydı her açılışta bir tazeleme turu ve boş bir bildirim doğardı.
   */
  const placeKey = place ? `${place.country}:${place.postalCode}` : '';
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
 * Ekleme niyetinin ölçüm karşılığı (08.9) — istemcinin elindeki tek gerçek bu.
 *
 * `CartEntry` ürünü değil varyantı tanıyor; defterin `subjectId`'si de o varyant. Ürün kırılımı
 * gerektiğinde varyant tablosundan çözülür (gerekçe `writeCartAction` künyesinde).
 */
function intentOf(entry: CartEntry): AddToCartIntent {
  return entry.kind === 'bundle'
    ? { subjectType: 'bundle', subjectId: entry.bundleId, qty: entry.qty }
    : { subjectType: 'variant', subjectId: entry.variantId, qty: entry.qty };
}
