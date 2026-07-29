'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { OrderDecision } from '@lezzet/domain-core';
import type { FulfillmentAdjustment, OrderStatus } from '@lezzet/types';
import type { Device } from '@/lib/device';
import { useDevice } from '@/lib/use-device';
import { adjustFulfillmentAction, advanceOrderStatusAction, cancelOrderAction } from '../actions';
import { CancelDialog } from './components/cancel-dialog';
import { DecisionDialog } from './components/decision-dialog';
import { OrderDetailDesktop } from './order-detail.desktop';
import { OrderDetailMobile } from './order-detail.mobile';
import type { OrderDetailView } from './order-detail-types';

// Detay client kökü (Sapma 3): tek durum ağacı burada, sunum web/telefon olarak çatallanır.
// Durum ilerletme LİSTEYLE AYNI action'ı çağırır — iki ekran aynı kapıdan geçmezse biri motorun
// izin kontrolünü atlayabilirdi.
//
// Üç kararın ikisi TABLOLU pencere ister (kalem başına adet + akıbet), iptal ise yalnız onay:
// seçilecek adet, akıbet ya da yol yoktur. Bu yüzden iptalin kendi penceresi var (`CancelDialog`) —
// ama yine de BİR PENCERE: tarayıcının `confirm()` kutusu ne operasyonun görsel dilini taşır, ne
// kararın üç ayrı sonucunu (hazırlık · stok · para) yazabilir, ne de işlem düşerse hatayı gösterir.

interface OrderDetailClientProps {
  order: OrderDetailView;
  device: Device;
}

export function OrderDetailClient({ order, device }: OrderDetailClientProps) {
  const resolvedDevice = useDevice(device);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dialog, setDialog] = useState<OrderDecision | null>(null);

  /** Her yazma yolu aynı kapıdan döner: hata ekranda kalır, başarı sayfayı tazeler. */
  const run = (call: Promise<{ error: string | null }>, onDone?: () => void) => {
    setBusy(true);
    setError(null);
    void call
      .then(({ error: actionError }) => {
        if (actionError) {
          setError(actionError);
          return;
        }
        onDone?.();
        // Sayfa kalır, veri tazelenir: operatör aynı siparişe bakmaya devam ediyor.
        router.refresh();
      })
      .finally(() => setBusy(false));
  };

  const onAdvance = (to: OrderStatus) => run(advanceOrderStatusAction(order.id, order.status, to));

  const onDecision = (decision: OrderDecision) => {
    setError(null);
    setDialog(decision);
  };

  const onConfirmDecision = (
    lines: FulfillmentAdjustment[],
    opts: { refundAccountId: string | null; refundAmount: number | null },
  ) => run(adjustFulfillmentAction(order.id, lines, opts), () => setDialog(null));

  return (
    <>
      {/* Telefonda KARAR YOK (tasarım notu): kısmi karşılama ve iade kalem kalem adet ve akıbet
          seçtiriyor — küçük ekranda yanlış dokunuşun bedeli para. Ekran bunu cümleyle söyler. */}
      {resolvedDevice === 'mobile' ? (
        <OrderDetailMobile order={order} onAdvance={onAdvance} busy={busy} error={error} />
      ) : (
        <OrderDetailDesktop order={order} onAdvance={onAdvance} onDecision={onDecision} busy={busy} error={error} />
      )}
      {dialog === 'cancel' ? (
        <CancelDialog
          order={order}
          busy={busy}
          error={error}
          onClose={() => setDialog(null)}
          onConfirm={() => run(cancelOrderAction(order.id), () => setDialog(null))}
        />
      ) : dialog ? (
        <DecisionDialog
          order={order}
          kind={dialog}
          busy={busy}
          error={error}
          onClose={() => setDialog(null)}
          onConfirm={onConfirmDecision}
        />
      ) : null}
    </>
  );
}
