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
 * Talep sayfasının cihaz çatalı ve sayfalama imlecinin sahibi. Seçili talep rotanın işidir: istemci durumunda yaşasaydı cevap
 * e-postasındaki doğrudan bağlantı çalışmaz, geri tuşu listeye dönmezdi.
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
  const [tailFailed, setTailFailed] = useState(false);

  const onLoadMore = () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    setTailFailed(false);
    void loadMoreTicketsAction(cursor)
      .then(({ data, errorKey }) => {
        // Düşen devam listeyi bozmaz: satırlar yerinde kalır, tetikleyici yeniden denenebilir.
        if (errorKey || !data) {
          setTailFailed(true);
          return;
        }
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
    tailFailed,
    onLoadMore,
    selected,
  };

  return useDevice(device) === 'mobile' ? <SupportMobile {...view} /> : <SupportDesktop {...view} />;
}
