import { useLocalSearchParams } from 'expo-router';

import { LoginNoticeSchema } from '@lezzet/mobile-kit/src/screens/login/login-notice';
import { LoginScreen } from '@lezzet/mobile-kit/src/screens/login/login-screen';
import { operationsHomeRoute } from '@/screens/login/post-login-route';

/*
  GİRİŞ — operasyon uygulamasının açılış kapısı (21.310): oturumsuz personeli kapı buraya yollar
  (`(operations)/_layout.tsx`). Ekran ortak çekirdekte; bu uygulama iniş kuralını (personel → ilk bölümü,
  `post-login-route`) ve geliştirme düğmelerinin süzgecini verir. Bölümü olmayan hesapta kural `null` döner,
  ekran köke kapanır ve kapı "yetki yok" der. `notice` müşteri uygulamasındakiyle aynı iki kaynaktan gelir
  (OAuth reddi · reddedilen oturum) ve süzülür. Gizlilik bağı yok: gizlilik metni müşteri uygulamasının rotası.
*/
export default function LoginRoute() {
  const { notice } = useLocalSearchParams<{ notice?: string }>();
  const parsed = LoginNoticeSchema.safeParse(notice);
  return (
    <LoginScreen
      initialNotice={parsed.success ? parsed.data : undefined}
      landingFor={operationsHomeRoute}
      devAccounts="operations"
    />
  );
}
