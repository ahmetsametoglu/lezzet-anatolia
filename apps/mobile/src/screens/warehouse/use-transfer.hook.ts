import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import type {
  ClosedTransferContract,
  InboundTransferContract,
  OutboundTransferContract,
  TransferShortfallDeclaration,
} from '@lezzet/types';

import { fetchWarehouseTransfers, receiveTransfer } from '@/lib/api/warehouse';
import { useNotice } from '@/lib/haptics/use-notice.hook';
import { fillCopy } from '@/screens/operations/copy';
import { warehouseCopy } from './copy';
import { trackWarehouse } from './warehouse-status';

/*
  D5 · TRANSFER — RAMPADA SAYIM (v2:458-480). `/warehouse/transfers` + `/transfers/:id/receive`.

  ── EKRANIN TAMAMI TEK BİR AYRIMIN ÜSTÜNDE DURUYOR ──────────────────────────
  v2:474 birebir: *"0 = geldi ama kayıp; boş = sayılmadı — boş satır kabulü bloklar, ikisi ayrı
  şeydir."* Bu yüzden satır adedi `number | null`dır ve `null` asla 0'a düşürülmez: sıfır bir
  BEYANDIR ("sevk edildi, gelmedi") ve kayıp malın kaydını doğurur; boş ise "daha bakmadım"dır.
  İkisini birleştiren bir alan, sayılmamış bir satırı kayıp beyanına çevirirdi.

  Sözleşme de aynı ayrımı taşıyor (`InboundTransferLineContract.receivedQty: number | null`) ve kapı
  sayılmamış satır varsa `incomplete` + `missingLineIds` döner — yani ret EKRAN VERİSİDİR: hangi
  satırın sayılmadığı rampada aranacak bilginin ta kendisi. İstemci kendi kontrolünü de yapar
  (CTA kapalı kalır), ama kapının cevabı yine de gösterilir: araya biri girip satır eklemiş olabilir.

  ── SEVK YOK, YALNIZ KABUL — AMA ÜÇ BÖLÜM VAR (30.08) ───────────────────────
  Ekran hâlâ "ver" yarısını çizmiyor: sevk masaüstündeki Depolar ekranının işi. Şablonun (v3:11)
  öteki iki bölümü ise OKUMA: **YOLDA** (bu depodan çıkmış, hâlâ yolda) ve **SON KAPANANLAR**.
  İkisi de eylem taşımaz — biri "unuttuğum bir sevkiyat yolda mı", öteki "son ne kapandı" diye
  sorar. Kabul kuyruğuyla aynı turdan geliyorlar (`fetchWarehouseTransfers`), çünkü aynı ekranın
  aynı anda çizdiği şeyler.
*/

const t = warehouseCopy;

type TransferStatus = 'loading' | 'ready' | 'error';

/** Kapının altı cevabı — sözleşmeden TÜRER, elle yazılmaz. */
type ReceiveOutcome = Extract<Awaited<ReturnType<typeof receiveTransfer>>, { error: null }>['data'];

interface TransferNotice {
  tone: 'ok' | 'warn' | 'error';
  text: string;
}

interface UseTransferResult {
  status: TransferStatus;
  transfers: InboundTransferContract[];
  /** Bu depodan çıkmış, hâlâ yolda — okuma bölümü, eylemi yok. */
  outbound: OutboundTransferContract[];
  /** Son kapananlar (kabul edilmiş / geri alınmış), iki yön birden — sabit sınırlı pencere. */
  closed: ClosedTransferContract[];
  transfer: InboundTransferContract | null;
  select: (transferId: string | null) => void;
  /** Satırın sayılan adedi; `null` = HENÜZ SAYILMADI (sıfır değil). */
  countOf: (lineId: string) => number | null;
  setCount: (lineId: string, qty: number | null) => void;
  /** Kapının "sayılmadı" dediği satırlar — cevaptan gelir, tahmin edilmez. */
  missingLineIds: string[];
  /** Bütün satırlar sayıldı mı — CTA'nın kapısı. */
  counted: boolean;
  /**
   * EKSİK BEYANI (04.09): bütün satırlar sayılmış ve en az biri sevk edilenden azsa dolu — satır
   * satır fark ve toplam. Sayım bitmeden `null`: yarım sayımın eksiği bir beyan değil, bir
   * bilinmezdir (boş ≠ 0 ayrımının aynısı).
   */
  shortfall: TransferShortfallDraft | null;
  /** Beyan çekmecesi açık mı — yalnız eksik varken açılır, CTA'nın ikinci dokunuşu. */
  declarationOpen: boolean;
  declaration: DeclarationDraft;
  setDeclarationReason: (reason: DeclarationDraft['reason']) => void;
  setDeclarationNote: (note: string) => void;
  /** Çekmecenin düğmesi: beyanla birlikte kabulü yazar. */
  confirmDeclaration: () => void;
  cancelDeclaration: () => void;
  sending: boolean;
  notice: TransferNotice | null;
  submit: () => void;
  reload: () => void;
}

