/** Basılmış ama henüz sonucu görülmemiş bağlama: kodun bitişi ve basıldığı andaki numara listesi (`null` bilinmiyordu demek). */
export interface PendingWhatsappLink {
  expiresAt: number;
  startedWith: string | null;
}

/** Numara listesinin karşılaştırılabilir hâli. */
export function whatsappNumbersKey(numbers: readonly string[]): string {
  return numbers.join('|');
}

/**
 * Müşteri uygulamaya ya da sekmeye döndüğünde bağın yeniden okunup okunmayacağı. Kodun ömrü bitmişse ya da liste basıldığı andan
 * beri değiştiyse sonuç zaten belli olduğu için okunmaz; böylece dönüşler sunucuya boşuna gitmez.
 */
export function whatsappRecheckDue(pending: PendingWhatsappLink | null, currentKey: string | null, now: number): boolean {
  if (pending === null || now > pending.expiresAt) return false;
  return pending.startedWith === null || currentKey === pending.startedWith;
}
