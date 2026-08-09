import * as Linking from 'expo-linking';
import type { AuthErrorKey } from '@lezzet/types';

import { getSupabase } from './supabase';

/*
  GOOGLE OAUTH — cihaz akışı (21.14c; web'de aynı sağlayıcı zaten canlı, `login-client.tsx`).

  `expo-web-browser` YOK ve bilerek eklenmedi: paket yerel modül taşır, eklemek dev-client'ın
  YENİDEN DERLENMESİNİ ister (21.13 rebuild kümesinin sınırı). Onun yerine sistem tarayıcısı
  (`Linking.openURL`) + şema dönüşü (`lezzetanatolia://auth/callback`) kullanılıyor: Supabase
  PKCE akışında dönüş yalnız tek kullanımlık `?code=` taşır, tarayıcıda oturum kalıntısı kalmaz.
  Rebuild günü gelince (kamera kümesiyle) `openAuthSessionAsync`e geçmek tek dosyalık iş.

  ZAMAN AŞIMI: müşteri tarayıcıda vazgeçip elle geri dönebilir — dönüş olayı hiç gelmez. Sonsuz
  bekleyen bir söz yerine süre dolunca `oauth_failed` döner; ekran hatayı basar, akış yeniden
  denenebilir.
*/

/** Tarayıcıdan dönüş için makul bekleme — parametrik, tek yerde. */
const OAUTH_TIMEOUT_MS = 180_000;

type OAuthResult = { error: AuthErrorKey | null };

/** Dönüş URL'inden `code` çeker; bizim callback yolumuz değilse `null` (alakasız derin bağlantı). */
function codeOf(url: string): string | null {
  const parsed = Linking.parse(url);
  if (parsed.path !== 'auth/callback') return null;
  const code = parsed.queryParams?.code;
  return typeof code === 'string' && code.length > 0 ? code : null;
}

export async function signInWithGoogle(): Promise<OAuthResult> {
  const supabase = getSupabase();
  const redirectTo = Linking.createURL('auth/callback');

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true },
  });
  if (error !== null || !data?.url) return { error: 'google_unavailable' };

  const code = await new Promise<string | null>((resolve) => {
    const timer = setTimeout(() => {
      subscription.remove();
      resolve(null);
    }, OAUTH_TIMEOUT_MS);
    const subscription = Linking.addEventListener('url', (event) => {
      const found = codeOf(event.url);
      if (found === null) return;
      clearTimeout(timer);
      subscription.remove();
      resolve(found);
    });
    void Linking.openURL(data.url).catch(() => {
      clearTimeout(timer);
      subscription.remove();
      resolve(null);
    });
  });

  if (code === null) return { error: 'oauth_failed' };

  const exchange = await supabase.auth.exchangeCodeForSession(code);
  return { error: exchange.error === null ? null : 'oauth_failed' };
}