export interface TransferShortfallDraft {
  qty: number;
  lines: Array<{ lineId: string; name: string; dispatchedQty: number; receivedQty: number }>;
}

/** Çekmecenin taslağı — sebep çip, not serbest metin (boş = gönderilmez). */
export interface DeclarationDraft {
  reason: TransferShortfallDeclaration['reason'];
  note: string;
}

const EMPTY_DECLARATION: DeclarationDraft = { reason: 'transfer_shortfall', note: '' };

export function useTransfer(): UseTransferResult {
  const [status, setStatus] = useState<TransferStatus>('loading');
  const [transfers, setTransfers] = useState<InboundTransferContract[]>([]);
  const [outbound, setOutbound] = useState<OutboundTransferContract[]>([]);
  const [closed, setClosed] = useState<ClosedTransferContract[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<string, number | null>>({});
  const [missingLineIds, setMissingLineIds] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useNotice<TransferNotice>();
  const [declarationOpen, setDeclarationOpen] = useState(false);
  const [declaration, setDeclaration] = useState<DeclarationDraft>(EMPTY_DECLARATION);

  const generation = useRef(0);

  const load = useCallback(async () => {
    const run = (generation.current += 1);
    const result = await trackWarehouse(fetchWarehouseTransfers());
    if (run !== generation.current) return;

    if (result.error !== null) {
      setStatus('error');
      return;
    }

    setTransfers(result.data.transfers);
    setOutbound(result.data.outbound);
    setClosed(result.data.closed);
    setStatus('ready');
    setSelectedId((current) =>
      current !== null && result.data.transfers.some((row) => row.transferId === current)
        ? current
        : result.data.transfers.length === 1
          ? (result.data.transfers[0]?.transferId ?? null)
          : null,
    );
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const reload = useCallback(() => {
    setStatus('loading');
    void load();
  }, [load]);

  const select = useCallback((transferId: string | null) => {
    setSelectedId(transferId);
    setCounts({});
    setMissingLineIds([]);
    setNotice(null);
    setDeclarationOpen(false);
    setDeclaration(EMPTY_DECLARATION);
  }, []);

  const countOf = useCallback(
    (lineId: string): number | null => {
      const value = counts[lineId];
      return value === undefined ? null : value;
    },
    [counts],
  );

  const transfer = transfers.find((row) => row.transferId === selectedId) ?? null;

  const setCount = useCallback(
    (lineId: string, qty: number | null) => {
      // Negatif adet bir sayım değil bir yazım hatasıdır; kapı da `nonnegative` istiyor.
      // TAVAN SEVK EDİLEN ADET (04.09): fazlası kapıda zaten reddediliyordu ama ret sunucudan
      // "receive_transfer: sevk edilen 5 iken 6 kabul edilemez" diye geliyordu (cihazda ölçüldü
      // 03.09) — fonksiyon adı depocunun ekranında. Duvar artık girişte: sayaç ve çekmece tavanda durur.
      const dispatched = transfer?.lines.find((line) => line.lineId === lineId)?.dispatchedQty;
      setCounts((current) => ({
        ...current,
        [lineId]: qty === null ? null : Math.min(dispatched ?? Number.POSITIVE_INFINITY, Math.max(0, qty)),
      }));
    },
    [transfer],
  );

  const counted = transfer !== null && transfer.lines.every((line) => countOf(line.lineId) !== null);

  /* EKSİK BEYANI yalnız sayım BİTİNCE kurulur: yarım sayımın eksiği bir beyan değil, bir
     bilinmezdir (boş ≠ 0 ayrımının aynısı — sayılmamış satır "eksik" sayılmaz). */
  const shortLines =
    transfer === null || !counted
      ? []
      : transfer.lines.flatMap((line) => {
          const receivedQty = countOf(line.lineId) ?? 0;
          return receivedQty < line.dispatchedQty
            ? [{ lineId: line.lineId, name: line.name, dispatchedQty: line.dispatchedQty, receivedQty }]
            : [];
        });
  const shortfall: TransferShortfallDraft | null =
    shortLines.length === 0
      ? null
      : { qty: shortLines.reduce((sum, line) => sum + line.dispatchedQty - line.receivedQty, 0), lines: shortLines };

  const send = useCallback(
    (declared: TransferShortfallDeclaration | null) => {
      if (transfer === null || sending || !counted) return;
      setSending(true);
      setNotice(null);
      setDeclarationOpen(false);

      void (async () => {
        const lines = transfer.lines.map((line) => ({ lineId: line.lineId, receivedQty: countOf(line.lineId) ?? 0 }));
        const result = await trackWarehouse(receiveTransfer(transfer.transferId, { lines, declaration: declared }));
        setSending(false);

        if (result.error !== null) {
          setNotice({
            tone: 'error',
            text:
              result.error === 'network_error'
                ? t.common.networkError
                : fillCopy(t.common.serverError, { error: result.error }),
          });
          return;
        }

        setMissingLineIds(result.data.status === 'incomplete' ? result.data.missingLineIds : []);
        setNotice(noticeOf(result.data));
        await load();
      })();
    },
    [counted, countOf, load, sending, transfer],
  );

  /*
    İKİ DOKUNUŞ, YALNIZ EKSİKTE (kullanıcı kararı 04.09): eksik varsa CTA önce beyan çekmecesini
    açar — yanlışlıkla "0 · hiç gelmedi"ye basılmış bir satırın kayıp olarak yazılmasını son bir
    bakış önler. Eksik yoksa kabul bugünkü gibi tek dokunuşla yazılır; rampaya adım eklenmez.
  */
  const submit = useCallback(() => {
    if (shortfall !== null) {
      setDeclarationOpen(true);
      return;
    }
    send(null);
  }, [send, shortfall]);

  const confirmDeclaration = useCallback(() => {
    const note = declaration.note.trim();
    send({ reason: declaration.reason, note: note.length === 0 ? null : note });
  }, [declaration, send]);

  const cancelDeclaration = useCallback(() => setDeclarationOpen(false), []);
  const setDeclarationReason = useCallback(
    (reason: DeclarationDraft['reason']) => setDeclaration((current) => ({ ...current, reason })),
    [],
  );
  const setDeclarationNote = useCallback((note: string) => setDeclaration((current) => ({ ...current, note })), []);

  return {
    status,
    transfers,
    outbound,
    closed,
    transfer,
    select,
    countOf,
    setCount,
    missingLineIds,
    counted,
    shortfall,
    declarationOpen,
    declaration,
    setDeclarationReason,
    setDeclarationNote,
    confirmDeclaration,
    cancelDeclaration,
    sending,
    notice,
    submit,
    reload,
  };
}

/** Kapının cevabı → ekrandaki cümle. Altı dalın hepsi gösterilir; hiçbiri yutulmaz. */
function noticeOf(outcome: ReceiveOutcome): TransferNotice {
  switch (outcome.status) {
    case 'ok':
      // Eksik varsa toast onu ve belgeyi söyler (04.09) — "Kabul yazıldı — 1 parti açıldı" beş
      // birim kaybı yutuyordu (cihazda ölçüldü 03.09).
      if (outcome.shortfall !== null) {
        const args = { n: String(outcome.createdBatches), qty: String(outcome.shortfall.qty) };
        return {
          tone: 'warn',
          text:
            outcome.shortfall.referenceNo === null
              ? fillCopy(t.transfer.resultShortNoRef, args)
              : fillCopy(t.transfer.resultShort, { ...args, ref: outcome.shortfall.referenceNo }),
        };
      }
      return { tone: 'ok', text: fillCopy(t.transfer.result.ok, { n: String(outcome.createdBatches) }) };
    case 'incomplete':
      return {
        tone: 'warn',
        text: fillCopy(t.transfer.result.incomplete, {
          n: String(outcome.missingLineIds.length + outcome.unknownLineIds.length),
        }),
      };
    case 'stale':
      return { tone: 'error', text: fillCopy(t.transfer.result.stale, { status: t.transfer.status[outcome.currentStatus] }) };
    case 'failed':
      // RPC'nin kendi cümlesi AYNEN gösterilir — fiziksel gerçeği ondan iyi anlatan bir metin yok.
      return { tone: 'error', text: outcome.message };
    case 'forbidden':
      return { tone: 'error', text: t.common.outOfScope };
    default:
      return { tone: 'error', text: t.common.notFound };
  }
}
