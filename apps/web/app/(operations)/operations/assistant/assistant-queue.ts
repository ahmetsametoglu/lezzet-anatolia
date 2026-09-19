import type { KindFilter } from './assistant-url';

/**
 * Kuyruğun GÖRÜNEN sırası ve o sıradaki bir sonraki öneri.
 *
 * İkisi de saf hesap ve bilinçli olarak öyle: karar verildikten sonra hangi önerinin açılacağı bir
 * sunucu sorusu değil, EKRANDA DURAN sıranın sorusu — operatör neyi görüyorsa onun ardındakine
 * geçer. Sunucuya sorulsaydı cevap süzgeci bilmez, kuyruğun tamamından bir satır verirdi.
 */

/** Tip süzgecinden geçen satırlar; süzgeç boşsa liste olduğu gibi döner. */
export function visibleRowsOf<T extends { kind: string }>(rows: readonly T[], kind: KindFilter): readonly T[] {
  return kind ? rows.filter((row) => row.kind === kind) : rows;
}

/**
 * Bir önerinin ARDINDAKİ önerinin kimliği; yoksa boş dize — yani adreste seçim kalmaz ve diyalog
 * kapanır.
 *
 * **Liste sonunda DURUR, başa dönmez:** "sonra bak" denen öneri kuyrukta kalıyor ve döngü kurulsaydı
 * operatör az önce atladığı öneriye aynı turda geri getirilirdi — kuyrukta ilerlediğini sanırken.
 *
 * Kimlik listede yoksa geçilecek yer de yok: öneri süzgecin dışında ya da başka bir sekmede.
 */
export function nextProposalId(visible: readonly { id: string }[], currentId: string): string {
  const at = visible.findIndex((row) => row.id === currentId);
  if (at < 0) return '';
  return visible[at + 1]?.id ?? '';
}
