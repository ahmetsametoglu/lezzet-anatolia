import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { returnAdjustments, type ReturnPart } from '@lezzet/domain-core';
import {
  ReturnDispositionEnum,
  UNASSIGNED_RETURNS,
  type ReturnDisposition,
  type ReturnDropLineContract,
  type ReturningCourierContract,
  type WarehouseCourierReturnResponse,
} from '@lezzet/types';

import { acceptCourierReturn, fetchCourierReturn, fetchReturningCouriers, submitWarehouseReturn } from '@/lib/api/warehouse';
import { useNotice } from '@/lib/haptics/use-notice.hook';
import { fillCopy } from '@/screens/operations/copy';
import { warehouseCopy } from './copy';
import { trackWarehouse } from './warehouse-status';

/*
  D6 · Kurye dönüşü kabulü — `/courier-return`; liste kurye eksenlidir, çünkü mal kurye başına kapanır ve araç bir kez boşalır.
  Akıbet payları hedef adede motorda çevrilir (`returnAdjustments`, web iade penceresiyle ortak) ve CTA önce akıbetleri, sonra
  malı yazar: devir düşerse akıbetler yazılı kalır, bütün devir geri alınmaz.
*/

const t = warehouseCopy;

interface ReturnNotice {
  tone: 'ok' | 'warn' | 'error';
  text: string;
}

type DetailStatus = 'idle' | 'loading' | 'ready' | 'error';

interface UseCourierReturnResult {
  status: 'loading' | 'ready' | 'error';
  /** Rampada bekleyen kuryeler — kuryesiz küme de bir satırdır (`courierId: null`). */
  couriers: ReturningCourierContract[];
  reload: () => void;

  /** Seçili kuryenin dökümü; `null` = liste görünüyor. */
  detail: WarehouseCourierReturnResponse | null;
  detailStatus: DetailStatus;
  select: (courierId: string | null) => void;

  dispositionOf: (orderItemId: string) => ReturnDisposition | null;
  pick: (orderItemId: string, disposition: ReturnDisposition) => void;
  noteOf: (orderItemId: string) => string;
  setNote: (orderItemId: string, note: string) => void;
  /** Satırın adetleri akıbetlere ayrı ayrı mı işaretleniyor; tek akıbete dönüşte paylar silinir. */
  isSplit: (orderItemId: string) => boolean;
  setSplit: (orderItemId: string, split: boolean) => void;
  splitQtyOf: (orderItemId: string, disposition: ReturnDisposition) => number;
  setSplitQty: (orderItemId: string, disposition: ReturnDisposition, qty: number) => void;

  /** Sayılan DÖNEN adet — kutu beklenenle (araçta kayıtlı) dolu açılır. */
  countOf: (variantId: string) => number;
  setCount: (variantId: string, qty: number) => void;

  /** Her bekleyen kalemde adetlerin tamamı akıbete bağlandı mı ve "stoğa dön"ün notu yazılmış mı — CTA'nın kapısı. */
  canSubmit: boolean;
  sending: boolean;
  notice: ReturnNotice | null;
  submit: () => void;
}

/** Kuryesiz kümenin adresi — liste satırındaki `null` kimliğin yoldaki karşılığı. */
function pathIdOf(courierId: string | null): string {
  return courierId ?? UNASSIGNED_RETURNS;
}

