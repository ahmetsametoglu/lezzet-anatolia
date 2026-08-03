'use client';

import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { TicketStatus } from '@lezzet/types';
import type { Device } from '@/lib/device';
import { useDevice } from '@/lib/use-device';
import { ORDERS_PATH } from '../orders/orders-url';
import {
  changeTicketStatusAction,
  loadMoreTicketsAction,
  replyToTicketAction,
  takeOverTicketAction,
  triggerReturnAction,
} from './actions';
import { ManualTicketDialog } from './manual-ticket-dialog';
import { TicketConfirmDialog } from './ticket-confirm-dialog';
import { TicketsDesktop } from './tickets.desktop';
import { TicketsMobile } from './tickets.mobile';
import { ticketsUrl, type TicketFilterKey, type TicketsUrlState } from './tickets-url';
import type { TicketRowView, TicketsData } from './tickets-types';

// Talepler ekranı client kökü (Sapma 3): tek durum ağacı burada, sunum web/mobil olarak çatallanır.
//
// SÜZGEÇ ve SEÇİM gerçek gezinmedir (`?f=…&t=…`): detay sunucuda okunuyor ve bir talebin bağlantısı
// paylaşılabilir olmalı ("şuna bir bak").

interface TicketsClientProps {
  data: TicketsData;
  device: Device;
  urlState: TicketsUrlState;
}

/** Onay penceresinin hâli — çizimdeki tek modal kabuğu iki karara hizmet ediyor. */
type ConfirmKind = 'return' | 'takeover' | null;

export function TicketsClient({ data, device, urlState }: TicketsClientProps) {
  const resolvedDevice = useDevice(device);
  const router = useRouter();
  const [navPending, startNav] = useTransition();

  const go = (patch: Partial<TicketsUrlState>) => {
    startNav(() => router.replace(ticketsUrl({ ...urlState, ...patch }), { scroll: false }));
  };

  // Liste: ilk sayfa sunucudan, devamı action ile EKLENİR. Sunucu verisi değişince (süzgeç ya da
  // yazımdan sonraki tazeleme) eklenen sayfalar SIFIRLANIR; yoksa eski süzgecin satırları kalırdı.
  const [extra, setExtra] = useState<TicketRowView[]>([]);
  const [cursor, setCursor] = useState(data.nextCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  useEffect(() => {
    setExtra([]);
    setCursor(data.nextCursor);
  }, [data.rows, data.nextCursor]);

  const onLoadMore = () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    void loadMoreTicketsAction(window.location.search, cursor)
      .then(({ data: page }) => {
        // Hata sessiz: kuyruk olduğu yerde kalır, tetikleyici yeniden denenebilir (sunucu = gerçek).
        if (!page) return;
        setExtra((prev) => [...prev, ...page.rows]);
        setCursor(page.nextCursor);
      })
      .finally(() => setLoadingMore(false));
  };

  // Yazma hâli: tek bayrak yeter — cevap yazarken durum düğmesine basmak da beklemeli, ikisi de
  // aynı talebi değiştiriyor ve sıraları belirsizse hangi sonucun ekranda kaldığı da belirsiz olur.
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<ConfirmKind>(null);
  const [manualOpen, setManualOpen] = useState(false);

  const detail = data.detail;

  /** Yazma sarmalı: kilitle, hatayı göster, başarıda sunucuyu yeniden oku. */
  async function run<T>(call: () => Promise<{ data: T | null; error: string | null }>): Promise<T | null> {
    if (busy) return null;
    setBusy(true);
    setError(null);
    try {
      const result = await call();
      if (result.error !== null || result.data === null) {
        setError(result.error ?? 'İşlem tamamlanamadı.');
        return null;
      }
      // Action zaten `revalidatePath` çağırdı; `refresh` o taze RSC çıktısını ekrana getirir.
      router.refresh();
      return result.data;
    } finally {
      setBusy(false);
    }
  }

  const onReply = async (body: string): Promise<boolean> => {
    if (!detail) return false;
    return (await run(() => replyToTicketAction(detail.ticket.id, body))) !== null;
  };

  const onStatus = (to: TicketStatus) => {
    if (!detail) return;
    void run(() => changeTicketStatusAction(detail.ticket.id, to));
  };

  const onTakeOver = () => {
    if (!detail) return;
    void run(() => takeOverTicketAction(detail.ticket.id)).then(() => setConfirm(null));
  };

  /**
   * İade tetikleme İKİ ADIMDIR ve ikincisi atlanamaz: damga talebi siparişe bağlar, iadeyi
   * yürütmez (DOMAIN §8). Operatör bu yüzden siparişe GÖTÜRÜLÜR — damgayla baş başa bırakmak,
   * iadenin yarım kalmasının en kolay yolu olurdu.
   */
  const onTriggerReturn = () => {
    if (!detail) return;
    void run(() => triggerReturnAction(detail.ticket.id)).then((result) => {
      setConfirm(null);
      if (result) router.push(`${ORDERS_PATH}/${result.orderId}`);
    });
  };

  const view = {
    data: { ...data, rows: [...data.rows, ...extra] },
    urlState,
    navPending,
    busy,
    error,
    hasMore: cursor !== null,
    loadingMore,
    onLoadMore,
    onFilter: (f: TicketFilterKey) => go({ f }),
    // Süzgeç değişmiyor, seçim değişiyor: aynı adres iki soruyu birden taşıyor.
    onSelect: (t: string) => go({ t }),
    onCloseDetail: () => go({ t: '' }),
    onReply,
    onStatus,
    onTakeOver: () => setConfirm('takeover'),
    onTriggerReturn: () => setConfirm('return'),
    onNewTicket: () => setManualOpen(true),
  };

  return (
    <>
      {resolvedDevice === 'mobile' ? <TicketsMobile {...view} /> : <TicketsDesktop {...view} />}

      {confirm && detail ? (
        <TicketConfirmDialog
          kind={confirm}
          customerName={detail.customer.name}
          orderReferenceNo={detail.order?.referenceNo ?? null}
          busy={busy}
          onClose={() => setConfirm(null)}
          onConfirm={confirm === 'return' ? onTriggerReturn : onTakeOver}
        />
      ) : null}

      {manualOpen ? (
        <ManualTicketDialog
          onClose={() => setManualOpen(false)}
          onCreated={(id) => {
            setManualOpen(false);
            // Yeni talep AÇILIR: elle talep açan operatör onu ilk kez okumak ister ve kuyrukta
            // aramak zorunda kalmamalı.
            go({ t: id });
            router.refresh();
          }}
        />
      ) : null}
    </>
  );
}
