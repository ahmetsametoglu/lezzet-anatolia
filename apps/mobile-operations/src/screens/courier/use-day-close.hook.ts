import { useCallback, useEffect, useRef, useState } from 'react';
import type { DayCloseDraftContract } from '@lezzet/types';

import { fetchDayCloseDraft, submitDayClose } from '@/lib/api/courier';
import { toastError, toastInfo, toastSuccess } from '@lezzet/mobile-kit/src/lib/toast/toast-store';
import { fillCopy } from '@/screens/operations/copy';
import { courierCopy } from './copy';
import { centsToAmountText, money, parseAmountToCents, signedMoney } from './courier-format';

/*
  Sefer kapanışı: öznesi seferdir ve taslak kuryenin o günkü seferini getirir; beklenen ile sayılan yan yana durur ve fark işaretiyle görünür (eksi eksik, artı fazla).
  Sayım alanları beklenenle açılır, çünkü normal gün fark sıfırdır; kapanmış seferde alanlar kilitlidir ve değerler kapanış kaydından okunur.
*/

const t = courierCopy;

/**
 * Üç yöntemin TEK sırası — ekran satırları, fark hesabı ve istek gövdesi (`countedCash…`,
 * `countedCard…`, `countedCheque…`) aynı sıradan okur. İhraç EDİLMİYOR: dışarıdan kimse bu sırayı
 * bilmek zorunda değil, hook zaten sıralı satırlar döndürüyor.
 */
const CLOSE_METHODS = ['cash', 'card', 'cheque'] as const;
/** Kapanışta sayılan kasalar; ihraç edilir, çünkü ekran hangi kasanın tuş takımının açık olduğunu bu tiple tutar. */
export type CloseMethod = (typeof CLOSE_METHODS)[number];

interface CloseMoneyRow {
  method: CloseMethod;
  label: string;
  expectedCents: number;
  countedText: string;
  /** Sayılan − beklenen (cent). Girdi bozuksa `null` — fark UYDURULMAZ. */
  differenceCents: number | null;
  differenceLabel: string;
}

interface UseDayCloseResult {
  status: 'loading' | 'ready' | 'error';
  draft: DayCloseDraftContract | null;
  reload: () => void;

  /** Gün kapanmış mı — kapanmışsa ekran salt-okunur. */
  closed: boolean;
  deliveredCount: number;
  pendingCount: number;
  returnedCount: number;
  /** Sonuçlanmamış durak uyarısı; kapanışı ENGELLEMEZ (K7). */
  openWarning: string | null;

  rows: CloseMoneyRow[];
  setCounted: (method: CloseMethod, value: string) => void;
  note: string;
  setNote: (value: string) => void;

  confirming: boolean;
  askConfirm: () => void;
  cancelConfirm: () => void;
  sending: boolean;
  /**
   * Kapanış sonucunun şekli, durum değil tip olarak durur: `announce` onu toast fiillerine çevirir ve tonların kümesi tek yerde tanımlı kalır.
   */
  noticeShape?: { tone: 'ok' | 'info' | 'error'; text: string };
  close: () => void;
}

/**
 * `onClosed` kapanış yazıldıktan sonra çağrılır ki ekran kendini kapatsın; `already_closed` dalında çağrılmaz, çünkü yeni kapanış olmadı.
 * `runId` verilmezse sunucu sürülen seferi çözer; iki seferli günde gösterilen künye ile kapatılan kaydın aynı olduğunu ancak kimlik garanti eder.
 */
