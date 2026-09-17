'use client';

import { useEffect, useRef, useState } from 'react';
import { ticketTitle } from '@lezzet/helper';
import supportMessages from '@lezzet/i18n/customer/support';
import { EmptyState } from '@/components/customer/phone-kit/empty-state';
import { LoadingState } from '@/components/customer/phone-kit/loading-state';
import { PrimaryButton } from '@/components/customer/phone-kit/primary-button';
import { AppBar } from '@/components/customer/ui/app-bar';
import { BackButton } from '@/components/customer/ui/back-button';
import { MobileIcon } from '@/components/customer/ui/mobile-icon';
import type { CustomerTicketView } from '@/lib/ticket/ticket-types';
import { useLoadMore } from '@/lib/use-load-more.hook';
import { PhoneReplyBox } from './components/phone-reply-box';
import { PhoneTicketCard } from './components/phone-ticket-card';
import { PhoneTicketStatusTag } from './components/phone-ticket-status-tag';
import { PhoneTicketThread } from './components/phone-ticket-thread';
import type { SupportViewProps } from './support-types';

/**
 * Taleplerim telefon görünümü: liste ve yazışma iki ayrı ekran ve hangisinin çizileceğini rota söyler. İkisi de native talep
 * ekranlarının ikizi; metin iki yüzeyin ortak sözlüğünden.
 */
export function SupportMobile({ t, locale, mode, tickets, nextCursor, loadingMore, tailFailed, onLoadMore, selected }: SupportViewProps) {
  const copy = supportMessages[locale];
  const [ticket, setTicket] = useState<CustomerTicketView | null>(selected);
  const open = ticket?.id === selected?.id ? ticket : selected;
  // Düşen devam kendiliğinden yinelenmez; "tekrar dene" müşterinin elinde.
  const { ref } = useLoadMore({ hasMore: nextCursor !== null && !tailFailed, loading: loadingMore, onLoadMore });
  const threadRef = useRef<HTMLDivElement>(null);
  const messageCount = open?.messages.length ?? 0;

  // En yeni mesaj en altta: açılışta ve her yeni mesajda kaydırıcı sona iner, müşteri kendi baloncuğunu görür.
  useEffect(() => {
    const thread = threadRef.current;
    if (thread) thread.scrollTop = thread.scrollHeight;
  }, [messageCount]);

  if (mode === 'detail') {
    // Sayfa bulunamayan talepte zaten `notFound()` veriyor; buraya yalnız cihaz kararı istemcide değişirse düşülür.
    if (!open) {
      return (
        <EmptyState
          fill
          icon={<MobileIcon name="whatsapp" size={80} className="text-sand-600" />}
          title={copy.detail.notFound}
          description={copy.detail.notFoundBody}
          action={<PrimaryButton label={copy.detail.notFoundCta} shape="pill" href="/support" />}
        />
      );
    }

    // Ekranı doldurur (`SiteFrame fill`): yazışma kendi içinde kayar, yazma çubuğu dipte sabit durur.
    return (
      <div className="flex h-full min-h-0 flex-col">
        <AppBar
          title={ticketTitle(copy.type[open.type], open.subject, copy.list.withSubject)}
          left={<BackButton label={copy.back} fallback="/support" />}
          right={<PhoneTicketStatusTag status={open.status} label={copy.status[open.status]} />}
        />
        <div ref={threadRef} className="min-h-0 flex-1 overflow-y-auto">
          <PhoneTicketThread copy={copy} t={t} locale={locale} ticket={open} />
        </div>
        <PhoneReplyBox copy={copy} t={t} locale={locale} ticketId={open.id} onReplied={setTicket} />
      </div>
    );
  }

  if (tickets.length === 0) {
    return (
      <EmptyState
        fill
        icon={<MobileIcon name="whatsapp" size={80} className="text-sand-600" />}
        title={copy.list.empty.title}
        description={copy.list.empty.body}
        action={<PrimaryButton label={copy.list.empty.cta} shape="pill" href="/support/new" />}
      />
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto px-4.5 pt-4.5 pb-7.5">
      <ul className="flex flex-col gap-2.5">
        {tickets.map((row) => (
          <li key={row.id}>
            <PhoneTicketCard copy={copy} locale={locale} ticket={row} />
          </li>
        ))}
      </ul>
      {/* Kuyruk üç ayrı hâl: yükleniyor, düştü, bitti. */}
      <div ref={ref} className="flex justify-center pt-2.5 empty:pt-0">
        {loadingMore && <LoadingState label={copy.list.loading} />}
        {tailFailed && !loadingMore && <PrimaryButton label={copy.list.tailRetry} shape="pill" onClick={onLoadMore} />}
        {nextCursor === null && <p className="text-center font-sans text-body-sm text-muted">{copy.list.end}</p>}
      </div>
    </div>
  );
}
