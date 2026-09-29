'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { OrderDecision } from '@lezzet/domain-core';
import type { FulfillmentAdjustment, OrderStatus } from '@lezzet/types';
import { adjustFulfillmentAction, advanceOrderStatusAction, cancelOrderAction, retryRefundAction } from '../actions';
import { CancelDialog } from './components/cancel-dialog';
import { DecisionDialog } from './components/decision-dialog';
import { OrderDetailDesktop } from './order-detail.desktop';
import type { OrderDetailView } from './order-detail-types';

// Detay client kökü: tek durum ağacı burada; durum ilerletme listeyle aynı action'ı çağırır ki motorun izin kontrolü atlanmasın.
// İptal adet ve akıbet sormadığı için kendi penceresindedir, tarayıcının `confirm()` kutusu kararın sonuçlarını ve hatayı yazamazdı.

interface OrderDetailClientProps {
  order: OrderDetailView;
}

/**
 * Action sonucundan iade uyarısını çeker — yalnız iade yolları taşır. `retryable` yalnız sağlayıcı düştüğünde true: künye ya
 * da hesap eksikliği tekrarla düzelmez ve düğme operatörü boşuna uğraştırırdı.
 */
function noticeOf(data: unknown): { text: string; retryable: boolean } | null {
  if (!data || typeof data !== 'object' || !('refundNotice' in data)) return null;
  const { refundNotice, refundBlocked } = data as { refundNotice: unknown; refundBlocked?: unknown };
  if (typeof refundNotice !== 'string') return null;
  return { text: refundNotice, retryable: refundBlocked === 'provider_failed' };
}

export function OrderDetailClient({ order }: OrderDetailClientProps) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** İşlem geçti ama iade yazılamadı — hata değil, tamamlanmamış bir sonuç. */
  const [notice, setNotice] = useState<{ text: string; retryable: boolean } | null>(null);
  const [dialog, setDialog] = useState<OrderDecision | null>(null);

  /**
   * Her yazma yolu aynı kapıdan döner: hata ekranda kalır, başarı sayfayı tazeler. İade yazılamadıysa ayrı ve kalıcı bir uyarı
   * durur: düzeltme kaydedildi, tekrar denenmemeli, ama paranın çıkmadığını yalnız bu satır söyler.
   */
  const run = (call: Promise<{ error: string | null; data?: unknown }>, onDone?: () => void) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    void call
      .then(({ error: actionError, data }) => {
        if (actionError) {
          setError(actionError);
          return;
        }
        // Uyarıyı yalnız iade yolları taşır (durum ilerletme taşımaz) — o yüzden varlığı sorulur.
        setNotice(noticeOf(data));
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
    opts: { refundAccountId: string | null },
  ) => run(adjustFulfillmentAction(order.id, lines, opts), () => setDialog(null));

  return (
    <>
      {/* Paranın çıkmadığını söyleyen tek yer. Kapatma düğmesi var ama kendiliğinden kaybolmuyor:
          operatör bir sonraki adımı (elle iade / panelden iade) buradan öğreniyor. */}
      {notice ? (
        <div
          role="status"
          className="mb-3 flex items-start gap-3 rounded-ops-card border border-ops-amber-line bg-ops-amber-bg px-4 py-3"
        >
          <span className="font-ops-body text-ops-micro leading-[1.5] text-ops-amber-dark">{notice.text}</span>
          {notice.retryable ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => run(retryRefundAction(order.id))}
              className="ml-auto shrink-0 cursor-pointer font-ops-body text-ops-micro font-semibold text-ops-amber-dark underline disabled:cursor-not-allowed disabled:opacity-50"
            >
              Tekrar dene
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setNotice(null)}
            className={[
              'shrink-0 cursor-pointer font-ops-body text-ops-micro text-ops-muted hover:text-ops-ink',
              notice.retryable ? '' : 'ml-auto',
            ].join(' ')}
          >
            Kapat
          </button>
        </div>
      ) : null}

      <OrderDetailDesktop order={order} onAdvance={onAdvance} onDecision={onDecision} busy={busy} error={error} />
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
