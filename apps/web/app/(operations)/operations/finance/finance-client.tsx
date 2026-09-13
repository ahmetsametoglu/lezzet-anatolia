'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  addTagAction,
  applyMatchAction,
  dismissMatchAction,
  documentFileUrlAction,
  removeAllocationAction,
  setMovementCounterpartyAction,
  setMovementNatureAction,
  tagMovementAction,
  unmatchRowAction,
} from '@/lib/finance/actions';
import type { MatchTarget } from '@/lib/bank/reconcile';
import { MatchDialog } from './match-dialog';
import { FinanceDesktop } from './finance.desktop';
import { financeUrl, type FinanceUrlState } from './finance-url';
import type { DialogKind, FinanceData, FinanceViewProps, MatchRowView, OpenDocumentView } from './finance-types';

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

/** Action'ların ortak cevabından yalnız hata okunur — veri sayfanın yeni hâliyle gelir. */
type ActionOutcome = { error: string | null };

export function FinanceClient({ data, urlState, writableAccounts }: FinanceClientProps) {
  const router = useRouter();
  const [navPending, startNav] = useTransition();
  const [dialog, setDialog] = useState<DialogKind>(null);
  /** Hangi kuyruk satırı işleniyor — iki kez tıklanmasın, ve hangisinin beklediği görünsün. */
  const [busyId, setBusyId] = useState<string | null>(null);
  const [queueError, setQueueError] = useState<string | null>(null);
  /** Hedef seçimi açık olan kuyruk satırı — kartın "Seç/Düzelt/Elle bağla"sı ve satırın "Bağla…"sı. */
  const [picking, setPicking] = useState<MatchRowView | null>(null);
  /** "Ödemesini yaz" denen açık belge — elle hareket penceresi belgeyle dolu açılır (12.12). */
  const [payingDocument, setPayingDocument] = useState<OpenDocumentView | null>(null);
  /** Geri alma ya da bağ kaldırma bekleyen defter satırı. */
  const [rowBusyId, setRowBusyId] = useState<string | null>(null);
  /** Defter satırının son reddi (13.09) — satırların üstünde okunur. */
  const [rowError, setRowError] = useState<string | null>(null);

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

  const runQueueAction = async (row: MatchRowView, run: () => Promise<ActionOutcome>) => {
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
  /** Kuyruk satırının TÜRÜNÜ koyar (13.09) — kartın menüsü ve seçim penceresi aynı kapıya gider. */
  const classify = (row: MatchRowView, nature: string) => void runQueueAction(row, () => setMovementNatureAction(row.movementId, nature));

  /**
   * Satırın tür · cari · etiket yazımı (13.09 · Kaydet yok). Sayfa verisi action'ın `revalidatePath`iyle
   * aynı cevapta tazelenir; satırın iyimser gösterimi o cevaba kadar sürer. Ret satırların üstündeki
   * şeride düşer ve söz `false` döner.
   */
  const writeRow = async (run: () => Promise<ActionOutcome>): Promise<boolean> => {
    setRowError(null);
    const { error } = await run();
    if (error) {
      setRowError(error);
      return false;
    }
    return true;
  };

  /** Geri alma ve bağ kaldırma — satır kilitlenir; bitince sayfa tazelenir. */
  const runRowAction = async (movementId: string, run: () => Promise<ActionOutcome>) => {
    setRowError(null);
    setRowBusyId(movementId);
    const { error } = await run();
    setRowBusyId(null);
    if (error) {
      setRowError(error);
      return;
    }
    startNav(() => router.refresh());
  };

  /** Menüden yeni etiket — sözlüğe girer, anahtarı döner (ad zaten varsa var olanınki). */
  const createTag = async (label: string): Promise<string | null> => {
    setRowError(null);
    const { data: created, error } = await addTagAction({ label });
    if (error || !created) {
      setRowError(error ?? 'Etiket eklenemedi.');
      return null;
    }
    return created.slug;
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

  const view: FinanceViewProps = {
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
    // Güçlü adayda tek tıkla onay: motorun "tek aday, belirsizlik yok" cevabı zaten burada
    // (`strength === 'strong'`), ekran ikinci bir soru sormuyor. Karar adayın üstünde hazır.
    onApprove: (row) => applyTarget(row, row.candidates[0]!.target),
    // "Seç", "Düzelt", "Elle bağla" ve satırın "Bağla…"sı aynı pencereyi açar: dördü de "bu satır
    // neyin parası" diye sorar.
    onPick: (row) => setPicking(row),
    onClassify: classify,
    onDismiss: (row) => void runQueueAction(row, () => dismissMatchAction(row.movementId)),
    onSetNature: (movementId, nature) => writeRow(() => setMovementNatureAction(movementId, nature)),
    onSetCounterparty: (movementId, counterpartyId) => writeRow(() => setMovementCounterpartyAction(movementId, counterpartyId)),
    onTag: (movementId, tags) => writeRow(() => tagMovementAction(movementId, tags)),
    onCreateTag: createTag,
    onUnmatch: (movementId) => void runRowAction(movementId, () => unmatchRowAction(movementId)),
    onRemoveAllocation: (movementId, documentId) => void runRowAction(movementId, () => removeAllocationAction(movementId, documentId)),
    rowBusyId,
    rowError,
    payingDocument,
    onPayDocument: setPayingDocument,
    onClosePay: () => setPayingDocument(null),
    onOpenDocumentFile: (document) => void onOpenDocumentFile(document),
  };

  return (
    <>
      <FinanceDesktop {...view} />
      {picking ? (
        <MatchDialog
          row={picking}
          targets={data.matchTargets}
          natureOptions={data.natureOptions}
          busy={busyId === picking.movementId}
          onClose={() => setPicking(null)}
          onApply={(target) => {
            const row = picking;
            setPicking(null);
            applyTarget(row, target);
          }}
          onClassify={(nature) => {
            const row = picking;
            setPicking(null);
            classify(row, nature);
          }}
        />
      ) : null}
    </>
  );
}
