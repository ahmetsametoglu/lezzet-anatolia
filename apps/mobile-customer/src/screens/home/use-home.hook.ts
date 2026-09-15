import { useCallback, useEffect, useRef, useState } from 'react';
import type { Home } from '@lezzet/types';
import type { Locale } from '@lezzet/i18n';

import { fetchHome } from '@/lib/api/home';

/*
  VİTRİN VERİSİ — tek istek, üç bölüm (bantlar · fırsatlar · tarifler). Sayfalama yok, süzgeç yok;
  ürün detay hook'uyla aynı iskelet. Eskimiş cevap koruması yine tek sebepten: art arda iki uçuş
  başlarsa yavaş olanın sonucu hızlıyı ezmesin.

  HATA EKRANA TAŞINMAZ, BÖLÜM ÇİZİLMEZ: vitrin tasarımında bu bölümler için iskelet/hata hâli
  tanımlı değil (v3'te vitrin hep dolu) ve vitrinin geri kalanı (fixture bölümleri) ayakta.
  Sessiz yutma değil — durum burada duruyor, ekran "boş dizi = bölüm yok" kuralıyla çiziyor;
  vitrine tasarımdan bir hata hâli gelirse bu durumdan okunur.

  AŞAĞI ÇEKEREK YENİLEME (kullanıcı isteği 09.08) İLK YÜKTEN AYRI BİR ŞEYDİR: yenileme sırasında
  `status` 'loading'e DÜŞMEZ — düşseydi ekrandaki bütün bölümler bir an kaybolur, sonra geri
  gelirdi. Eski veri de yenileme HATASINDA silinmez: "yeni veriyi alamadım" ile "veri yok" ayrı
  cümlelerdir ve ikincisini söylemek elimizdekini gizlemek olurdu.
*/

type HomeStatus = 'loading' | 'ready' | 'error';

interface UseHomeResult {
  status: HomeStatus;
  /** Yalnız `ready` hâlinde dolu. */
  home: Home | null;
  refreshing: boolean;
  refresh: () => void;
  retry: () => void;
}

/**
 * @param postalCode Cihazdaki saklı posta kodu. Yerin SORUSUDUR, cevabı sunucu verir — fırsat
 * şeridi buna bağlı (ölçüldü 09.08: kodsuz `offers=0`, 67000 ile `offers=2`). Kod DEĞİŞİNCE
 * vitrin yeniden okunur: teklif ve stok yere göre değişiyor, eski ekran kalırsa müşteri başka bir
 * bölgenin fiyatına bakar.
 */
export function useHome(locale: Locale, postalCode: string | null): UseHomeResult {
  const [status, setStatus] = useState<HomeStatus>('loading');
  const [home, setHome] = useState<Home | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const generation = useRef(0);

  const load = useCallback(
    (options: { refresh: boolean }) => {
      const run = (generation.current += 1);
      if (options.refresh) setRefreshing(true);
      else setStatus('loading');

      void fetchHome(locale, postalCode).then((result) => {
        if (run !== generation.current) return;
        setRefreshing(false);
        if (result.error !== null) {
          // Yenilemede ekrandaki bölümler yerinde kalır (künye); yalnız ilk yükün düşmesi hâldir.
          if (!options.refresh) setStatus('error');
          return;
        }
        setHome(result.data);
        setStatus('ready');
      });
    },
    [locale, postalCode],
  );

  useEffect(() => {
    load({ refresh: false });
  }, [load]);

  const refresh = useCallback(() => load({ refresh: true }), [load]);
  const retry = useCallback(() => load({ refresh: false }), [load]);

  return { status, home, refreshing, refresh, retry };
}
