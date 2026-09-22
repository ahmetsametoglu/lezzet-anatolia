import { z } from 'zod';
import { ConversationSourceEnum } from '../primitives/enums.schema';

/** Hesabın bir sohbet kanalı: bağlı mı, ilk bağlanma anı (`null` = sohbet yok) ve WhatsApp'ta doğrulanmış numaralar. */
export const MeLinkedChannelSchema = z.object({
  source: ConversationSourceEnum,
  linked: z.boolean(),
  since: z.string().nullable(),
  numbers: z.array(z.string()),
});
export type MeLinkedChannel = z.infer<typeof MeLinkedChannelSchema>;

/** `GET /me/channels`: her kanal sabit sırada tek satır, bağlı olmasa da. */
export const MeChannelsSchema = z.object({ channels: z.array(MeLinkedChannelSchema) });

/**
 * `POST /me/channels/code`: bağlama kodu. İstemci kodu mesaja ekler (WhatsApp'ta hazır mesaja, öteki kanallarda panoya); kod
 * `expiresAt`e kadar ve tek kez geçerli, bu yüzden istemci dönüşte bağı yalnız bu süre içinde yeniden okur.
 */
export const MeChannelLinkCodeSchema = z.object({ code: z.string(), expiresAt: z.string() });
