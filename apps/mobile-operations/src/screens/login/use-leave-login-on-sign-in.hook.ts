import { useRouter } from 'expo-router';
import { useEffect } from 'react';

import { getSupabase } from '@lezzet/mobile-kit/src/lib/auth/supabase';

/*
  GİRİŞTEYKEN AÇILAN OTURUM → KAPI (21.310 — cihazda ölçüldü 14.09).

  Oturumsuz soğuk açılışta kapı girişe geçer ve sökülür; dinleyicisi de onunla gider. Otomatik giriş
  (`useDevAutoLogin`) oturumu bundan SONRA kurduğunda ekran girişte kalıyordu: giriş ekranı yalnız KENDİ
  akışından sonra yönlendirir. Tek uygulamada bu işi personel iniş kancası (21.97) yapıyordu — oturumu
  görünce `replace`.

  YALNIZ `SIGNED_IN` (yeni oturum). Açılış olayı (`INITIAL_SESSION`) da dinlenseydi, API'nin reddettiği ama
  auth sunucusuna ulaşılamadığı için cihazda korunan bir oturumda (`authorizedFetch` künyesi) kapı girişe,
  giriş kapıya atardı — döngü. Ters sıra (oturum kapı yönlendirmeden ÖNCE açılır) kapının işidir:
  `signed_out` kararı `stillCurrent` taşır (`use-operations-access.hook.ts`).

  Giriş ekranının kendi akışı (kod) da `SIGNED_IN` doğurur; iki yönlendirme de ilk bölümde biter.
*/

/** Girişteyken yeni oturum açılırsa kapıya (`/`) döner — `replace`: geçmişte giriş ekranı kalmaz. */
export function useLeaveLoginOnSignIn(): void {
  const router = useRouter();
  useEffect(() => {
    const { data } = getSupabase().auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_IN') router.replace('/');
    });
    return () => data.subscription.unsubscribe();
  }, [router]);
}
