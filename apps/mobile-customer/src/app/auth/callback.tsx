import { useLocalSearchParams } from 'expo-router';

import { AuthCallbackScreen } from '@/screens/login/auth-callback-screen';

/*
  Rota İNCE (login kabuğunun deseni) — `lezzetanatolie://auth/callback?code=…` derin bağlantısı
  buraya iner; parametreyi kabuk okur, kararları ekran verir (`auth-callback-screen` künyesi).
*/
/** Dönüşte açılabilecek rotalar; derin bağlantı dışarıdan da yazılabildiği için liste dışı hedef eve düşer. */
const RETURN_ROUTES = ['/cart'] as const;

export default function AuthCallbackRoute() {
  const { code, next } = useLocalSearchParams<{ code?: string; next?: string }>();
  const target = RETURN_ROUTES.find((route) => route === next);
  return (
    <AuthCallbackScreen
      code={typeof code === 'string' && code.length > 0 ? code : null}
      homeRoute={target ?? '/account'}
    />
  );
}
