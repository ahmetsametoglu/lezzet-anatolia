/** Basılmış ama henüz sonucu görülmemiş bağlama: kodun bitişi ve basıldığı andaki bağ anahtarı (`null` bilinmiyordu demek). */
export interface PendingChannelLink {
  expiresAt: number;
  startedWith: string | null;
}

/** Kanal satırlarının karşılaştırılabilir hâli; herhangi bir kanalın bağı ya da numarası değişince anahtar da değişir. */
export function linkedChannelsKey(channels: readonly { source: string; linked: boolean; numbers: readonly string[] }[]): string {
  return channels.map((channel) => `${channel.source}:${channel.linked ? 1 : 0}:${channel.numbers.join(',')}`).join('|');
}

/**
 * Müşteri uygulamaya ya da sekmeye döndüğünde bağın yeniden okunup okunmayacağı. Kodun ömrü bitmişse ya da bağ basıldığı andan
 * beri değiştiyse sonuç zaten belli olduğu için okunmaz; böylece dönüşler sunucuya boşuna gitmez.
 */
export function channelLinkRecheckDue(pending: PendingChannelLink | null, currentKey: string | null, now: number): boolean {
  if (pending === null || now > pending.expiresAt) return false;
  return pending.startedWith === null || currentKey === pending.startedWith;
}
