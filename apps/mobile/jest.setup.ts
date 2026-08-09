// Unistyles Jest mock'ları + tema kaydı (unistyl.es/v3/start/testing).
// Mock'lar ekran/pixel-ratio VERMEZ: komponent testleri davranış + erişilebilirlik assert eder,
// renk/piksel doğrulaması tasarım incelemesinin ve E2E hattının işidir (01-teknoloji-secimi §11).
import 'react-native-unistyles/mocks';
import './src/theme/unistyles';

/*
  HAREKET & ANİMASYON MOCK'LARI (09.08) — yüzen sayfa Reanimated'e taşındığından beri gerekli.

  NEDEN: Reanimated 4'ün çekirdeği `react-native-worklets` modüllerini `*.native.ts` uzantısıyla
  ayırıyor ve o dal yerel köprüyü arıyor; testte köprü YOK, suite daha açılırken düşüyordu
  ("Cannot read properties of undefined (reading 'loadUnpackers')" — ölçüldü, çekmeceyi kullanan
  üç dosya). İki paketin de KENDİ resmî mock'u var, elle taklit yazılmadı.

  ÇÖZÜCÜ DEĞİL MOCK: `react-native-worklets/jest/resolver` de bu işi yapıyor ama Jest'in tek bir
  `resolver` yuvası var ve orayı doldurmak `jest-expo`nun KENDİ çözücüsünü eziyor — ölçüldü
  (09.08): platform uzantıları çözülemez oldu ve `expo-blur` gibi yerel modüller "are you sure
  you've linked all the native dependencies" diye 19 paketi birden düşürdü. Mock yolu yalnız bu
  iki paketi değiştirir, çözümlemeye hiç dokunmaz.
*/
import 'react-native-gesture-handler/jestSetup';

/* SIRA ÖNEMLİ: önce ÇEKİRDEK sahtelenir, sonra Reanimated. `react-native-reanimated/mock`
   kendi içinde gerçek `index`i çekiyor ve o da worklets'in yerel dalına iniyor — çekirdek
   sahtelenmemişse mock'un kendisi patlıyor (ölçüldü 09.08). İkisi de paketlerin KENDİ
   mock'ları; elle taklit yazılmadı. */
jest.mock('react-native-worklets', () => require('react-native-worklets/lib/module/mock'));
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
