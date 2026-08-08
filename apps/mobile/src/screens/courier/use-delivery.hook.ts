import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ORDER_STATUS_LABELS,
  type ConfirmDoorDeliveryResponse,
  type CourierStopContract,
  type DeliveryProofInputContract,
  type DoorCollectionInputContract,
  type FulfillmentAdjustment,
  type MarkUndeliveredResponse,
} from '@lezzet/types';

import { base64ToBytes } from '@/lib/base64';
import {
  fetchCourierDay,
  requestProofUpload,
  submitDoorDelivery,
  submitUndelivered,
  uploadProofImage,
} from '@/lib/api/courier';
import { newRequestKey } from '@/lib/request-key';
import { fillCopy } from '@/screens/operations/copy';
import { courierCopy } from './copy';
import { centsToAmountText, money, parseAmountToCents } from './courier-format';

/*
  TESLİMAT EKRANININ MOTORU (K3 · K4 · K5) — durak okuması, kanıt yüklemesi, kapılar ve iki yazma
  yolu tek yerde. Ekran yalnız çiziyor.

  ── DURAK GÜN LİSTESİNDEN OKUNUR, KİMLİKLE DOĞRUDAN DEĞİL ───────────────────
  Sahiplik sorgunun kendisine gömülüdür (web'in `readDeliveryStop`'uyla aynı karar): durak önce
  kuryenin KENDİ gününde aranır, listede yoksa ekran "bu durak bugünkü rotanızda yok" der. Yan
  faydası rota sırası — "Durak 3/6" ikinci bir sayma olmadan buradan çıkar.

  ── SIRA EKRANDA GÖRÜNÜR, İSTEK BÖLÜNMEZ ───────────────────────────────────
  Kanıt → mal → teslim → para sırası KAPININ içindedir; ekran onu üç bölüm hâlinde GÖSTERİR ama
  tek `POST …/deliver` gönderir. Kanıt YÜKLEMESİ ayrı bir adımdır ve bilerek daha erken çalışır
  (imza onaylanınca): yükleme düşerse kurye bunu kanıt panelinde görür, teslim düğmesine bastıktan
  sonra değil.

  ── OLUMSUZ CEVAPLAR YUTULMAZ ───────────────────────────────────────────────
  `proof_required` · `stale` (+ `currentStatus`) · `forbidden` · `not_found` ekrana ÇIKAR ve
  `stale`/`deduped` açıkça "para/kayıt ikilenmedi" diye okunur — HTTP koduna indirgenen bir ret
  taşıdığı bilgiyi kaybeder (uç künyesi).

  ── KALEM SATIRLARI SÖZLEŞMEDEN OKUNUR, METİNDEN TAHMİN EDİLMEZ ─────────────
  Liste `stop.items`ten çıkıyor ve satırın anahtarı `orderItemId`nin KENDİSİDİR — yani ekranda
  işaretlenen satır, uca gönderilen satırla aynı satırdır. 21.10d'den önce burada içerik özeti
  (`contentSummary`) ayrıştırılıyordu: kurye işaretleyebiliyor ama gönderemiyordu, çünkü kimlik
  yoktu. Kısmi iade artık gerçekten yazılıyor ve `fulfilledQty` **HEDEF** değerdir (kalan adet),
  fark değil — ekranda görülen sayı gönderilir (sözleşme künyesi).

  ── TAHSİLAT KAPISININ ANAHTARI GÜN CEVABINDA ───────────────────────────────
  `collection.accountId` zorunlu bir uuid ve değeri gün başına tekil: `/courier/day` onu
  `doorAccountId` olarak taşıyor (ayardan; kullanılamaz hâlde `null`). `null` gelirse tahsilat
  paneli TAM çalışır (tutar, ±, yöntem, kısmi rozeti, nakit uyarısı) ama TESLİM KAPISI kapanır ve
  sebebi ekranda yazılır. "Teslim yazıp parayı yazmamak" bilerek seçilmedi: kapıda alınan 42 €
  kayda geçmeden teslim kapanırsa sipariş borçlu görünür, müşteriye borç hatırlatması gider ve para
  ancak ay sonu mutabakatında aranır. Kanıt kapısının kuralı da aynı — eksik girdide HİÇBİR yazım
  yapılmaz.
*/

const t = courierCopy;

/**
 * NAKİT YASAL SINIRI — **yalnız ekrandaki uyarı için** (DOMAIN §7: bilgi, engel değil). Gerçek
 * karar sunucudadır ve cevabın `cashLimitExceeded` alanıyla geri gelir; bu sabit onu ÖNCEDEN
 * göstermek içindir. Değer `cash_legal_limit_cents` ayarından gelmeli ama o ayar bu uçtan okunamıyor;
 * migration'ın fabrika değeri BİLİNÇLİ kopyalandı — web okuması da aynısını yapıyor ve gerekçesi
 * orada yazılı: *"ayrışırlarsa ekran yanlış yazı gösterir, yanlış iş yapmaz"* (izin kararı tek
 * yerde, kapıda). PARAMETRİK ve tek yerde: 1.000 €.
 */
