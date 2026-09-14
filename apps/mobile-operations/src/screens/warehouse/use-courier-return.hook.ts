import { useCallback, useRef, useState } from 'react';
import { useFocusEffect } from 'expo-router';
import { UNASSIGNED_RETURNS, type ReturnDisposition, type ReturningCourierContract, type WarehouseCourierReturnResponse } from '@lezzet/types';

import { acceptCourierReturn, fetchCourierReturn, fetchReturningCouriers, submitWarehouseReturn } from '@/lib/api/warehouse';
import { useNotice } from '@/lib/haptics/use-notice.hook';
import { fillCopy } from '@/screens/operations/copy';
import { warehouseCopy } from './copy';
import { trackWarehouse } from './warehouse-status';

/*
  D6 · KURYE DÖNÜŞÜ KABULÜ — `/courier-return`. Tasarım: v3:14 + "D6 Rampa Listesi" (04.09).

  ── LİSTE KURYE EKSENLİ, SEFER EKSENLİ DEĞİL ────────────────────────────────
  Para SEFER başına kapanır (kuryenin kendi ekranından, her sefer ayrı); MAL kurye başına teslim
  alınır. Ayrım fiziksel: araç bir yerdedir ve o gün tek kuryenin yükünü taşır, yani iki sefer
  sürmüş kurye rampaya BİR KEZ döner ve araç BİR KEZ boşalır. Satırı sefere bağlasaydık aynı aracın
  serbest ürünü iki satırda iki kez sayılırdı.

  ── FIXTURE ÖLDÜ (04.09) ────────────────────────────────────────────────────
  Ekran 08.08'den 04.09'a kadar kod içine yazılmış TEK bir dökümle açılıyordu (`Musa K.`,
  `LZA-26-9Q2B`): sunucudaki okuma ucu aynı gün yazılmıştı ama istemci onu hiç çağırmıyordu. Kayıt
  gerçekti, döküm değildi — uydurma kimlik yüzünden kapı `not_found` dönüyordu ve ekran o reddi
  gösteriyordu. Şimdi üçü de gerçek: liste, döküm, kayıt.

  ── MİKTAR HEDEF DEĞERDİR, FARK DEĞİL ───────────────────────────────────────
  v2 birebir: *"Miktar hedef değer olarak girilir; fark sistemde hesaplanır."* Sözleşme bunu taşıyor
  (`FulfillmentAdjustment.fulfilledQty` = kalemin KALAN karşılanan adedi) ve bu ekran ondan çıkarma
  YAPMAZ — yapsaydı aynı hesap iki yerde olurdu ve ikisi bir gün ayrışırdı. Hedef değer akıbetten
  TÜRER: `restock`/`discard` → mal geri geldi, karşılanan adet **0**; `goodwill` → mal müşteride
  KALDI, adet **değişmez**.

  ── TEK DOKUNUŞ, İKİ YAZIM VE SIRASI ────────────────────────────────────────
  CTA önce AKIBETLERİ yazar (sipariş başına `POST /returns/:orderId`), sonra MALI devreder
  (`POST /courier-return/:courierId`). Sıra bilinçli: akıbet yazımı stoktan bağımsızdır ve
  düşmez; devir düşerse (`not_enough`/`stuck`) akıbetler yazılmış kalır — mal zaten rampada ve
  kaydı geciktirmenin bir faydası yok. Ters sırada, tek bir sipariş yüzünden bütün devri geri
  almak gerekirdi.
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

  /** Sayılan DÖNEN adet — kutu beklenenle (araçta kayıtlı) dolu açılır. */
  countOf: (variantId: string) => number;
  setCount: (variantId: string, qty: number) => void;

  /** Her bekleyen kalemde akıbet var mı ve "stoğa dön"lerin notu yazılmış mı — CTA'nın kapısı. */
  canSubmit: boolean;
  sending: boolean;
  notice: ReturnNotice | null;
  submit: () => void;
}

/**
 * Akıbet → HEDEF adet. Jestte mal müşteride kaldığı için karşılanan adet değişmez; iade ve imhada
 * mal geri geldiği için sıfırlanır. Tek satır ama kaydın anlamı bu satırda — kendi testi var.
 */
