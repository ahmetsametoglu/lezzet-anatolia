import { WarehouseHubScreen } from '@/screens/warehouse/warehouse-hub-screen';

/*
  Depo bölümünün kökü — gövdesi geldi (21.11c) ve kurye kökünün açtığı yolu izliyor: başlık üçlüsü
  ortak komponenttendir (`OperationsSectionHeader` + zil), gövdeyi ekranın kendisi çizer. Yönetim ve
  Para hâlâ ortak `OperationsSectionScreen`den çiziliyor.
*/
export default function WarehouseRoute() {
  return <WarehouseHubScreen />;
}
