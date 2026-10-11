'use client';

import type { OrderStatus } from '@lezzet/types';
import { Button } from '@/components/operation/ui/button';
import { Dialog } from '@/components/operation/ui/dialog';
import { money } from '@/components/operation/ui/format';
import { statusLabel } from '../../orders-labels';
import type { OrderDetailView } from '../order-detail-types';

// Siparişi ana yolundan çıkaran geçiş tek tıkla yazılmaz; pencere geçişin neyi yazıp neyi yazmadığını söyler.

/** Geçişin sonucu, operatörün dilinde; sonucu yazılmamış durumda pencere yalnız onay sorar. */
const OUTCOME: Partial<Record<OrderStatus, string>> = {
  returned:
    'Sipariş depodaki geri dönen mal kuyruğuna girer; bu adım tek başına stok ve para yazmaz. Mal rampaya gelince depo akıbetini işaretler ve parası o anda iade edilir; malı beklemeden iade için Kararlar bloğundaki "İade başlat" kullanılır.',
};

interface TransitionConfirmDialogProps {
  order: OrderDetailView;
  to: OrderStatus;
  onClose: () => void;
  onConfirm: () => void;
  busy: boolean;
  error: string | null;
}

export function TransitionConfirmDialog({ order, to, onClose, onConfirm, busy, error }: TransitionConfirmDialogProps) {
  const outcome = OUTCOME[to];
  const action = `${statusLabel(to)} durumuna geçir`;

  return (
    <Dialog
      open
      onClose={onClose}
      maxWidth={520}
      title={`${action} — ${order.referenceNo ?? '—'}`}
      subtitle={`${order.customerName} · ${money(order.payment.totalCents)}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy} className="ml-auto">
            Vazgeç
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={busy}>
            {busy ? 'Uygulanıyor…' : action}
          </Button>
        </>
      }
    >
      {error ? (
        <div className="rounded-ops-card border border-ops-red-line bg-ops-red-bg px-3.5 py-2.5 font-ops-body text-ops-xs font-semibold text-ops-red">
          {error}
        </div>
      ) : null}

      {outcome ? <p className="font-ops-body text-ops-sm leading-relaxed text-ops-body">{outcome}</p> : null}
    </Dialog>
  );
}
