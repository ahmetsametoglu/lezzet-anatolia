import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ORDER_STATUS_LABELS,
  type ConfirmDoorDeliveryResponse,
  type CourierStopContract,
  type DoorCollectionInputContract,
  type FulfillmentAdjustment,
  type MarkUndeliveredResponse,
} from '@lezzet/types';

import {
  fetchCourierDay,
  submitDoorDelivery,
  submitUndelivered,
} from '@/lib/api/courier';
import { toastError, toastSuccess } from '@lezzet/mobile-kit/src/lib/toast/toast-store';
import { newRequestKey } from '@/lib/request-key';
import { fillCopy } from '@/screens/operations/copy';
import { courierCopy } from './copy';
import { lineAmountCents } from '@lezzet/domain-core';
import { centsToAmountText, money, parseAmountToCents } from './courier-format';

/*
  Teslimat ekranının motoru: durak kuryenin kendi gün listesinden okunur (sahiplik sorgunun içindedir), kanıt → mal → teslim → para sırası kapıdadır ve ekran tek istek gönderir.
  Tahsilat hesabı gün cevabından gelir; `null` ise panel çalışır ama teslim kapısı kapanır, çünkü parayı yazmadan kapanan teslim siparişi borçlu gösterir.
*/

const t = courierCopy;

/**
 * Nakit yasal sınırı yalnız ekrandaki uyarı içindir; gerçek karar sunucudadır ve `cashLimitExceeded` ile döner.
 * Ayar bu uçtan okunamadığı için fabrika değeri bilinçli kopyalandı: ayrışırsa ekran yanlış yazı gösterir, yanlış iş yapmaz.
 */
const CASH_LIMIT_CENTS = 100_000;

/** Tutar ±/− adımı — v2 bir euro artırıp azaltıyor (`gercek - 1`). */
const AMOUNT_STEP_CENTS = 100;

/** Kalemin üç hâli (v2:917): işaretsiz → teslim → reddedildi → işaretsiz. */

/** Kapıdaki kalem satırı — tip SÖZLEŞMEDEN türer, elle yazılmaz (CLAUDE §1). */
type StopLine = CourierStopContract['items'][number];

/** Kapının olumsuz dalları — iki uç da aynı şekli döndürür, çeviri de tek yerden yapılır. */
type CourierRefusal =
  | Exclude<ConfirmDoorDeliveryResponse, { status: 'ok' }>
  | Exclude<MarkUndeliveredResponse, { status: 'ok' }>;

/** Ekrana basılan tek bildirim — yazma sonucunun ya da bir reddin metni. */
interface DeliveryNotice {
  tone: 'ok' | 'error';
  text: string;
}

interface UseDeliveryResult {
  status: 'loading' | 'ready' | 'missing';
  stop: CourierStopContract | null;
  /** Rota sırası (1'den) ve gün toplamı — başlıktaki "Durak 3/6". */
  order: number;
  total: number;
  reload: () => void;

  /**
   * KUTU OKUTMASI (23.8) — kutulu durakta teslimin ön koşulu. `boxes` boşsa bölüm hiç çizilmez
   * (kutusuz akış); doluysa tüm kodlar okutulmadan teslim kapısı açılmaz — son doğrulama yine
   * sunucuda (`boxes_missing`).
   */
  boxes: CourierStopContract['boxes'];
  scannedBoxCount: number;
  isBoxScanned: (code: string) => boolean;
  boxScanOpen: boolean;
  setBoxScanOpen: (open: boolean) => void;
  handleBoxScan: (code: string) => void;

  /** Durağın kalem satırları — sözleşmeden, anahtarı `orderItemId`. */
  lines: StopLine[];
  /** Kalemin kapıda geri verilen adedi; 0 = teslim edildi (varsayılan). */
  refusedQtyOf: (line: StopLine) => number;
  setRefusedQty: (line: StopLine, qty: number) => void;
  hasRefused: boolean;
  allRefused: boolean;
  /** Bir kısmı reddedildi — düzeltme uca GİDER; not iade akışının nereye düştüğünü söyler. */
  partialReturn: boolean;

