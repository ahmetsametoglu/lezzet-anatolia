'use client';

import { brand } from '@lezzet/brand';
import { messageStamp } from '@lezzet/helper';
import type { Locale } from '@lezzet/i18n';
import supportMessages from '@lezzet/i18n/customer/support';
import { TranslationNote } from '@/components/customer/ui/translation-note';
import { Icon } from '@/components/customer/ui/icons';
import { ChatText } from '@/components/text/chat-text';
import { formatPrice } from '@/lib/storefront/format';
import type { CustomerTicketView, TicketMessageView } from '@/lib/ticket/ticket-types';
import type { Messages } from '../support-types';
import { MessageStamp } from './message-stamp';
import { useStampReveal } from './use-stamp-reveal.hook';

/**
 * Yazışma, basit bir mesaj dizisi: müşterinin balonu sağda ve zeytin, işletmeninki solda ve beyaz; iç not yoktur, personelin her
 * mesajı müşteriye aynen görünür. İade bandı mesaj değil sonuç olduğu için yazışmanın sonunda durur.
 */
interface DesktopTicketThreadProps {
  t: Messages;
  locale: Locale;
  ticket: CustomerTicketView;
}

export function DesktopTicketThread({ t, locale, ticket }: DesktopTicketThreadProps) {
  const stamp = useStampReveal();

  return (
    <>
      {ticket.messages.map((message) => (
        <MessageBubble
          key={message.id}
          t={t}
          locale={locale}
          message={message}
          stampShown={stamp.shownId === message.id}
          onReveal={() => stamp.show(message.id)}
        />
      ))}

      {ticket.returnOutcome && ticket.returnOutcome.refundedCents > 0 && (
        <div className="flex items-center justify-center gap-2 rounded-[12px] bg-olive-bg px-3.5 py-2.5 text-center font-sans text-note leading-relaxed font-semibold text-olive">
          <Icon name="undo" size={15} className="flex-none" />
          {t.refunded.replace('{amount}', formatPrice(ticket.returnOutcome.refundedCents, locale))}
        </div>
      )}

      {/* Çözülmüş talep yazınca kendiliğinden açılır; ayrı bir "yeniden aç" düğmesi, yazıp basmayı unutanın mesajını kapalı talepte
          bırakırdı. */}
      {ticket.status === 'resolved' && <span className="font-sans text-note leading-relaxed text-muted">{t.reopenNote}</span>}
    </>
  );
}

interface MessageBubbleProps {
  t: Messages;
  locale: Locale;
  message: TicketMessageView;
  stampShown: boolean;
  onReveal: () => void;
}

function MessageBubble({ t, locale, message, stampShown, onReveal }: MessageBubbleProps) {
  // `ai` gönderici de işletmedir: müşteri kimin değil işletmenin yazdığını görür.
  const mine = message.sender === 'customer';
  const stamp = messageStamp(message.createdAt, locale, supportMessages[locale].today);

  return (
    // Saat üstüne gelince ya da dokununca görünür, çünkü kalıcı damga tek satırlık mesajda yazının kendisinden çok yer tutar.
    <div
      onClick={onReveal}
      className={[
        'group relative flex max-w-[380px] flex-col gap-1.5 px-3.5 py-2.75',
        mine
          ? 'self-end rounded-[16px] rounded-br-[4px] bg-olive text-cream'
          : 'self-start rounded-[16px] rounded-bl-[4px] border border-sand-200 bg-card',
      ].join(' ')}
    >
      {!mine && <span className="font-sans text-micro font-bold text-olive">{brand.name}</span>}
      {/* Müşteri yazışmayı yalnız kendi dilinde görür. Metin biçimli çizilir ve çizici operasyonla ortak, çünkü müşteriye giden vurgu
          iki yüzeyde aynı görünmeli. */}
      <ChatText lang={locale} className={`font-sans text-note leading-relaxed ${mine ? '' : 'text-ink'}`} text={message.body} />
      <span className="sr-only">{stamp}</span>

      {/* Müşterinin kendi balonu koyu zeytin: kum rozeti orada okunmuyor. */}
      {message.bodyTranslated && <TranslationNote badge={t.translation.badge} onDark={mine} />}

      {message.attachmentUrls.map((url) => (
        // Ek daima fotoğraftır (`checkAttachment` yalnız görsel uzantı geçiriyor); ham `<img>`
        // bilerek — adres R2'nin imzalı ve SÜRELİ adresi, `next/image` onu önbelleğe alıp süresi
        // dolduktan sonra kırık gösterirdi.
        <img key={url} src={url} alt={t.photoAlt} className="h-16 w-[90px] rounded-[8px] object-cover" loading="lazy" />
      ))}

      <MessageStamp text={stamp} shown={stampShown} mine={mine} />
    </div>
  );
}
