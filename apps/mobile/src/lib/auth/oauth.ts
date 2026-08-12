import * as Linking from 'expo-linking';
import type { AuthErrorKey } from '@lezzet/types';

import { claimPendingInvite } from '../invite/invite-api';
import { getSupabase } from './supabase';

/*
  GOOGLE OAUTH — cihaz akışı (21.14c; web'de aynı sağlayıcı zaten canlı, `login-client.tsx`).

  `expo-web-browser` YOK ve bilerek eklenmedi: paket yerel modül taşır, eklemek dev-client'ın
  YENİDEN DERLENMESİNİ ister (21.13 rebuild kümesinin sınırı). Onun yerine sistem tarayıcısı
  (`Linking.openURL`) + şema dönüşü (`lezzetanatolia://auth/callback`) kullanılıyor: Supabase
  PKCE akışında dönüş yalnız tek kullanımlık `?code=` taşır, tarayıcıda oturum kalıntısı kalmaz.
  Rebuild günü gelince (kamera kümesiyle) `openAuthSessionAsync`e geçmek tek dosyalık iş.

  DÖNÜŞÜN SAHİBİ ROTA, DİNLEYİCİ DEĞİL (cihaz kanıtı 09.08): şema dönüşünü expo-router bir
  NAVİGASYON olarak işliyor — `Linking.addEventListener('url')` kurgusunda olay dinleyiciye hiç
  düşmedi, `code` kullanılmadan ekranda kaldı ve router "Unmatched Route" bastı (auth.users'ta
  google kimliği oluşmuş, `last_sign_in_at` boş — değişim hiç çağrılmamış). Bu yüzden burada
  yalnız tarayıcı AÇILIR; değişimi `app/auth/callback` rotası yapar (`exchangeOAuthCode`).
*/

type OAuthResult = { error: AuthErrorKey | null };

/**
 * Tarayıcıda Google girişini BAŞLATIR — akışın devamı bu fonksiyonda değil: dönüş derin
 * bağlantısı `/auth/callback` rotasına iner ve değişimi o yapar. Başarı "tarayıcı açıldı"
 * demektir; müşteri tarayıcıda vazgeçerse uygulamaya döndüğünde giriş ekranı bıraktığı gibidir
 * (asılı bir bekleme YOK — eski zaman aşımı kurgusunun gerekçesi rota sahipliğiyle düştü).
 */
export async function signInWithGoogle(): Promise<OAuthResult> {
  const supabase = getSupabase();
  const redirectTo = Linking.createURL('auth/callback');

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error !== null || !data?.url) return { error: 'google_unavailable' };

  try {
    await Linking.openURL(data.url);
    return { error: null };
  } catch {
    return { error: 'oauth_failed' };
  }
}

/**
 * PKCE kodunu oturuma çevirir — `/auth/callback` rotasının tek işi. Değişim düşerse oturuma
 * bakılır: kod tek kullanımlıktır ve derin bağlantı iki kez işlenebilir (soğuk açılış + olay);
 * oturum kurulmuşsa ikinci deneme hata değil, tamamlanmış girişin yankısıdır.
 */
export async function exchangeOAuthCode(code: string): Promise<OAuthResult> {
  const supabase = getSupabase();
  const exchange = await supabase.auth.exchangeCodeForSession(code);
  if (exchange.error === null) {
    /* ── DAVET BAĞI BURADA KURULUR (21.44 · ölçülmüş boşluk) ──────────────────
       Bu akış `/auth/otp/verify` ucundan HİÇ geçmiyor: değişim doğrudan Supabase ile yapılıyor ve
       profili trigger açıyor. Kod yalnız OTP gövdesinde taşındığı sürece, davet bağlantısına
       tıklayıp *"Google ile devam et"* diyen davetli sessizce bağsız kalıyordu — hata yok, log
       yok, ödül yok; üstelik en olası yol buydu. Web aynı boşluğu `auth/callback` rotasında
       kapattı (17.11). Kapı giriş yöntemini BİLMEZ, yalnız "oturum kuruldu"yu bilir. */
    await claimPendingInvite();
    return { error: null };
  }

  const { data } = await supabase.auth.getSession();
  if (!data.session) return { error: 'oauth_failed' };

  /* Değişim düştü ama oturum VAR: derin bağlantı iki kez işlenmiş (soğuk açılış + olay) ve giriş
     ilk turda tamamlanmış demektir. Bekleyen davet o turda zaten tüketildi; kapı idempotent
     olduğu için ikinci çağrı da zararsız — bekleyen kod yoksa hiçbir şey yapmaz. */
  await claimPendingInvite();
  return { error: null };
}
