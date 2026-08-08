import { PreparationScreen } from '@/screens/warehouse/preparation-screen';

/*
  D1 · TOPLAMA — `/picking`. Bölüm kökünün ÜSTÜNE açılır ve `(sections)` DIŞINDA durur (kurye
  teslimat ekranıyla aynı gerekçe): yığına girilince sekme çubuğu gizlenir, geri hareketi depo
  hub'ına döner. Segment İngilizcedir (CLAUDE §2), operasyon yüzeyinde önek yok.
*/
export default function PickingRoute() {
  return <PreparationScreen />;
}
