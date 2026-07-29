// Gözlemleme (18.5) — `architecture/OBSERVABILITY.md`.
//
// **SUNUCU TARAFI paket.** `pino` node-only, `@lezzet/database` service-role istemcisi kurar;
// istemci komponentinden import edilirse derleme kırılır. Tarayıcıda `console` kalır.
//
// Neden ayrı paket: iki uygulama (web + backend) aynı logger'ı ve aynı köprüyü kullanıyor. Referans
// projede her ikisi kendi yapılandırmasını kuruyor — bu projede duplication yasak (CLAUDE.md §1).
export { logger } from './logger';
export { captureError, SOURCES, type CaptureContext } from './capture';
