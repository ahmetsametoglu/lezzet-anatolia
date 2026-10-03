/**
 * Muhasebe belgesi olarak kabul edilen dosya türleri: belge bir kanıttır, ofis dosyası ya da arşiv kabul edilmez. İçerik türü
 * burada türetilir, çünkü imzalı yükleme adresi onu bağlar ve istemci aynı eşlemeyi ikinci kez yazmamalı.
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
