import { LoginScreen } from '@/screens/login/login-screen';

/*
  HIZLI DOĞRULAMA — sekme kabuğunun dışında, kök yığında: tasarımda giriş bir SAYFA olarak
  açılır (sekme çubuğu gizlenir) ve doğrulama bitince kaldığı yere döner.
*/
export default function LoginRoute() {
  return <LoginScreen />;
}
