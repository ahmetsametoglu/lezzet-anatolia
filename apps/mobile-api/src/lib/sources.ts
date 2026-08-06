/**
 * Hata kaynağı sabitleri — `@lezzet/observability`'nin `SOURCES` disipliniyle aynı: serbest metin
 * yerine sabit, çünkü sistem ekranı bu değere göre süzüyor ve elle yazılan iki yazım iki ayrı
 * kaynak gibi görünürdü.
 *
 * Neden YEREL: `SOURCES` mobil kaynakları henüz tanımıyor ve `packages/*` bu şeridin yazı alanı
 * dışında (02-mimari §2 — alt ajan packages'a yazamaz; terfi ihtiyacı yöneticiye raporlandı).
 * Terfi olunca bu dosya silinir, importlar `SOURCES`'a döner.
 */
export const MOBILE_API_SOURCES = {
  /** Mobile-api HTTP isteği (backend'in `backendHttp` karşılığı). */
  http: 'mobile-api-http',
  /** Sürecin kendisi — hiçbir sarmala düşmeyen hata (`unhandledRejection`/`uncaughtException`). */
  process: 'mobile-api-process',
} as const;
