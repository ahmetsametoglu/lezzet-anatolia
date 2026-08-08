import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ORDER_STATUS_LABELS,
  type ConfirmDoorDeliveryResponse,
  type CourierStopContract,
  type DeliveryProofInputContract,
  type DoorCollectionInputContract,
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
import { centsToAmountText, money, parseAmountToCents, parseContentSummary, type SummaryLine } from './courier-format';

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

  ── BUGÜN GÖNDERİLEMEYEN İKİ ALAN — SÖZLEŞME BOŞLUĞU, EKRAN KUSURU DEĞİL ────
  Ölçüldü (08.08), varsayılmadı:
  · `collection.accountId` ZORUNLU bir uuid (`DoorCollectionInputSchema`) ve mobil istemcinin onu
    öğrenebileceği bir yol YOK — web ekranı değeri `door_cash_account_id` AYARINDAN sunucu
    tarafında okuyor (`deliveries/[orderId]/delivery-read.ts:36`), `/api/v1/courier/day` cevabı da
    `/me` de bu alanı taşımıyor. Uydurulmuş bir uuid 400 alır, alansız gövde sözleşmeye uymaz.
    → Tahsilat paneli TAM çalışır (tutar, ±, yöntem, kısmi rozeti, nakit uyarısı) ama TESLİM KAPISI
    kapalıdır ve sebebi ekranda yazılıdır. "Teslim yazıp parayı yazmamak" bilerek seçilmedi: kapıda
    alınan 42 € kayda geçmeden teslim kapanırsa sipariş borçlu görünür, müşteriye borç hatırlatması
    gider ve para ancak ay sonu mutabakatında aranır. Kanıt kapısının kendi kuralı da aynı — eksik
    girdide HİÇBİR yazım yapılmaz. Bugünkü çalışan yol operasyon WEB ekranıdır (o kapı tam).
  · `adjustments[].orderItemId` de yok: durak sözleşmesi kalem SATIRI taşımıyor, yalnız `itemCount`
    ve bir özet metni (`contentSummary`). Kalem işaretleri bu yüzden iki KAPIYI besliyor ("her
    kalemi işaretle" · "tümü reddedildiyse Kabul etmedi'yi kullan") ama kısmi iade uca
    GÖNDERİLEMEZ; o hâlde de teslim kapısı kapalı ve sebebi yazılı.
  BEKLEYEN(21.10): `/courier/day` cevabına kapı kasası hesabı + kalem satırları (`orderItemId`,
  `qty`) eklenmeli — ikisi de `packages/types` + `apps/mobile-api` işi, bu şeridin yazma alanı dışı.
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

/**
 * **KAPI KASASI HESABI — bugün `null`.** Dosya künyesindeki sözleşme boşluğunun tek dikişi burası:
 * alan uca eklendiği gün bu fonksiyon durağı okur ve tahsilat kendiliğinden açılır. Sabit bir
 * `null` yerine adlandırılmış bir dikiş olması bilinçli — "neden tahsilat gönderilmiyor?" sorusunun
 * cevabı koda bakan kişinin ilk gördüğü şey olsun.
 */
function doorCashAccountId(): string | null {
  return null;
}

/** Kalemin üç hâli (v2:917): işaretsiz → teslim → reddedildi → işaretsiz. */
type LineMark = 'delivered' | 'refused' | undefined;

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

  lines: SummaryLine[];
  /** Özete sığmayan kalem sayısı — işaretlenemezler, kapıyı da bloke etmezler. */
  hiddenLines: number;
  markOf: (key: string) => LineMark;
  toggleLine: (key: string) => void;
  returnQtyOf: (line: SummaryLine) => number;
  changeReturnQty: (line: SummaryLine, delta: number) => void;
  hasRefused: boolean;
  allRefused: boolean;
  /** Kısmi iade uca gönderilemiyor (künye) — kapı kapalı, sebebi ekranda. */
  partialBlocked: boolean;

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
  /** Tahsilat gönderilemiyor (künye) — panel çalışır, teslim kapısı kapalıdır. */
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

  const summary = parseContentSummary(stop?.contentSummary ?? '', stop?.itemCount ?? 0);
  const lines = summary.lines;
  const allMarked = lines.length > 0 && lines.every((line) => marks[line.key] !== undefined);
  const hasRefused = lines.some((line) => marks[line.key] === 'refused');
  const allRefused = lines.length > 0 && lines.every((line) => marks[line.key] === 'refused');
  const partialBlocked = hasRefused && !allRefused;

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
    const accountId = doorCashAccountId();
    if (accountId === null) return null;
    collectionKey.current ??= newRequestKey('col');
    return { method, amountCents, accountId, idempotencyKey: collectionKey.current };
  }, [amountCents, dueCents, method]);

  const collectionBlocked = dueCents !== null && buildCollection() === null;

  const proofRequired = stop?.channel === 'b2b';
  const proofSatisfied = !proofRequired || proof !== null;
  const gateOpen = proofSatisfied && allMarked && !allRefused && !partialBlocked && !collectionBlocked && !finished;

  const gateNote = gateOpen
    ? null
    : allRefused
      ? null
      : partialBlocked
        ? t.delivery.goods.partialBlocked
        : collectionBlocked
          ? t.delivery.collection.blocked
          : `${t.delivery.cta.gate}${proofSatisfied ? '' : t.delivery.cta.gateProof}${allMarked ? '' : t.delivery.cta.gateGoods}`;

  const ctaLabel = allRefused
    ? t.delivery.cta.allRefused
    : sending
      ? t.delivery.cta.sending
      : hasRefused
        ? t.delivery.cta.partial
        : dueCents !== null && amountCents !== null
          ? fillCopy(t.delivery.cta.deliverWithAmount, { amount: money(amountCents) })
          : t.delivery.cta.deliver;

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
      /* Gövde bugün YALNIZ kanıt taşıyor: `adjustments` kalem kimliği olmadığı için hiç doğmuyor,
         `collection` da kasa hesabı olmadığı için (künye). İkisi de sözleşmede opsiyonel — eksik
         alanla gönderilen bir istek DEĞİL, o alanların doğmadığı bir istek gidiyor. */
      const collection = buildCollection();
      const result = await submitDoorDelivery(orderId, {
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
  }, [buildCollection, gateOpen, orderId, proof, sending]);

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
    hiddenLines: summary.hidden,
    markOf: (key) => marks[key],
    toggleLine: (key) =>
      setMarks((current) => ({
        ...current,
        [key]: current[key] === undefined ? 'delivered' : current[key] === 'delivered' ? 'refused' : undefined,
      })),
    returnQtyOf: (line) => returnQty[line.key] ?? line.qty,
    changeReturnQty: (line, delta) =>
      setReturnQty((current) => ({
        ...current,
        [line.key]: Math.min(line.qty, Math.max(1, (current[line.key] ?? line.qty) + delta)),
      })),
    hasRefused,
    allRefused,
    partialBlocked,

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
