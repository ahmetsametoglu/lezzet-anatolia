'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { resolvePlaceAction } from '@/lib/delivery/actions';
import { readPlace, readSkipped, writePlace, writeSkipped } from '@/lib/delivery/place-store';
import type { DeliveryPlace } from '@/lib/delivery/place-types';

/**
 * Teslimat yeri bağlamı — "nereye getirelim" cevabının TEK sahibi.
 *
 * Neden bağlam: aynı cevap dört yerde birden görünür — başlıktaki hap, ürün ve paket detayındaki
 * teslimat satırı, sepetteki kısıt bloğu, katalogdaki çip. Her biri kendi state'ini tutsaydı
 * müşteri kodu değiştirdiğinde bir kısmı eski yeri göstermeye devam ederdi.
 *
 * **Yer bir SÖZDÜR, bir FİLTRE DEĞİLDİR:** buradan hiçbir şey engellenmez. Bileşenler `place`'e
 * bakıp ne söyleyeceklerine karar verir; ne yapılabileceğine değil (tasarım §7).
 *
 * **Her açılışta yeniden çözülür.** Depodaki tarih kesim saatiyle bayatlar (16:00 sonrası "en yakın
 * teslimat" kayar); sunucuya tekrar sormak bu bayatlığı ortadan kaldırır. Depodaki kopya yalnız ilk
 * karede hap boş görünmesin diye vardır.
 */
interface PlaceContextValue {
  /** null = henüz sorulmadı ya da temizlendi; hap "Teslimat yerinizi seçin" der. */
  place: DeliveryPlace | null;
  /** İlk okuma bitene kadar hap çizilmez — yanlış yer göstermektense hiç göstermemek. */
  ready: boolean;
  /** Kodu çözer ve saklar; hatalı kodda `error` döner, yer değişmez. */
  setPostalCode: (postalCode: string) => Promise<string | null>;
  clear: () => void;
  /**
   * Soru atlandı mı — şerit ikinci kez sormaz (tasarım: "şimdi değil"). KAPSAMLIDIR: anasayfadaki
   * davet ile sepetteki somut soru aynı şey değil, birini geçmek öbürünü susturmamalı.
   */
  skipped: (scope: 'home' | 'cart') => boolean;
  skip: (scope: 'home' | 'cart') => void;
}

const PlaceContext = createContext<PlaceContextValue | null>(null);

export function useDeliveryPlace(): PlaceContextValue {
  const ctx = useContext(PlaceContext);
  if (!ctx) throw new Error('useDeliveryPlace yalnız PlaceProvider içinde kullanılır');
  return ctx;
}

export function PlaceProvider({ children }: { children: ReactNode }) {
  const [place, setPlace] = useState<DeliveryPlace | null>(null);
  const [ready, setReady] = useState(false);
  const [skipped, setSkipped] = useState<Record<'home' | 'cart', boolean>>({ home: false, cart: false });

  useEffect(() => {
    const stored = readPlace();
    setSkipped({ home: readSkipped('home'), cart: readSkipped('cart') });
    if (!stored) {
      setReady(true);
      return;
    }
    // Depodakini HEMEN göster (hap boş yanıp sönmesin), sonra sunucuya tazelet.
    setPlace(stored);
    setReady(true);
    void resolvePlaceAction(stored.postalCode).then(({ data }) => {
      if (!data) return;
      setPlace(data);
      writePlace(data);
    });
  }, []);

  const setPostalCode = useCallback(async (postalCode: string) => {
    const { data, error } = await resolvePlaceAction(postalCode);
    if (!data) return error ?? 'Posta kodu çözülemedi';
    setPlace(data);
    writePlace(data);
    // Kod girildiyse her iki soru da cevaplanmıştır; atlama işaretleri düşer.
    setSkipped({ home: false, cart: false });
    return null;
  }, []);

  const value = useMemo<PlaceContextValue>(
    () => ({
      place,
      ready,
      setPostalCode,
      clear: () => {
        setPlace(null);
        writePlace(null);
      },
      skipped: (scope) => skipped[scope],
      skip: (scope) => {
        setSkipped((prev) => ({ ...prev, [scope]: true }));
        writeSkipped(scope);
      },
    }),
    [place, ready, setPostalCode, skipped],
  );

  return <PlaceContext.Provider value={value}>{children}</PlaceContext.Provider>;
}
