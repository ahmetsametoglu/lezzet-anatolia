/**
 * **Geçiş köprüsü** (06.13 terfisi) — tip `@lezzet/application`a taşındı.
 *
 * Ayrı dosya olarak DURUYOR ve sebebi değişmedi: türetme sunucu tarafıdır, ama tipi istemci
 * komponentleri de görüyor (teklif diyaloğu, kartlar). Tek dosyada dursaydı istemci sunucu
 * modülünü sürüklerdi — bu yüzden köprünün de ikiye ayrılması şart, `batch-view` köprüsü
 * `server-only`.
 *
 * Silinmesi depo benimsemesiyle (10.7).
 */
export type { BatchView } from '@lezzet/application';
