import { useEffect } from 'react';

import { getSupabase } from '@/lib/auth/supabase';
import { ensurePushRegistration } from './register-device';

/*
  PUSH KAYDININ TETİKLEYİCİLERİ — ziyaret puanının (`use-visit-points`) deseni, aynı gerekçeyle
  KÖKTE: kayıt bir ekrana bağlanamaz, müşteri hangi ekranda oturum açacağını bilmiyoruz.

  1. **İlk kare** — oturumu zaten açık olan kullanıcı uygulamayı açtığında (jeton + izin tazelenir).
  2. **Oturum açılınca** — giriş yapan kullanıcı kaydolur; SAHİP DEVRİ burada devreye girer:
     aynı cihazda önceki hesabın jetonu kalmışsa sunucu onu yeni hesaba geçirir (0050 RPC'si).

  Çıkış tetikleyicisi BURADA DEĞİL, `signOut`un içinde: silme ucu yetki ister ve `SIGNED_OUT`
  olayı düştüğünde oturum çoktan kapanmıştır — olaydan dinlemek hep geç kalırdı.

  Oturumsuz açılışta hiçbir şey olmaz: `ensurePushRegistration` sunucuya `authorizedFetch` ile
  gider ve o, oturumsuzda ağa hiç çıkmaz (yerel kısa devre) — izin istemi de ancak girişli
  kullanıcıya görünmüş olur, misafire açılışta izin sormak en kötü ilk izlenimdir.
*/
export function usePushRegistration(): void {
  useEffect(() => {
    void ensurePushRegistration();

    /* `getSupabase` env'siz ortamda (test, yarım kurulum) FIRLATIR ve burası kök — işlenmemiş bir
       istisna bütün kabuğu düşürür. Yutma bilinçli ve künyeli (visit-points'in aynı koruması):
       push bir hızlandırıcıdır, dinleyicisiz kalması uygulamayı aksatmaz. */
    try {
      const { data } = getSupabase().auth.onAuthStateChange((event) => {
        if (event === 'SIGNED_IN') void ensurePushRegistration();
      });
      return () => data.subscription.unsubscribe();
    } catch {
      return undefined;
    }
  }, []);
}
