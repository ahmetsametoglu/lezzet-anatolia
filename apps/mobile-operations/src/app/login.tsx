import { useLocalSearchParams } from 'expo-router';

import { LoginNoticeSchema } from '@lezzet/mobile-kit/src/screens/login/login-notice';
import { LoginScreen } from '@lezzet/mobile-kit/src/screens/login/login-screen';
import { operationsHomeRoute } from '@/screens/login/post-login-route';
import { useLeaveLoginOnSignIn } from '@/screens/login/use-leave-login-on-sign-in.hook';

/*
  GİRİŞ — operasyon uygulamasının açılış kapısı (21.310): oturumsuz personeli kapı buraya yollar
  (`(operations)/_layout.tsx`). Ekran ortak çekirdekte; bu uygulama iniş kuralını (personel → ilk bölümü,
  `post-login-route`) ve geliştirme düğmelerinin süzgecini verir. Bölümü olmayan hesapta kural `null` döner,
  ekran köke kapanır ve kapı "yetki yok" der. `notice` müşteri uygulamasındakiyle aynı iki kaynaktan gelir
  (OAuth reddi · reddedilen oturum) ve süzülür. Gizlilik bağı yok: gizlilik metni müşteri uygulamasının rotası.
  GERİ OKU YOK (`closable={false}`): giriş bu uygulamanın kök ekranı, altında dönülecek bir ekran yok (kullanıcı
  kuralı 14.09). BEKLEYEN(21.310): operasyon girişinin tasarımı — başlık ve metin müşteriye hitap ediyor ("İster
  yeni ister dönen müşteri olun"); tasarım gelene dek ortak metin kalır (kullanıcı kararı 14.09).
  GİRİŞTEYKEN OTURUM AÇILIRSA kapıya dönülür (`use-leave-login-on-sign-in.hook.ts`) — otomatik girişin geç
  kalan oturumu cihazda böyle girişte asılı kalıyordu (14.09).
*/
export default function LoginRoute() {
  const { notice } = useLocalSearchParams<{ notice?: string }>();
  const parsed = LoginNoticeSchema.safeParse(notice);
  useLeaveLoginOnSignIn();
  return (
    <LoginScreen
      initialNotice={parsed.success ? parsed.data : undefined}
      landingFor={operationsHomeRoute}
      devAccounts="operations"
      closable={false}
    />
  );
}
