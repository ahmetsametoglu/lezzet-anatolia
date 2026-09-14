import { SocialInboxScreen } from '@/screens/management/social-inbox-screen';

/*
  SOSYAL GELEN KUTUSU — `/social`. Yönetim kökünün ÜSTÜNE açılır ve `(sections)` DIŞINDA durur
  (şikâyet/teslimat alt ekranlarıyla aynı gerekçe): yığına girilince sekme çubuğu gizlenir, geri
  hareketi yönetim köküne döner. Segment İngilizcedir (CLAUDE §2), operasyon yüzeyinde önek yok.
*/
export default function SocialInboxRoute() {
  return <SocialInboxScreen />;
}
