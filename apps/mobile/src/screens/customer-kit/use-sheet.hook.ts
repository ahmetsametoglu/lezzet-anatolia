import { useCallback, useState } from 'react';

/*
  ÇEKMECE AÇMA/KAPAMA — üç çağıranın (bilgi bandının iki çekmecesi, teslimat bölgeleri sayfası)
  ortak kalıbı.

  İKİ BAYRAK, ÇÜNKÜ İKİ AYRI SORU VAR:
   · `mounted` — çekmece HİÇ açıldı mı? Açılmadıysa kurulmaz: kapalı bir katmanı liste başlığında
     sürekli ayakta tutmak, içindeki kancaları (kimlik okuması gibi) her ekran açılışında boşuna
     çalıştırırdı.
   · `visible` — şu anda açık mı? Kapanışta bu düşer ama `mounted` düşmez; `BottomSheet`in kapanış
     animasyonu ancak komponent ayakta kalırsa görünür (kitin künyesi: panel önce kayıp gider,
     `Modal` ondan sonra sökülür). Kapanırken sökseydik kapanış hiç görünmezdi.
*/
interface SheetState {
  /** Kurulsun mu — ilk açılıştan sonra hep `true`. */
  mounted: boolean;
  visible: boolean;
  open: () => void;
  close: () => void;
}

export function useSheet(): SheetState {
  const [mounted, setMounted] = useState(false);
  const [visible, setVisible] = useState(false);

  const open = useCallback(() => {
    setMounted(true);
    setVisible(true);
  }, []);
  const close = useCallback(() => setVisible(false), []);

  return { mounted, visible, open, close };
}
