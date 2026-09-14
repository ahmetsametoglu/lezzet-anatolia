'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  addTagAction,
  applyMatchAction,
  documentFileUrlAction,
  documentRowAction,
  ledgerRowsAction,
  linkDocumentAction,
  loadMoreDocumentsAction,
  loadMoreLedgerAction,
  removeAllocationAction,
  setMovementCounterpartyAction,
  setMovementNatureAction,
  tagMovementAction,
  unmatchRowAction,
} from '@/lib/finance/actions';
import { FinanceDesktop } from './finance.desktop';
import { financeUrl, type FinanceUrlState } from './finance-url';
import type { DialogKind, DocumentRowView, FinanceData, FinanceViewProps, MovementRowView } from './finance-types';

// Para client kökü: tek durum ağacı burada. Operasyon web'i masaüstü-yalnız (06.08);
// mobil deneyim native uygulamada — `docs/uygulama`.
//
// Süzgeçler GERÇEK GEZİNMEDİR (`?acct=…&tab=…&from=…`) çünkü veriyi sunucu okuyor ve "şu hesabın
// hareketleri" bağlantısı paylaşılabilir olmalı. Listenin eklenen sayfaları ise İSTEMCİ durumudur:
// imleç adrese yazılmaz (CLAUDE §1).

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
  /** Hangi belge işleniyor (dosyası açılıyor) — iki kez tıklanmasın, hangisinin beklediği görünsün. */
  const [busyId, setBusyId] = useState<string | null>(null);
  /** "Ödemesini yaz" denen belge — elle hareket penceresi belgeyle dolu açılır (12.12). */
  const [payingDocument, setPayingDocument] = useState<DocumentRowView | null>(null);
  /** Yapısal yazım bekleyen satır (bağ, hedef, geri alma). */
  const [rowBusyId, setRowBusyId] = useState<string | null>(null);
  /** Satırın son reddi — listenin üstünde okunur. */
  const [rowError, setRowError] = useState<string | null>(null);

  // ── Liste: ilk sayfa sunucudan, devamı action ile EKLENİR (müşteri ekranının deseni) ──
  const onDocuments = urlState.tab === 'documents';
  const firstPage = onDocuments ? data.documents : data.ledger;
  const [extraMovements, setExtraMovements] = useState<MovementRowView[]>([]);
  const [extraDocuments, setExtraDocuments] = useState<DocumentRowView[]>([]);
  const [cursor, setCursor] = useState<string | null>(firstPage?.nextCursor ?? null);
  const [loadingMore, setLoadingMore] = useState(false);
  /*
    SÜZGEÇ ya da SEKME değişince eklenen sayfalar SIFIRLANIR — eski süzgecin satırları yeni
    listede kalmasın. Yazım sonrası tazelemede KORUNUR: sayfa 2'deki satıra etiket koyan operatörün
    listesi başa dönmez, o satırın kendisi yeniden okunur (`refreshMovement`). Prop değişince durumu
    ayarlamanın React deseni: efekt değil, çizim sırasında karşılaştırma.
  */
  const listKey = financeUrl(urlState);
  const [seenKey, setSeenKey] = useState(listKey);
  const [seenFirst, setSeenFirst] = useState(firstPage);
  if (seenKey !== listKey) {
    setSeenKey(listKey);
    setSeenFirst(firstPage);
    setExtraMovements([]);
    setExtraDocuments([]);
    setCursor(firstPage?.nextCursor ?? null);
  } else if (seenFirst !== firstPage) {
    setSeenFirst(firstPage);
    // Henüz sayfa eklenmediyse imleç ilk sayfanın yenisinden okunur (başa yeni satır eklenmiş olabilir).
    if (extraMovements.length === 0 && extraDocuments.length === 0) setCursor(firstPage?.nextCursor ?? null);
  }
  const movementRows = [...(data.ledger?.rows ?? []), ...extraMovements];
  const documentRows = [...(data.documents?.rows ?? []), ...extraDocuments];

  // `replace` (push değil): süzgeç değiştirmek bir GEZİNME değil, aynı ekranın başka bir görünümü.
  const go = (next: Partial<FinanceUrlState>) => {
    startNav(() => router.replace(financeUrl({ ...urlState, ...next }), { scroll: false }));
  };

  /** Yazma sonrası tazeleme — `revalidatePath` sunucuyu tazeliyor, `refresh` onu ekrana taşıyor. */
  const refresh = () => {
    setDialog(null);
    startNav(() => router.refresh());
  };

  /** "Devamını yükle" ile gelmiş satır yazımdan sonra kendisi yeniden okunur — liste başa dönmez. */
  const refreshMovement = async (movementId: string) => {
    if (!extraMovements.some((row) => row.id === movementId)) return;
    const { data: fresh, error } = await ledgerRowsAction(movementId);
    if (error || !fresh) {
      setRowError(error ?? 'Satır tazelenemedi — sayfayı yenileyin.');
      return;
    }
    setExtraMovements((rows) => rows.map((row) => (row.id === movementId ? (fresh.find((next) => next.ledgerAccountId === row.ledgerAccountId) ?? row) : row)));
  };
  const refreshDocument = async (documentId: string) => {
    if (!extraDocuments.some((document) => document.id === documentId)) return;
    const { data: fresh, error } = await documentRowAction(documentId);
    if (error) {
      setRowError(error);
      return;
    }
    if (fresh) setExtraDocuments((documents) => documents.map((document) => (document.id === documentId ? fresh : document)));
  };
  /** Yazım sonrası: eklenmiş sayfadaki satır ya da belge tazelenir (satırın menüleri verisini açılınca okur). */
  const afterWrite = (movementId: string, documentId: string | null = null) => {
    void refreshMovement(movementId);
    if (documentId) void refreshDocument(documentId);
  };

  /**
   * Satırın tür · cari · etiket yazımı (13.09 · Kaydet yok). Sayfa verisi action'ın `revalidatePath`iyle
   * aynı cevapta tazelenir; satırın iyimser gösterimi o cevaba kadar sürer. Ret satırların üstündeki
   * şeride düşer ve söz `false` döner.
   */
  const writeRow = async (movementId: string, run: () => Promise<ActionOutcome>): Promise<boolean> => {
    setRowError(null);
    const { error } = await run();
    if (error) {
      setRowError(error);
      return false;
    }
    afterWrite(movementId);
    return true;
  };

  /** Yapısal yazım (bağ, hedef, geri alma) — satır kilitlenir; bitince sayfa tazelenir. */
  const runRowAction = async (movementId: string, run: () => Promise<ActionOutcome>, documentId: string | null = null): Promise<boolean> => {
    setRowError(null);
    setRowBusyId(movementId);
    const { error } = await run();
    setRowBusyId(null);
    if (error) {
      setRowError(error);
      return false;
    }
    startNav(() => router.refresh());
    afterWrite(movementId, documentId);
    return true;
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
  const onOpenDocumentFile = async (document: DocumentRowView) => {
    setRowError(null);
    setBusyId(document.id);
    const { data: file, error } = await documentFileUrlAction(document.id);
    setBusyId(null);
    if (error || !file) {
      setRowError(error ?? 'Belge dosyası açılamadı.');
      return;
    }
    window.open(file.url, '_blank', 'noopener');
  };

  const onLoadMore = () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    const search = window.location.search;
    // Düşen sayfa isteği satırların üstündeki şeride yazılır — sessiz kalsaydı liste kuyruğunu gizlerdi.
    const request = onDocuments
      ? loadMoreDocumentsAction(search, cursor).then(({ data: page, error }) => {
          if (error || !page) return setRowError(error ?? 'Sonraki sayfa okunamadı.');
          setExtraDocuments((rows) => [...rows, ...page.rows]);
          setCursor(page.nextCursor);
        })
      : loadMoreLedgerAction(search, cursor).then(({ data: page, error }) => {
          if (error || !page) return setRowError(error ?? 'Sonraki sayfa okunamadı.');
          setExtraMovements((rows) => [...rows, ...page.rows]);
          setCursor(page.nextCursor);
        });
    void request.finally(() => setLoadingMore(false));
  };

  const view: FinanceViewProps = {
    data,
    urlState,
    writableAccounts,
    navPending,
    dialog,
    busyId,
    onFilter: go,
    onOpenDialog: setDialog,
    onCloseDialog: () => setDialog(null),
    onSaved: () => {
      setPayingDocument(null);
      refresh();
    },
    onSetNature: (movementId, nature) => writeRow(movementId, () => setMovementNatureAction(movementId, nature)),
    onSetCounterparty: (movementId, counterpartyId) => writeRow(movementId, () => setMovementCounterpartyAction(movementId, counterpartyId)),
    onTag: (movementId, tags) => writeRow(movementId, () => tagMovementAction(movementId, tags)),
    onCreateTag: createTag,
    onUnmatch: (movementId) => void runRowAction(movementId, () => unmatchRowAction(movementId)),
    onRemoveAllocation: (movementId, documentId) => void runRowAction(movementId, () => removeAllocationAction(movementId, documentId), documentId),
    onApplyTarget: (movementId, target) => runRowAction(movementId, () => applyMatchAction(movementId, target)),
    onLinkDocument: (movementId, documentId) => runRowAction(movementId, () => linkDocumentAction(movementId, documentId), documentId),
    rowBusyId,
    rowError,
    movementRows,
    documentRows,
    hasMore: cursor !== null,
    loadingMore,
    onLoadMore,
    payingDocument,
    onPayDocument: setPayingDocument,
    onClosePay: () => setPayingDocument(null),
    onOpenDocumentFile: (document) => void onOpenDocumentFile(document),
  };

  return <FinanceDesktop {...view} />;
}
