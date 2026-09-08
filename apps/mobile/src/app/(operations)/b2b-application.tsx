import { useLocalSearchParams } from 'expo-router';

import { B2bApplicationScreen } from '@/screens/management/b2b-application-screen';

/*
  KURUMSAL BAŞVURU KARTI — `/b2b-application?id=<müşteri>` (21.217).

  Kimlik SORGUDA, yolda değil: bildirimin hedefi de bu adresi kuruyor (`notification-map`) ve
  başvurunun kimliği MÜŞTERİ kimliğidir — ayrı bir "başvuru" varlığı yok, onay müşteri kaydının
  bir alanıdır (web'in 30.07 kararı, `b2b/check.ts` künyesi).
*/
export default function B2bApplicationRoute() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <B2bApplicationScreen customerId={typeof id === 'string' ? id : ''} />;
}
