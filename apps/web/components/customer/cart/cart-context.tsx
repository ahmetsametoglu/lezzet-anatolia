'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Locale } from '@lezzet/i18n';
import { readCartAction, writeCartAction } from '@/lib/cart/actions';
import { clearGuestCart, mergeEntry, readGuestCart, setEntryQty, writeGuestCart } from '@/lib/cart/cart-store';
import { EMPTY_CART, cartKey, entryOf, viewWithEntries, type CartEntry, type CartRef, type CartView } from '@/lib/cart/cart-types';
import { CartUndo } from './cart-undo';

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
  add: (entry: CartEntry) => void;
  /** Tekrar sipariş: birçok kalem TEK turda girer — tek tek eklemek N sunucu turu demekti. */
  addMany: (entries: readonly CartEntry[]) => void;
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
  const [entries, setEntries] = useState<CartEntry[]>([]);
  const [view, setView] = useState<CartView>(EMPTY_CART);
  const [ready, setReady] = useState(false);
  // Silinen kalem, geri alınana ya da pencere kapanana kadar burada bekler.
  const [undo, setUndo] = useState<{ entry: CartEntry; name: string } | null>(null);
  // Yarışı kesmek için: geç dönen eski yanıt yeni durumu ezmesin.
  const seq = useRef(0);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Niyeti yazar ve çözülmüş görünümü alır. Ziyaretçide tarayıcıya, girişlide sunucuya gider. */
  const sync = useCallback(
    (next: CartEntry[]) => {
      setEntries(next);
      writeGuestCart(next);
      const ticket = ++seq.current;
      void writeCartAction(locale, next).then(({ data }) => {
        // Bilet eskiyse kullanıcı bu arada bir şey daha yaptı: eski cevap YOK SAYILIR. Kilide gerek
        // bırakmayan şey bu — arayüz açık kalır, sonuncu yazma kazanır.
        if (ticket !== seq.current || !data) return;
        setView(data);
        // Sunucu satırı düşürdüyse (ürün silinmiş) niyet listesi de ona uyar.
        setEntries(data.lines.map(entryOf));
      });
    },
    [locale],
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
  useEffect(() => {
    const guest = readGuestCart();
    setEntries(guest);
    const ticket = ++seq.current;
    void readCartAction(locale, guest)
      .then(({ data }) => {
        if (ticket !== seq.current || !data) return;
        // Devralma yapıldıysa tarayıcı deposu boşaltılır; yoksa aynı kalemler her açılışta
        // yeniden eklenir ve adet katlanır.
        if (data.merged) clearGuestCart();
        setView(data.view);
        setEntries(data.view.lines.map(entryOf));
      })
      .finally(() => {
        if (ticket === seq.current) setReady(true);
      });
  }, [locale]);

  // Görünüm sunucudan, adetler niyetten. İkisini birleştiren tek yer burası.
  const displayView = useMemo(() => viewWithEntries(view, entries), [view, entries]);

  const value = useMemo<CartContextValue>(
    () => ({
      view: displayView,
      ready,
      add: (entry) => {
        closeUndo();
        sync(mergeEntry(entries, entry));
      },
      addMany: (incoming) => {
        closeUndo();
        sync(incoming.reduce<CartEntry[]>((acc, entry) => mergeEntry(acc, entry), entries));
      },
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
      setQty: (ref, qty) => {
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
        sync(setEntryQty(entries, ref, qty));
      },
    }),
    [displayView, view, ready, entries, sync, closeUndo, undo],
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
          sync(mergeEntry(entries, entry));
        }}
        onClose={closeUndo}
      />
    </CartContext.Provider>
  );
}
