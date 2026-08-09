import { MoneyTrackingScreen } from '@/screens/money/money-screen';

/*
  Para bölümünün kökü — gövdesi geldi (21.12). Başlığın sağ yuvasında zil DEĞİL "Gün sonu →" metin
  eylemi durur (v2:719); gerekçe `components/operations/section-header.tsx` künyesinde.
*/
export default function MoneyRoute() {
  return <MoneyTrackingScreen />;
}
