import { useLocalSearchParams } from 'expo-router';

import { FeedbackScreen } from '@/screens/feedback/feedback-screen';

/*
  GERİ BİLDİRİM ROTASI — sipariş sonrası değerlendirme; mail/bildirimdeki TOKEN'LI derin
  bağlantıyla açılır (`lezzet://feedback/<token>`). Parametre sipariş numarası değil DAVET
  TOKEN'ıdır: token oturum yerine geçer, başka kimlik sorulmaz (web'in `feedback/[token]`
  sayfasıyla aynı kapı).

  Sekme kabuğunun DIŞINDA (kök `Stack` altında): yığına girildiğinde sekme çubuğu gizlenir
  (envanter §4) — dosyanın `(tabs)` grubunda olmaması bunu kendiliğinden sağlıyor.
*/
export default function FeedbackRoute() {
  const { token } = useLocalSearchParams<{ token: string }>();
  return <FeedbackScreen token={typeof token === 'string' ? token : ''} />;
}
