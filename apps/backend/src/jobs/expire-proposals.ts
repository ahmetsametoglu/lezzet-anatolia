import { AssistantProposalService, serviceDb } from '@lezzet/database';

/**
 * Süresi geçmiş asistan önerilerini `expired`e çevirir (22.3).
 *
 * **Tarama işidir, olay değil** (`zone_available` cron'unun dersi): öneriyi üreten tarafın bir
 * zamanlayıcı kurması gerekseydi, süreç ölünce satır sonsuza dek "bekliyor" görünürdü. Tarama
 * kendini onarır — hangi yolla yazıldığı önemsiz.
 *
 * Kuyruk okuması zaten süresi geçmişleri düşürüyor (`listPending`), yani bu iş görüntüyü DEĞİL
 * kaydı düzeltir: patron geçmişe baktığında "süresi doldu" ile "reddettim" ayrı görünmeli.
 */
export const EXPIRE_PROPOSALS = 'expire-assistant-proposals';

export async function expireProposalsJob(): Promise<{ expired: number }> {
  const expired = await new AssistantProposalService(serviceDb()).expireOverdue();
  return { expired };
}
