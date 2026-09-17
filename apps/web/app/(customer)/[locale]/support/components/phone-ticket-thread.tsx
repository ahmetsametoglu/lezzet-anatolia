'use client';

import { useState } from 'react';
import { brand } from '@lezzet/brand';
import { ticketScope } from '@lezzet/helper';
import type { Locale, LocalizedCopy } from '@lezzet/i18n';
import type supportMessages from '@lezzet/i18n/customer/support';
import { Note } from '@/components/customer/phone-kit/note';
import { ChatText } from '@/components/text/chat-text';
import { formatOrderDate, formatPrice } from '@/lib/storefront/format';
import type { CustomerTicketView, TicketMessageView } from '@/lib/ticket/ticket-types';
import type { Messages } from '../support-types';
import { messageStamp } from './ticket-labels';

type SupportCopy = LocalizedCopy<typeof supportMessages>;

/**
 * Talep yazışmasının telefon gövdesi, native detayın ikizi: üstte kapsam ve açılış, varsa iade sonucu, baloncuklar, altta bir kez çeviri
 * ve bildirim notu. Çeviri işareti baloncukta değil burada, çünkü yazışmanın iki yönü de çevrilir ve baloncuk başına işaret gürültü olur.
 */
interface PhoneTicketThreadProps {
  copy: SupportCopy;
  t: Messages;
  locale: Locale;
  ticket: CustomerTicketView;
}

export function PhoneTicketThread({ copy, t, locale, ticket }: PhoneTicketThreadProps) {
  const scope = ticketScope(ticket.order?.referenceNo ?? null, copy.list.orderScope, copy.detail.generalScope);
  // İade ancak ödenmişse söylenir: tetiklenmiş ama ödenmemiş iade gerçek bir ara hâldir.
  const refunded =
    ticket.returnOutcome && ticket.returnOutcome.refundedCents > 0 ? formatPrice(ticket.returnOutcome.refundedCents, locale) : null;

  return (
    <div className="flex flex-col gap-2.5 px-4 py-4.5">
      <span className="font-sans text-micro text-muted">{`${scope} · ${formatOrderDate(ticket.createdAt, locale, true)}`}</span>
      {refunded !== null && (
        <Note tone="olive" description={copy.detail.resolution.replace('{value}', copy.detail.refunded.replace('{amount}', refunded))} />
      )}

      {ticket.messages.map((message) => (
        <PhoneBubble key={message.id} copy={copy} t={t} locale={locale} message={message} />
      ))}

      {/* Çözülmüş talep yazınca kendiliğinden açılır; ayrı bir "yeniden aç" düğmesi yazıp basmayı unutanın mesajını kapalı talepte bırakırdı. */}
      {ticket.status === 'resolved' && <p className="font-sans text-note leading-[1.6] text-muted">{t.reopenNote}</p>}
      {ticket.messages.some((message) => message.bodyTranslated) && (
        <p className="pt-2 text-center font-sans text-micro text-sand-600">{copy.detail.translatedNotice}</p>
      )}
      <p className="pt-2 text-center font-sans text-micro text-sand-600">{copy.detail.notice}</p>
    </div>
  );
}

interface PhoneBubbleProps {
  copy: SupportCopy;
  t: Messages;
  locale: Locale;
  message: TicketMessageView;
}

function PhoneBubble({ copy, t, locale, message }: PhoneBubbleProps) {
  // `ai` gönderici de işletmedir: müşteri kimin değil işletmenin yazdığını görür.
  const mine = message.sender === 'customer';
  const [showingOriginal, setShowingOriginal] = useState(false);
  const shown = message.bodyTranslated && showingOriginal ? message.originalBody : message.body;
  const tone = mine ? 'bg-olive text-card' : 'bg-transparent text-ink';

  return (
    <div className={['flex', mine ? 'justify-end' : 'justify-start'].join(' ')}>
      {/* Tavan %88: kimin yazdığını karşılıklı hizadaki boşluk söyler. */}
      <div className={['flex max-w-[88%] flex-col gap-1.5', mine ? 'items-end' : 'items-start'].join(' ')}>
        <div className={`rounded-control border border-sand-200 px-4 py-3 ${tone}`}>
          {/* Hizalama ve renk yazanı yalnız görene söyler; ekran okuyucu öneki duyar. */}
          <span className="sr-only">{`${mine ? copy.detail.fromCustomer : brand.name}: `}</span>
          {!mine && <span className="block font-sans text-micro font-bold text-olive">{brand.name}</span>}
          <ChatText
            lang={showingOriginal ? (message.language ?? undefined) : locale}
            className="font-sans text-note leading-[1.6]"
            text={shown}
          />
        </div>

        {message.attachmentUrls.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {message.attachmentUrls.map((url) => (
              // Adres R2'nin süreli imzalı adresi; `next/image` önbelleğe alıp süresi dolunca kırık gösterirdi.
              <img
                key={url}
                src={url}
                alt={copy.detail.photo}
                loading="lazy"
                className="size-30 rounded-control bg-sand-250 object-cover"
              />
            ))}
          </div>
        )}

        <span className="flex items-center gap-2 font-sans text-micro text-sand-600">
          {messageStamp(message.createdAt, locale, t)}
          {message.bodyTranslated && (
            <button
              type="button"
              onClick={() => setShowingOriginal((value) => !value)}
              className="cursor-pointer font-bold text-olive transition-colors hover:text-olive-dark"
            >
              {showingOriginal ? t.translation.showTranslation : t.translation.showOriginal}
            </button>
          )}
        </span>
      </div>
    </div>
  );
}
