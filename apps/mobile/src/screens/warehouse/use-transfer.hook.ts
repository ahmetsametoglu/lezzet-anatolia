import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import type { InboundTransferContract } from '@lezzet/types';

import { fetchInboundTransfers, receiveTransfer } from '@/lib/api/warehouse';
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

  ── SEVK YOK, YALNIZ KABUL ──────────────────────────────────────────────────
  Bu ekran "ver" yarısını çizmiyor (tasarımda yok) ve uçta da açılmadı; gerekçe uç künyesinde.
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
  transfer: InboundTransferContract | null;
  select: (transferId: string | null) => void;
  /** Satırın sayılan adedi; `null` = HENÜZ SAYILMADI (sıfır değil). */
  countOf: (lineId: string) => number | null;
  setCount: (lineId: string, qty: number | null) => void;
  /** Kapının "sayılmadı" dediği satırlar — cevaptan gelir, tahmin edilmez. */
  missingLineIds: string[];
  /** Bütün satırlar sayıldı mı — CTA'nın kapısı. */
  counted: boolean;
  sending: boolean;
  notice: TransferNotice | null;
  submit: () => void;
  reload: () => void;
}

export function useTransfer(): UseTransferResult {
  const [status, setStatus] = useState<TransferStatus>('loading');
  const [transfers, setTransfers] = useState<InboundTransferContract[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [counts, setCounts] = useState<Record<string, number | null>>({});
  const [missingLineIds, setMissingLineIds] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useNotice<TransferNotice>();

  const generation = useRef(0);

  const load = useCallback(async () => {
    const run = (generation.current += 1);
    const result = await trackWarehouse(fetchInboundTransfers());
    if (run !== generation.current) return;

    if (result.error !== null) {
      setStatus('error');
      return;
    }

    setTransfers(result.data.transfers);
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
  }, []);

  const countOf = useCallback(
    (lineId: string): number | null => {
      const value = counts[lineId];
      return value === undefined ? null : value;
    },
    [counts],
  );

  const setCount = useCallback((lineId: string, qty: number | null) => {
    // Negatif adet bir sayım değil bir yazım hatasıdır; kapı da `nonnegative` istiyor.
    setCounts((current) => ({ ...current, [lineId]: qty === null ? null : Math.max(0, qty) }));
  }, []);

  const transfer = transfers.find((row) => row.transferId === selectedId) ?? null;
  const counted = transfer !== null && transfer.lines.every((line) => countOf(line.lineId) !== null);

  const submit = useCallback(() => {
    if (transfer === null || sending || !counted) return;
    setSending(true);
    setNotice(null);

    void (async () => {
      const lines = transfer.lines.map((line) => ({ lineId: line.lineId, receivedQty: countOf(line.lineId) ?? 0 }));
      const result = await trackWarehouse(receiveTransfer(transfer.transferId, { lines }));
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
  }, [counted, countOf, load, sending, transfer]);

  return {
    status,
    transfers,
    transfer,
    select,
    countOf,
    setCount,
    missingLineIds,
    counted,
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
