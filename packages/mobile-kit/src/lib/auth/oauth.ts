import * as Linking from 'expo-linking';
import type { AuthErrorKey } from '@lezzet/types';

import { runSignInEffects } from './sign-in-effects';
import { getSupabase } from './supabase';

/*
  Google girişi sistem tarayıcısıyla (`Linking.openURL`) ve şema dönüşüyle (`lezzetanatolie://auth/callback`) yapılır; `expo-web-browser`
  yerel modül taşıdığı için dev-client'ın yeniden derlenmesini isterdi. Dönüşü bir dinleyici değil `app/auth/callback` rotası karşılar,
  çünkü expo-router şema dönüşünü navigasyon olarak işler ve dinleyiciye hiç düşürmez.
*/

type OAuthResult = { error: AuthErrorKey | null };

/**
 * Tarayıcıda Google girişini başlatır; değişimi `/auth/callback` rotası yapar. Başarı "tarayıcı açıldı" demektir, tarayıcıda vazgeçen
 * müşteri uygulamaya döndüğünde girişi bıraktığı gibi bulur.
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
    /* Google akışı `/auth/otp/verify` ucundan geçmez; giriş sonrası işler (davet bağı dahil) burada koşmazsa Google'la giren davetli
       sessizce bağsız kalırdı. Kapı giriş yöntemini bilmez, yalnız "oturum kuruldu"yu bilir (`sign-in-effects`). */
    await runSignInEffects();
    return { error: null };
  }

  const { data } = await supabase.auth.getSession();
  if (!data.session) return { error: 'oauth_failed' };

  /* Değişim düştü ama oturum var: derin bağlantı iki kez işlenmiş ve giriş ilk turda tamamlanmış demektir. Giriş sonrası işler
     idempotent olduğu için ikinci çağrı zararsızdır. */
  await runSignInEffects();
  return { error: null };
}
