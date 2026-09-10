import { useRootNavigationState, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';

import { SESSION_ENDED_NOTICE } from '@/screens/login/login-notice';

import { onSessionRejected } from './session-end';

/*
  REDDEDİLEN OTURUM → GİRİŞ EKRANI (21.304 — kullanıcı kararı 10.09: "401 hatasını da giriş
  ekranına yönlendirebiliriz").

  Oturumu kapatma kararı `authorizedFetch`te verilir (sunucu jetonu, auth sunucusu da tazelemeyi
  KESİN reddetti); bu kanca yalnız sonucu kişiye söyler: giriş ekranı sebep cümlesiyle açılır. Veri
  katmanı yönlendirmez (02-mimari §4) — kabuk yönlendirir, burası kabuğun kökü.

  ── NİÇİN KÖKTE, OPERASYON KAPISINDA DEĞİL ─────────────────────────────────
  İlk yazım kapıdaydı ve uçtan uca test onu yakaladı: ret, uygulama açılırken kökteki isteklerden
  (push kaydı, sepet) de gelebiliyor ve o anda kapı henüz monte değil — sebep kimseye ulaşmadan
  personel vitrine düşüyordu. Ret uygulamanın HER yerinden gelebilir; hepsini duyan tek yer, hepsinin
  üstündeki köktür. Gönüllü çıkış bu kancayı TETİKLEMEZ (ret yayınlamıyor) — kapının "çıkan vitrine"
  kararı (21.97b) aynen duruyor.

  ── NİÇİN BEKLETİLEN BİR NİYET ─────────────────────────────────────────────
  Açılışta kök yığın, kapılar (font, dil, onboarding) açılmadan ÇİZİLMİYOR ve yığın yokken gezinmek
  expo-router'da hatadır. Ret o arada gelirse kaybolmasın diye niyet saklanır; yığın hazır olunca
  (`useRootNavigationState().key`) ekran açılır.

  ── NİÇİN `push` ───────────────────────────────────────────────────────────
  Giriş, kişinin bulunduğu ekranın ÜSTÜNE açılır: yeniden doğrulanan müşteri kaldığı yere döner,
  vazgeçen geri tuşuyla misafir olarak sürer. Operasyonda kapının "/" yönlendirmesi (`Redirect`)
  yalnız odaktaki ekranda koşar; hangisi önce koşarsa koşsun kişi girişte, sebebiyle karşılanır.
*/
export function useSessionEndedLogin(): void {
  const router = useRouter();
  const navigationReady = useRootNavigationState()?.key !== undefined;
  const [pending, setPending] = useState(false);

  useEffect(() => onSessionRejected(() => setPending(true)), []);

  useEffect(() => {
    if (!pending || !navigationReady) return;
    setPending(false);
    router.push({ pathname: '/login', params: { notice: SESSION_ENDED_NOTICE } });
  }, [pending, navigationReady, router]);
}
