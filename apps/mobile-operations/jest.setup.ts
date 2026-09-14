// OPERASYON UYGULAMASININ JEST KURULUMU — ortak kurulum (Unistyles + tema, hareket, çekmece, dokunma
// ertelemesi) kitte ve ÖNCE o koşar (`@lezzet/mobile-kit/jest-base.cjs` → `setupFiles`, 21.310). Burada yalnız
// bu uygulamanın yerel modül sahteleri: ses (sosyal sohbetin sesli mesajı) ve kamera (kod okutma).

/* `require` fabrikada ZORUNLU — gerekçesi kitin `jest.setup.ts` künyesinde (`jest.mock` hoisting). */
/* eslint-disable @typescript-eslint/no-require-imports */
/* SES (21.287) — `expo-audio` yerel bir modül ve paketin kendi mock'u yok; gerekçe ve sahtenin
   şekli `testing/expo-audio.mock.ts` künyesinde. */
jest.mock('expo-audio', () => require('@/testing/expo-audio.mock'));
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
