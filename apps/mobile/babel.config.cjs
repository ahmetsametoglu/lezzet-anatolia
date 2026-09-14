// Babel — tarif kitte tek yerde (`@lezzet/mobile-kit/babel.cjs`, 21.310): native uygulamalar ve
// kitin kendi testleri aynı ayarı okur; Unistyles seçeneklerinin gerekçesi orada.
//
// SARMALAYICI FONKSİYON BİLİNÇLİ — `module.exports = require(…)` diye sadeleştirmeyin. knip, yalnız
// bir paketi yeniden dışa aktaran ayar dosyasını HİÇ YÜKLEMİYOR (`isExternalReExportsOnly`); preset'i
// göremeyince `babel-preset-expo`yu "kullanılmayan bağımlılık" diye raporluyordu (ölçüldü 14.09).
const mobileBabelConfig = require('@lezzet/mobile-kit/babel.cjs');

module.exports = (api) => mobileBabelConfig(api);
