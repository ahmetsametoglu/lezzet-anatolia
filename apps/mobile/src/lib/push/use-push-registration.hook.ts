import { useEffect } from 'react';
import { AppState } from 'react-native';

import { getSupabase } from '@/lib/auth/supabase';
import { ensurePushRegistration } from './register-device';

/*
  PUSH KAYDININ TETİKLEYİCİLERİ — ziyaret puanının (`use-visit-points`) deseni, aynı gerekçeyle
  KÖKTE: kayıt bir ekrana bağlanamaz, müşteri hangi ekranda oturum açacağını bilmiyoruz.

  1. **İlk kare** — oturumu zaten açık olan kullanıcı uygulamayı açtığında (jeton + izin tazelenir).
  2. **Oturum açılınca** — giriş yapan kullanıcı kaydolur; SAHİP DEVRİ burada devreye girer:
     aynı cihazda önceki hesabın jetonu kalmışsa sunucu onu yeni hesaba geçirir (0050 RPC'si).
  3. **Uygulama öne gelince, günde en çok bir kez** (push talebi 10.09 — "uygulama önce" kuralının
     cihaz ayağı): sunucu native cihazın ETKİN olduğuna `push_device.last_seen_at` ile bakıyor
     (varsayılan 30 gün). Uygulamayı her gün kullanan ama hiç KAPATMAYAN müşteride ilk kare bir daha
     koşmuyordu; 30 gün sonra cihaz "etkin değil" sayılır ve haber tarayıcıya düşerdi. Her öne
     gelişte değil günde bir: kayıt Expo'dan jeton ister ve sunucuya yazar, uygulama değiştirmek ise
     dakikada bir olabilir — tazelik için günde bir fazlasıyla yeter. Sayaç DENEMEYİ sayar, başarıyı
     değil: düşen kayıt ertesi gün yeniden denenir, ilk kare ve giriş zaten her seferinde dener.

  Çıkış tetikleyicisi BURADA DEĞİL, `signOut`un içinde: silme ucu yetki ister ve `SIGNED_OUT`
  olayı düştüğünde oturum çoktan kapanmıştır — olaydan dinlemek hep geç kalırdı.

  Oturumsuz açılışta hiçbir şey olmaz: `ensurePushRegistration` sunucuya `authorizedFetch` ile
  gider ve o, oturumsuzda ağa hiç çıkmaz (yerel kısa devre) — izin istemi de ancak girişli
  kullanıcıya görünmüş olur, misafire açılışta izin sormak en kötü ilk izlenimdir.
*/

/** Öne gelişte kaydı tazeleme aralığı — parametrik (CLAUDE §4); talep "günde bir yeter" diyor. */
export const PUSH_REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;

export function usePushRegistration(): void {
  useEffect(() => {
    let lastAttemptAt = 0;
    const attempt = () => {
      lastAttemptAt = Date.now();
      void ensurePushRegistration();
    };
    attempt();

    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active' && Date.now() - lastAttemptAt >= PUSH_REFRESH_INTERVAL_MS) attempt();
    });

    /* `getSupabase` env'siz ortamda (test, yarım kurulum) FIRLATIR ve burası kök — işlenmemiş bir
       istisna bütün kabuğu düşürür. Yutma bilinçli ve künyeli (visit-points'in aynı koruması):
       push bir hızlandırıcıdır, dinleyicisiz kalması uygulamayı aksatmaz. */
    let authSubscription: { unsubscribe: () => void } | null = null;
    try {
      authSubscription = getSupabase().auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_IN') attempt();
      }).data.subscription;
    } catch {
      authSubscription = null;
    }

    return () => {
      appState.remove();
      // Nesnenin KENDİSİ tutuluyor, metodu değil: `unsubscribe` `this`e bağlı olabilir.
      authSubscription?.unsubscribe();
    };
  }, []);
}
