'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { resolvePlaceAction } from '@/lib/delivery/actions';
import { readPlaceAnswer, readSkipped, writePlaceAnswer, writeSkipped } from '@/lib/delivery/place-store';
import type { DeliveryPlace, DeliveryZoneSummary } from '@/lib/delivery/place-types';

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
  /**
   * Kapıya teslim ettiğimiz yerler — **sayfa açılırken sunucuda okunmuş** hâlde gelir
   * (`layout` → `getDeliveryZones`), burada bekletilir.
   *
   * Panel bunu kendi açılışında istemciden çekiyordu ve liste birkaç yüz milisaniye sonra alttan
   * beliriyordu: müşteri sorusunu sorarken cevabın yarısı henüz yoktu. Liste operatörün elle
   * kurduğu, veriyle büyümeyen bir küme (CLAUDE.md §1) — bir kez okunup burada durması hem
   * beklemeyi hem de her panel açılışında tekrarlanan turu ortadan kaldırıyor.
   */
  zones: DeliveryZoneSummary[];
}

const PlaceContext = createContext<PlaceContextValue | null>(null);

export function useDeliveryPlace(): PlaceContextValue {
  const ctx = useContext(PlaceContext);
  if (!ctx) throw new Error('useDeliveryPlace yalnız PlaceProvider içinde kullanılır');
  return ctx;
}

interface PlaceProviderProps {
  children: ReactNode;
  /** Sunucuda okunmuş bölge listesi; istemci bunu bir daha sormaz. */
  zones: DeliveryZoneSummary[];
}

export function PlaceProvider({ children, zones }: PlaceProviderProps) {
  const [place, setPlace] = useState<DeliveryPlace | null>(null);
  const [ready, setReady] = useState(false);
  const [skipped, setSkipped] = useState<Record<'home' | 'cart', boolean>>({ home: false, cart: false });

  useEffect(() => {
    // Çerez artık yalnız müşterinin CEVABINI taşıyor (`{country, postalCode}`, 19.9); çözümü
    // sunucu yapar. Bu yüzden depodaki değer doğrudan gösterilemez — `inRoute` ve teslimat günü
    // orada yok ve UYDURULAMAZ.
    const stored = readPlaceAnswer();
    setSkipped({ home: readSkipped('home'), cart: readSkipped('cart') });
    if (!stored) {
      setReady(true);
      return;
    }
    // `ready` çözüm gelene kadar false: hap önce "yer seçin" deyip sonra dolarsa yanıp söner.
    // Kısa bir gecikme, yanlış bir ara kareye yeğdir.
    // BEKLEYEN(19.7): ilk kare sunucudan gelebilir — `PlaceProvider` bir `initialPlace` prop'u
    // alırsa (RSC `readPlaceContext()` ile çözer) bu tur tamamen kalkar ve gecikme sıfırlanır.
    void resolvePlaceAction(stored.postalCode).then(({ data }) => {
      if (data) setPlace(data);
      setReady(true);
    });
  }, []);

  const setPostalCode = useCallback(async (postalCode: string) => {
    const { data, error } = await resolvePlaceAction(postalCode);
    if (!data) return error ?? 'Posta kodu çözülemedi';
    setPlace(data);
    // Saklanan tek şey CEVAP: çözümü (bölge, gün, depo) her istekte sunucu yeniden üretir.
    writePlaceAnswer({ country: data.country, postalCode: data.postalCode });
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
        writePlaceAnswer(null);
      },
      zones,
      skipped: (scope) => skipped[scope],
      skip: (scope) => {
        setSkipped((prev) => ({ ...prev, [scope]: true }));
        writeSkipped(scope);
      },
    }),
    [place, ready, setPostalCode, skipped, zones],
  );

  return <PlaceContext.Provider value={value}>{children}</PlaceContext.Provider>;
}
