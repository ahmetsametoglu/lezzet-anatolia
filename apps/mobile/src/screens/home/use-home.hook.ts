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
*/

type HomeStatus = 'loading' | 'ready' | 'error';

interface UseHomeResult {
  status: HomeStatus;
  /** Yalnız `ready` hâlinde dolu. */
  home: Home | null;
  retry: () => void;
}

export function useHome(locale: Locale): UseHomeResult {
  const [status, setStatus] = useState<HomeStatus>('loading');
  const [home, setHome] = useState<Home | null>(null);
  const generation = useRef(0);

  const load = useCallback(() => {
    const run = (generation.current += 1);
    setStatus('loading');
    void fetchHome(locale).then((result) => {
      if (run !== generation.current) return;
      if (result.error !== null) {
        setStatus('error');
        return;
      }
      setHome(result.data);
      setStatus('ready');
    });
  }, [locale]);

  useEffect(() => {
    load();
  }, [load]);

  return { status, home, retry: load };
}
