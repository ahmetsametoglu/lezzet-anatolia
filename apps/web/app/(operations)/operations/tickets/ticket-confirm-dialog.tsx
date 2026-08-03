'use client';

import { Button } from '@/components/operation/ui/button';
import { Dialog } from '@/components/operation/ui/dialog';

/**
 * İade tetikleme ve AI'dan devralma onayı — çizimdeki **tek modal kabuğu** iki karara hizmet ediyor
 * (`Operasyon - Talepler.dc.html`: `modalKind` `iade` · `devral`).
 *
 * İkisi de tek tıkla yapılabilecek işler değil: iade siparişi bir sürece sokar, devralma müşterinin
 * muhatabını değiştirir ve **geri alınmaz** (`TicketService.takeOver` künyesi: insandan AI'a geri
 * verilmez). Onay penceresi bu yüzden bir nezaket değil, kararın kendisi.
 *
 * Metin ikisinde de aynı üç parçadan kurulu (gövde · sarı not · düğme), çünkü çizim öyle: not her
 * zaman "bunun ardından ne olacak" sorusunu cevaplar.
 */

interface TicketConfirmDialogProps {
  kind: 'return' | 'takeover';
  customerName: string;
  orderReferenceNo: string | null;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export function TicketConfirmDialog({ kind, customerName, orderReferenceNo, busy, onClose, onConfirm }: TicketConfirmDialogProps) {
  const isReturn = kind === 'return';

  return (
    <Dialog
      open
      onClose={onClose}
      maxWidth={440}
      title={isReturn ? 'İade tetikle' : "AI'dan devral"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy} className="ml-auto">
            Vazgeç
          </Button>
          <Button variant={isReturn ? 'destructive' : 'primary'} onClick={onConfirm} disabled={busy}>
            {busy ? 'Uygulanıyor…' : isReturn ? 'Siparişte iade başlat' : 'Devral'}
          </Button>
        </>
      }
    >
      <p className="font-ops-body text-ops-sm leading-relaxed text-ops-body">
        {isReturn ? (
          <>
            <span className="font-semibold text-ops-ink">{customerName}</span>
            {orderReferenceNo ? ` · ${orderReferenceNo}` : ''} için iade akışı başlatılır. Para ve stok kararı sipariş
            ekranında sonuçlanır; talep buna bağlanır ve sonucu buradan izlenir.
          </>
        ) : (
          'Bu talebi üstleniyorsunuz. AI bu talepte susturulur; sonraki cevaplar sizden gider.'
        )}
      </p>

      <p className="rounded-ops-card border border-ops-amber-line bg-ops-amber-bg px-3 py-2.5 font-ops-body text-ops-xs leading-relaxed text-ops-amber-dark">
        {isReturn
          ? 'İade burada sonuçlanmaz — onayladığınızda siparişin iade akışına götürülürsünüz ve iş orada bitirilir.'
          : 'Devralma geri alınmaz: talebi tekrar AI’a bırakmak diye bir yol yok, müşterinin muhatabı habersiz değişmemeli.'}
      </p>
    </Dialog>
  );
}