  /** Kapıda tahsil edilecek tutar (cent); `null` = borç yok. */
  dueCents: number | null;
  amountText: string;
  setAmountText: (value: string) => void;
  changeAmount: (deltaCents: number) => void;
  amountCents: number | null;
  method: 'cash' | 'card';
  setMethod: (method: 'cash' | 'card') => void;
  partialPayment: boolean;
  cashLimitWarning: boolean;
  /** Kapı kasası hesabı yok (ayar boş) — panel çalışır, teslim kapısı kapalıdır. */
  collectionBlocked: boolean;
  amountStepCents: number;

  gateOpen: boolean;
  /**
   * Olumsuz sonuç (ulaşılamadı, kabul etmedi) yazılabilir mi: durak yola çıkmış olmalı, çünkü kapıya hiç gidilmemiş durağa "ulaşılamadı" yazılmaz.
   */
  outcomeOpen: boolean;
  gateNote: string | null;
  ctaLabel: string;

  outcome: 'unreachable' | 'refused' | null;
  openOutcome: (outcome: 'unreachable' | 'refused') => void;
  cancelOutcome: () => void;
  outcomeNote: string;
  setOutcomeNote: (value: string) => void;
  noteError: string | null;

  sending: boolean;
  /** Yazma başarıyla tamamlandı — ekran artık bir sonuç ekranıdır, form değil. */
  finished: boolean;
  deliver: () => void;
  confirmOutcome: () => void;
}

/** Kapının ret dallarını ekranın diline çevirir — hiçbiri YUTULMAZ, hepsi bir cümleye çıkar. */
function refusalText(result: CourierRefusal): string {
  switch (result.status) {
    case 'proof_required':
      return fillCopy(t.delivery.refusal.proofRequired, { channel: t.channel[result.channel] });
    case 'boxes_missing':
      // Ekran zaten yerelde kilitliyor; bu dal yarışın (başka cihaz, bayat liste) son savunması.
      return fillCopy(t.delivery.refusal.boxesMissing, { boxes: result.remainingBoxNos.join(', ') });
    case 'stale':
      return fillCopy(t.delivery.refusal.stale, { status: ORDER_STATUS_LABELS[result.currentStatus] });
    case 'not_found':
      return t.delivery.refusal.notFound;
    default:
      if (result.reason === 'same_status') return t.delivery.refusal.sameStatus;
      if (result.reason === 'terminal') return t.delivery.refusal.terminal;
      if (result.reason === 'not_allowed') return t.delivery.refusal.notAllowed;
      return t.delivery.refusal.notAssigned;
  }
}

/** Tel hatası (401/500/ağ) kapı kararı DEĞİLDİR — ayrı cümle, çünkü ayrı şey. */
function wireErrorText(error: string): string {
  return error === 'network_error' ? t.delivery.refusal.network : fillCopy(t.delivery.refusal.unknown, { error });
}

