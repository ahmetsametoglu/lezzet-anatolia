'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { OrderDecision } from '@lezzet/domain-core';
import type { FulfillmentAdjustment, OrderStatus } from '@lezzet/types';
import type { Device } from '@/lib/device';
import { useDevice } from '@/lib/use-device';
import { adjustFulfillmentAction, advanceOrderStatusAction, cancelOrderAction, retryRefundAction } from '../actions';
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

/**
 * Action sonucundan iade uyarısını çeker — yalnız iade yolları taşır, durum ilerletme taşımaz.
 *
 * `retryable` yalnız SAĞLAYICI DÜŞTÜĞÜNDE true — o geçici bir hâldir. Künye eksikliği ya da hesap
 * bulunamaması tekrarla düzelmez (veri yok, bir daha bakınca da olmayacak); orada düğme göstermek
 * operatörü boşuna uğraştırır, cümle zaten ne yapılacağını söylüyor.
 */
function noticeOf(data: unknown): { text: string; retryable: boolean } | null {
  if (!data || typeof data !== 'object' || !('refundNotice' in data)) return null;
  const { refundNotice, refundBlocked } = data as { refundNotice: unknown; refundBlocked?: unknown };
  if (typeof refundNotice !== 'string') return null;
  return { text: refundNotice, retryable: refundBlocked === 'provider_failed' };
}

export function OrderDetailClient({ order, device }: OrderDetailClientProps) {
  const resolvedDevice = useDevice(device);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** İşlem geçti ama iade yazılamadı — hata değil, tamamlanmamış bir sonuç (07.11). */
  const [notice, setNotice] = useState<{ text: string; retryable: boolean } | null>(null);
  const [dialog, setDialog] = useState<OrderDecision | null>(null);

  /**
   * Her yazma yolu aynı kapıdan döner: hata ekranda kalır, başarı sayfayı tazeler.
   *
   * **Üçüncü bir sonuç var: işlem oldu ama iade yazılamadı** (07.11). Hata değil — düzeltme/iptal
   * kaydedildi, tekrar denenmemeli; ama sessiz de geçilemez, paranın çıkmadığını yalnız bu satır
   * söylüyor. Bu yüzden ayrı bir uyarı olarak duruyor ve sayfa tazelendiğinde silinmiyor: operatör
   * okumadan kaybolan bir uyarı, hiç gösterilmemiş sayılır.
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
    opts: { refundAccountId: string | null; refundAmount: number | null },
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
