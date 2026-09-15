import { useCallback, useEffect, useRef, useState } from 'react';
import type { Locale } from '@lezzet/i18n';

import { fetchOrderDetail, type OrderDetail } from '@/lib/api/orders';
import { useLiveRefresh } from '@/lib/app-state/use-live-refresh';

/*
  SİPARİŞ DETAY VERİSİ — paket/tarif detay hook'larının deseni birebir (`use-package.hook.ts`):
  sayfanın TAMAMI tek turda gelir (sözleşmenin sözü — kalemler, çizgi, adres, para; bölüm başına
  çağrı yok) ve eskimiş cevap koruması "Tekrar dene"ye art arda basan parmağın iki uçuşu için.

  DÖRT HÂL, çünkü dördü ayrı şey:
  · `guest`   — oturum yok (401 yerel kısa devre): bildirimden/derin bağlantıdan gelinmiş olabilir,
                doğru cevap giriş kapısıdır, hata değil.
  · `missing` — uç 404 dedi: bulunamayan, başkasına ait ve taslak siparişin ORTAK cevabı (ayrımı
                sunucu bilerek söylemiyor — numara denenerek başkasının siparişi doğrulatılmasın).
  · `error`   — telin arızası.
  · `ready`   — veri elde.
  İkisini tek "hata"ya indirmek, silinmiş bir bağlantıyı bağlantı arızası gibi gösterirdi.
*/

type OrderStatus = 'loading' | 'guest' | 'ready' | 'missing' | 'error';

interface UseOrderResult {
  status: OrderStatus;
  /** Yalnız `ready` hâlinde dolu. */
  detail: OrderDetail | null;
  retry: () => void;
}

export function useOrder(reference: string, locale: Locale): UseOrderResult {
  const [status, setStatus] = useState<OrderStatus>('loading');
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const generation = useRef(0);

  const load = useCallback(() => {
    const run = (generation.current += 1);
    setStatus('loading');
    void fetchOrderDetail(reference, locale).then((result) => {
      if (run !== generation.current) return;
      if (result.error !== null) {
        setStatus(result.status === 401 ? 'guest' : result.status === 404 ? 'missing' : 'error');
        return;
      }
      setDetail(result.data);
      setStatus('ready');
    });
  }, [locale, reference]);

  useEffect(() => {
    load();
  }, [load]);

  /*
    ÖNE GELİNCE TAZELENİR (kullanıcı bulgusu 01.09 — `21.209`ın ölçümü).

    Sipariş 17:52'de hazırlandı; ekran 18:23'te hâlâ "Alındı" diyordu. Sebep bu dosyaydı: okuma
    yalnız monte olurken koşuyor ve telefonlar kapatılmıyor, cebe konuyor. Sipariş durumu
    müşterinin BEKLEDİĞİ şeydir — bayat kaldığında ekran yalnız eskiyi göstermiyor, müşteriyi
    boşuna bekletiyor.

    `load` eskimiş cevabı zaten eliyor (`generation`), yani öne gelme ile "Tekrar dene" aynı yoldan
    geçer ve yarışan iki uçuşta son cevap kazanır.
  */
  useLiveRefresh(load);

  return { status, detail, retry: load };
}