const CASH_LIMIT_CENTS = 100_000;

/** Tutar ±/− adımı — v2 bir euro artırıp azaltıyor (`gercek - 1`). */
const AMOUNT_STEP_CENTS = 100;

/** Kalemin üç hâli (v2:917): işaretsiz → teslim → reddedildi → işaretsiz. */
type LineMark = 'delivered' | 'refused' | undefined;

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

  /** Kanal ayarının istemci karşılığı: B2B'de kanıt zorunlu (uç aynı soruyu YENİDEN sorar). */
  proofRequired: boolean;
  proof: DeliveryProofInputContract | null;
  signing: boolean;
  uploading: boolean;
  proofError: string | null;
  openSignature: () => void;
  cancelSignature: () => void;
  confirmSignature: (pngBase64: string) => void;
  clearProof: () => void;

  /** Durağın kalem satırları — sözleşmeden, anahtarı `orderItemId`. */
  lines: StopLine[];
  markOf: (orderItemId: string) => LineMark;
  toggleLine: (orderItemId: string) => void;
  returnQtyOf: (line: StopLine) => number;
  changeReturnQty: (line: StopLine, delta: number) => void;
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
  method: 'cash' | 'card' | 'cheque';
  setMethod: (method: 'cash' | 'card' | 'cheque') => void;
  partialPayment: boolean;
  cashLimitWarning: boolean;
  /** Kapı kasası hesabı yok (ayar boş) — panel çalışır, teslim kapısı kapalıdır. */
  collectionBlocked: boolean;
  amountStepCents: number;

  gateOpen: boolean;
  gateNote: string | null;
  ctaLabel: string;

  outcome: 'unreachable' | 'refused' | null;
  openOutcome: (outcome: 'unreachable' | 'refused') => void;
  cancelOutcome: () => void;
  outcomeNote: string;
  setOutcomeNote: (value: string) => void;
  noteError: string | null;

  sending: boolean;
  notice: DeliveryNotice | null;
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
   * **Kapı kasası hesabı** — gün cevabından (`doorAccountId`). Durak başına değil gün başına, çünkü
   * ayarın kendisi tekil. `null` = ayar boş ya da kullanılamaz → tahsilat kapısı kapalı ve sebebi
   * ekranda (dosya künyesi). Uydurma bir uuid göndermek 400 alırdı; rastgele bir değer ise kapıda
   * alınan parayı olmayan bir hesaba yazardı.
   */
  const [doorAccountId, setDoorAccountId] = useState<string | null>(null);

  const [proof, setProof] = useState<DeliveryProofInputContract | null>(null);
  const [signing, setSigning] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [proofError, setProofError] = useState<string | null>(null);

  const [marks, setMarks] = useState<Record<string, LineMark>>({});
  const [returnQty, setReturnQty] = useState<Record<string, number>>({});

  const [amountText, setAmountText] = useState('');
  const [method, setMethod] = useState<'cash' | 'card' | 'cheque'>('cash');

  const [outcome, setOutcome] = useState<'unreachable' | 'refused' | null>(null);
  const [outcomeNote, setOutcomeNote] = useState('');
  const [noteError, setNoteError] = useState<string | null>(null);

  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<DeliveryNotice | null>(null);
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
    setOrder(index + 1);
    setTotal(result.data.stops.length);
    setDoorAccountId(result.data.doorAccountId);
    setStatus('ready');
    // Tutar alanı MOTORUN tutarıyla açılır (K4: "alan onunla açılır"); kurye gerçekleşeni düzeltir.
    setAmountText(found.payment.dueAmountCents === null ? '' : centsToAmountText(found.payment.dueAmountCents));
    const expected = found.payment.expectedMethod;
    // Kuryenin eline yalnız üç yöntem girer; `online`/`bank_transfer` beklentisi segmenti değiştirmez.
    if (expected === 'cash' || expected === 'card' || expected === 'cheque') setMethod(expected);
  }, [orderId]);

  useEffect(() => {
    void load();
  }, [load]);

  const lines = stop?.items ?? [];
  const allMarked = lines.length > 0 && lines.every((line) => marks[line.orderItemId] !== undefined);
  const hasRefused = lines.some((line) => marks[line.orderItemId] === 'refused');
  const allRefused = lines.length > 0 && lines.every((line) => marks[line.orderItemId] === 'refused');
  const partialReturn = hasRefused && !allRefused;

  /**
   * **KALEM DÜZELTMELERİ** — yalnız REDDEDİLEN satırlardan doğar ve `fulfilledQty` HEDEF adettir:
   * sipariş edilen adetten kapıda geri kalan çıkarılır. İşaretsiz ya da teslim edilen satır
   * gönderilmez, çünkü onlarda değişen bir şey yok ve düzeltilmeyen satır kapıda olduğu gibi kalır.
   *
   * `returnDisposition` BİLEREK boş: malın akıbeti (stoğa dönsün mü, imha mı) kapıda değil DEPO
   * KABULÜNDE karara bağlanır (DOMAIN §8 — "akıbet kararı depocunundur"). Kurye ne gördüğünü söyler,
   * ne olacağını söylemez.
   */
  const adjustments: FulfillmentAdjustment[] = lines
    .filter((line) => marks[line.orderItemId] === 'refused')
    .map((line) => ({ orderItemId: line.orderItemId, fulfilledQty: line.qty - (returnQty[line.orderItemId] ?? line.qty) }));

  const dueCents = stop?.payment.dueAmountCents ?? null;
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
   * **Tahsilat YAZILAMAZ** — borç var ama kapı kasası hesabı yok (ayar boş / bozuk).
   *
   * Tutarın BOŞ olması bu kapıyı kapatmaz ve bu bilinçli bir ayrım: boş tutar "hesap bilinmiyor"
   * değil, kuryenin "kapıda para almadım" demesidir — sipariş borçlu kalır, cevabın `amountDueCents`i
   * bunu söyler ve CTA'nın kendisi de tahsilat yazılmayacağını yazar. İkisini tek bayrağa toplamak
   * çalışan bir kapıyı, çalışmayan bir kapının gerekçesiyle kapatırdı.
   */
  const collectionBlocked = dueCents !== null && doorAccountId === null;

  const proofRequired = stop?.channel === 'b2b';
  const proofSatisfied = !proofRequired || proof !== null;
  const gateOpen = proofSatisfied && allMarked && !allRefused && !collectionBlocked && !finished;

  const gateNote = gateOpen
    ? null
    : allRefused
      ? null
      : collectionBlocked
        ? t.delivery.collection.blocked
        : `${t.delivery.cta.gate}${proofSatisfied ? '' : t.delivery.cta.gateProof}${allMarked ? '' : t.delivery.cta.gateGoods}`;

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

  const confirmSignature = useCallback(
    (pngBase64: string) => {
      setProofError(null);
      setUploading(true);
      void (async () => {
        /* İzin → cihaz DOĞRUDAN kovaya yükler → anahtar saklanır. `signature.png`: kabul edilen
           uzantılar motorda sayılı (SVG yok) ve içerik türü imzaya gömülü, o yüzden ad ile
           `image/png` tek yerden çıkar. */
        const permission = await requestProofUpload(orderId, { filename: 'signature.png', alreadyRequested: 0 });
        if (permission.error !== null) {
          setUploading(false);
          setProofError(t.delivery.proof.uploadFailed);
          return;
        }
        if (!permission.data.ok) {
          setUploading(false);
          setProofError(t.delivery.proof.refusal[permission.data.reason]);
          return;
        }

        const uploaded = await uploadProofImage(permission.data.uploadUrl, 'image/png', base64ToBytes(pngBase64));
        setUploading(false);
        if (!uploaded.ok) {
          setProofError(t.delivery.proof.uploadFailed);
          return;
        }

        setProof({ kind: 'signature', imageKey: permission.data.key, receivedBy: stop?.customerName ?? null });
        setSigning(false);
      })();
    },
    [orderId, stop],
  );

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
        ...(proof === null ? {} : { proof }),
        ...(collection === null ? {} : { collection }),
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

      setNotice({
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
  }, [adjustments, buildCollection, gateOpen, orderId, proof, sending]);

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
        setNotice({ tone: 'error', text: wireErrorText(result.error) });
        return;
      }
      if (result.data.status !== 'ok') {
        setNotice({ tone: 'error', text: refusalText(result.data) });
        return;
      }

      setNotice({
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

    proofRequired,
    proof,
    signing,
    uploading,
    proofError,
    openSignature: useCallback(() => {
      setSigning(true);
      setProofError(null);
    }, []),
    cancelSignature: useCallback(() => setSigning(false), []),
    confirmSignature,
    clearProof: useCallback(() => {
      setProof(null);
      setProofError(null);
    }, []),

    lines,
    markOf: (orderItemId) => marks[orderItemId],
    toggleLine: (orderItemId) =>
      setMarks((current) => ({
        ...current,
        [orderItemId]:
          current[orderItemId] === undefined ? 'delivered' : current[orderItemId] === 'delivered' ? 'refused' : undefined,
      })),
    returnQtyOf: (line) => returnQty[line.orderItemId] ?? line.qty,
    changeReturnQty: (line, delta) =>
      setReturnQty((current) => ({
        ...current,
        [line.orderItemId]: Math.min(line.qty, Math.max(1, (current[line.orderItemId] ?? line.qty) + delta)),
      })),
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
    notice,
    finished,
    deliver,
    confirmOutcome,
  };
}
