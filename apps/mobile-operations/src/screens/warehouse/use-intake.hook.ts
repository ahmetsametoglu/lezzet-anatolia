import { useCallback, useEffect, useRef, useState } from 'react';
import { MLOR_PERCENT } from '@lezzet/domain-core';
import type {
  BarcodeKind,
  IntakeFormRowContract,
  IntakePurchaseOrderContract,
  PendingIntakeContract,
  VariantSearchRowContract,
} from '@lezzet/types';

import { EMPTY_BREAKDOWN, setCaseCount, type QuantityBreakdown } from '@/components/operations/quantity-value';
import { fetchIntakeForm, fetchPendingIntakes, learnScannedCode, receiveGoods, resolveScannedCode } from '@/lib/api/warehouse';
import { useNotice } from '@/lib/haptics/use-notice.hook';
import { toastSuccess } from '@lezzet/mobile-kit/src/lib/toast/toast-store';
import { fillCopy } from '@/screens/operations/copy';
import { warehouseCopy } from './copy';
import { parseDate, productLabel } from './warehouse-format';
import { trackWarehouse } from './warehouse-status';

/*
  SKT alanı metindir: yerel tarih seçici modülü bağımlılıklarda yok ve eklenmesi dev-client'ı yeniden derletir.
  Hasara fotoğraf eklenmez, çünkü yükleme hattı yok ve düğme olmayan bir kanıtı vaat ederdi.
*/

const t = warehouseCopy;

type IntakeStatus = 'loading' | 'ready' | 'error';

/** Kapının iki cevabı — sözleşmeden TÜRER, elle yazılmaz. */
type ReceiveOutcome = Extract<Awaited<ReturnType<typeof receiveGoods>>, { error: null }>['data'];

interface IntakeNotice {
  tone: 'ok' | 'warn' | 'error';
  text: string;
}

/** Satırın ekrandaki hâli — dördü de depocunun elinden gelir, hiçbiri türetilmez. */
export interface IntakeRowState {
  /** Gelen adet; `null` = henüz sayılmadı (sıfır DEĞİL — sıfır "hiç gelmedi" beyanıdır). */
  qty: number | null;
  /**
   * Adedin dökümü (kaç koli + kaç tek paket); `qty` bunun toplamıdır ve ikisi aynı yamada yazılır ki biri geride kalmasın.
   * Döküm ayrıca tutulur, çünkü depocu çekmeceyi yeniden açınca toplamı değil koli sayısını düzeltmek ister.
   */
  breakdown: QuantityBreakdown;
  /** Ham metin: alan yazılırken geçersiz ara hâllerden geçer, ISO'ya ancak tamamlanınca döner. */
  expiryText: string;
  lotText: string;
  /** Hasar kartı açık mı — sayaç 0'dan başladığı için "kart açıldı" ile "hasar var" ayrı sorulardır. */
  damageOpen: boolean;
  /** Kaç paket hasarlı — kabul edilen adedin İÇİNDEN işaretlenir, toplamı değiştirmez. */
  damagedQty: number;
  /** Hasar sebebi; `null` = sebep verilmedi, sebepsiz hasar da geçerlidir. */
  damageReason: string | null;
  damageNote: string;
  /**
   * Adet barkod okutularak mı yazıldı ve neyle: elle sayılan satır yalnız beyandır, okutulanda kod ile kayıt eşleşmiştir.
   * Boole değil nesne, çünkü ekran neyin okutulduğunu da yazar ("koli barkodu · çarpan 12").
   */
  scan: { kind: BarcodeKind; qtyPerCode: number } | null;
}

const EMPTY_ROW: IntakeRowState = {
  qty: null,
  breakdown: EMPTY_BREAKDOWN,
  expiryText: '',
  lotText: '',
  damageOpen: false,
  damagedQty: 0,
  damageReason: null,
  damageNote: '',
  scan: null,
};

/**
 * Okutulan adedi dökümde koli ve tek pakete böler; artığı koliye yuvarlamak sayımı bozardı.
 * Boy, kayıtlı boylarla çarpanından eşleşir; eşleşmeseydi aynı boy çekmecede iki kez çizilirdi.
 */
