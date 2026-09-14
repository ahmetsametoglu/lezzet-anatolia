import { MoneyTrackingScreen } from '@/screens/money/money-screen';

/*
  Para bölümünün kökü — gövdesi geldi (21.12). Başlığın sağ yuvasında zil YOKTUR (v2:719; gerekçe
  `components/operations/section-header.tsx` künyesinde) — orada yalnız kimlik durur.

  "gün sonu →" metin eylemi v3'te başlıktan ÇIKTI (30.08): tasarım onu BEKLEYEN TAHSİLATLAR
  başlığının yanına koyuyor, yani götürdüğü listenin yanına. Ekran künyesi bunu ölçümüyle yazıyor.
*/
export default function MoneyRoute() {
  return <MoneyTrackingScreen />;
}
