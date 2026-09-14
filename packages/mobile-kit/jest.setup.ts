// ORTAK JEST KURULUMU (21.310) — kitin kendi testleri ve native uygulamalar bu dosyayı `setupFiles`in
// BAŞINDA okur (`jest-base.cjs`). Uygulamaya özgü yerel modül sahteleri (müşteride ödeme ve görsel seçici,
// operasyonda ses ve kamera) uygulamanın kendi `jest.setup.ts`inde ve bundan SONRA koşar.

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

/* ÇEKMECE (01.09) — paketin KENDİ mock'u kullanılmıyor, gerekçesi ikizin künyesinde: resmî mock
   çocukları her zaman çiziyor ve "kapalıyken görünmez" güvencesini sessizce yok ediyor. */
jest.mock('@gorhom/bottom-sheet', () => require('./src/testing/gorhom-bottom-sheet.mock'));
/* eslint-enable @typescript-eslint/no-require-imports */

/* DOKUNMA ERTELEMESİ TESTTE EŞZAMANLI (21.219 · ölçüldü 03.09). Kitin `onPress`i cihazda bir kare
   erteleniyor ve o erteleme Fabric'in "child already has a parent" çökmesini kesiyor — gerekçesi
   `src/lib/interaction/defer-press.ts` künyesinde. Testin konusu Fabric zamanlaması DEĞİL: erteleme
   çıplak bırakılınca `fireEvent.press` sonrası eşzamanlı bekleyen 251 test kırılıyordu (ölçüldü);
   sahteyle 1276/1276 geçiyor. Sahtelenebilir bir yüzey olsun diye modül ayrı yazıldı — çıplak bir
   `requestAnimationFrame` çağrısı burada tutulamazdı. Jest yolu gerçek yola çözdüğü için bu sahte,
   modülü paket yoluyla okuyan uygulama dosyalarında da geçerli. */
jest.mock('./src/lib/interaction/defer-press', () => ({ deferPress: (handler: () => void) => handler() }));