function addToBreakdown(
  current: QuantityBreakdown,
  qty: number,
  scan: { kind: BarcodeKind; qtyPerCode: number },
  caseSizes: { code: string; qtyPerCode: number }[],
): QuantityBreakdown {
  if (scan.kind !== 'case' || scan.qtyPerCode <= 1) return { ...current, loose: current.loose + qty };
  const registered = caseSizes.find((item) => item.qtyPerCode === scan.qtyPerCode);
  const size = { code: registered?.code ?? null, qtyPerCode: scan.qtyPerCode };
  const already = current.cases.find((item) => item.code === size.code && item.qtyPerCode === scan.qtyPerCode)?.count ?? 0;
  const boxes = Math.floor(qty / scan.qtyPerCode);
  const rest = qty - boxes * scan.qtyPerCode;
  const withBoxes = boxes === 0 ? current : setCaseCount(current, size, already + boxes);
  return rest === 0 ? withBoxes : { ...withBoxes, loose: withBoxes.loose + rest };
}

/**
 * Öğrenilen kodun ekranda kalan kartı. `LearnState`ten ayrıdır: o akış bitince `null`a döner, bu akıştan sonra doğar
 * ve bir sonraki kabulü değiştiren sonucu anlatır.
 */
export interface LearnedNote {
  code: string;
  /** Ürünün ekrandaki adı — kart onu kodun karşısına yazıyor. */
  name: string;
  kind: BarcodeKind;
  qtyPerCode: number;
}

/**
 * Öğrenmenin iki adımı tek durumda: kod hangi ürüne bağlanacak ve neyi sayıyor (tekil paket mi, kaç adetlik koli mi).
 * İkinci adım olmasaydı öğretilen her kod 1 adet sayılırdı.
 */
export interface LearnState {
  code: string;
  /** `null` = ürün henüz seçilmedi; ekran birinci adımı (satır listesi) çizer. */
  variantId: string | null;
  kind: BarcodeKind;
  /** Bir okutmanın kaç adet sayılacağı — `unit` için daima 1 (kural veride). */
  qtyPerCode: number;
}