export function useCourierReturn(): UseCourierReturnResult {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [couriers, setCouriers] = useState<ReturningCourierContract[]>([]);
  const [detail, setDetail] = useState<WarehouseCourierReturnResponse | null>(null);
  const [detailStatus, setDetailStatus] = useState<DetailStatus>('idle');
  const [dispositions, setDispositions] = useState<Record<string, ReturnDisposition>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [splits, setSplits] = useState<Record<string, Partial<Record<ReturnDisposition, number>>>>({});
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useNotice<ReturnNotice>();

  const generation = useRef(0);
  /* Seçim `useRef`te DE tutuluyor: liste tazelenirken açık detayı yeniden okumak gerekiyor ve
     `load` bağımlılığına seçimi koymak, her seçimde listeyi de yeniden çekerdi. */
  const selectedRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    const run = (generation.current += 1);
    const result = await trackWarehouse(fetchReturningCouriers());
    if (run !== generation.current) return;

    if (result.error !== null) {
      setStatus('error');
      return;
    }
    setCouriers(result.data.couriers);
    setStatus('ready');
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const openDetail = useCallback(async (courierId: string | null) => {
    setDetailStatus('loading');
    const result = await trackWarehouse(fetchCourierReturn(pathIdOf(courierId)));
    if (selectedRef.current !== pathIdOf(courierId)) return;

    if (result.error !== null) {
      setDetailStatus('error');
      return;
    }
    setDetail(result.data);
    setDetailStatus('ready');
  }, []);

  const select = useCallback(
    (courierId: string | null) => {
      // Seçim değişince taslak SIFIRLANIR: bir kuryenin işaretleri ötekinde durursa depocu, hiç
      // görmediği bir kalemi karara bağlamış olur (transfer ekranının aynı kuralı).
      setDispositions({});
      setNotes({});
      setSplits({});
      setCounts({});
      setNotice(null);

      // `select(null)` listeye dönüştür; kuryesiz kümenin kapısı `UNASSIGNED_RETURNS` dizgesidir. İki niyeti tek `null`a
      // bindirmek geri tuşuyla kuryesiz kümeyi aynı çağrı yapardı.
      if (courierId === null) {
        selectedRef.current = null;
        setDetail(null);
        setDetailStatus('idle');
        return;
      }
      selectedRef.current = courierId;
      void openDetail(courierId);
    },
    [openDetail, setNotice],
  );

  /** Kuryesiz kümeyi seçmenin yolu — kimliği `null` olduğu için `select` ile ifade edilemez. */
  const selectUnassigned = useCallback(() => {
    setDispositions({});
    setNotes({});
    setSplits({});
    setCounts({});
    setNotice(null);
    selectedRef.current = UNASSIGNED_RETURNS;
    void openDetail(null);
  }, [openDetail, setNotice]);

  const dispositionOf = useCallback(
    (orderItemId: string): ReturnDisposition | null => dispositions[orderItemId] ?? null,
    [dispositions],
  );

  const pick = useCallback(
    (orderItemId: string, disposition: ReturnDisposition) => {
      setDispositions((current) => ({ ...current, [orderItemId]: disposition }));
      setNotice(null);
    },
    [setNotice],
  );

  const noteOf = useCallback((orderItemId: string): string => notes[orderItemId] ?? '', [notes]);

  const setNote = useCallback((orderItemId: string, note: string) => {
    setNotes((current) => ({ ...current, [orderItemId]: note }));
  }, []);

  const isSplit = useCallback((orderItemId: string): boolean => splits[orderItemId] !== undefined, [splits]);

  const setSplit = useCallback((orderItemId: string, split: boolean) => {
    setSplits((current) => {
      const next = { ...current };
      if (split) next[orderItemId] = {};
      else delete next[orderItemId];
      return next;
    });
  }, []);

  const splitQtyOf = useCallback(
    (orderItemId: string, disposition: ReturnDisposition): number => splits[orderItemId]?.[disposition] ?? 0,
    [splits],
  );

  const setSplitQty = useCallback((orderItemId: string, disposition: ReturnDisposition, qty: number) => {
    setSplits((current) => ({ ...current, [orderItemId]: { ...current[orderItemId], [disposition]: Math.max(0, qty) } }));
  }, []);

  /** Satırın akıbet payları: tek akıbette bekleyen adedin tamamı, ayrı işaretlemede depocunun saydıkları; not her paya düşer. */
  const partsOf = useCallback(
    (line: ReturnDropLineContract): ReturnPart[] => {
      const note = notes[line.orderItemId] ?? null;
      const split = splits[line.orderItemId];
      if (split) return ReturnDispositionEnum.options.map((disposition) => ({ disposition, qty: split[disposition] ?? 0, note }));
      const disposition = dispositions[line.orderItemId];
      return disposition ? [{ disposition, qty: line.pendingQty, note }] : [];
    },
    [dispositions, notes, splits],
  );

  /*
    Sayaç araçta kayıtlı adetle açılır, normal günde fark sıfırdır. Kurye bir seferi sürüyorsa araç bugün boşalmaz ve sayaç
    sıfırdan açılır: depocu fiilen indirileni sayar, sayılmayan mal araçta kalır.
  */
  const countOf = useCallback(
    (variantId: string): number => {
      const stored = counts[variantId];
      if (stored !== undefined) return stored;
      if ((detail?.drivingRuns ?? 0) > 0) return 0;
      return detail?.freeGoods.find((line) => line.variantId === variantId)?.onVanQty ?? 0;
    },
    [counts, detail],
  );

  const setCount = useCallback((variantId: string, qty: number) => {
    // Negatif adet bir sayım değil bir yazım hatasıdır; kapı da `nonnegative` istiyor. TAVAN
    // BURADA YOK: beklenenden fazlasını kapı reddediyor (`not_enough`) ve sebebini söylüyor —
    // ekranda sessizce kırpmak, depocunun saydığı sayıyı yalanlamak olurdu.
    setCounts((current) => ({ ...current, [variantId]: Math.max(0, qty) }));
  }, []);

  /** Akıbeti BEKLEYEN satırlar — yazılmış adetler ikinci kez gönderilmez. */
  const pendingLines = (detail?.drops ?? []).flatMap((drop) =>
    drop.lines.filter((line) => line.pendingQty > 0).map((line) => ({ drop, line })),
  );

  const canSubmit = pendingLines.every(({ line }) => {
    const parts = partsOf(line);
    if (parts.reduce((sum, part) => sum + part.qty, 0) !== line.pendingQty) return false;
    const restock = parts.some((part) => part.disposition === 'restock' && part.qty > 0);
    return !restock || (notes[line.orderItemId]?.trim().length ?? 0) > 0;
  });

  const submit = useCallback(() => {
    if (sending || !canSubmit || detail === null) return;
    setSending(true);
    setNotice(null);

    void (async () => {
      const parts: string[] = [];
      let tone: ReturnNotice['tone'] = 'ok';

      // 1) AKIBETLER — sipariş başına. Yazılmış satır ikinci kez gönderilmez.
      let restocked = 0;
      let discarded = 0;
      let released = 0;
      let blocked: string | null = null;

      for (const drop of detail.drops) {
        const adjustments = drop.lines.flatMap((line) =>
          line.pendingQty > 0 ? (returnAdjustments(line.orderItemId, line.fulfilledQty, partsOf(line)) ?? []) : [],
        );
        if (adjustments.length === 0) continue;

        const written = await trackWarehouse(submitWarehouseReturn(drop.orderId, { adjustments }));
        if (written.error !== null) {
          setSending(false);
          setNotice({
            tone: 'error',
            text:
              written.error === 'network_error'
                ? t.common.networkError
                : fillCopy(t.common.serverError, { error: written.error }),
          });
          /* Ekran bayat kalmaz: yarıda kesilen turda önceki siparişler yazılmıştır ve tazeleme onları salt-okunur yapar,
             yoksa ikinci denemede aynı satırlar farklı akıbetle yeniden gönderilebilirdi. */
          void openDetail(detail.courierId);
          return;
        }
        const outcome = written.data;
        if (outcome.status !== 'ok') {
          setSending(false);
          setNotice({ tone: 'error', text: refusalOf(outcome) });
          void openDetail(detail.courierId);
          return;
        }
        restocked += outcome.restockedQty;
        discarded += outcome.discardedQty;
        released += outcome.releasedQty;
        // PARA ALANLARI GÖSTERİLMEZ (`refundedAmountCents`, `amountToCollectCents`): depo ekranı
        // tutar görmez. `refundBlocked` ise para değil bir DURUM bildirir — yutulsaydı iade
        // yapılmış gibi görünürdü.
        if (outcome.refundBlocked !== undefined) blocked = t.return.refundBlocked[outcome.refundBlocked];
      }

      if (restocked + discarded + released > 0) {
        parts.push(
          fillCopy(t.return.result.ok, {
            restocked: String(restocked),
            discarded: String(discarded),
            released: String(released),
          }),
        );
      }

      // 2) MAL DEVRİ — kuryesiz kümede yok (araç da kutu da yok).
      if (detail.courierId !== null && (detail.freeGoods.length > 0 || detail.boxesDown.length > 0)) {
        const accepted = await trackWarehouse(
          acceptCourierReturn(detail.courierId, {
            freeGoods: detail.freeGoods.map((line) => ({ variantId: line.variantId, returnedQty: countOf(line.variantId) })),
          }),
        );
        if (accepted.error !== null) {
          setSending(false);
          setNotice({
            tone: 'error',
            text:
              accepted.error === 'network_error'
                ? t.common.networkError
                : fillCopy(t.common.serverError, { error: accepted.error }),
          });
          // Akıbetler bu noktada YAZILDI — ekran onları yazılı göstermeli, yoksa ikinci deneme
          // aynı satırları yeniden gönderir.
          void openDetail(detail.courierId);
          return;
        }
        const outcome = accepted.data;
        if (outcome.status === 'ok') {
          parts.push(
            fillCopy(t.return.result.accepted, {
              boxes: String(outcome.unloadedBoxes),
              qty: String(outcome.transferred.reduce((sum, row) => sum + row.qty, 0)),
            }),
          );
          if (outcome.shortfalls.length > 0) {
            tone = 'warn';
            parts.push(fillCopy(t.return.result.shortfall, { n: String(outcome.shortfalls.length) }));
          }
        } else {
          tone = 'warn';
          parts.push(
            outcome.status === 'not_enough'
              ? fillCopy(t.return.result.notEnough, { n: String(outcome.available) })
              : outcome.status === 'stuck'
                ? t.return.result.stuck
                : outcome.status === 'no_vehicle'
                  ? t.return.result.noVehicle
                  : t.common.outOfScope,
          );
        }
      }

      if (blocked !== null) {
        tone = 'warn';
        parts.push(blocked);
      }

      setSending(false);
      setNotice({ tone, text: parts.join(' ') });
      // Teslim alınan kurye geride bırakılır: ekran yerinde kalırsa depocu kapattığı işi görmeye devam eder ve "yazıldı mı"
      // sorusu ekranla çelişir.
      selectedRef.current = null;
      setDetail(null);
      setDetailStatus('idle');
      setDispositions({});
      setNotes({});
      setSplits({});
      setCounts({});
      void load();
    })();
  }, [canSubmit, countOf, detail, load, partsOf, sending, setNotice]);

  return {
    status,
    couriers,
    reload: useCallback(() => {
      setStatus('loading');
      void load();
    }, [load]),

    detail,
    detailStatus,
    select: useCallback(
      (courierId: string | null) => {
        if (courierId === UNASSIGNED_RETURNS) selectUnassigned();
        else select(courierId);
      },
      [select, selectUnassigned],
    ),

    dispositionOf,
    pick,
    noteOf,
    setNote,
    isSplit,
    setSplit,
    splitQtyOf,
    setSplitQty,
    countOf,
    setCount,

    canSubmit,
    sending,
    notice,
    submit,
  };
}

/**
 * Akıbet yazımının reddi → ekrandaki cümle. Ret bir cevaptır, hata değil: `stale` sipariş o durumda değil, `forbidden`
 * kapsam dışı, `not_found` kayıt yok.
 */
function refusalOf(outcome: { status: 'forbidden' | 'stale' | 'not_found' | 'already_marked'; currentStatus?: string }): string {
  if (outcome.status === 'stale') return fillCopy(t.return.result.stale, { status: outcome.currentStatus ?? '—' });
  /* `already_marked` hata değil, ekranın bayat olduğunun cevabı: adetler başka bir kayıtla yazılmış ve kapı hiçbir satır
     yazmadı. Çağıran `openDetail` ile ekranı tazeler, depocu kalanı görür. */
  if (outcome.status === 'already_marked') return t.return.result.alreadyMarked;
  return outcome.status === 'forbidden' ? t.common.outOfScope : t.common.notFound;
}
