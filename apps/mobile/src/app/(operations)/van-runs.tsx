import { CourierVanRunsScreen } from '@/screens/courier/van-runs-screen';

/*
  Araçtaki seferler (v3:15) — araç bir ara depo olduğu için doğan ekran: kurulmuş seferler burada
  birikir ve kurye istediğini başlatır. Gövdeyi ekranın kendisi çizer (`trip.tsx` emsali).
*/
export default function VanRunsRoute() {
  return <CourierVanRunsScreen />;
}
