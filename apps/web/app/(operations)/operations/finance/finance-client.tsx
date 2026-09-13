'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { applyMatchAction, classifyRowAction, dismissMatchAction, documentFileUrlAction, tagMovementAction } from '@/lib/finance/actions';
import type { ClassifyType, MatchTarget } from '@/lib/bank/reconcile';
import { MatchDialog } from './match-dialog';
import { FinanceDesktop } from './finance.desktop';
import { financeUrl, type FinanceUrlState } from './finance-url';
import type { DialogKind, FinanceData, MatchRowView, OpenDocumentView } from './finance-types';

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
}

export function FinanceClient({ data, urlState, writableAccounts }: FinanceClientProps) {
  const router = useRouter();
  const [navPending, startNav] = useTransition();
  const [dialog, setDialog] = useState<DialogKind>(null);
  /** Hangi kuyruk satırı işleniyor — iki kez tıklanmasın, ve hangisinin beklediği görünsün. */
  const [busyId, setBusyId] = useState<string | null>(null);
  const [queueError, setQueueError] = useState<string | null>(null);
  /** Hedef seçimi açık olan kuyruk satırı — "Seç", "Düzelt" ve "Elle bağla" aynı pencereyi açar. */
  const [picking, setPicking] = useState<MatchRowView | null>(null);
  /** "Ödemesini yaz" denen açık belge — elle hareket penceresi belgeyle dolu açılır (12.12). */
  const [payingDocument, setPayingDocument] = useState<OpenDocumentView | null>(null);
  /** Satır içi etiketleme bekleyen hareket. */
  const [tagBusyId, setTagBusyId] = useState<string | null>(null);

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

  /** Kuyruk kararı — kart ve seçim penceresi aynı kapıya gider; hedefi ekran değil kapı yorumlar. */
  const applyTarget = (row: MatchRowView, target: MatchTarget) => void runQueueAction(row, () => applyMatchAction(row.movementId, target));
  const classify = (row: MatchRowView, type: ClassifyType, tags: string[]) =>
    void runQueueAction(row, () => classifyRowAction(row.movementId, type, tags));

  /** Satırı etiketler; ret satır listesinin altındaki hata şeridine düşer (kuyruk hatasıyla aynı yer). */
  const onTag = async (movementId: string, tags: string[]) => {
    setQueueError(null);
    setTagBusyId(movementId);
    const { error } = await tagMovementAction(movementId, tags);
    setTagBusyId(null);
    if (error) {
      setQueueError(error);
      return;
    }
    startNav(() => router.refresh());
  };

  /** Belge dosyası: okuma adresi TIKLANINCA istenir (kısa ömürlü), yeni sekmede açılır. */
  const onOpenDocumentFile = async (document: OpenDocumentView) => {
    setQueueError(null);
    setBusyId(document.id);
    const { data: file, error } = await documentFileUrlAction(document.id);
    setBusyId(null);
    if (error || !file) {
      setQueueError(error ?? 'Belge dosyası açılamadı.');
      return;
    }
    window.open(file.url, '_blank', 'noopener');
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
    onSaved: () => {
      setPayingDocument(null);
      refresh();
    },
    onTag: (movementId: string, tags: string[]) => void onTag(movementId, tags),
    tagBusyId,
    payingDocument,
    onPayDocument: setPayingDocument,
    onClosePay: () => setPayingDocument(null),
    onOpenDocumentFile: (document: OpenDocumentView) => void onOpenDocumentFile(document),
    // Güçlü adayda tek tıkla onay: motorun "tek aday, belirsizlik yok" cevabı zaten burada
    // (`strength === 'strong'`), ekran ikinci bir soru sormuyor. Karar adayın üstünde hazır.
    onApprove: (row: MatchRowView) => applyTarget(row, row.candidates[0]!.target),
    // "Seç", "Düzelt" ve "Elle bağla" aynı pencereyi açar: üçü de "bu satır neyin parası" diye sorar.
    onPick: (row: MatchRowView) => setPicking(row),
    onClassify: classify,
    onDismiss: (row: MatchRowView) => void runQueueAction(row, () => dismissMatchAction(row.movementId)),
  };

  return (
    <>
      <FinanceDesktop {...view} />
      {picking ? (
        <MatchDialog
          row={picking}
          targets={data.matchTargets}
          tagOptions={data.tagOptions}
          busy={busyId === picking.movementId}
          onClose={() => setPicking(null)}
          onApply={(target) => {
            const row = picking;
            setPicking(null);
            applyTarget(row, target);
          }}
          onClassify={(type, tags) => {
            const row = picking;
            setPicking(null);
            classify(row, type, tags);
          }}
        />
      ) : null}
    </>
  );
}
