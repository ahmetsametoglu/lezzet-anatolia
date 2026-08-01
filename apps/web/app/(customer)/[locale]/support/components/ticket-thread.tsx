'use client';

import { brand } from '@lezzet/brand';
import type { Locale } from '@lezzet/i18n';
import { formatPrice } from '@/lib/storefront/format';
import type { CustomerTicketView, TicketMessageView } from '@/lib/ticket/ticket-types';
import { messageStamp } from './ticket-labels';
import type { Messages } from '../support-types';

/**
 * Yazışma — **basit bir mesaj dizisi** (tasarım). Müşterinin balonu sağda ve zeytin, işletmeninki
 * solda ve beyaz; kuyruk köşesi (4px) balonun sahibini rengi okumadan da söyler.
 *
 * **İç not diye bir şey YOKTUR** (`DOMAIN §15`): personelin yazdığı her mesaj müşteriye aynen
 * görünür. Bu yüzden burada "hangi mesajı göstereyim" diye bir süzgeç yok — kapı ne getirdiyse o.
 *
 * İşletmenin adı `@lezzet/brand`'den geliyor, `messages.json`'dan değil: marka adı çeviri değildir
 * ve üç dilde de aynıdır; sözlüğe koymak onu bir gün ayrışabilir hale getirirdi.
 *
 * **İade bandı yazışmanın SONUNDA duruyor, mesaj olarak değil** — çünkü iade bir mesaj değil, bir
 * sonuçtur ve tutarı talepte değil siparişin para hareketlerinde yaşıyor (`returnOutcome`). Aynı
 * bilgi sipariş detayında da görünür; band bunu açıkça söylüyor.
 */
interface TicketThreadProps {
  t: Messages;
  locale: Locale;
  ticket: CustomerTicketView;
  /**
   * Balonun azami genişliği masaüstünde 380px, mobilde 280px (tasarım). Ekran genişliğine bakan bir
   * `lg:` sınıfıyla DEĞİL, cihaz çatalından gelen bir bayrakla — bu yüzeyin kuralı akışkan responsive
   * değil, iki ayrı görünüm (ADR Sapma 3).
   */
  wide?: boolean;
}

export function TicketThread({ t, locale, ticket, wide = false }: TicketThreadProps) {
  return (
    <>
      {ticket.messages.map((message) => (
        <MessageBubble key={message.id} t={t} locale={locale} message={message} wide={wide} />
      ))}

      {ticket.returnOutcome && ticket.returnOutcome.refundedCents > 0 && (
        <div className="rounded-[12px] bg-olive-bg px-3.5 py-2.5 text-center font-sans text-note leading-relaxed font-semibold text-olive">
          {t.refunded.replace('{amount}', formatPrice(ticket.returnOutcome.refundedCents, locale))}
        </div>
      )}

      {/* Çözülmüş talep: yeniden açmak AYRI bir düğme değil — yazmak yeter (motorun kararı,
          `statusAfterCustomerReply`). Tasarımın "Yeniden aç ve yaz" düğmesi bu yüzden bir düğme
          değil bir CÜMLE: müşteri yazar, talep kendiliğinden açılır. Ayrı düğme olsaydı yazıp
          basmayı unutan müşterinin mesajı kapalı bir talepte kalırdı. */}
      {ticket.status === 'resolved' && (
        <span className="font-sans text-note leading-relaxed text-muted">{t.reopenNote}</span>
      )}
    </>
  );
}

function MessageBubble({
  t,
  locale,
  message,
  wide,
}: {
  t: Messages;
  locale: Locale;
  message: TicketMessageView;
  wide: boolean;
}) {
  // `ai` gönderici de işletmedir: müşteriye kimin yazdığı değil, İŞLETMENİN yazdığı görünür
  // (16.5 geldiğinde bile müşteri "bir robotla mı konuşuyorum" sorusuyla baş başa bırakılmaz).
  const mine = message.sender === 'customer';

  return (
    <div
      className={[
        'flex flex-col gap-1.5 px-3.5 py-2.75',
        wide ? 'max-w-[380px]' : 'max-w-[280px]',
        mine
          ? 'self-end rounded-[16px] rounded-br-[4px] bg-olive text-cream'
          : 'self-start rounded-[16px] rounded-bl-[4px] border border-sand-200 bg-card',
      ].join(' ')}
    >
      {!mine && <span className="font-sans text-micro font-bold text-olive">{brand.name}</span>}
      <span className={`font-sans text-note leading-relaxed ${mine ? '' : 'text-ink'}`}>{message.body}</span>

      {message.attachmentUrls.map((url) => (
        // Ek daima fotoğraftır (`checkAttachment` yalnız görsel uzantı geçiriyor); ham `<img>`
        // bilerek — adres R2'nin imzalı ve SÜRELİ adresi, `next/image` onu önbelleğe alıp süresi
        // dolduktan sonra kırık gösterirdi.
        <img
          key={url}
          src={url}
          alt={t.photoAlt}
          className="h-16 w-[90px] rounded-[8px] object-cover"
          loading="lazy"
        />
      ))}

      <span className={`self-end font-sans text-micro ${mine ? 'text-on-image-soft' : 'text-sand-600'}`}>
        {messageStamp(message.createdAt, locale, t)}
      </span>
    </div>
  );
}
