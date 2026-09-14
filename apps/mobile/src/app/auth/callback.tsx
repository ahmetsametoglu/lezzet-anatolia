import { useLocalSearchParams } from 'expo-router';

import { AuthCallbackScreen } from '@lezzet/mobile-kit/src/screens/login/auth-callback-screen';
import { operationsHomeRoute } from '@/screens/login/post-login-route';

/*
  Rota İNCE (login kabuğunun deseni) — `lezzetanatolie://auth/callback?code=…` derin bağlantısı
  buraya iner; parametreyi kabuk okur, kararları ekran verir (`auth-callback-screen` künyesi).
*/
export default function AuthCallbackRoute() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  return (
    <AuthCallbackScreen
      code={typeof code === 'string' && code.length > 0 ? code : null}
      landingFor={operationsHomeRoute}
      homeRoute="/account"
    />
  );
}
