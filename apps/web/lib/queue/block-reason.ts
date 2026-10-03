/** Kuyruk satırı `blocked:<sebep>` ile durur; sebebin kodu, satır durmamışsa (hata almış ya da sırada) `null`. */
export function queueBlockReason(lastError: string | null): string | null {
  return lastError?.startsWith('blocked:') ? lastError.slice('blocked:'.length) : null;
}
