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
  transformIgnorePatterns: [
    '/node_modules/(?!(.pnpm|@lezzet|react-native|@react-native|@react-native-community|expo|@expo|@expo-google-fonts|react-navigation|@react-navigation|@sentry/react-native|native-base|standard-navigation))',
    '/node_modules/react-native-reanimated/plugin/',
    '/node_modules/@react-native/babel-preset/',
  ],
};
