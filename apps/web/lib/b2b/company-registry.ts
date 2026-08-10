import 'server-only';

/**
 * **KÖPRÜ (21.31)** — gövde `@lezzet/application/b2b/company-registry`e taşındı.
 *
 * Taşımanın gerekçesi orada: ikinci yüzey doğdu (mobil başvuru formunun "Bul" düğmesi) ve
 * `apps/mobile-api` bu klasörü import edemez. Bu dosya duruyor ki webin çağrı yerleri (server
 * action + başvuru yazımı) değişmesin; benimseme — yani import'ların doğrudan pakete çevrilmesi —
 * web şeridinin işi (katalog/adres/sipariş terfilerinin aynı deseni).
 *
 * `server-only` BURADA KALIYOR, pakette değil: kapı Next tarafında hâlâ yalnız sunucuya aittir
 * (dış servise anahtarsız da olsa istemciden gidilmez), ama paketin kendisi iki taşımayı besliyor.
 */
export { lookupCompanyBySiret } from '@lezzet/application';
export type { CompanyLookupFailure, CompanyRegistryRecord } from '@lezzet/application';
