/**
 * Talebin ekrandaki adı: tür · konu. Konu boş olabilir (müşteri başlık değil anlatım yazar); o zaman "Soru ·" gibi asılı bir ayraç
 * bırakılmaz.
 */
export function ticketTitle(typeLabel: string, subject: string | null, template: string): string {
  const trimmed = subject?.trim();
  return trimmed ? template.replace('{type}', typeLabel).replace('{subject}', trimmed) : typeLabel;
}

/** Talebin bağlamı: siparişin numarası ya da genel talep. */
export function ticketScope(orderReference: string | null, orderTemplate: string, generalLabel: string): string {
  return orderReference === null ? generalLabel : orderTemplate.replace('{reference}', orderReference);
}

/**
 * Liste kartının alt satırı: kapsam · açılış · son mesaj. Liste son mesaja göre sıralı olduğu için ölçüt görünür; çözülmüş talepte
 * son mesaj bir davet değil kayıt olduğundan yazılmaz.
 */
export function ticketMeta(
  ticket: { status: string; createdAt: string; lastMessageAt: string },
  scope: string,
  lastMessageTemplate: string,
  dateOf: (iso: string) => string,
): string {
  const parts = [scope, dateOf(ticket.createdAt)];
  if (ticket.status !== 'resolved') parts.push(lastMessageTemplate.replace('{date}', dateOf(ticket.lastMessageAt)));
  return parts.join(' · ');
}
