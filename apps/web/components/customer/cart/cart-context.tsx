'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Locale } from '@lezzet/i18n';
import { readCartAction, writeCartAction } from '@/lib/cart/actions';
import { clearGuestCart, mergeEntry, readGuestCart, setEntryQty, writeGuestCart } from '@/lib/cart/cart-store';
import { EMPTY_CART, type CartEntry, type CartView } from '@/lib/cart/cart-types';

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
 * tarayıcı. Hangisi olduğunu action söyler; bileşenler yalnız `add`/`setQty`/`remove` görür.
 */
interface CartContextValue {
  view: CartView;
  /** İlk okuma tamamlanana kadar sayaç gösterilmez — yanlış sayı göstermektense hiç göstermemek. */
  ready: boolean;
  pending: boolean;
  add: (entry: CartEntry) => void;
  setQty: (line: Pick<CartEntry, 'variantId' | 'stockId'>, qty: number) => void;
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
  const [pending, setPending] = useState(false);
  // Yarışı kesmek için: geç dönen eski yanıt yeni durumu ezmesin.
  const seq = useRef(0);

  /** Niyeti yazar ve çözülmüş görünümü alır. Ziyaretçide tarayıcıya, girişlide sunucuya gider. */
  const sync = useCallback(
    (next: CartEntry[]) => {
      setEntries(next);
      writeGuestCart(next);
      const ticket = ++seq.current;
      setPending(true);
      void writeCartAction(locale, next)
        .then(({ data }) => {
          if (ticket !== seq.current || !data) return;
          setView(data);
          // Sunucu satırı düşürdüyse (ürün silinmiş) niyet listesi de ona uyar.
          setEntries(data.lines.map((l) => ({ variantId: l.variantId, qty: l.qty, stockId: l.stockId })));
        })
        .finally(() => {
          if (ticket === seq.current) setPending(false);
        });
    },
    [locale],
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
        setEntries(data.view.lines.map((l) => ({ variantId: l.variantId, qty: l.qty, stockId: l.stockId })));
      })
      .finally(() => {
        if (ticket === seq.current) setReady(true);
      });
  }, [locale]);

  const value = useMemo<CartContextValue>(
    () => ({
      view,
      ready,
      pending,
      add: (entry) => sync(mergeEntry(entries, entry)),
      setQty: (line, qty) => sync(setEntryQty(entries, line, qty)),
    }),
    [view, ready, pending, entries, sync],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}
