/**
 * Server Action hata normalizasyonu + sonuç sözleşmesi (referans deseni). Action'lar throw ETMEZ;
 * `{ data, error }` döner — UI hatayı bilinçli gösterir. `getErrorMessage` bilinen Error mesajını,
 * aksi halde genel metni verir (iç detay sızmaz).
 */
export function getErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Beklenmeyen bir hata oluştu.';
}

export type ActionResult<T = null> = { data: T | null; error: string | null };