export function useDelivery(orderId: string): UseDeliveryResult {
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing'>('loading');
  const [stop, setStop] = useState<CourierStopContract | null>(null);
  const [order, setOrder] = useState(0);
  const [total, setTotal] = useState(0);
  /**
   * Kapı kasası hesabı gün cevabından gelir; `null` = ayar boş, tahsilat kapısı kapalıdır ve sebebi ekranda yazılır.
   * Uydurma bir kimlik kapıda alınan parayı olmayan bir hesaba yazardı.
   */
  const [doorAccountId, setDoorAccountId] = useState<string | null>(null);


  /* Teslim varsayılandır, red istisna: kalem başına tek sayı reddedilen adettir, çünkü kutulu akışta içerik mühürde sabitlendi ve her kalemi ayrıca işaretlemek gereksiz dokunuştu. */
  const [refusedQty, setRefusedQtyState] = useState<Record<string, number>>({});

  /** Kapıda okutulan kutu KODLARI (23.8) — teslim isteğiyle gider, kanıt kaydına yazılır. */
  const [scannedBoxCodes, setScannedBoxCodes] = useState<string[]>([]);
  const [boxScanOpen, setBoxScanOpen] = useState(false);

  const [amountText, setAmountText] = useState('');
  const [method, setMethod] = useState<'cash' | 'card'>('cash');

  const [outcome, setOutcome] = useState<'unreachable' | 'refused' | null>(null);
  const [outcomeNote, setOutcomeNote] = useState('');
  const [noteError, setNoteError] = useState<string | null>(null);

  const [sending, setSending] = useState(false);
  /* Sonuç toast'ta: sayfanın altındaki satıra kurye kutu okuturken bakmıyor ve reddin sebebini görmüyordu. */
  const setNotice = useCallback((notice: DeliveryNotice | null) => {
    if (notice === null) return;
    if (notice.tone === 'ok') toastSuccess(notice.text);
    else toastError(notice.text);
  }, []);

  /**
   * Başarılı sonuç toast'a gider ve ekran kapanır: olumlu cevapta kalınacak bir şey yok, sıradaki durak listede.
   * Olumsuz cevap ekranda kalır, çünkü kurye orada kalıp düzeltecek.
   */
  const setDoneToast = useCallback((next: DeliveryNotice) => {
    toastSuccess(next.text);
  }, []);
  const [finished, setFinished] = useState(false);

  /* TAHSİLAT İSTEĞİNİN KİMLİĞİ — bir kez doğar, ekran yaşadığı sürece AYNI kalır: "tekrar dene"
     aynı anahtarla gider ve para iki kez yazılmaz (sözleşme künyesi: anahtar durağın değil İSTEĞİN
     kimliği). Yeni bir durak yeni bir ekran, dolayısıyla yeni bir anahtar. */
  const collectionKey = useRef<string | null>(null);
  const generation = useRef(0);

  const load = useCallback(async () => {
    const run = (generation.current += 1);
    const result = await fetchCourierDay();
    if (run !== generation.current) return;

    if (result.error !== null) {
      setStatus('missing');
      return;
    }
    const index = result.data.stops.findIndex((candidate) => candidate.orderId === orderId);
    const found = result.data.stops[index];
    if (found === undefined) {
      setStatus('missing');
      return;
    }

    setStop(found);
    /* "Durak 3/6" seferin içinde sayılır ki gün ekranının özet kartıyla aynı sırayı göstersin; sefersiz durakta küme günün tamamıdır. */
    const ownRun = result.data.stops.filter((candidate) => candidate.runId === found.runId);
    const inRun = ownRun.findIndex((candidate) => candidate.orderId === orderId);
    setOrder(inRun >= 0 ? inRun + 1 : index + 1);
    setTotal(ownRun.length > 0 ? ownRun.length : result.data.stops.length);
    setDoorAccountId(result.data.doorAccountId);
    setStatus('ready');
    // Tutar alanı MOTORUN tutarıyla açılır (K4: "alan onunla açılır"); kurye gerçekleşeni düzeltir.
    setAmountText(found.payment.dueAmountCents === null ? '' : centsToAmountText(found.payment.dueAmountCents));
    const expected = found.payment.expectedMethod;
    // Kuryenin eline yalnız nakit ve kart girer; `online`/`bank_transfer` beklentisi segmenti değiştirmez.
    if (expected === 'cash' || expected === 'card') setMethod(expected);
  }, [orderId]);

  useEffect(() => {
    void load();
  }, [load]);

  /*
    KUTU KAPISI (23.8, etüt 2.5): kutulu durakta teslim, tüm kutuların QR'ı okutulmadan açılmaz —
    yanlış kapıya inen kutu tam burada yakalanır. Eşleşme YERELDE (kodlar gün cevabında geldi;
    kapı önünde tur atılmaz), son doğrulama sunucuda (`boxes_missing` — bayat listeye karşı).
  */
  const boxes = stop?.boxes ?? [];
  /* Kutusuz durak da kapıyı açmaz: mal kutusuyla hazırlanır ve kapıdan çıkar; sunucu kutusuz teslimi reddettiği için ekran kuryeyi reddedilecek isteğe göndermemeli. */
  const boxesSatisfied = boxes.length > 0 && boxes.every((box) => scannedBoxCodes.includes(box.code));

  /**
   * Durak yola çıktı mı: kutusu binmemiş sipariş `ready` kalır, araçta değildir ve kapıda teslim edilemez.
   * Kapı burada kapanır ve sebebi kuryenin dilinde yazılır; yoksa sunucunun `stale` reddi kuryeye "başkası kapatmış olabilir" gibi yanlış bir hikâye anlatır.
   */
  const loadedOnVan = boxes.length > 0 && boxes.every((box) => box.loadedAt !== null);

  const handleBoxScan = useCallback(
    (code: string) => {
      setBoxScanOpen(false);
      const trimmed = code.trim();
      const box = boxes.find((candidate) => candidate.code === trimmed);
      if (!box) {
        setNotice({ tone: 'error', text: t.delivery.boxes.notMine });
        return;
      }
      if (scannedBoxCodes.includes(trimmed)) {
        setNotice({ tone: 'ok', text: fillCopy(t.delivery.boxes.alreadyScanned, { n: String(box.boxNo) }) });
        return;
      }
      const next = [...scannedBoxCodes, trimmed];
      setScannedBoxCodes(next);
      /* Başarılı okutma bildirim yazmaz: kutu kartı sayaç, ✓ ve cümleyle zaten söylüyor; bildirim kartta görünmeyen olumsuz cevaplarda kalır. */
    },
    [boxes, scannedBoxCodes],
  );

  const lines = stop?.items ?? [];
  /** Kalemin kapıda geri verilen adedi — kayıt yoksa 0, yani teslim edilmiştir. */
  const refusedOf = (line: StopLine): number => Math.min(line.qty, Math.max(0, refusedQty[line.orderItemId] ?? 0));
  const hasRefused = lines.some((line) => refusedOf(line) > 0);
  /** HEPSİ geri verildi — teslim değil bir REDDİR, kurye "Kabul etmedi"yi kullanmalı. */
  const allRefused = lines.length > 0 && lines.every((line) => refusedOf(line) === line.qty);
  const partialReturn = hasRefused && !allRefused;

  /**
   * Kalem düzeltmeleri yalnız reddedilen satırlardan doğar ve `fulfilledQty` hedef adettir; değişmeyen satır gönderilmez.
   * `returnDisposition` bilerek boştur: malın akıbeti depo kabulünde karara bağlanır, kurye ne gördüğünü söyler.
   */
  const adjustments: FulfillmentAdjustment[] = lines
    .filter((line) => refusedOf(line) > 0)
    .map((line) => ({ orderItemId: line.orderItemId, fulfilledQty: line.qty - refusedOf(line) }));

  /*
    Kapıda alınacak tutar geri verilen mal düşülmüş hâlidir: `dueAmountCents` siparişin tam tutarıdır ve sunucu düzeltmeyi teslim anında yapar, kurye ise kapıda doğru rakamı görmeli.
    Hesap motorun kendisidir (`lineAmountCents`); satır başına tam eksi kalan alınır, çünkü indirim payı oransal düşer.
  */
  const refundedCents = lines.reduce((sum, line) => {
    const refused = refusedOf(line);
    if (refused === 0) return sum;
    const full = lineAmountCents({ ...line, fulfilledQty: line.qty });
    const kept = lineAmountCents({ ...line, fulfilledQty: line.qty - refused });
    return sum + (full - kept);
  }, 0);
  const fullDueCents = stop?.payment.dueAmountCents ?? null;
  const dueCents = fullDueCents === null ? null : Math.max(0, fullDueCents - refundedCents);

  /**
   * Reddedilen adedi yazar ve tahsilat alanını yeni tutara çeker: kalem geri alınınca alacak da o an değişir, alan eski rakamda kalırsa ekran kendisiyle çelişir.
   */
  const setRefusedQty = useCallback(
    (line: StopLine, qty: number) => {
      const next = Math.min(line.qty, Math.max(0, qty));
      setRefusedQtyState((current) => {
        const updated = { ...current, [line.orderItemId]: next };
        if (fullDueCents !== null) {
          const drop = lines.reduce((sum, row) => {
            const refused = Math.min(row.qty, Math.max(0, updated[row.orderItemId] ?? 0));
            if (refused === 0) return sum;
            return (
              sum +
              (lineAmountCents({ ...row, fulfilledQty: row.qty }) -
                lineAmountCents({ ...row, fulfilledQty: row.qty - refused }))
            );
          }, 0);
          setAmountText(centsToAmountText(Math.max(0, fullDueCents - drop)));
        }
        return updated;
      });
    },
    [fullDueCents, lines],
  );
  const amountCents = parseAmountToCents(amountText);
  const partialPayment = dueCents !== null && amountCents !== null && amountCents < dueCents;
  const cashLimitWarning = dueCents !== null && method === 'cash' && (amountCents ?? 0) > CASH_LIMIT_CENTS;

  /**
   * Gönderilecek tahsilat gövdesi. Borç yoksa `null` (kapıda para konuşulmaz); kasa hesabı
   * bilinmiyorsa da `null` — ve o hâlde `collectionBlocked` teslim kapısını kapatır, yani "para
   * yazılmadan teslim" ASLA gönderilmez.
   */
  const buildCollection = useCallback((): DoorCollectionInputContract | null => {
    if (dueCents === null || amountCents === null || amountCents <= 0) return null;
    if (doorAccountId === null) return null;
    collectionKey.current ??= newRequestKey('col');
    return { method, amountCents, accountId: doorAccountId, idempotencyKey: collectionKey.current };
  }, [amountCents, doorAccountId, dueCents, method]);

  /**
   * Tahsilat yazılamaz: borç var ama kapı kasası hesabı yok.
   * Boş tutar bu kapıyı kapatmaz, çünkü boş tutar "kapıda para almadım" demektir ve sipariş borçlu kalır.
   */
  const collectionBlocked = dueCents !== null && doorAccountId === null;

  /* Kapı üç şeyi sorar: kutular okutuldu mu, kanıt alındı mı, para yazılabilir mi; hepsi geri verilmişse bu teslim değil "kabul etmedi"dir. */
  const gateOpen = loadedOnVan && boxesSatisfied && !allRefused && !collectionBlocked && !finished;
  /* Olumsuz sonucun kapısı DAHA DAR değil daha GENİŞ: kutuların kapıda okutulması gerekmiyor
     (mal verilmedi ki), ama durak yola çıkmış olmalı — yoksa yazılacak bir geçiş yok. */
  const outcomeOpen = loadedOnVan && !finished;

  const gateNote = gateOpen
    ? null
    : allRefused
      ? null
      : collectionBlocked
        ? t.delivery.collection.blocked
        : !loadedOnVan
          ? t.delivery.cta.notLoaded
          : /* SIRA CÜMLESİ KUTULU DURAKTA KUTUYU DA SAYAR (30.08): adımlar numaralanınca cümlenin
             kutuları atladığı görünür oldu — ekran "1 · KUTULAR" derken alt not sırayı "kanıt"tan
             başlatıyordu. İki farklı sıra anlatan tek ekran, kuryeye hangisine uyacağını sordurur. */
          `${boxes.length === 0 ? t.delivery.cta.gate : t.delivery.cta.gateBoxed}${boxesSatisfied ? '' : t.delivery.cta.gateBoxes}`;

  const ctaLabel = allRefused
    ? t.delivery.cta.allRefused
    : sending
      ? t.delivery.cta.sending
      : hasRefused
        ? t.delivery.cta.partial
        : dueCents === null
          ? t.delivery.cta.deliver
          : // Borç varken tutarın boş/sıfır olması sessiz kalmaz: düğmenin kendisi "para yazılmıyor" der.
            amountCents !== null && amountCents > 0
            ? fillCopy(t.delivery.cta.deliverWithAmount, { amount: money(amountCents) })
            : t.delivery.cta.deliverNoCollection;

  const deliver = useCallback(() => {
    if (!gateOpen || sending) return;
    setSending(true);
    setNotice(null);

    void (async () => {
      /* Üç alan da sözleşmede OPSİYONEL ve yalnız gerçekten bir şey söylüyorsa doğuyor: kanıt
         alındıysa `proof`, kalem reddedildiyse `adjustments`, para alındıysa `collection`. Boş bir
         dizi ya da sıfırlı bir gövde göndermek, olmayan bir düzeltmeyi kapıya iş olarak vermekti. */
      const collection = buildCollection();
      const result = await submitDoorDelivery(orderId, {
        ...(adjustments.length === 0 ? {} : { adjustments }),
        ...(collection === null ? {} : { collection }),
        // Kutulu durakta okutulan kodlar teslimin ön koşulu (23.8) — kutusuz durakta alan gitmez.
        ...(scannedBoxCodes.length === 0 ? {} : { scannedBoxCodes }),
      });
      setSending(false);

      if (result.error !== null) {
        setNotice({ tone: 'error', text: wireErrorText(result.error) });
        return;
      }
      if (result.data.status !== 'ok') {
        setNotice({ tone: 'error', text: refusalText(result.data) });
        return;
      }

      /* Sonuç toast'a gider, ekran listeye döner: kurye en sık yaptığı işte sonuç ekranında takılıyordu; liste de tazelendiği için sonuç durağın satırında görünür. */
      setDoneToast({
        tone: 'ok',
        text: [
          result.data.collectedCents > 0
            ? fillCopy(t.delivery.result.collected, { amount: money(result.data.collectedCents) })
            : t.delivery.result.collectedNone,
          result.data.amountDueCents > 0
            ? fillCopy(t.delivery.result.due, { amount: money(result.data.amountDueCents) })
            : '',
          result.data.collectionDeduped === true ? t.delivery.result.deduped : '',
          result.data.cashLimitExceeded ? t.delivery.result.cashLimit : '',
        ].join(''),
      });
      setFinished(true);
    })();
  }, [adjustments, buildCollection, gateOpen, orderId, scannedBoxCodes, sending]);

  const confirmOutcome = useCallback(() => {
    if (outcome === null || sending) return;
    if (outcomeNote.trim().length === 0) {
      setNoteError(t.delivery.outcome.noteRequired);
      return;
    }
    setNoteError(null);
    setSending(true);
    setNotice(null);

    void (async () => {
      const result = await submitUndelivered(orderId, { outcome, note: outcomeNote.trim() });
      setSending(false);

      if (result.error !== null) {
        // Uç eksik notu AYRI bir anahtarla söylüyor (`note_required`); ekran da onu genel bir biçim
        // hatası değil ALAN hatası olarak gösterir — kullanıcının düzeltebileceği tek durum bu.
        if (result.error === 'note_required') {
          setNoteError(t.delivery.outcome.noteRequired);
          return;
        }
        /* Çekmece kapanır, çünkü bildirim gövdede çizilir ve açık çekmecenin altında görünmez kalırdı. */
        setOutcome(null);
        setNotice({ tone: 'error', text: wireErrorText(result.error) });
        return;
      }
      if (result.data.status !== 'ok') {
        setOutcome(null);
        setNotice({ tone: 'error', text: refusalText(result.data) });
        return;
      }

      setDoneToast({
        tone: 'ok',
        text: result.data.outcome === 'refused' ? t.delivery.result.refused : t.delivery.result.unreachable,
      });
      setFinished(true);
    })();
  }, [orderId, outcome, outcomeNote, sending]);

  return {
    status,
    stop,
    order,
    total,
    reload: useCallback(() => {
      setStatus('loading');
      void load();
    }, [load]),


    boxes,
    scannedBoxCount: scannedBoxCodes.length,
    isBoxScanned: (code) => scannedBoxCodes.includes(code),
    boxScanOpen,
    setBoxScanOpen,
    handleBoxScan,

    lines,
    refusedQtyOf: refusedOf,
    /** Çekmeceden gelen adet — 0 yazmak "geri verilmedi" demektir, kayıt silinmez. */
    setRefusedQty,
    hasRefused,
    allRefused,
    partialReturn,

    dueCents,
    amountText,
    setAmountText,
    changeAmount: (deltaCents) => setAmountText(centsToAmountText(Math.max(0, (amountCents ?? 0) + deltaCents))),
    amountCents,
    method,
    setMethod,
    partialPayment,
    cashLimitWarning,
    collectionBlocked,
    amountStepCents: AMOUNT_STEP_CENTS,

    gateOpen,
    outcomeOpen,
    gateNote,
    ctaLabel,

    outcome,
    openOutcome: (next) => {
      setOutcome(next);
      setOutcomeNote('');
      setNoteError(null);
      setNotice(null);
    },
    cancelOutcome: () => {
      setOutcome(null);
      setOutcomeNote('');
      setNoteError(null);
    },
    outcomeNote,
    setOutcomeNote: (value) => {
      setOutcomeNote(value);
      if (value.trim().length > 0) setNoteError(null);
    },
    noteError,

    sending,
    finished,
    deliver,
    confirmOutcome,
  };
}
