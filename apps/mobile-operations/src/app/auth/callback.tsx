import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';

import { handOffOAuthCode } from '@/screens/login/oauth-handoff';

/*
  OAUTH DÖNÜŞÜ — `lezzetoperasyonu://auth/callback?code=…` buraya iner. Değişimi GİRİŞ EKRANI yapar (21.312):
  tasarım Google doğrulamasını girişin üstünde çiziyor ve sonucu orada gösteriyor (gerekçe `oauth-handoff.ts`).
  Rota yalnız kodu devreder ve girişe döner: tarayıcıdan dönüşte giriş yığında alttadır (`back`); uygulama
  tarayıcıdayken kapandıysa dönüş soğuk açılıştır ve giriş yeniden kurulur (`replace`).
  BEKLEYEN(21.310): Supabase dönüş izin listesine `lezzetoperasyonu://**` (`supabase/config.toml`).
*/
export default function AuthCallbackRoute() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  const router = useRouter();

  useEffect(() => {
    handOffOAuthCode(typeof code === 'string' && code.length > 0 ? code : null);
    if (router.canGoBack()) router.back();
    else router.replace('/login');
  }, [code, router]);

  return null;
}