export function useDayClose(onClosed?: () => void, runId?: string): UseDayCloseResult {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [draft, setDraft] = useState<DayCloseDraftContract | null>(null);
  const [counted, setCounted] = useState<Partial<Record<CloseMethod, string>>>({});
  const [note, setNote] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  /* Sonuç toast'ta ve ekran kapanan seferi geride bırakır (`onClosed`): yerinde kalsaydı kurye kapattığı seferi karşısında görmeye devam ederdi. */
  const announce = useCallback((notice: NonNullable<UseDayCloseResult['noticeShape']>) => {
    if (notice.tone === 'ok') toastSuccess(notice.text);
    else if (notice.tone === 'error') toastError(notice.text);
    else toastInfo(notice.text);
  }, []);
  const [closedLocally, setClosedLocally] = useState(false);

  const generation = useRef(0);

  const load = useCallback(async () => {
    const run = (generation.current += 1);
    const result = await fetchDayCloseDraft(runId === undefined ? {} : { runId });
    if (run !== generation.current) return;

    if (result.error !== null) {
      setStatus('error');
      return;
    }
    setDraft(result.data);
    setNote(result.data.closed?.note ?? '');
    setStatus('ready');
  }, [runId]);

  useEffect(() => {
    void load();
  }, [load]);

  const closedRecord = draft?.closed ?? null;
  const closed = closedRecord !== null || closedLocally;

  const expectedOf = (method: CloseMethod): number => {
    if (closedRecord !== null) {
      return method === 'cash'
        ? closedRecord.expectedCashCents
        : method === 'card'
          ? closedRecord.expectedCardCents
          : closedRecord.expectedChequeCents;
    }
    if (draft === null) return 0;
    return method === 'cash'
      ? draft.expected.cashCents
      : method === 'card'
        ? draft.expected.cardCents
        : draft.expected.chequeCents;
  };

  const countedOf = (method: CloseMethod): string => {
    if (closedRecord !== null) {
      return centsToAmountText(
        method === 'cash'
          ? closedRecord.countedCashCents
          : method === 'card'
            ? closedRecord.countedCardCents
            : closedRecord.countedChequeCents,
      );
    }
    return counted[method] ?? centsToAmountText(expectedOf(method));
  };

  const rows: CloseMoneyRow[] = CLOSE_METHODS.map((method) => {
    const expectedCents = expectedOf(method);
    const countedText = countedOf(method);
    const countedCents = parseAmountToCents(countedText);
    const differenceCents = countedCents === null ? null : countedCents - expectedCents;
    return {
      method,
      label: t.method[method],
      expectedCents,
      countedText,
      differenceCents,
      // Ölçülemeyen fark SIFIR DEĞİLDİR: bozuk girdide çizgi yazılır, "0,00 €" değil (CLAUDE §1).
      differenceLabel: differenceCents === null ? '—' : signedMoney(differenceCents),
    };
  });

  const deliveredCount = draft?.delivered.length ?? 0;
  const pendingCount = draft?.pending.length ?? 0;
  const returnedCount = draft?.returned.length ?? 0;

  /*
    `useCallback` YOK ve bilinçli: gövde her render'da yeniden kurulan `rows`u okuyor, yani bir
    bağımlılık listesi ya `rows`u da içermek (her render'da yeni referans → memo anlamsız) ya da
    eskimiş bir sayımı göndermek zorunda kalırdı. Kimlik kararlılığına ihtiyaç da yok: değer tek
    bir `onPress`e gidiyor, memo edilmiş bir alt ağaca değil.
  */
  const close = () => {
    // Sefer yoksa kapatılacak bir şey de yok — istek gönderilmez (ekran zaten formu çizmiyor).
    if (draft === null || draft.run === null || closed || sending) return;
    /* Kapanışın öznesi SEFER: ekranın gösterdiği künye ile kapatılan kayıt aynı olsun diye kimlik
       taslaktan İSTEK KURULMADAN ÖNCE alınır — cevap beklenirken taslak tazelenirse bile gönderilen
       kimlik kuryenin onayladığı seferin kimliğidir. */
    const runId = draft.run.runId;
    setSending(true);

    void (async () => {
      // Bozuk girdide BEKLENEN gönderilir: "sayamadım" hâlinde uydurma bir sayı yazmak yerine
      // sistemin kendi hesabı gider ve fark sıfır çıkar — yani ekranda "—" gördüğü şeyi kurye
      // bilerek onaylamış olur, gizlenmiş bir sayı değil.
      const amounts = rows.map((row) => parseAmountToCents(row.countedText) ?? row.expectedCents);
      const result = await submitDayClose({
        runId,
        countedCashCents: amounts[0],
        countedCardCents: amounts[1],
        countedChequeCents: amounts[2],
        note: note.trim().length === 0 ? null : note.trim(),
      });
      setSending(false);
      setConfirming(false);

      if (result.error !== null) {
        announce({ tone: 'error', text: fillCopy(t.dayClose.failed, { error: result.error }) });
        return;
      }
      if (!result.data.ok) {
        // `already_closed` bir hata DEĞİL: kapanmış sefer salt-okunurdur, ikinci çağrı EZMEZ.
        setClosedLocally(true);
        announce({ tone: 'info', text: t.dayClose.alreadyClosed });
        return;
      }

      const released = result.data.releasedCount ?? 0;
      setClosedLocally(true);
      announce({
        tone: 'ok',
        text:
          fillCopy(t.dayClose.done, {
            cash: signedMoney(result.data.differenceCashCents ?? 0),
            card: signedMoney(result.data.differenceCardCents ?? 0),
            cheque: signedMoney(result.data.differenceChequeCents ?? 0),
          }) +
          // Kapanışın çözdüğü takılı durak SESSİZ geçmez (K4): kurye onların yarına devrolduğunu
          // burada okur. Sıfırsa cümle hiç kurulmaz — "0 durak çözüldü" bir bilgi değil gürültüdür.
          (released > 0 ? fillCopy(t.dayClose.released, { n: String(released) }) : ''),
      });
      /* Kapanan sefer geride bırakılır: ekran yerinde kalsaydı kurye kapattığı seferi karşısında görmeye devam ederdi; sonuç zaten toast'ta. */
      onClosed?.();
    })();
  };

  return {
    status,
    draft,
    reload: useCallback(() => {
      setStatus('loading');
      void load();
    }, [load]),

    closed,
    deliveredCount,
    pendingCount,
    returnedCount,
    openWarning:
      !closed && pendingCount > 0 ? fillCopy(t.dayClose.openWarning, { n: String(pendingCount) }) : null,

    rows,
    setCounted: (method, value) => setCounted((current) => ({ ...current, [method]: value })),
    note,
    setNote,

    confirming,
    askConfirm: () => {
      if (!closed && draft?.run != null) setConfirming(true);
    },
    cancelConfirm: () => setConfirming(false),
    sending,
    close,
  };
}

/** Beklenen tutarın okunur hâli — satır künyesinde "beklenen 42,00 €". */
export function expectedLabel(cents: number): string {
  return fillCopy(t.dayClose.expected, { amount: money(cents) });
}
