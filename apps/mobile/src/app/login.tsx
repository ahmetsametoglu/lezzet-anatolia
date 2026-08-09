import { useLocalSearchParams } from 'expo-router';
import { AuthErrorKeyEnum } from '@lezzet/types';

import { LoginScreen } from '@/screens/login/login-screen';

/*
  HIZLI DOĞRULAMA — sekme kabuğunun dışında, kök yığında: tasarımda giriş bir SAYFA olarak
  açılır (sekme çubuğu gizlenir) ve doğrulama bitince kaldığı yere döner.

  `notice` parametresi OAuth dönüş rotasından gelir (`/auth/callback` retleri buraya `replace`
  eder); değer URL'den geldiği için sözleşme enum'uyla SÜZÜLÜR — tanınmayan anahtar ekrana inmez.
*/
export default function LoginRoute() {
  const { notice } = useLocalSearchParams<{ notice?: string }>();
  const parsed = AuthErrorKeyEnum.safeParse(notice);
  return <LoginScreen initialNotice={parsed.success ? parsed.data : undefined} />;
}
