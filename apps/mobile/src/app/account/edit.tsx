import { ProfileEditScreen } from '@/screens/account/profile-edit-screen';

/*
  PROFİLİ DÜZENLE — sekme kabuğunun DIŞINDA (kök yığın): yığına girildiğinde sekme çubuğu gizlenir
  ve geri tuşu hesap sekmesine döner. Rota dosyası İNCE (kataloğun gerekçesi): ekranın parçaları
  `src/screens/account/`ta.
*/
export default function ProfileEditRoute() {
  return <ProfileEditScreen />;
}