interface UseIntakeResult {
  status: IntakeStatus;
  rows: IntakeFormRowContract[];
  /** Konusuz açılışta bekleyen sevkiyatlar; konulu açılışta boş. */
  pending: PendingIntakeContract[];
  /**
   * Açık sevkiyatın künyesi; ekran başlığa sevkiyat kodunu yazar, çünkü depocunun elindeki irsaliyede o kod durur.
   * `null` = konusuz açılış ya da plansız kabul.
   */
  purchaseOrder: IntakePurchaseOrderContract | null;
  /**
   * Sunucudaki MLOR eşiği (%). Motorun sabiti yalnız form okunmadan çizilen kare için varsayılandır: eşik okunamadı diye
   * uyarıyı kapatmak bilinen bir kuralı yok saymak olurdu.
   */
  mlorPercent: number;
  /** Plansız kabulde aramadan seçilen ürünü satır yapar. */
  addManualRow: (variant: VariantSearchRowContract) => void;
  stateOf: (variantId: string) => IntakeRowState;
  patch: (variantId: string, patch: Partial<IntakeRowState>) => void;
  /** Her satırda adet + geçerli SKT var mı — CTA'nın kapısı. */
  complete: boolean;
  /** En az bir satır yazılabilir mi — KISMİ kaydın ölçütü (künyesi türetildiği yerde). */
  hasAnyCounted: boolean;
  /** Kaç satır yazılabilir durumda — yapışkan çubuğun kapı metni ("3/5 satır dolu"). */
  filledCount: number;
  /** Bu kabulde BAŞKA satırlara girilmiş lot kodları — çekmecenin öneri listesi. */
  lotsUsedBy: (variantId: string) => string[];
  /** Bu kabulde BAŞKA satırlara yazılmış SKT'ler (ISO) — tarih tuş takımının hızlı çipleri. */
  datesUsedBy: (variantId: string) => string[];
  /** Beklenenden sapan satırlar — yalnız onlar gösterilir. */
  differences: { name: string; expected: number; received: number }[];
  sending: boolean;
  notice: IntakeNotice | null;
  /** Kabulün sonucu: uyarılar ve farklar KAPIDAN gelir, ekran yeniden hesaplamaz. */
  warnings: { name: string; remainingPercent: number | null }[];
  /**
   * Kabulü yazar; `onDone` yalnız tam kayıtta çağrılır, çünkü gezinme ekranın kararıdır ve kısmi kayıtta depocu kalan
   * satırlara devam eder.
   */
  submit: (options?: { partial?: boolean; onDone?: () => void }) => void;
  reload: () => void;
  /** Aşağı çekme — ekranı karartmadan tazeler (liste yerinde durur, halka döner). */
  refresh: () => void;
  /** Çekme sürüyor mu — `status` DEĞİL: o listeyi söküp yükleme hâline geçirirdi. */
  reloading: boolean;
  /** Tarama sayfası açık mı — ekran ScanSheet'i bununla çizer. */
  scanOpen: boolean;
  openScan: () => void;
  closeScan: () => void;
  /** Ham kodun işlenmesi — çözüm, satır bulma ve adet çekmecesi (künye aşağıda). */
  handleScan: (code: string) => void;
  /** Okutmayla sayılan satırın kimliği — ekran onu açar ve adet çekmecesini getirir. */
  pendingCount: string | null;
  clearPendingCount: () => void;
  /** Tanınmayan kod — dolu ise ekran öğrenme çekmecesini çizer (iki adım, künye aşağıda). */
  learn: LearnState | null;
  /** Öğrenilen kodun kalıcı künyesi — akış bitince doğar, ekranda kalır (künyesi tipin üstünde). */
  learned: LearnedNote | null;
  /** 1. adım: kodun hangi ürüne bağlanacağı. */
  pickLearnVariant: (variantId: string) => void;
  /** 2. adım: bu kod tekil paketi mi koliyi mi sayıyor, koliyse kaç adet. */
  setLearnKind: (kind: BarcodeKind) => void;
  setLearnQty: (qtyPerCode: number) => void;
  /** Kodu yazar; `already_bound` cevabı da burada cümleye çevrilir. */
  confirmLearn: () => void;
  cancelLearn: () => void;
}

/**
 * `unplanned` = siparişsiz kabul: satırlar sunucudan gelmez, depocu aramayla ya da okutmayla kurar. Bu yüzden PO'lu
 * kabulün "listede olmayan satır açılmaz" kuralı burada yoktur.
 */
