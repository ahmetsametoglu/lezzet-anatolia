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
/* `require` BURADA ZORUNLU, tercih değil: `jest.mock`un fabrikası hoisting yüzünden modül üstü
   `import`ları göremez (ESM bağı fabrika koştuğunda henüz kurulmamıştır) ve Jest'in kendi
   dokümanı da bu iki satırı böyle yazdırıyor. Kural genel olarak doğru, bu iki satırda değil. */
/* eslint-disable @typescript-eslint/no-require-imports */
jest.mock('react-native-worklets', () => require('react-native-worklets/lib/module/mock'));
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));

/* ÖDEME SDK'sı (09.08) — kök `_layout` `PaymentProvider` ile sarmalandığı an her ekran testi yerel
   Stripe modülüne çarpıyor ("TurboModuleRegistry … 'StripeSdk' could not be found", ölçüldü: 18
   paket birden düştü).

   DOĞRU DOSYA `jest/mock.js`, `jest/setup.js` DEĞİL: setup yalnız Onramp modülünü sahteliyor,
   `StripeSdk`'ya hiç dokunmuyor — `setupFiles`a eklemek denendi ve çözmedi. Paketin kendi mock'u;
   elle taklit yazılmadı. */
/* ÇEKMECE (01.09) — paketin KENDİ mock'u kullanılmıyor, gerekçesi ikizin künyesinde: resmî mock
   çocukları her zaman çiziyor ve "kapalıyken görünmez" güvencesini sessizce yok ediyor. */
jest.mock('@gorhom/bottom-sheet', () => require('@/testing/gorhom-bottom-sheet.mock'));

jest.mock('@stripe/stripe-react-native', () => require('@stripe/stripe-react-native/jest/mock.js'));
/* eslint-enable @typescript-eslint/no-require-imports */

/* KAMERA (Modül 23) — paketin hazır jest mock'u YOK (jest-expo da sahtelemiyor; ölçüldü:
   `useCameraPermissions()` undefined dönüyor ve ScanSheet'i içeren her ekran testi düşüyordu).
   Sahtenin şekli gerçek imzanın en küçüğü: izin "verilmedi ve sorulabilir" hâliyle döner —
   test ortamında vizör hiç açılmaz, izin isteği çağrılabilir ama hiçbir yere gitmez. */
jest.mock('expo-camera', () => ({
  CameraView: () => null,
  useCameraPermissions: () => [
    { granted: false, canAskAgain: true, status: 'undetermined' },
    jest.fn().mockResolvedValue({ granted: false, canAskAgain: true, status: 'undetermined' }),
  ],
}));

/* ScanSheet yüklemeden önce native modülü YOKLAR — jest'te native yoktur ve gerçek yoklama kamera
   dalını hiç açtırmazdı; izin akışı test edilemez kalırdı. Sahtelenen şey `expo-modules-core`
   DEĞİL (bir kez denendi ve preset'in öteki native sahtelerini deldi — 7 suite düştü, ölçüldü),
   yalnız bizim tek soruluk yoklama dosyamız: "var" der, üstteki mock'lu JS dalı çalışır. */
jest.mock('@/components/scan/camera-availability', () => ({ hasCameraNativeModule: () => true }));
