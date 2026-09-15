import { useLocalSearchParams } from 'expo-router';

import { LoginNoticeSchema } from '@lezzet/mobile-kit/src/screens/login/login-notice';
import { LoginScreen } from '@/screens/login/login-screen';

/*
  HIZLI DOĞRULAMA — sekme kabuğunun dışında, kök yığında: tasarımda giriş bir SAYFA olarak
  açılır (sekme çubuğu gizlenir) ve doğrulama bitince kaldığı yere döner.

  `notice` parametresinin iki kaynağı var: OAuth dönüş rotası (`/auth/callback` retleri buraya
  `replace` eder) ve kökteki oturum kancası (21.304 — oturumu sunucu reddetti,
  `lib/auth/use-session-ended-login`). Değer URL'den geldiği için süzülür (`LoginNoticeSchema`) —
  tanınmayan anahtar ekrana inmez.

  Gizlilik adresi BURADAN verilir (21.310 — ekran o gün ortak çekirdekteydi; 15.09'dan beri yine uygulamada ama
  rota ağacını yine bu kabuk bilir). Giriş kişiyi
  geldiği yere döndürür; personelin girişi operasyon uygulamasının kendi ekranı (21.312).
*/

const PRIVACY_HREF = { pathname: '/legal/[page]', params: { page: 'privacy' } } as const;

export default function LoginRoute() {
  const { notice } = useLocalSearchParams<{ notice?: string }>();
  const parsed = LoginNoticeSchema.safeParse(notice);
  return <LoginScreen initialNotice={parsed.success ? parsed.data : undefined} privacyHref={PRIVACY_HREF} />;
}
