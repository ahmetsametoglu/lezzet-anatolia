/** Kasa kuyruğunda duran satırın sebebi, operatörün diliyle; ayar kartı ve sipariş detayı aynı cümleyi kursun diye tek yerde. */
const BLOCK_REASON_LABEL: Record<string, string> = {
  unknown_method: 'yöntemi bilinmeyen tahsilat',
  refund_before_sale: 'satıştan önce iade',
  no_lines: 'ücretlenen kalem yok',
  gift_order_money: 'hediye siparişe para yazılmış',
  no_store: 'deponun kasa eşlemesi yok',
  changed_after_write: 'kasaya yazıldıktan sonra değişen hareket',
};

/** `last_error` `blocked:<sebep>` biçimindeyse sebebin etiketi, değilse `null` (satır durmamış, hata almış). */
export function blockReasonOf(lastError: string | null): string | null {
  if (!lastError?.startsWith('blocked:')) return null;
  const reason = lastError.slice('blocked:'.length);
  return BLOCK_REASON_LABEL[reason] ?? reason;
}
