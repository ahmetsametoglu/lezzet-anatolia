import { useLocalSearchParams } from 'expo-router';

import { AuthCallbackScreen } from '@/screens/login/auth-callback-screen';

/*
  Rota İNCE (login kabuğunun deseni) — `lezzetanatolia://auth/callback?code=…` derin bağlantısı
  buraya iner; parametreyi kabuk okur, kararları ekran verir (`auth-callback-screen` künyesi).
*/
export default function AuthCallbackRoute() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  return <AuthCallbackScreen code={typeof code === 'string' && code.length > 0 ? code : null} />;
}
