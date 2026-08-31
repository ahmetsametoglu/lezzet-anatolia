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
import { useNotice } from '@/lib/haptics/use-notice.hook';
import { toastSuccess } from '@/lib/toast/toast-store';
import { newRequestKey } from '@/lib/request-key';
import { fillCopy } from '@/screens/operations/copy';
import { courierCopy } from './copy';
import { lineAmountCents } from '@lezzet/domain-core';
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
  method: 'cash' | 'card' | 'cheque';
  setMethod: (method: 'cash' | 'card' | 'cheque') => void;
  partialPayment: boolean;
  cashLimitWarning: boolean;
  /** Kapı kasası hesabı yok (ayar boş) — panel çalışır, teslim kapısı kapalıdır. */
  collectionBlocked: boolean;
  amountStepCents: number;

  gateOpen: boolean;
  /**
   * Olumsuz sonuç (ulaşılamadı · kabul etmedi) yazılabilir mi — durak YOLA ÇIKMIŞ olmalı.
   *
   * Ölçüldü 31.08 (cihazda): kutuları binmemiş bir durakta "Ulaşılamadı" basılıyor, uç
   * `same_status` diyor ("sipariş zaten bu durumda") çünkü `unreachable`ın hedefi `ready` ve
   * sipariş zaten orada. Ekran doğru davranıyordu ama kuryeye YAPILAMAYACAK bir yol vaat
   * ediyordu — kapıya hiç gitmediğin bir durağa "ulaşılamadı" yazılmaz.
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
   * **Kapı kasası hesabı** — gün cevabından (`doorAccountId`). Durak başına değil gün başına, çünkü
   * ayarın kendisi tekil. `null` = ayar boş ya da kullanılamaz → tahsilat kapısı kapalı ve sebebi
   * ekranda (dosya künyesi). Uydurma bir uuid göndermek 400 alırdı; rastgele bir değer ise kapıda
   * alınan parayı olmayan bir hesaba yazardı.
   */
  const [doorAccountId, setDoorAccountId] = useState<string | null>(null);


  /*
    ── TESLİM VARSAYILAN, RED İSTİSNA (kullanıcı kararı 30.08) ────────────────────────────────
    Eskiden iki durum vardı (`marks`: işaretsiz · teslim · red) ve teslim kapısı HER kalemin
    işaretlenmesini şart koşuyordu (`allMarked`). Kutulu akış zorunlu olunca o şart anlamını
    yitirdi: kutu mühürlenirken içeriği sabitlendi, kapıda okutuldu, müşteriye verildi — "mal
    verildi mi" sorusu ikinci kez sorulmuş oluyordu. Kurye hiçbir şey reddedilmeyen normal bir
    teslimde de kalem sayısı kadar gereksiz dokunuş yapıyordu, hem de elinde kutuyla.

    Model artık TEK sayı: kalem başına REDDEDİLEN adet. Kayıt yoksa ya da 0 ise kalem teslim
    edilmiştir; >0 ise o kadarı geri verilmiştir. İki durumlu işaret (`marks`) kalktı — "işaretsiz"
    diye bir hâl yok, çünkü varsayılanın kendisi bir cevap.
  */
  const [refusedQty, setRefusedQtyState] = useState<Record<string, number>>({});

  /** Kapıda okutulan kutu KODLARI (23.8) — teslim isteğiyle gider, kanıt kaydına yazılır. */
  const [scannedBoxCodes, setScannedBoxCodes] = useState<string[]>([]);
  const [boxScanOpen, setBoxScanOpen] = useState(false);

  const [amountText, setAmountText] = useState('');
  const [method, setMethod] = useState<'cash' | 'card' | 'cheque'>('cash');

  const [outcome, setOutcome] = useState<'unreachable' | 'refused' | null>(null);
  const [outcomeNote, setOutcomeNote] = useState('');
  const [noteError, setNoteError] = useState<string | null>(null);

  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useNotice<DeliveryNotice>();

  /**
   * BAŞARILI SONUÇ: mesaj toast'a gider, ekran kapanır (kullanıcı kararı 30.08).
   *
   * `notice` ekranın İÇİNDE duran bir şerittir ve olumsuz cevaplar için doğru yer — kurye orada
   * kalıp düzeltecek. Olumlu cevapta kalınacak bir şey yok: iş bitti, sıradaki durak listede.
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

  /*
    KUTU KAPISI (23.8, etüt 2.5): kutulu durakta teslim, tüm kutuların QR'ı okutulmadan açılmaz —
    yanlış kapıya inen kutu tam burada yakalanır. Eşleşme YERELDE (kodlar gün cevabında geldi;
    kapı önünde tur atılmaz), son doğrulama sunucuda (`boxes_missing` — bayat listeye karşı).
  */
  const boxes = stop?.boxes ?? [];
  /* KUTUSUZ DURAK DA KAPIYI AÇMAZ (kullanıcı kararı 30.08): mal kutusuyla hazırlanır, kutusuyla
     araca biner, kutusuyla kapıdan çıkar. Kutusuz bir durak bugün bir VERİ HATASIDIR ve sunucu da
     onu reddediyor (`boxes_missing`) — ekranın kapıyı açık göstermesi, kuryeyi reddedilecek bir
     isteğe göndermek olurdu. Eskiden `boxes.length === 0` "kutu kapısı yok" diye okunuyordu. */
  const boxesSatisfied = boxes.length > 0 && boxes.every((box) => scannedBoxCodes.includes(box.code));

  /**
   * **DURAK YOLA ÇIKTI MI** (kullanıcı bulgusu 30.08 · cihazda yakalandı).
   *
   * Kutuları rampada okutulmamış sipariş `ready` kalır — yani araçta değildir ve kapıda teslim
   * EDİLEMEZ. Ekran bunu bilmiyordu: durağı açıyor, kutuyu "kapıda okutturuyor" ve teslim
   * düğmesini etkin gösteriyordu; kurye basınca uç `stale` diyordu ve ekran o reddi olduğu gibi
   * yazıyordu — *"bu durak başkası tarafından kapatılmış olabilir"*. Cümle teknik olarak doğru
   * ama kapıdaki kuryeye YANLIŞ bir hikâye anlatıyor: durağı kimse kapatmadı, mal araçta değil.
   *
   * Cevap zaten sözleşmede duruyordu (`boxes[].loadedAt`): bir kutu bile binmemişse sipariş yola
   * çıkmamıştır. Kapı burada kapanır ve sebebi kuryenin dilinde yazılır.
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
      /* BAŞARILI OKUTMA BİLDİRİM YAZMAZ (kullanıcı bulgusu 30.08): kutu kartı aynı şeyi zaten üç
         yerde söylüyor — sayaç ("1/1 OKUTULDU"), satırın ✓ işareti ve "tüm kutular verildi"
         cümlesi. Dördüncü kez, hem de ekranın en dibinde CTA'nın üstünde bir yeşil şerit olarak
         söylemek gürültüydü. Bildirim OLUMSUZ cevaplarda kalıyor (yanlış kutu · zaten okutulmuş):
         onlar kartta görünmez ve söylenmezse kurye neden ilerlemediğini bilemez. */
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
   * **KALEM DÜZELTMELERİ** — yalnız REDDEDİLEN satırlardan doğar ve `fulfilledQty` HEDEF adettir:
   * sipariş edilen adetten kapıda geri kalan çıkarılır. İşaretsiz ya da teslim edilen satır
   * gönderilmez, çünkü onlarda değişen bir şey yok ve düzeltilmeyen satır kapıda olduğu gibi kalır.
   *
   * `returnDisposition` BİLEREK boş: malın akıbeti (stoğa dönsün mü, imha mı) kapıda değil DEPO
   * KABULÜNDE karara bağlanır (DOMAIN §8 — "akıbet kararı depocunundur"). Kurye ne gördüğünü söyler,
   * ne olacağını söylemez.
   */
  const adjustments: FulfillmentAdjustment[] = lines
    .filter((line) => refusedOf(line) > 0)
    .map((line) => ({ orderItemId: line.orderItemId, fulfilledQty: line.qty - refusedOf(line) }));

  /*
    ── KAPIDA ALINACAK TUTAR, GERİ VERİLEN MAL DÜŞÜLMÜŞ (kullanıcı bulgusu 30.08) ────────────────
    `dueAmountCents` siparişin TAM tutarıdır ve kapıda bir kalem geri verilince değişmez — sunucu
    düzeltmeyi teslim ANINDA yapıyor. Ekran onu olduğu gibi gösterirken kurye "1/2 geri verildi"
    yazıp altında hâlâ tam tutarı görüyordu: kapıda ne tahsil edeceğini bilmiyordu ve kapıda geç
    kalan bir doğruluk, doğruluk değildir.

    Hesap MOTORUN kendisi (`lineAmountCents`, domain-core): ekran ikinci bir formül yazmıyor,
    muhasebe export'u ve kârlılık hangi hesabı yapıyorsa onu çağırıyor. Fark satır başına alınır —
    tam hâl eksi kalan hâl — çünkü indirim payı oransal düşüyor ve bunu ikinci kez türetmek iki
    ayrı doğru üretirdi.
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
   * Reddedilen adedi yazar VE tahsilat alanını yeni tutara çeker.
   *
   * İki iş bilerek TEK yerde: kurye kapıda bir kalemi geri aldığında alacağı para da o anda
   * değişiyor ve alan eski rakamda kalırsa ekran kendi kendisiyle çelişir — üstte "1/2 geri
   * verildi", altta hâlâ tam tutar. Alan kuryenin ELLE yazabildiği bir yer, ama burada yazan
   * kurye değil MOTOR: geri verilen mal bir pazarlık değil, hesabın kendisi.
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
   * **Tahsilat YAZILAMAZ** — borç var ama kapı kasası hesabı yok (ayar boş / bozuk).
   *
   * Tutarın BOŞ olması bu kapıyı kapatmaz ve bu bilinçli bir ayrım: boş tutar "hesap bilinmiyor"
   * değil, kuryenin "kapıda para almadım" demesidir — sipariş borçlu kalır, cevabın `amountDueCents`i
   * bunu söyler ve CTA'nın kendisi de tahsilat yazılmayacağını yazar. İkisini tek bayrağa toplamak
   * çalışan bir kapıyı, çalışmayan bir kapının gerekçesiyle kapatırdı.
   */
  const collectionBlocked = dueCents !== null && doorAccountId === null;

  /* `allMarked` KAPIDAN ÇIKTI (30.08): teslim varsayılan olduğuna göre işaretlenecek bir şey yok.
     Kapı hâlâ üç şeyi soruyor — kutular okutuldu mu, kanıt alındı mı, para yazılabilir mi — ve bir
     şeyi reddediyor: HEPSİ geri verilmişse o teslim değildir, "Kabul etmedi"dir. */
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

      /* SONUÇ TOAST'A, EKRAN LİSTEYE DÖNER (kullanıcı kararı 30.08) ─────────────────────────
         Eskiden ekran "sonuç ekranı"na dönüp KALIYORDU (v2:882'nin bilinçli sapması: "kurye
         yazıldı mı sorusunun cevabını okur, sonra listeye döner"). Cihazda ölçüldü: kurye
         okuyacak bir şey olduğunu anlamıyor, durakta takılı kalıyor ve geri tuşunu arıyor —
         üstelik en sık yaptığı iş bu ve her seferinde iki dokunuş fazladan.
         Cevap kayboluyor DEĞİL: toast onu listenin üstünde taşıyor ve liste zaten tazeleniyor
         (`useFocusEffect`), yani kurye sonucu durağın kendi satırında da görüyor. */
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
        /* ÇEKMECE KAPANIR (ölçüldü 31.08 · cihazda): bildirim ekranın gövdesinde çiziliyor ve
           çekmece AÇIK kalınca onun altında kalıyordu — kurye "Onayla"ya basıyor, hiçbir şey
           olmadığını görüyor, tekrar basıyordu. Yutulan bir hata yoktu; GÖRÜNMEYEN bir hata vardı. */
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
    notice,
    finished,
    deliver,
    confirmOutcome,
  };
}
