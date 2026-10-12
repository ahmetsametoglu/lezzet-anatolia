import { sendCloudApiMessage, type CloudApiMessage } from '../whatsapp/cloud-api';
import type { NotifyDriver, NotifyPayloads, NotifyRecipient, NotifyResult } from '../types';

/**
 * WhatsApp Business API sürücüsü; şimdilik yalnız kapı kodunu taşır, öteki sipariş şablonları ücret çalışmasından sonra açılır
 * (`docs/feature/whatsapp-bildirimleri.md`). Yapılandırılmamışsa hiçbir olayı üstlenmez ve kod e-postaya düşer.
 */

export interface WhatsappApiDriverOptions {
  /** Sistem kullanıcısı jetonu ve gönderen numaranın Meta kimliği; ikisi de çağırandan gelir, çünkü paket env okumaz. */
  token: string | null;
  phoneNumberId: string | null;
  fetchImpl?: typeof fetch;
}

/** Kapı kodunun authentication şablonu; Meta'da tr, fr ve de dilleriyle açılır. */
const DOOR_CODE_TEMPLATE = 'delivery_code';

const UNCONFIGURED: WhatsappApiDriverOptions = { token: null, phoneNumberId: null };

export function whatsappApiDriver(options: WhatsappApiDriverOptions = UNCONFIGURED): NotifyDriver {
  return {
    channel: 'whatsapp_api',
    supports(event, recipient) {
      return event === 'order_out_for_delivery' && Boolean(recipient.whatsapp && options.token && options.phoneNumberId);
    },
    async send(event, recipient, payload): Promise<NotifyResult> {
      if (!options.token || !options.phoneNumberId || !recipient.whatsapp) return skipped('not_configured');
      if (event !== 'order_out_for_delivery') return skipped('unsupported_event');
      // "Yolda" haberinin kendisi bu kanaldan gitmez; utility şablonu kodu taşıyamadığı için kod ayrı mesajdır.
      const code = (payload as NotifyPayloads['order_out_for_delivery']).deliveryCode;
      if (!code) return skipped('no_door_code');
      const result = await sendCloudApiMessage(
        { token: options.token, fetchImpl: options.fetchImpl },
        doorCodeMessage(options.phoneNumberId, recipient.whatsapp, recipient.locale, code),
      );
      return result.ok
        ? { status: 'sent', channel: 'whatsapp_api', ref: result.messageId }
        : { status: 'error', channel: 'whatsapp_api', error: result.reason };
    },
  };
}

function skipped(reason: string): NotifyResult {
  return { status: 'skipped', channel: 'whatsapp_api', reason };
}

/** Authentication şablonunda kod iki yere gider, gövdeye ve "kopyala" düğmesine; Meta ikisini de ister. */
function doorCodeMessage(phoneNumberId: string, to: string, locale: NotifyRecipient['locale'], code: string): CloudApiMessage {
  return {
    accountRef: phoneNumberId,
    to,
    channel: 'whatsapp',
    text: null,
    templateName: DOOR_CODE_TEMPLATE,
    templateLanguage: locale,
    templateComponents: [
      { type: 'body', parameters: [{ type: 'text', text: code }] },
      { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: code }] },
    ],
  };
}
