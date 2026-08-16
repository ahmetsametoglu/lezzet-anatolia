import { useCallback, useEffect, useRef, useState } from 'react';
import type { DayCloseDraftContract } from '@lezzet/types';

import { fetchDayCloseDraft, submitDayClose } from '@/lib/api/courier';
import { useNotice } from '@/lib/haptics/use-notice.hook';
import { fillCopy } from '@/screens/operations/copy';
import { courierCopy } from './copy';
import { centsToAmountText, money, parseAmountToCents, signedMoney } from './courier-format';

/*
  GÜN KAPANIŞI (K7) — taslak okuması, sayım girdileri, iki adımlı onay.

  ── KAPANIŞ BİR MUTABAKATTIR, PARA HAREKETİ DEĞİL ───────────────────────────
  Para kapıda tahsil edilirken zaten yazıldı; burada beklenen (sistemin hesabı) ile sayılan
  (kuryenin teslim ettiği) yan yana durur ve FARK işaretiyle görünür — eksi eksik teslim, artı
  fazla para (`design/pages/app-kurye.md` K7). Mutlak değere indirgemek işaretin taşıdığı tek
  bilgiyi silerdi.

  ── SAYIM ALANLARI BEKLENENLE AÇILIR ────────────────────────────────────────
  v2:951 aynısını yapıyor (`say = S.sayilan[k] ?? bek`). Gerekçe: normal gün fark SIFIRDIR ve
  kuryeye üç alanı elle doldurtmak, doğru olanı yazmak için emek isteyip yanlış olanı ise sessizce
  geçirir. Değiştirilen alan zaten farkı anında gösteriyor.

  ── KAPANMIŞ GÜN SALT-OKUNUR ────────────────────────────────────────────────
  `closed` doluysa alanlar KİLİTLİ ve değerler kapanış KAYDINDAN okunur — taslağın "beklenen"i
  değil, o gün ne konuşulduysa o (kaydın `expected_*` alanları anın fotoğrafıdır). İkinci kapanış
  isteği zaten uçta reddediliyor (`already_closed`); ekranın kilidi o reddi beklemeden gösteriyor.
  `already_closed` bir HATA DEĞİL, bir gerçektir: yeşil değil ama kırmızı da değil, bilgi.
*/

const t = courierCopy;

/**
 * Üç yöntemin TEK sırası — ekran satırları, fark hesabı ve istek gövdesi (`countedCash…`,
 * `countedCard…`, `countedCheque…`) aynı sıradan okur. İhraç EDİLMİYOR: dışarıdan kimse bu sırayı
 * bilmek zorunda değil, hook zaten sıralı satırlar döndürüyor.
 */
const CLOSE_METHODS = ['cash', 'card', 'cheque'] as const;
type CloseMethod = (typeof CLOSE_METHODS)[number];

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
  notice: { tone: 'ok' | 'info' | 'error'; text: string } | null;
  close: () => void;
}

export function useDayClose(): UseDayCloseResult {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [draft, setDraft] = useState<DayCloseDraftContract | null>(null);
  const [counted, setCounted] = useState<Partial<Record<CloseMethod, string>>>({});
  const [note, setNote] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useNotice<NonNullable<UseDayCloseResult['notice']>>();
  const [closedLocally, setClosedLocally] = useState(false);

  const generation = useRef(0);

  const load = useCallback(async () => {
    const run = (generation.current += 1);
    const result = await fetchDayCloseDraft();
    if (run !== generation.current) return;

    if (result.error !== null) {
      setStatus('error');
      return;
    }
    setDraft(result.data);
    setNote(result.data.closed?.note ?? '');
    setStatus('ready');
  }, []);

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
    if (draft === null || closed || sending) return;
    setSending(true);
    setNotice(null);

    void (async () => {
      // Bozuk girdide BEKLENEN gönderilir: "sayamadım" hâlinde uydurma bir sayı yazmak yerine
      // sistemin kendi hesabı gider ve fark sıfır çıkar — yani ekranda "—" gördüğü şeyi kurye
      // bilerek onaylamış olur, gizlenmiş bir sayı değil.
      const amounts = rows.map((row) => parseAmountToCents(row.countedText) ?? row.expectedCents);
      const result = await submitDayClose({
        date: draft.date,
        countedCashCents: amounts[0],
        countedCardCents: amounts[1],
        countedChequeCents: amounts[2],
        note: note.trim().length === 0 ? null : note.trim(),
      });
      setSending(false);
      setConfirming(false);

      if (result.error !== null) {
        setNotice({ tone: 'error', text: fillCopy(t.dayClose.failed, { error: result.error }) });
        return;
      }
      if (!result.data.ok) {
        // `already_closed` bir hata DEĞİL: kapanmış gün salt-okunurdur, ikinci çağrı EZMEZ.
        setClosedLocally(true);
        setNotice({ tone: 'info', text: t.dayClose.alreadyClosed });
        return;
      }

      setClosedLocally(true);
      setNotice({
        tone: 'ok',
        text: fillCopy(t.dayClose.done, {
          cash: signedMoney(result.data.differenceCashCents ?? 0),
          card: signedMoney(result.data.differenceCardCents ?? 0),
          cheque: signedMoney(result.data.differenceChequeCents ?? 0),
        }),
      });
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
      if (!closed) setConfirming(true);
    },
    cancelConfirm: () => setConfirming(false),
    sending,
    notice,
    close,
  };
}

/** Beklenen tutarın okunur hâli — satır künyesinde "beklenen 42,00 €". */
export function expectedLabel(cents: number): string {
  return fillCopy(t.dayClose.expected, { amount: money(cents) });
}
