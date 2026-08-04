import {
  B2bApplicationResultEmail,
  FeedbackInviteEmail,
  OrderCancelledEmail,
  OrderConfirmedEmail,
  OrderDeliveredEmail,
  OrderOutForDeliveryEmail,
  OrderRefundedEmail,
  OrderShortfallEmail,
  TicketReceivedEmail,
  TicketRepliedEmail,
  TicketStatusChangedEmail,
  ZoneAvailableEmail,
  b2bApplicationResultSubject,
  feedbackInviteSubject,
  orderCancelledSubject,
  orderConfirmedSubject,
  orderDeliveredSubject,
  orderOutForDeliverySubject,
  orderRefundedSubject,
  orderShortfallSubject,
  sendEmail,
  ticketReceivedSubject,
  ticketRepliedSubject,
  ticketStatusChangedSubject,
  zoneAvailableSubject,
} from '@lezzet/email';
import type { ReactElement } from 'react';
import type { NotifyDriver, NotifyEventName, NotifyPayloads, NotifyRecipient, NotifyResult } from '../types';

/**
 * E-posta sürücüsü (14.4) — olayı şablona bağlar ve `@lezzet/email` ile gönderir.
 *
 * Olay → şablon eşlemesi TEK yerde durur. Çağıran hangi şablonun kullanılacağını bilmez; yarın
 * "onay" maili değişse bu tablo değişir, iş kodu değişmez.
 */

interface EmailDriverOptions {
  brandName: string;
  /** Alt bilgideki yasal adres satırı. */
  postalAddress: string;
}

/**
 * Şablon olayın KENDİ verisine bağlıdır (`NotifyPayloads[E]`), ortak bir "bildirim" tipine değil.
 * Tek tipe bağlansaydı talep şablonu sipariş alanlarını da görür ve derleyici yanlış alanı okumayı
 * yakalayamazdı.
 */
interface Template<E extends NotifyEventName> {
  subject: (data: NotifyPayloads[E]) => string;
  render: (props: { data: NotifyPayloads[E]; brandName: string; postalAddress: string }) => ReactElement;
}

const TEMPLATES: { [E in NotifyEventName]: Template<E> } = {
  order_confirmed: { subject: orderConfirmedSubject, render: OrderConfirmedEmail },
  order_out_for_delivery: { subject: orderOutForDeliverySubject, render: OrderOutForDeliveryEmail },
  order_delivered: { subject: orderDeliveredSubject, render: OrderDeliveredEmail },
  order_cancelled: { subject: orderCancelledSubject, render: OrderCancelledEmail },
  order_shortfall: { subject: orderShortfallSubject, render: OrderShortfallEmail },
  order_refunded: { subject: orderRefundedSubject, render: OrderRefundedEmail },
  ticket_received: { subject: ticketReceivedSubject, render: TicketReceivedEmail },
  ticket_replied: { subject: ticketRepliedSubject, render: TicketRepliedEmail },
  ticket_status_changed: { subject: ticketStatusChangedSubject, render: TicketStatusChangedEmail },
  feedback_invite: { subject: feedbackInviteSubject, render: FeedbackInviteEmail },
  zone_available: { subject: zoneAvailableSubject, render: ZoneAvailableEmail },
  b2b_application_result: { subject: b2bApplicationResultSubject, render: B2bApplicationResultEmail },
};

export function emailDriver(options: EmailDriverOptions): NotifyDriver {
  return {
    channel: 'email',

    // Yetenek bakması: adresi olana gider. İzin kontrolü BURADA DEĞİL — bunlar işlemsel
    // bildirimlerdir, pazarlama iznine bağlı değildir (tasarım + DOMAIN §11).
    supports(event, recipient) {
      return Boolean(recipient.email) && event in TEMPLATES;
    },

    async send<E extends NotifyEventName>(event: E, recipient: NotifyRecipient, payload: NotifyPayloads[E]): Promise<NotifyResult> {
      if (!recipient.email) return { status: 'skipped', channel: 'email', reason: 'no_email' };

      const template: Template<E> = TEMPLATES[event];
      const result = await sendEmail({
        to: recipient.email,
        subject: template.subject(payload),
        react: template.render({ data: payload, brandName: options.brandName, postalAddress: options.postalAddress }),
      });

      if (result.error) return { status: 'error', channel: 'email', error: result.error };
      // `sendEmail` anahtar yokken sessizce atlar (`{data:null,error:null}`) — bunu "gitti"den
      // ayırmak şart: yerelde gönderilmemiş mail başarılı görünmemeli.
      if (!result.data) return { status: 'skipped', channel: 'email', reason: 'provider_key_absent' };
      return { status: 'sent', channel: 'email', ref: result.data.id };
    },
  };
}
