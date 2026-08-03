'use client';

import { useState } from 'react';
import type { Locale } from '@lezzet/i18n';
import type { KeysetCursor, Page } from '@lezzet/types';
import type { Device } from '@/lib/device';
import { useDevice } from '@/lib/use-device.hook';
import type { CustomerTicketSummary, CustomerTicketView } from '@/lib/ticket/ticket-types';
import { loadMoreTicketsAction } from './actions';
import type { Messages, SupportMode } from './support-types';
import { SupportDesktop } from './support.desktop';
import { SupportMobile } from './support.mobile';

/**
 * Talep sayfasının cihaz çatalı (ADR Sapma 3) ve **durum sahibi**: yalnız sayfalama imleci.
 *
 * Seçili talep burada TUTULMAZ — o rotanın işi (`/support/[ticket]`). İstemci durumunda yaşasaydı
 * yazışmaya doğrudan bağlantı veren cevap e-postası çalışmazdı; ayrıca geri tuşu listeye değil
 * sayfadan çıkışa giderdi.
 *
 * İmleç URL'e yazılmaz (`CLAUDE.md §1`): burada paylaşılabilecek bir süzgeç yok, liste yalnız uzuyor.
 */
interface SupportClientProps {
  t: Messages;
  locale: Locale;
  device: Device;
  mode: SupportMode;
  first: Page<CustomerTicketSummary>;
  selected: CustomerTicketView | null;
}

export function SupportClient({ t, locale, device, mode, first, selected }: SupportClientProps) {
  const [extra, setExtra] = useState<CustomerTicketSummary[]>([]);
  const [cursor, setCursor] = useState<KeysetCursor | null>(first.nextCursor);
  const [loadingMore, setLoadingMore] = useState(false);

  const onLoadMore = () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    void loadMoreTicketsAction(cursor)
      .then(({ data, errorKey }) => {
        // Hata sessiz: liste olduğu yerde kalır, tetikleyici yeniden denenebilir (sunucu = gerçek).
        if (errorKey || !data) return;
        setExtra((prev) => [...prev, ...data.rows]);
        setCursor(data.nextCursor);
      })
      .finally(() => setLoadingMore(false));
  };

  const view = {
    t,
    locale,
    mode,
    tickets: [...first.rows, ...extra],
    nextCursor: cursor,
    loadingMore,
    onLoadMore,
    selected,
  };

  return useDevice(device) === 'mobile' ? <SupportMobile {...view} /> : <SupportDesktop {...view} />;
}
