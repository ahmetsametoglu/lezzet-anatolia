import { Redirect } from 'expo-router';

import { operationsSectionRoute } from '@/screens/login/post-login-route';
import { useOperationsSections } from '@/screens/operations/sections-context';

/*
  UYGULAMANIN KÖKÜ (`/`) — personelin İLK bölümü (21.310). Kapı (`_layout.tsx`) bölümleri çözüp bağlama koydu;
  kapıdan geçen kişide liste boş değildir. Sıra tasarımın sırası (`OPERATIONS_SECTIONS`) ve kaynak girişin iniş
  kuralıyla aynı (`post-login-route`). `Redirect`: geçmişe kayıt düşmez, geri tuşu boş köke dönmez.

  Tek uygulama iki yüzeyi taşırken bu karar müşteri kabuğunda, açılışta bir kez koşan bir kancaydı (21.97);
  ayrı uygulamada kök operasyonun kendisi.
*/
export default function OperationsIndex() {
  const [first] = useOperationsSections();
  return first === undefined ? null : <Redirect href={operationsSectionRoute(first)} />;
}
