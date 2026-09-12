import 'server-only';
import { requestTicketUploadUrl as requestTicketUploadUrlGate } from '@lezzet/application';
import { serviceDb } from '@lezzet/database';

/**
 * Şikâyet fotoğrafının yükleme kapısı (16.2) — artık KÖPRÜ (21.309).
 *
 * Kural `@lezzet/application`a terfi etti (`ticket/attachments.ts`, gerekçelerin tamamı orada):
 * native uygulama aynı kapıdan geçiyor ve iki kopya bir gün ayrışırdı. İmza web çağıranları için
 * değişmedi; dönüşe eklenen `contentType` burada kullanılmıyor — tarayıcı dosyanın türünü zaten
 * biliyor.
 */
export function requestTicketUploadUrl(
  input: Parameters<typeof requestTicketUploadUrlGate>[1],
): ReturnType<typeof requestTicketUploadUrlGate> {
  return requestTicketUploadUrlGate(serviceDb(), input);
}
