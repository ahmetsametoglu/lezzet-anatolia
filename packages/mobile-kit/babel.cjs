// BABEL TARİFİ — iki native uygulama ve kitin kendi testleri AYNI dosyayı okur (21.310; CLAUDE §1:
// duplication yok). Metro (uygulama) ve jest-expo (test) aynı ayarı kullanır.
// `.cjs` uzantısı bilinçli: paket ESM değil, kök ESLint flat config de `**/*.cjs`'i denetlemez.
//
// UNISTYLES EKLENTİSİ — iki seçenek, ikisi de ölçülmüş davranışa göre:
// · `root: 'src'` — eklenti `<babel kökü>/src` altındaki HER dosyayı işler: RN bileşen importlarını
//   (View, Text, ScrollView…) Unistyles'ın izlenen bileşenleriyle değiştirir. Kökün dışındaki bir
//   dosyayı ise YALNIZ `react-native-unistyles` import ediyorsa işler (eklenti kaynağı,
//   `forceProcessing` · `hasUnistylesImport`). Test ortamında (NODE_ENV=test) kendini kapatır —
//   unistyl.es/v3/start/testing.
// · `autoProcessPaths: ['mobile-kit/src']` — kit dosyaları uygulamanın `src`inin DIŞINDA. Stil
//   prop'unu dışarıdan alıp RN bileşenine geçiren bir kit bileşeni bu seçenek olmadan işlenmez ve
//   tema/yazı ölçeği değişiminde yeniden çizilmezdi; uygulamanın içindeyken işleniyordu. Kalıp
//   paket adıyla yazıldı ki hem gerçek yolu (`packages/mobile-kit/src/…`) hem bağ yolunu
//   (`node_modules/@lezzet/mobile-kit/src/…`) yakalasın — eklenti `filename.includes` ile eşler.
module.exports = function mobileBabelConfig(api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [['react-native-unistyles/plugin', { root: 'src', autoProcessPaths: ['mobile-kit/src'] }]],
  };
};
