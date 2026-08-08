import 'server-only';
export { readExpiryThresholds, toBatchViews } from '@lezzet/application';
export type { BatchView } from '@lezzet/application';

/**
 * **Geçiş köprüsü** (06.13 terfisi, 08.08) — gövde `@lezzet/application/warehouse/batch-view`e taşındı.
 *
 * Taşınma sebebi: dosya `server-only` idi ve yakın-SKT kararının tek adresiydi; `apps/mobile-api`
 * import edemediği için mobil D3 ekranı açılamıyordu. Kopyalamak yasak — aynı eşik iki yerde
 * yaşarsa bir gün ayrışır ve iki yüzey aynı parti için farklı karar gösterir ("stokta imhalık
 * görünen parti, fiyatlarda hâlâ teklife açık").
 *
 * Köprü NİYE DURUYOR: bugün beş operasyon ekranı bu yoldan okuyor; hepsini aynı turda çevirmek
 * terfiyi büyütür ve taşımanın kendisini doğrulanamaz kılardı. **Silinmesi depo benimsemesiyle
 * (10.7).** `server-only` burada kalıyor — sınır web tarafında korunuyor, pakette değil.
 */
