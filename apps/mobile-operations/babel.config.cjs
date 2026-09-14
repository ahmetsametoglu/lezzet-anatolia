// Babel — tarif kitte tek yerde (`@lezzet/mobile-kit/babel.cjs`, 21.310). Sarmalayıcı fonksiyon bilinçli;
// gerekçesi (knip yalnız yeniden-ihraç eden ayar dosyasını yüklemiyor) müşteri uygulamasının aynı dosyasında.
const mobileBabelConfig = require('@lezzet/mobile-kit/babel.cjs');

module.exports = (api) => mobileBabelConfig(api);
