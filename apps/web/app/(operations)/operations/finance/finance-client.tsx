'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { applyMatchAction, classifyExpenseAction, dismissMatchAction } from '@/lib/finance/actions';
import { MatchDialog } from './match-dialog';
import { FinanceDesktop } from './finance.desktop';
import { financeUrl, type FinanceUrlState } from './finance-url';
import type { DialogKind, FinanceData, MatchRowView } from './finance-types';

// Para client kökü: tek durum ağacı burada. Operasyon web'i masaüstü-yalnız (06.08);
// mobil deneyim native uygulamada — `docs/uygulama`.
//
// Süzgeçler GERÇEK GEZİNMEDİR (`?acct=…&type=…`) çünkü veriyi sunucu okuyor ve "şu hesabın
// hareketleri" bağlantısı paylaşılabilir olmalı. İstemci durumunda tutulsaydı her çip bir istemci
// turu olur, paylaşılan bağlantı hep varsayılanı açardı.

interface FinanceClientProps {
  data: FinanceData;
  urlState: FinanceUrlState;
  writableAccounts: FinanceData['accounts'];
  /** Asistan önerisinden gelindiyse ön dolgu (22.5); `null` ise ekran hiç değişmez. */
}

export function FinanceClient({ data, urlState, writableAccounts }: FinanceClientProps) {
  const router = useRouter();
  const [navPending, startNav] = useTransition();
  /**
   * Öneriden gelindiyse elle hareket penceresi DOĞRUDAN açılır: operatör kuyruktan bu ekrana zaten
   * "bu kaydı gözden geçir" diye geldi; ayrıca "+ Hareket"e bastırmak fazladan bir adım olurdu.
   * Formun alamadığı iki tipte (`blocked`) pencere açılmaz — künye yolu söyler.
   */
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
      <FinanceDesktop {...view} />
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
