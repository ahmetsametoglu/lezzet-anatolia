import { ManagementHubScreen } from '@/screens/management/management-hub-screen';

/*
  Yönetim bölümünün kökü — gövdesi geldi (21.12) ve kurye/depo köklerinin açtığı yolu izliyor:
  başlık üçlüsü ortak komponenttendir (`OperationsSectionHeader` + zil), gövdeyi ekranın kendisi
  çizer. Dört bölümün dördü de artık kendi gövdesini çiziyor; ortak `OperationsSectionScreen`
  tüketicisiz kaldığı için SÖKÜLDÜ (ölü kod bırakılmaz — CLAUDE §2).
*/
export default function ManagementRoute() {
  return <ManagementHubScreen />;
}
