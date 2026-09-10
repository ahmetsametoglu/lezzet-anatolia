import { useLocalSearchParams } from 'expo-router';

import { LoginNoticeSchema } from '@/screens/login/login-notice';
import { LoginScreen } from '@/screens/login/login-screen';

/*
  HIZLI DOĞRULAMA — sekme kabuğunun dışında, kök yığında: tasarımda giriş bir SAYFA olarak
  açılır (sekme çubuğu gizlenir) ve doğrulama bitince kaldığı yere döner.

  `notice` parametresinin iki kaynağı var: OAuth dönüş rotası (`/auth/callback` retleri buraya
  `replace` eder) ve kökteki oturum kancası (21.304 — oturumu sunucu reddetti,
  `lib/auth/use-session-ended-login`). Değer URL'den geldiği için süzülür (`LoginNoticeSchema`) —
  tanınmayan anahtar ekrana inmez.
*/
export default function LoginRoute() {
  const { notice } = useLocalSearchParams<{ notice?: string }>();
  const parsed = LoginNoticeSchema.safeParse(notice);
  return <LoginScreen initialNotice={parsed.success ? parsed.data : undefined} />;
}
