/**
 * Muhasebe belgesi olarak kabul edilen dosya türleri (12.12) — DOMAIN §9.
 *
 * Fatura çoğu zaman PDF gelir, fiş ve bordro fotoğraflanır; ofis dosyası ya da arşiv kabul
 * edilmez — belge bir KANITTIR, düzenlenebilir bir taslak değil. Kural motorda, çünkü "neyi belge
 * sayarız" bir iş kararıdır, depo ayarı değil (talep eklerinin `checkAttachment` deseni).
 *
 * İçerik türü BURADA türetilir: imzalı yükleme adresi içerik türünü bağlar (uyuşmayan yükleme R2'de
 * reddedilir) ve istemcinin aynı eşlemeyi ikinci kez yazması gerekmez (CLAUDE §1).
 */

const CONTENT_TYPE_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
};

export const ALLOWED_DOCUMENT_EXTENSIONS: readonly string[] = Object.keys(CONTENT_TYPE_BY_EXTENSION);

export type DocumentFileCheck = { ok: true; extension: string; contentType: string } | { ok: false; reason: 'unsupported_type' };

export function checkDocumentFile(filename: string): DocumentFileCheck {
  const extension = filename.split('.').pop()?.toLowerCase() ?? '';
  const contentType = CONTENT_TYPE_BY_EXTENSION[extension];
  if (!contentType) return { ok: false, reason: 'unsupported_type' };
  return { ok: true, extension, contentType };
}
