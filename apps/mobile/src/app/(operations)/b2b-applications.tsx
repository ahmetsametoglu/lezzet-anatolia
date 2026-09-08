import { B2bApplicationsScreen } from '@/screens/management/b2b-applications-screen';

/*
  KURUMSAL BAŞVURU LİSTESİ — `/b2b-applications` (21.217). Detayla (`/b2b-application`) aynı
  katmanda ve `(sections)` DIŞINDA: yığına girilince sekme çubuğu gizlenir, geri hareketi yönetim
  köküne döner (talep ikilisinin aynı deseni). Adres ÇOĞULDUR ve fark anlamlıdır — tekil bir
  başvuruyu, çoğul kuyruğun tamamını açar.
*/
export default function B2bApplicationsRoute() {
  return <B2bApplicationsScreen />;
}
