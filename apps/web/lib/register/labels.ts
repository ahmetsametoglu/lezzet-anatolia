import { registerBlockReasonLabel } from '@lezzet/i18n';

/** `last_error` `blocked:<sebep>` biçimindeyse sebebin etiketi, değilse `null` (satır durmamış, hata almış). */
export function blockReasonOf(lastError: string | null): string | null {
  if (!lastError?.startsWith('blocked:')) return null;
  return registerBlockReasonLabel(lastError.slice('blocked:'.length));
}
