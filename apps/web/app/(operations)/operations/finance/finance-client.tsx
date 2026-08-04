'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { Device } from '@/lib/device';
import { useDevice } from '@/lib/use-device.hook';
import { applyMatchAction, classifyExpenseAction, dismissMatchAction } from './actions';
import { MatchDialog } from './match-dialog';
import { FinanceDesktop } from './finance.desktop';
import { FinanceMobile } from './finance.mobile';
import { financeUrl, type FinanceUrlState } from './finance-url';
import type { DialogKind, FinanceData, MatchRowView } from './finance-types';

// Para client kökü (Sapma 3): tek durum ağacı burada, sunum web/mobil çatallanır.
//
// Süzgeçler GERÇEK GEZİNMEDİR (`?acct=…&type=…`) çünkü veriyi sunucu okuyor ve "şu hesabın
// hareketleri" bağlantısı paylaşılabilir olmalı. İstemci durumunda tutulsaydı her çip bir istemci
// turu olur, paylaşılan bağlantı hep varsayılanı açardı.

interface FinanceClientProps {
  data: FinanceData;
  device: Device;
  urlState: FinanceUrlState;
  writableAccounts: FinanceData['accounts'];
}

export function FinanceClient({ data, device, urlState, writableAccounts }: FinanceClientProps) {
  const resolvedDevice = useDevice(device);
  const router = useRouter();
  const [navPending, startNav] = useTransition();
  const [dialog, setDialog] = useState<DialogKind>(null);
  /** Hangi kuyruk satırı işleniyor — iki kez tıklanmasın, ve hangisinin beklediği görünsün. */
  const [busyId, setBusyId] = useState<string | null>(null);
  const [queueError, setQueueError] = useState<string | null>(null);
  /** Aday seçimi açık olan kuyruk satırı — "Seç" ve "Düzelt" aynı pencereyi açar. */
  const [picking, setPicking] = useState<MatchRowView | null>(null);

  // `replace` (push değil): süzgeç değiştirmek bir GEZİNME değil, aynı ekranın başka bir görünümü.
  // `push` olsaydı beş çip denemesinden sonra geri tuşu ekrandan çıkmak için beş kez basmak isterdi.
  const go = (next: Partial<FinanceUrlState>) => {
    startNav(() => router.replace(financeUrl({ ...urlState, ...next }), { scroll: false }));
  };

  /** Yazma sonrası tazeleme — `revalidatePath` sunucuyu tazeliyor, `refresh` onu ekrana taşıyor. */
  const refresh = () => {
    setDialog(null);
    startNav(() => router.refresh());
  };

  const runQueueAction = async (row: MatchRowView, run: () => Promise<{ error: string | null }>) => {
    setQueueError(null);
    setBusyId(row.movementId);
    const { error } = await run();
    setBusyId(null);
    if (error) {
      setQueueError(error);
      return;
    }
    startNav(() => router.refresh());
  };

  const view = {
    data,
    urlState,
    writableAccounts,
    navPending,
    dialog,
    busyId,
    queueError,
    onFilter: go,
    onOpenDialog: setDialog,
    onCloseDialog: () => setDialog(null),
    onSaved: refresh,
    // Güçlü adayda tek tıkla onay: motorun "tek aday, belirsizlik yok" cevabı zaten burada
    // (`strength === 'strong'`), ekran ikinci bir soru sormuyor.
    onApprove: (row: MatchRowView) =>
      void runQueueAction(row, () => applyMatchAction(row.movementId, row.candidates[0]!.orderId)),
    // "Seç" ve "Düzelt" aynı pencereyi açar: ikisi de "bu satır hangi siparişin parası" diye sorar.
    onPick: (row: MatchRowView) => setPicking(row),
    onClassify: (row: MatchRowView, category: string) =>
      void runQueueAction(row, () => classifyExpenseAction(row.movementId, category)),
    onDismiss: (row: MatchRowView) => void runQueueAction(row, () => dismissMatchAction(row.movementId)),
  };

  return (
    <>
      {resolvedDevice === 'mobile' ? <FinanceMobile {...view} /> : <FinanceDesktop {...view} />}
      {/* Pencere cihaz görünümlerinin DIŞINDA: ikisinde de aynı, ve her birine ayrı ayrı
          yerleştirilseydi açık/kapalı durumu iki yerde tutulurdu. */}
      {picking ? (
        <MatchDialog
          row={picking}
          busy={busyId === picking.movementId}
          onClose={() => setPicking(null)}
          onPick={(orderId) => {
            const row = picking;
            setPicking(null);
            void runQueueAction(row, () => applyMatchAction(row.movementId, orderId));
          }}
        />
      ) : null}
    </>
  );
}
