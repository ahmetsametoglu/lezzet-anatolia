import { doorCodeVia } from '@lezzet/domain-core';
import { DEVICE_CHANNELS, type NotifyChannel, type NotifyResult } from '@lezzet/notify';
import type { DoorCodeVia, OrderNotification } from '@lezzet/types';

/** Tek gönderim: hangi kanallar, hangi veri ve uygulama içi satır yazılsın mı; çağıran dağıtım kapısına bağlar. */
export type DoorCodeNoticeSend = (input: {
  channels: readonly NotifyChannel[];
  data: OrderNotification;
  inApp: boolean;
}) => Promise<NotifyResult[]>;

/**
 * Kodlu "yolda": cihaz bildirimi ve uygulama içi satır kodsuz gider, kod tek yazılı mesajla. WhatsApp'ı olan müşteriye önce WhatsApp,
 * gitmezse e-posta denenir, çünkü şablon onayı ya da ayar eksikliği kodu müşteriden esirgememeli.
 */
export async function sendDoorCodeNotice(
  input: { data: OrderNotification; code: string; reach: { whatsapp: boolean; email: boolean } },
  send: DoorCodeNoticeSend,
): Promise<{ results: NotifyResult[]; sentVia: DoorCodeVia | null }> {
  const results = [...(await send({ channels: DEVICE_CHANNELS, data: input.data, inApp: true }))];
  // Olay zaten işlendiyse kod da gitmiştir; ikinci kez gönderilmez.
  if (results.some((result) => result.status === 'skipped' && result.reason === 'duplicate')) return { results, sentVia: null };

  const first = doorCodeVia(input.reach);
  const tries: DoorCodeVia[] = first === 'whatsapp' && input.reach.email ? ['whatsapp', 'email'] : first ? [first] : [];
  for (const via of tries) {
    const sent = await send({
      channels: [via === 'whatsapp' ? 'whatsapp_api' : 'email'],
      data: { ...input.data, deliveryCode: input.code },
      inApp: false,
    });
    results.push(...sent);
    if (sent.some((result) => result.status === 'sent')) return { results, sentVia: via };
  }
  return { results, sentVia: null };
}
