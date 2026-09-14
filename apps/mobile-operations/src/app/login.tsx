import { useLocalSearchParams } from 'expo-router';

import { LoginNoticeSchema } from '@lezzet/mobile-kit/src/screens/login/login-notice';
import { OperationsLoginScreen } from '@/screens/login/operations-login-screen';

/*
  GİRİŞ — operasyon uygulamasının açılış kapısı (21.310): oturumsuz personeli kapı buraya yollar
  (`(operations)/_layout.tsx`). Ekran bu uygulamanın kendisi (21.312 — tasarım 14.09): sistemde kayıtlı olmayan
  giremez ve akış "hazır" ya da "yetki yok" hâliyle bu ekranda biter. `notice` reddedilen oturumun sebebidir
  (21.304, kökteki kanca yazar) ve süzülür. GERİ OKU YOK: giriş bu uygulamanın kök ekranı, altında dönülecek
  bir ekran yok (kullanıcı kuralı 14.09).
*/
export default function LoginRoute() {
  const { notice } = useLocalSearchParams<{ notice?: string }>();
  const parsed = LoginNoticeSchema.safeParse(notice);
  return <OperationsLoginScreen initialNotice={parsed.success ? parsed.data : undefined} />;
}