export function useIntake(purchaseOrderId: string | null, unplanned = false): UseIntakeResult {
  const [status, setStatus] = useState<IntakeStatus>('loading');
  const [rows, setRows] = useState<IntakeFormRowContract[]>([]);
  /** Konusuz açılışın listesi — "hangi sevkiyatı bekliyorum". Konulu açılışta boş kalır. */
  const [pending, setPending] = useState<PendingIntakeContract[]>([]);
  const [mlorPercent, setMlorPercent] = useState<number>(MLOR_PERCENT);
  const [purchaseOrder, setPurchaseOrder] = useState<IntakePurchaseOrderContract | null>(null);
  const [states, setStates] = useState<Record<string, IntakeRowState>>({});
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useNotice<IntakeNotice>();
  const [warnings, setWarnings] = useState<{ name: string; remainingPercent: number | null }[]>([]);

  const generation = useRef(0);

  const load = useCallback(async () => {
    if (unplanned) {
      /* Plansızda okunacak form yok. Ekran aynı rotada yeniden kurulmadığı için önceki siparişin satırları ve yarım SKT'leri
         temizlenir; yoksa siparişsiz kabul olmayan bir siparişin satırlarıyla açılırdı. */
      setRows([]);
      setPending([]);
      setStates({});
      // Künye de gider: siparişsiz kabulün başlığı bir sevkiyat kodu OLAMAZ ve bir öncekinin
      // kodu orada kalırsa ekran olmayan bir siparişin adıyla açılır (aynı rota, aynı tuzak).
      setPurchaseOrder(null);
      setStatus('ready');
      return;
    }
    if (purchaseOrderId === null) {
      // Konusuz açılış bekleyen sevkiyatları listeler; depocu kabule derin bağlantı olmadan buradan girer.
      const run = (generation.current += 1);
      const bekleyen = await trackWarehouse(fetchPendingIntakes());
      if (run !== generation.current) return;

      setRows([]);
      setPurchaseOrder(null);
      if (bekleyen.error !== null) {
        setStatus('error');
        return;
      }
      setPending(bekleyen.data.intakes);
      setStatus('ready');
      return;
    }

    const run = (generation.current += 1);
    const result = await trackWarehouse(fetchIntakeForm(purchaseOrderId));
    if (run !== generation.current) return;

    if (result.error !== null) {
      setStatus('error');
      return;
    }

    setRows(result.data.rows);
    setPurchaseOrder(result.data.purchaseOrder);
    setMlorPercent(result.data.mlorPercent);
    setStatus('ready');
  }, [purchaseOrderId, unplanned]);

  // Form BİR KEZ okunur (odakta değil): yarı doldurulmuş bir kabul formunu ekranın arkasından
  // tazelemek, depocunun yazdığı adetleri silerdi.
  useEffect(() => {
    void load();
  }, [load]);

  /* Aşağı çekmenin ayrı bayrağı var: `status` `loading`e dönseydi ekran listeyi söküp yükleme hâline geçerdi, oysa çekmede
     liste yerinde kalmalı. */
  const [reloading, setReloading] = useState(false);

  const reload = useCallback(() => {
    setStatus('loading');
    void load();
  }, [load]);

  /** Aşağı çekme: ekranı KARARTMADAN tazeler — liste yerinde durur, yalnız halka döner. */
  const refresh = useCallback(() => {
    setReloading(true);
    void load().finally(() => setReloading(false));
  }, [load]);

  const stateOf = useCallback((variantId: string): IntakeRowState => states[variantId] ?? EMPTY_ROW, [states]);

  const patch = useCallback((variantId: string, next: Partial<IntakeRowState>) => {
    setStates((current) => ({ ...current, [variantId]: { ...(current[variantId] ?? EMPTY_ROW), ...next } }));
    setNotice(null);
  }, []);

  /** Bir satır YAZILABİLİR mi: sayılmış, sıfırdan büyük ve SKT'si girilmiş. */
  const writable = (variantId: string) => {
    const state = states[variantId];
    return state !== undefined && state.qty !== null && state.qty > 0 && parseDate(state.expiryText) !== null;
  };

  const complete = rows.length > 0 && rows.every((row) => writable(row.variantId));

  /**
   * Kısmi kaydın ölçütü: en az bir satır yazılabilir mi. Hiçbiri hazır değilken kısmi kayıt düğmesi çizilseydi kapıya boş
   * bir kabul giderdi.
   */
  const hasAnyCounted = rows.some((row) => writable(row.variantId));

  /**
   * Kaç satır dolu — `complete` ve `hasAnyCounted` ile aynı ölçütten (`writable`) sayılır; ayrı bir "dolu" tanımı sayaç ile
   * düğmeyi birbirinden koparırdı.
   */
  const filledCount = rows.filter((row) => writable(row.variantId)).length;

  /**
   * Lot önerileri iki kaynaktan, bu sırayla: bu kabuldeki öteki satırların kodları, sonra varyantın depodaki partileri (ilk
   * satırda birinci kaynak boştur). Sıra yakınlık sırasıdır: aynı kabulde az önce yazılan kod, elimdeki koliyle büyük
   * ihtimalle aynıdır.
   */
  const lotsUsedBy = (variantId: string): string[] => {
    const seen = new Set<string>();
    for (const row of rows) {
      if (row.variantId === variantId) continue;
      const code = states[row.variantId]?.lotText.trim() ?? '';
      if (code.length > 0) seen.add(code);
    }
    for (const code of rows.find((row) => row.variantId === variantId)?.lotCandidates ?? []) {
      const trimmed = code.trim();
      if (trimmed.length > 0) seen.add(trimmed);
    }
    return [...seen];
  };

  /**
   * Tarih önerileri yalnız bu kabuldeki öteki satırlardan gelir. Depodaki partilerin tarihleri bilerek önerilmez: eski
   * partinin tarihi yeni koliye ancak yanlışlıkla yazılır.
   */
  const datesUsedBy = (variantId: string): string[] => {
    const seen = new Set<string>();
    for (const row of rows) {
      if (row.variantId === variantId) continue;
      const iso = parseDate(states[row.variantId]?.expiryText ?? '');
      if (iso !== null) seen.add(iso);
    }
    return [...seen];
  };

  const differences = rows
    .map((row) => ({
      name: productLabel(row.productName, row.variantLabel),
      expected: row.expectedQty,
      received: states[row.variantId]?.qty ?? null,
    }))
    .filter((row): row is { name: string; expected: number; received: number } => row.received !== null)
    // Beklenen yoksa (plansız kabul) sapma da yoktur; yoksa her adet fark özetine düşerdi.
    .filter((row) => row.expected > 0 && row.received !== row.expected);

  /**
   * Kabulü yazar; `partial` yalnız `complete` kilidini açar, gövde aynıdır çünkü sayılmamış satır zaten atlanır. Rampada
   * parça parça gelen mal geldiği kadar stoğa girmeli, ama en az bir sayılmış satır şarttır.
   */
  const submit = useCallback(
    (options?: { partial?: boolean; onDone?: () => void }) => {
      const partial = options?.partial === true;
      if (sending) return;
      if (!partial && !complete) return;
      if (partial && !hasAnyCounted) return;
      setSending(true);
      setNotice(null);

      void (async () => {
        const lines = rows.flatMap((row) => {
          const state = states[row.variantId];
          const expiryDate = state === undefined ? null : parseDate(state.expiryText);
          if (state === undefined || state.qty === null || state.qty <= 0 || expiryDate === null) return [];
          const lot = state.lotText.trim();
          return [
            {
              variantId: row.variantId,
              qty: state.qty,
              expiryDate,
              // Boş lot BİLİNÇLİ bir karardır; "atlandı" işaretiyle boş gider, uydurma bir kod DEĞİL.
              lotNumber: lot.length === 0 ? null : lot,
            },
          ];
        });

        /* Sözleşmede satır başına hasar alanı yok: adet, sebep ve not, hangi satıra ait olduğu yazılarak isteğin tek notunda
           toplanır. Stokta ayrı "hasarlı" kalem açılmaz; kartın dipnotu bunu söyler. */
        const damage = rows
          .map((row) => {
            const state = states[row.variantId];
            const parts = [
              state === undefined || state.damagedQty === 0 ? '' : fillCopy(t.intake.damage.broken, { n: String(state.damagedQty) }),
              state?.damageReason ?? '',
              state?.damageNote.trim() ?? '',
            ].filter((part) => part.length > 0);
            return { row, note: parts.join(' · ') };
          })
          .filter((entry) => entry.note.length > 0)
          .map((entry) => `${productLabel(entry.row.productName, entry.row.variantLabel)}: ${entry.note}`);

        const result = await trackWarehouse(
          receiveGoods(purchaseOrderId, { lines, note: damage.length === 0 ? null : damage.join(' · ') }),
        );
        setSending(false);

        if (result.error !== null) {
          setNotice({
            tone: 'error',
            text: result.error === 'network_error' ? t.common.networkError : fillCopy(t.common.serverError, { error: result.error }),
          });
          return;
        }

        setWarnings(
          result.data.status === 'ok'
            ? result.data.warnings.map((warning) => ({
                name: nameOf(rows, warning.variantId),
                remainingPercent: warning.remainingPercent,
              }))
            : [],
        );

        const outcome = noticeOf(result.data);

        /* Başarı toast'la söylenir, çünkü ekran kapanır ve kapanan ekrandaki bildirim çubuğu okunmaz. Hata çubukta kalır:
           ekran açık kalır ve depocu yeniden denerken mesaj sönmemeli. */
        if (outcome.tone === 'ok') {
          toastSuccess(outcome.text);
          if (partial) {
            /* KISMİ KAYITTA EKRANDA KALINIR ama form YENİLENİR: sunucu kalan adetleri yeniden
               hesapladı ve ekrandaki "beklenen"ler artık bayat. Yenilemeden devam etmek,
               depocuya kapanmış bir kalemi tekrar saydırırdı. */
            reload();
          } else {
            options?.onDone?.();
          }
          return;
        }
        setNotice(outcome);
      })();
    },
    [complete, hasAnyCounted, purchaseOrderId, reload, rows, sending, states],
  );

  /*
    Okutma adedi hemen yazar (paket kodu 1, koli kodu çarpanı kadar) ve düzeltme için adet çekmecesini açar. PO'lu kabulde
    siparişte olmayan ürün satır açmaz, çünkü fark raporu siparişin kümesine göre kurulur.
  */
  const [scanOpen, setScanOpen] = useState(false);
  /**
   * Adet çekmecesi açılacak satır: okutmada düzeltme için, elle eklemede (adet sıfır) işin kendisi için açılır. Bir kez
   * tüketilir (`clearPendingCount`), yoksa çekmece her çizimde yeniden açılırdı.
   */
  const [pendingCount, setPendingCount] = useState<string | null>(null);
  const [learn, setLearn] = useState<LearnState | null>(null);
  const [learned, setLearned] = useState<LearnedNote | null>(null);

  /** Bulunan satıra okumanın adedini ekler ve cümlesini kurar — tarama ile öğrenmenin ortak ucu. */
  const addScanned = useCallback(
    (variantId: string, qty: number, scan: { kind: BarcodeKind; qtyPerCode: number }) => {
      const row = rows.find((candidate) => candidate.variantId === variantId);
      if (row === undefined) return false;
      setStates((current) => {
        const state = current[variantId] ?? EMPTY_ROW;
        // Okutma izi bir kez YAZILINCA silinmez: satır okutularak açıldıysa, sonradan elle
        // düzeltilmesi o gerçeği geri almaz — künye "bu satıra barkod değdi" diyor, "son dokunuş
        // okutmaydı" değil.
        return {
          ...current,
          [variantId]: {
            ...state,
            qty: (state.qty ?? 0) + qty,
            breakdown: addToBreakdown(state.breakdown, qty, scan, row.caseSizes),
            scan,
          },
        };
      });
      /* Başarılı okutma bildirim basmaz: satır, adedi ve okutma künyesi zaten görünür. Bildirim sonucun görünmediği hâller
         içindir — yabancı ürün, formda olmayan kod, okuma hatası. */
      return true;
    },
    [rows],
  );

  const handleScan = useCallback(
    (code: string) => {
      setScanOpen(false);
      void (async () => {
        const result = await trackWarehouse(resolveScannedCode(code));
        if (result.error !== null) {
          setNotice({ tone: 'error', text: t.intake.scan.error });
          return;
        }
        if (result.data.status === 'unknown') {
          // Varsayılan TEKİL: koli olduğunu ancak depocu bilir ve söylemesi bir dokunuş; tersini
          // varsaymak, her tekil pakete uydurma bir çarpan yazmak olurdu.
          setLearn({ code, variantId: null, kind: 'unit', qtyPerCode: 1 });
          return;
        }

        const found = result.data;
        let row = rows.find((candidate) => candidate.variantId === found.variantId);
        if (row === undefined) {
          // Plansızda okutma satır açar, çünkü kıyaslanacak sipariş kümesi yoktur. Beklenen 0 "yok" demektir ve plansız
          // modda ekranda yazılmaz.
          if (!unplanned) {
            setNotice({
              tone: 'warn',
              text: fillCopy(t.intake.scan.notInForm, { name: productLabel(found.productName, found.variantLabel) }),
            });
            return;
          }
          row = {
            variantId: found.variantId,
            productName: found.productName,
            variantLabel: found.variantLabel,
            expectedQty: 0,
            // Tedarikçi kodu YOKTUR ve bu doğrudur: plansız kabulde sipariş kalemi yok, yani
            // hangi firmanın hangi kodu olduğu da yok. Uydurmak yerine görünür boşluk.
            supplierCode: null,
            // SKU ve tarih rejimi ise VARDIR ve çözüm ucundan geliyor — okutmayla açılan satır da
            // aramayla açılan kadar kodunu, PO'lu satır kadar "SKT ZORUNLU · DLC"sini
            // gösterebilmeli; yoksa aynı listede kural kaynağa göre değişirdi.
            sku: found.sku,
            dateType: found.dateType,
            shelfLifeDays: found.shelfLifeDays,
            // Koli boyları da aynı sebeple: okutmayla açılan satır adet çekmecesini açacak ve o
            // çekmece "kaç koli geldi" diye soracak. PO'lu satırda liste zaten var; burada
            // olmasaydı aynı formda bir satır koli sayar, ötekisi sayamazdı.
            caseSizes: found.caseSizes,
            /* Lot adayı yok: adaylar form açılışında depodan okunur, bu satır okutma anında doğdu. Depocu koli elindeyken
               ikinci bir tur beklemesin; çekmece aynı kabuldeki öteki satırların kodlarını zaten öneriyor. */
            lotCandidates: [],
          };
          setRows((current) => [...current, row!]);
        }
        // Adedi kod kendisi söyler (`qtyPerCode`), bu yüzden depocuya sorulmaz.
        const scannedQty = found.qtyPerCode;
        addScanned(found.variantId, scannedQty, { kind: found.kind, qtyPerCode: found.qtyPerCode });
        // Ekran bu sinyali görüp satırı açar ve adet çekmecesini getirir; bir kez tüketilir.
        setPendingCount(found.variantId);
      })();
    },
    [addScanned, rows, setNotice],
  );

  /**
   * Plansız kabulde aramadan seçilen ürün satır olur; zaten varsa ikinci kez eklenmez, çünkü iki satır kabulün toplamını
   * bölerdi.
   */
  const addManualRow = useCallback((variant: VariantSearchRowContract) => {
    /* Elle eklenen satırın adedi sıfırdır, bu yüzden çekmece burada işin kendisidir. Ürün zaten listedeyse de açılır, çünkü
       ikinci seçim onu sayma isteğidir. */
    setPendingCount(variant.variantId);
    setRows((current) =>
      current.some((row) => row.variantId === variant.variantId)
        ? current
        : [
            ...current,
            {
              variantId: variant.variantId,
              productName: variant.productName,
              variantLabel: variant.variantLabel,
              expectedQty: 0,
              // Okutmayla açılan satırla aynı ikili: kod yok (sipariş kalemi yok), tarih rejimi
              // var (ürünün kendi alanı) — gerekçe `handleScan`in satır açan dalında.
              supplierCode: null,
              sku: variant.sku,
              dateType: variant.dateType,
              shelfLifeDays: variant.shelfLifeDays,
              caseSizes: variant.caseSizes,
              /* Aramadan gelen satırın da adayı yok: `VariantSearchRow` lot taşımıyor ve taşısaydı
                 arama ucu her sonuç için parti okumak zorunda kalırdı (aynı gerekçe okutmada). */
              lotCandidates: [],
            },
          ],
    );
  }, []);

  /*
    Koli kodunun çarpanı öğrenme anında yazılır, çünkü başka yazılacak yeri yok (web'de kod ekleme yok). Yazılmasaydı
    her öğretilen kod 1 adet sayılır, depocu adedi hep elle düzeltirdi.
  */
  const pickLearnVariant = useCallback((variantId: string) => {
    setLearn((current) => (current === null ? null : { ...current, variantId }));
  }, []);

  const setLearnKind = useCallback((kind: BarcodeKind) => {
    // Tekile dönüşte çarpan 1'e ÇEKİLİR: `unit` kodun çarpanı veride de 1 olmak zorunda (0047
    // kısıtı) — ekranın elinde kalan eski koli sayısı kapıya gidip reddedilirdi.
    setLearn((current) => (current === null ? null : { ...current, kind, qtyPerCode: kind === 'unit' ? 1 : current.qtyPerCode }));
  }, []);

  const setLearnQty = useCallback((qtyPerCode: number) => {
    setLearn((current) => (current === null ? null : { ...current, qtyPerCode }));
  }, []);

  const confirmLearn = useCallback(() => {
    if (learn === null || learn.variantId === null || learn.qtyPerCode <= 0) return;
    const { code, variantId, kind, qtyPerCode } = learn;
    setLearn(null);
    void (async () => {
      const result = await trackWarehouse(learnScannedCode({ code, variantId, kind, qtyPerCode }));
      if (result.error !== null) {
        setNotice({ tone: 'error', text: t.intake.scan.error });
        return;
      }
      if (result.data.status === 'ok') {
        // Öğretilen kod ÇARPANI kadar sayılır: az önce "bu koli 12 adet" denmişken satıra 1 yazmak,
        // kendi söylediğimizi ilk kullanımda yok saymak olurdu.
        addScanned(variantId, qtyPerCode, { kind, qtyPerCode });
        // Öğrenmenin sonucu ekranda kalan kartta görünür, çünkü bir sonraki kabulü değiştiren kalıcı bir kayıttır.
        const learnedRow = rows.find((candidate) => candidate.variantId === variantId);
        if (learnedRow !== undefined) {
          setLearned({
            code,
            name: productLabel(learnedRow.productName, learnedRow.variantLabel),
            kind,
            qtyPerCode,
          });
        }
        return;
      }
      // Bu arada BAŞKASI öğretmiş (iki depocu aynı koliyle): kod kime bağlıysa oradan sayılır —
      // sessiz bir çift kayıt yerine, formda varsa o satıra düşer, yoksa yalnız söylenir. Adet
      // 1'dir ve olmalı: çarpan artık ÖTEKİNİN yazdığı kaydın bilgisi, bizim tahminimiz değil.
      const bound = result.data;
      const added = addScanned(bound.variantId, 1, {
        // ÖTEKİNİN yazdığı kayıt: çarpanı bilmiyoruz, tahmin de etmiyoruz — bu okutma 1 saydı ve
        // künye de onu söyler.
        kind: 'unit',
        qtyPerCode: 1,
      });
      /* Depocu bir ürünü seçti ama adet başka satıra düştü; bunu ekranda söyleyen tek şey bu bildirimdir. */
      if (added) {
        setNotice({ tone: 'warn', text: fillCopy(t.intake.scan.alreadyBound, { name: productLabel(bound.productName, bound.variantLabel) }) });
      }
      if (!added) {
        setNotice({
          tone: 'warn',
          text: fillCopy(t.intake.scan.notInForm, { name: productLabel(bound.productName, bound.variantLabel) }),
        });
      }
    })();
  }, [addScanned, learn, setNotice]);

  return {
    status,
    rows,
    pending,
    purchaseOrder,
    mlorPercent,
    addManualRow,
    stateOf,
    patch,
    complete,
    hasAnyCounted,
    filledCount,
    lotsUsedBy,
    datesUsedBy,
    differences,
    sending,
    notice,
    warnings,
    submit,
    reload,
    refresh,
    reloading,
    scanOpen,
    openScan: useCallback(() => setScanOpen(true), []),
    closeScan: useCallback(() => setScanOpen(false), []),
    handleScan,
    pendingCount,
    clearPendingCount: useCallback(() => setPendingCount(null), []),
    learn,
    learned,
    pickLearnVariant,
    setLearnKind,
    setLearnQty,
    confirmLearn,
    cancelLearn: useCallback(() => setLearn(null), []),
  };
}

function nameOf(rows: readonly IntakeFormRowContract[], variantId: string): string {
  const row = rows.find((candidate) => candidate.variantId === variantId);
  return row === undefined ? '—' : productLabel(row.productName, row.variantLabel);
}

/**
 * Kapının cevabı → ekrandaki cümle. `repricedCount` gösterilmez: `null` olabilir (ölçülemedi) ve depo ekranı fiyat görmez.
 */
function noticeOf(outcome: ReceiveOutcome): IntakeNotice {
  if (outcome.status === 'empty') return { tone: 'error', text: t.intake.result.empty };
  return { tone: 'ok', text: fillCopy(t.intake.result.ok, { n: String(outcome.result.stockIds.length) }) };
}
