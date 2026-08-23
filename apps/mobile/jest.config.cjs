// jest-expo — Expo'nun resmî birim/komponent test hattı (docs.expo.dev/develop/unit-testing).
// Monorepo'nun Vitest koşucusuna KARIŞMAZ: bu paket DB'siz saf Jest'tir (CLAUDE §4b kapsamı dışı).
//
// setupFiles preset'inkilerin SONUNA eklenir (Jest, preset setupFiles'ını config'le birleştirir);
// transformIgnorePatterns ise preset'i EZER — o yüzden jest-expo 57'nin pnpm-uyumlu kalıbı burada
// @lezzet workspace paketleri eklenerek aynen yazılıdır (sessiz bir ignore, testte
// "unexpected token" olarak patlar).
module.exports = {
  preset: 'jest-expo',
  setupFiles: ['<rootDir>/jest.setup.ts'],
  // Jest'in 5000 ms varsayılanı Node birim testine göre ölçülmüş; ağır bir RN EKRANININ ilk
  // render'ına yetmiyor. Ölçüldü 23.08: `picking-box.test.tsx`in ilk testi boş makinede 344 ms,
  // ötekiler 5–26 ms — yani test yavaş DEĞİL. Ama 87 test süreci soğuk önbellekle koşarken
  // `typecheck`in 19 paketiyle aynı işlemciyi paylaşınca o 344 ms 5000'i aştı ve dosya kırmızıya
  // döndü (yeniden üretildi). Tuzak o dosyaya özel değil: her ağır ekran dosyasının İLK testi
  // modül grafiğinin ısınmasını tek başına ödüyor. Sınır kaldırılmadı, ölçüye göre kondu —
  // 15 sn, ölçülen sürenin ~44 katı: gerçek bir yavaşlama regresyonunu hâlâ kırmızıya çevirir.
  testTimeout: 15_000,
  transformIgnorePatterns: [
    '/node_modules/(?!(.pnpm|@lezzet|react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@sentry/react-native|native-base|standard-navigation))',
    '/node_modules/react-native-reanimated/plugin/',
    '/node_modules/@react-native/babel-preset/',
  ],
};
