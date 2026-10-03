import { registerBlockReasonLabel } from '@lezzet/i18n';
import { queueBlockReason } from '@/lib/queue/block-reason';

/** `last_error` `blocked:<sebep>` biçimindeyse sebebin etiketi, değilse `null` (satır durmamış, hata almış). */
export function blockReasonOf(lastError: string | null): string | null {
  const reason = queueBlockReason(lastError);
  return reason ? registerBlockReasonLabel(reason) : null;
}
