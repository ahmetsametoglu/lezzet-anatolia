// Babel — Metro (uygulama) ve jest-expo (test) aynı config'i okur.
// `.cjs` uzantısı bilinçli: paket ESM değil, kök ESLint flat config de `**/*.cjs`'i denetlemez.
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Unistyles 3 plugin'i yalnız `root` altındaki dosyaları işler; test ortamında
      // (NODE_ENV=test) kendini otomatik kapatır — unistyl.es/v3/start/testing.
      ['react-native-unistyles/plugin', { root: 'src' }],
    ],
  };
};
