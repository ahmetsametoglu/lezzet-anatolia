import { useLocalSearchParams } from 'expo-router';

import { AuthCallbackScreen } from '@lezzet/mobile-kit/src/screens/login/auth-callback-screen';
import { operationsHomeRoute } from '@/screens/login/post-login-route';

/*
  OAUTH DÖNÜŞÜ — `lezzetoperasyonu://auth/callback?code=…` buraya iner (müşteri uygulamasının ince rotasıyla
  aynı desen). Personel ilk bölümüne, bölümü olmayan hesap köke gider ve kapı "yetki yok" der.
  BEKLEYEN(21.310): Supabase dönüş izin listesine `lezzetoperasyonu://**` (`supabase/config.toml`).
*/
export default function AuthCallbackRoute() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  return (
    <AuthCallbackScreen
      code={typeof code === 'string' && code.length > 0 ? code : null}
      landingFor={operationsHomeRoute}
      homeRoute="/"
    />
  );
}