export function targetQtyOf(disposition: ReturnDisposition, deliveredQty: number): number {
  return disposition === 'goodwill' ? deliveredQty : 0;
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
      setCounts({});
      setNotice(null);

      // `select(null)` LİSTEYE DÖNÜŞTÜR. Kuryesiz küme de bir seçimdir ama kimliği `null` olduğu
      // için bu imzayla ifade edilemez — onun kapısı `UNASSIGNED_RETURNS` dizgesi (dışarıya açılan
      // `select` onu ayırıyor). İki ayrı niyeti tek `null`a bindirmek, geri tuşuyla kuryesiz kümeyi
      // aynı çağrı yapardı.
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

  /*
    Sayaç ARAÇTA KAYITLI adetle açılır (para satırlarının deseni, v3:14): normal günde fark sıfırdır
    ve depocuya kutuları elle doldurtmak, doğru olanı yazmak için emek isteyip yanlış olanı sessizce
    geçirir.

    ── SÜRÜLEN SEFERDE VARSAYILAN SIFIR (kusur, ölçüldü 04.09) ─────────────────
    Kurye bir seferi SÜRÜYORSA araç bugün boşalmaz: araçtaki malın çoğu yola devam edecek. Kutular
    yine de araçtaki her şeyle dolu açılıyordu, yani tek dokunuş yola çıkacak kuryenin malını
    elinden alıyordu — ekran uyarıyor ama varsayılan uyarının tersini yapıyordu. Artık sıfırdan
    başlar: depocu FİİLEN indirileni sayar. Sayılmayan mal araçta kalır (devir yazılmaz), ki
    doğrusu da odur.
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

  /** Akıbeti BEKLEYEN satırlar — işaretlenmiş olanlar ikinci kez gönderilmez. */
  const pendingLines = (detail?.drops ?? []).flatMap((drop) =>
    drop.lines.filter((line) => line.disposition === null).map((line) => ({ drop, line })),
  );

  const canSubmit = pendingLines.every(({ line }) => {
    const disposition = dispositions[line.orderItemId];
    if (disposition === undefined) return false;
    return disposition !== 'restock' || (notes[line.orderItemId]?.trim().length ?? 0) > 0;
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
        const adjustments = drop.lines.flatMap((line) => {
          const disposition = dispositions[line.orderItemId];
          if (line.disposition !== null || disposition === undefined) return [];
          const note = notes[line.orderItemId]?.trim() ?? '';
          return [
            {
              orderItemId: line.orderItemId,
              fulfilledQty: targetQtyOf(disposition, line.fulfilledQty),
              returnDisposition: disposition,
              note: note.length === 0 ? null : note,
            },
          ];
        });
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
          /* EKRAN BAYAT KALMAZ (kusur, ölçüldü 04.09): yarıda kesilen turda ÖNCEKİ siparişler
             yazılmıştır ama ekran onları hâlâ işaretsiz gösterir; ikinci denemede aynı satırlar
             yeniden gönderilir ve depocu akıbeti değiştirirse kayıt kendi kendini yalanlar.
             Tazeleme yazılmış satırları salt-okunur yapar. */
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
      // Teslim alınan kurye GERİDE BIRAKILIR: ekran yerinde kalırsa depocu kapattığı işi karşısında
      // görmeye devam eder ve "yazıldı mı" sorusu ekranla çelişir (kapanış ekranının 01.09 dersi).
      selectedRef.current = null;
      setDetail(null);
      setDetailStatus('idle');
      setDispositions({});
      setNotes({});
      setCounts({});
      void load();
    })();
  }, [canSubmit, countOf, detail, dispositions, load, notes, sending, setNotice]);

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
    countOf,
    setCount,

    canSubmit,
    sending,
    notice,
    submit,
  };
}

/**
 * Akıbet yazımının REDDİ → ekrandaki cümle. Reddin kendisi bir cevaptır, hata değil: `stale` sipariş
 * artık o durumda değildir, `forbidden` kapsam dışıdır, `not_found` kayıt yoktur.
 */
function refusalOf(outcome: {
  status: 'forbidden' | 'stale' | 'not_found' | 'already_marked';
  currentStatus?: string;
  currentDisposition?: ReturnDisposition | null;
}): string {
  if (outcome.status === 'stale') return fillCopy(t.return.result.stale, { status: outcome.currentStatus ?? '—' });
  /* `already_marked` bir HATA değil, ekranın bayat olduğunun cevabı: kalem karara bağlanmış ve
     gelen istek başkasını söylüyor. Kapı hiçbir satır yazmadı; ekran tazelenip yazılı hâli
     gösteriyor (çağıran `openDetail`i tetikliyor). */
  if (outcome.status === 'already_marked') {
    const yazili = outcome.currentDisposition ?? null;
    return fillCopy(t.return.result.alreadyMarked, {
      disposition: yazili === null ? '—' : t.return.disposition[yazili],
    });
  }
  return outcome.status === 'forbidden' ? t.common.outOfScope : t.common.notFound;
}
