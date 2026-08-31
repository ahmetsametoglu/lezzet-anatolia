import { useCallback, useEffect, useRef, useState } from 'react';
import { MLOR_PERCENT } from '@lezzet/domain-core';
import type {
  BarcodeKind,
  IntakeFormRowContract,
  IntakePurchaseOrderContract,
  PendingIntakeContract,
  ResolveCodeResponse,
  VariantSearchRowContract,
} from '@lezzet/types';

import { EMPTY_BREAKDOWN, setCaseCount, type QuantityBreakdown } from '@/components/operations/quantity-value';
import { fetchIntakeForm, fetchPendingIntakes, learnScannedCode, receiveGoods, resolveScannedCode } from '@/lib/api/warehouse';
import { useNotice } from '@/lib/haptics/use-notice.hook';
import { toastSuccess } from '@/lib/toast/toast-store';
import { fillCopy } from '@/screens/operations/copy';
import { warehouseCopy } from './copy';
import { parseDate, productLabel } from './warehouse-format';
import { trackWarehouse } from './warehouse-status';

/*
  D2 · MAL KABUL (v2:353-400). `/warehouse/intake/:poId` + `/intake/:poId/receive`.

  ── SKT ZORUNLULUĞU BİR EKRAN KURALI DEĞİL, ŞEMA KURALI ─────────────────────
  v2: *"SKT her satırda zorunlu — girilmeden kabul kapanmaz."* Sözleşmede `expiryDate` zorunlu alan,
  yani tarihsiz satır gövde ayrıştırmasında 400 alır ve HİÇBİR yazım denenmez. Ekran bu yüzden
  CTA'yı kapalı tutuyor — kapıyı boşuna zorlamamak için, kuralın sahibi olduğu için değil.

  ── TARİH ALANI METİNDİR, VE BU BİR SINIR ───────────────────────────────────
  Tasarımın `<input type="date">`i cihazda yerel bir seçici açar; o modül (`@react-native-community/
  datetimepicker`) bağımlılıklarda YOK ve eklenmesi dev-client'ın yeniden derlenmesini ister —
  kameranın 21.13'e bağlanmasıyla aynı sınır. Alan metin olarak yazıldı, biçim doğrulaması
  `parseDate`te (gg.aa.yyyy · gg.aa.yy · ISO; takvimde olmayan gün REDDEDİLİR). Seçici geldiği gün
  yalnız girdi bileşeni değişir.

  ── HASAR: NOT VAR, FOTOĞRAF YOK ────────────────────────────────────────────
  Satır başına hasar notu tutulur ve isteğin TEK `note` alanında toplanır (sözleşmede satır başına
  not yok). Fotoğraf ÇİZİLMEDİ: kamera ve kova yükleme hattı 21.13'ün işi ve olmayan bir makinenin
  düğmesini koymak, depocuya var olmayan bir kanıt sözü vermek olurdu.

  ── PLANSIZ KABUL AYRI BİR ADRESTİR ─────────────────────────────────────────
  Uç iki kapı açıyor: PO'lu (`/intake/:poId/receive`) ve plansız (`/intake/receive`). İstemci hangi
  yolu çağıracağını ekranın konusundan bilir. Plansız yolda FORM BOŞ gelir ve satırların
  `variantId`si elle seçilmelidir — o seçimi besleyecek bir operasyon ürün araması bugün yok, o
  yüzden ekran plansız modda satır AÇMAZ ve bunu söyler (rapora yazıldı).
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
   * Adedin DÖKÜMÜ — hangi boydan kaç koli + koli dışı kaç tek paket (v3 · `sheetAdet`).
   *
   * `qty` bunun toplamıdır ve ikisi HER ZAMAN aynı yamada yazılır (çekmecenin `onChange`i,
   * okutmanın `addScanned`i) — ayrı yazılsalardı biri bir gün ötekinden geride kalırdı. Toplamı
   * ayrıca tutmanın sebebi: gönderim ve sapma hesabı toplamı ister, döküm ise ÇEKMECENİN belleği.
   * Depocu çekmeceyi yeniden açtığında "27" değil "2 koli + 3 tek" görmeli — düzeltmek istediği
   * şey toplam değil, bir koli sayısıdır.
   */
  breakdown: QuantityBreakdown;
  /** Ham metin: alan yazılırken geçersiz ara hâllerden geçer, ISO'ya ancak tamamlanınca döner. */
  expiryText: string;
  lotText: string;
  /**
   * Hasar kartı AÇIK mı — sayacın kendisi 0'dan başladığı için "açıldı" ile "hasar var" ayrı
   * sorulardır (v3:05 `hasarAcik`). Eskiden bu bayrak yoktu ve kart, nota tek boşluk yazılarak
   * açılıyordu; o hile notu da kirletiyordu.
   */
  damageOpen: boolean;
  /** Kaç paket hasarlı — kabul edilen adedin İÇİNDEN işaretlenir, toplamı değiştirmez. */
  damagedQty: number;
  /**
   * İşaretlenen hasar sebebi — TEK (kullanıcı kararı 30.08, tasarımdan sapma). Şablon dört çipi
   * karta serip çoklu seçime izin veriyordu (`multi:true`); kullanıcı listeyi çekmeceye aldı ve
   * tek sebebe indirdi. Sebepsiz hasar da geçerlidir: `null` kalabilir.
   */
  damageReason: string | null;
  damageNote: string;
  /**
   * Bu satırın adedi BARKOD OKUTULARAK mı yazıldı, ve okutulduysa NE ile (v3:05 — `kaynakNotu`
   * künyesi ve `okutTuru`/`okutNotu` kutusu; ikisi de aynı bilgiden).
   *
   * Tasarım satırın künyesinde bunu söylüyor, varsayılanı *"barkod okutulmadı"*. Bilgi denetim
   * içindir: elle sayılmış satırla okutularak sayılmış satır aynı görünmemeli — ikincisinde
   * kutunun üstündeki kod ile kayıt eşleşmiştir, birincisinde yalnız depocunun beyanı vardır.
   * Türetilemez, çünkü adet ikisinde de aynı sayıdır.
   *
   * Bayrak değil NESNE: tasarım yalnız "okutuldu" demiyor, NEYİN okutulduğunu da yazıyor
   * ("koli barkodu · çarpan 12"). Boole tutsaydık o cümle için ikinci bir yerden veri aramak
   * gerekirdi — oysa okutan çağıranların ikisi de (`confirmScanned`, `confirmLearn`) bu ikiliyi
   * zaten elinde tutuyor.
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
 * Okutulan adedi DÖKÜME yazar — sayı ile hesabın aynı yamada gitmesinin ikinci yarısı.
 *
 * **Koli kodu koli sayar, paket kodu tek paket sayar.** Okutulan koli barkodunun çarpanı biliniyor
 * (`scan.qtyPerCode`) ve depocunun çekmecede söylediği adet paket cinsindendir; tam bölünen kısım
 * koli olarak, artan kısım tek paket olarak yazılır — "26 paket" 12'lik koliden okutulduysa iki
 * koli ve iki tek pakettir, artığı koliye yuvarlamak sayımı bozardı.
 *
 * Okutulan boy ürünün KAYITLI boylarıyla çarpanından eşleştirilir; eşleşme yoksa döküm satırı
 * kodsuz açılır ve çekmecede "ürüne kaydedilecek" diye görünür. Eşleştirme olmasaydı kayıtlı bir
 * boy çekmecede İKİ kez çizilirdi — biri sayılmamış kayıtlı satır, öteki kodsuz kopyası.
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
 * Okutma çekmecesinin konusu: çözülen kod + depocunun seçtiği adet. `expectedQty` satırdan kopyalanır
 * ki ekran ikinci bir arama yapmasın; `qty` çekmecede oynar, satıra ancak onayla yazılır.
 */
export interface ScannedCode extends Omit<Extract<ResolveCodeResponse, { status: 'found' }>, 'status'> {
  qty: number;
  expectedQty: number;
}

/**
 * Öğrenmenin iki adımı tek durumda: **hangi ürün** (`variantId`) ve **bu kod neyi sayıyor**
 * (`kind`/`qtyPerCode`). İkincisi olmadan öğretilen kod hep 1 adetlik kalırdı (23.12 künyesi).
 */
/**
 * **Öğrenilen kodun kalıcı künyesi** (v3:05 · kullanıcı bulgusu 30.08) — listenin üstünde duran
 * kart: *"Kod öğrenildi · 8691234567890 → Fıstıklı Baklava 450 g"* + *"koli barkodu · çarpan 12 ·
 * ikinci gelişte tanınacak"*.
 *
 * `LearnState`ten AYRI ve olmak zorunda: o, öğrenme AKIŞININ hâlidir (çekmece açık, ürün seçiliyor)
 * ve bittiğinde `null`a döner. Bu ise akış bittikten SONRA doğar ve ekranda kalır — çünkü anlattığı
 * şey bir adım değil bir SONUÇ: bir dahaki kabulde o kod tanınacak.
 */
export interface LearnedNote {
  code: string;
  /** Ürünün ekrandaki adı — kart onu kodun karşısına yazıyor. */
  name: string;
  kind: BarcodeKind;
  qtyPerCode: number;
}

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
   * Açık sevkiyatın künyesi — **ekranın BAŞLIĞI budur** (v3:05, kullanıcı bulgusu 30.08).
   *
   * Uç 21.11d'de göndermeye başlamıştı ama hook onu düşürüyordu; ekran da başlığa sabit
   * "Mal kabul" yazıyordu. Tasarım oraya SEVKİYATIN KODUNU koyuyor ve sebebi depocunun elindeki
   * kâğıt: irsaliyede yazan şey `TS-26-4VXQEC`, "mal kabul" değil. Ekranın adını zaten oraya
   * nasıl geldiğinden biliyor.
   *
   * `null` = konusuz açılış (bekleyen listesi) ya da plansız kabul.
   */
  purchaseOrder: IntakePurchaseOrderContract | null;
  /**
   * MLOR eşiği (%) — SUNUCUDAN gelen ayar (`mlor_percent`), satır uyarısının ölçütü.
   *
   * Motorun sabiti (`MLOR_PERCENT`) burada varsayılan olarak duruyor ve YALNIZ form daha
   * okunmadan çizilen bir kare için: eşik okunamadığında uyarıyı büsbütün kapatmak, bilinen bir
   * kuralı sessizce yok saymak olurdu. Yanıt gelince gerçek ayar bunun yerine geçer.
   */
  mlorPercent: number;
  /** Plansız kabulde aramadan seçilen ürünü satır yapar (23.13). */
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
  /** Beklenenden SAPAN satırlar — yalnız onlar gösterilir (v2'nin fark özeti). */
  differences: { name: string; expected: number; received: number }[];
  sending: boolean;
  notice: IntakeNotice | null;
  /** Kabulün sonucu: uyarılar ve farklar KAPIDAN gelir, ekran yeniden hesaplamaz. */
  warnings: { name: string; remainingPercent: number | null }[];
  /**
   * Kabulü yazar. `onDone` YALNIZ başarıda çağrılır — gezinme kararı ÇAĞIRANIN (ekranın) işi;
   * hook bir rota bilmez. Kısmi kayıtta çağrılmaz: orada iş bitmedi, depocu kalan satırlara
   * devam edecek.
   */
  submit: (options?: { partial?: boolean; onDone?: () => void }) => void;
  reload: () => void;
  /** Aşağı çekme — ekranı karartmadan tazeler (liste yerinde durur, halka döner). */
  refresh: () => void;
  /** Çekme sürüyor mu — `status` DEĞİL: o listeyi söküp yükleme hâline geçirirdi. */
  reloading: boolean;
  /** Tarama sayfası açık mı (Modül 23) — ekran ScanSheet'i bununla çizer. */
  scanOpen: boolean;
  openScan: () => void;
  closeScan: () => void;
  /** Ham kodun işlenmesi — çözüm, satır bulma ve adet çekmecesi (künye aşağıda). */
  handleScan: (code: string) => void;
  /** Çözülen kodun çekmecesi — dolu ise ekran ürün kartı + adet seçiciyi çizer. */
  /** Okutmayla sayılan satırın kimliği — ekran onu açar ve adet çekmecesini getirir. */
  pendingCount: string | null;
  clearPendingCount: () => void;
  /** Seçilen adedi satıra yazar ve çekmeceyi kapatır. */
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
 * `unplanned` = PO'SUZ kabul (23.13): mal gelmiş ama siparişi girilmemiş. Satır kümesi sunucudan
 * GELMEZ, depocu kurar — arama ya da okutma ile. PO'lu kabulün "listede olmayan satır açılmaz"
 * duvarı burada YOKTUR ve olamaz: plansızın doğası zaten "liste yok"tur.
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
      /* Plansızda okunacak bir form YOK: satırlar depocunun elinden doğar. Sunucuya sormak,
         cevabı baştan bilinen bir soruyu sormak olurdu.

         ── SATIRLAR TEMİZLENİR (cihazda görüldü 30.08) ────────────────────────
         Ekran PO'lu kabulden siparişsize geçerken YENİDEN KURULMUYOR (aynı rota, farklı parametre)
         ve plansız hâl bir önceki siparişin satırlarıyla açılıyordu: "beklenen 36 · GZT-1005"
         yazan bir siparişsiz kabul. Beklenen adet plansızda YOKTUR; o satırlar depocuya olmayan
         bir siparişi vaat ediyordu. Satır durumları da gider — yarım kalmış bir SKT, başka bir
         kalemin satırında görünürdü. */
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
      // KONUSUZ AÇILIŞ artık boş bir ekran değil, BEKLEYEN SEVKİYAT LİSTESİ (24.08). Uç 21.11d'den
      // beri vardı ama ekran okumuyordu; mal kabule yalnız derin bağlantıyla girilebiliyordu ve
      // sipariş kimliği her tazelemede değiştiği için o yol sürekli kırılıyordu.
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

  /* AŞAĞI ÇEKME KENDİ BAYRAĞINI İSTER (30.08): `status` çekme sırasında `loading`e döndüğü an
     ekran listeyi söküp yükleme hâline geçiyordu — oysa çekme hareketinin sözü "liste dursun,
     üstüne taze veri gelsin". Bayrak ayrı: liste ekranda kalır, halka döner. */
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
   * KISMİ KAYDIN ölçütü — en az bir satır yazılabilir durumda.
   *
   * `complete`in gevşetilmiş hâli değil, AYRI bir soru: "hepsi hazır mı" ile "bir tanesi bile
   * hazır mı" iki farklı kapıyı açıyor. Hiçbiri hazır değilken kısmi kayıt düğmesi çizilirse
   * depocu boş bir kabul göndermeye çalışır ve kapı sessizce hiçbir şey yazmaz.
   */
  const hasAnyCounted = rows.some((row) => writable(row.variantId));

  /**
   * KAÇ SATIR DOLU — yapışkan çubuğun kapı metni bunu söyler (v3:05 "0/5 satır dolu").
   *
   * `complete`/`hasAnyCounted` ile aynı ölçütten (`writable`) sayılıyor, ayrı bir "dolu" tanımı
   * yazılmadı: üç cümle de aynı soruyu soruyor — satır yazılabilir mi? İkinci bir ölçüt, bir gün
   * "sayaç 5/5 diyor ama düğme açılmıyor" gibi açıklanamaz bir hâl üretirdi.
   */
  const filledCount = rows.filter((row) => writable(row.variantId)).length;

  /**
   * LOT ÖNERİLERİ — bu kabulde BAŞKA satırlara girilmiş kodlar (kullanıcı kararı 30.08).
   *
   * Bir sevkiyatın satırları çoğunlukla aynı lottan ya da iki üç lottan gelir; depocu kodu bir kez
   * yazar, ötekilerde listeden seçer. Kaynak formun kendi durumudur — hiçbir uç sorulmuyor.
   *
   * Satırın KENDİ kodu listede olmaz: depocuya zaten yazdığı şeyi önermek gürültüdür.
   */
  const lotsUsedBy = (variantId: string): string[] => {
    const seen = new Set<string>();
    for (const row of rows) {
      if (row.variantId === variantId) continue;
      const code = states[row.variantId]?.lotText.trim() ?? '';
      if (code.length > 0) seen.add(code);
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
    // Beklenen YOKSA sapma da yoktur (plansız kabul, 23.13): kıyaslanacak sipariş olmadan gelen her
    // adet "beklenenden farklı" görünür ve fark özeti anlamsız bir listeye dönerdi.
    .filter((row) => row.expected > 0 && row.received !== row.expected);

  /**
   * Kabulü yazar. `partial` **KAPIYI DEĞİL, KAPININ ÖNÜNDEKİ KİLİDİ** açar (v3:05 · `act.kismiKabul`).
   *
   * Tasarım yapışkan çubukta İKİ yol sunuyor ve ikisi ayrı karar: birincisi "her satırı saydım,
   * kabulü kapat", ikincisi *"Kısmen teslim alındı olarak kaydet"* — künyesi de ne olacağını
   * söylüyor: *"kalan satırlar açık kalır; sevkiyat 'kısmen teslim alındı'ya döner."*
   *
   * Gövde ZATEN doğruydu: `lines` sayılmamış satırı hep atlıyordu (aşağıda), yani kısmi kaydın
   * isteği tam kaydınkiyle aynı. Eksik olan tek şey `complete` kilidiydi — ekran "her satırı say"
   * diyerek depocuyu bekletiyordu, oysa rampada koli koli gelen bir sevkiyatta o bekleme
   * gerçek dışı: mal geldiği kadarıyla stoğa girmeli, kalanı açık kalmalı.
   *
   * Kısmi kayıtta da EN AZ BİR sayılmış satır şart — hiçbir şey sayılmadan yazmak, kapıya boş bir
   * kabul göndermek olurdu.
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

        // Hasar notları satır başına tutulur ama sözleşmede satır notu YOK — isteğin tek notunda,
        // hangi satıra ait olduğu YAZILARAK toplanır (bilginin kaybolmasındansa birleşmesi).
        /* Hasarın ÜÇ parçası tek cümlede toplanır: adet · sebepler · serbest not. Sözleşmede
           satır başına hasar alanı yok (`damagedQty` diye bir alan hiç açılmadı), o yüzden bilgi
           isteğin tek notuna yazılıyor — kaybolmasındansa birleşmesi. Stokta ayrı bir "hasarlı"
           kalem AÇILMIYOR ve ekran bunu saklamıyor (kartın dipnotu söylüyor). */
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

        /* SONUÇ TOAST'LA SÖYLENİR, EKRANDAKİ ŞERİTLE DEĞİL (kullanıcı bulgusu 30.08).
           Sebebi başarının ARDINDAN olan şey: ekran kapanıyor ve kapanan ekrandaki şeridi kimse
           okuyamaz. Toast kabuğun katmanında duruyor (`app/_layout` `ToastHost`), yani depocu
           listeye döndükten sonra da görüyor. Uygulamada zaten tek toast deposu var; ikinci bir
           bildirim düzeni açmak aynı işi iki yerde yapmak olurdu (CLAUDE §1).

           HATA ŞERİTTE KALIR: orada ekran kapanmıyor ve mesajın kalıcı olması gerekiyor —
           depocu tekrar deneyecek, geçip giden bir toast onu okuyamadan söner. */
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
    ── TARAMA (Modül 23 · etüt 2.1 · kullanıcı tasarımı 23.08) ───────────────
    Okutma bir SAYIM değil TANITIMDIR: depocu her koliyi ayrı okutmaz, bir kez okutur ve kod
    çözülünce ÜRÜN KARTI ÇEKMECESİ açılır — görsel + ad + adet seçici. Varsayılan adet okutulan
    birimin kendi miktarıdır (koli → çarpan, tekil → 1); "10 koli geldi" gerçeğini depocu adedi
    çekmecede artırarak söyler ve satıra ancak ONAYLA yazılır. Çarpan önerisi "adet önden
    doldurulmaz" kuralının istisnası DEĞİL: kodun kendi söylediği ölçülmüş gerçektir, beklenen
    adet değil. SKT/lot girişi aynen elle sürer; kabulün kendisi değişmez.

    PO kaleminde OLMAYAN ürünün kodu satır AÇMAZ (yalnız söyler): PO'lu kabulün satır kümesi
    siparişten gelir ve fark raporu o kümeye göre kurulur — listeye dışarıdan satır eklemek,
    "beklenmedik mal" hâlini fark raporunun göremeyeceği bir yere yazmak olurdu.
  */
  const [scanOpen, setScanOpen] = useState(false);
  /**
   * SAYILACAK SATIR — ekranın açıp adet çekmecesini göstereceği satırın kimliği.
   *
   * İKİ KAYNAĞI VAR ve ikisi de aynı cümleyi kuruyor (kullanıcı bulgusu 30.08):
   * · **okutma** — kod çözüldü, adet zaten yazıldı; çekmece düzeltme için açılır.
   * · **elle ekleme** — aramadan seçilen ürün satır oldu ve adedi SIFIR; çekmece burada
   *   düzeltme değil, işin kendisidir. Okutmada açılıp elle eklemede açılmaması, aynı sonucu
   *   veren iki yoldan birini yarım bırakmaktı.
   *
   * Adı bu yüzden "okutulan" değil: sinyal kaynağını değil SONUCU söyler. Bir kez tüketilir
   * (`clearPendingCount`), yoksa çekmece her çizimde yeniden açılırdı.
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
      /* BAŞARILI OKUTMA ARTIK BİLDİRİM BASMIYOR (kullanıcı bulgusu 30.08). "Fıstıklı Baklava ·
         2500 g bulundu — 1 adet eklendi" şeridi aynı şeyi ÜÇÜNCÜ kez söylüyordu: satır zaten
         açılmış, adedi yazılmış, künyesi "barkod okutuldu" demiş ve içinde "bir okutma = 24 adet"
         kartı belirmiştir. Bildirim, sonucun görünmediği hâller için: yabancı ürün, formda
         olmayan kod, okuma hatası — onlar yerinde duruyor. */
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
          // PLANSIZDA OKUTMA SATIR AÇAR — PO'lu kabulün tersi ve bilinçli: orada küme siparişten
          // gelir ve fark raporu o kümeye göre kurulur, burada küme YOKTUR (23.13). Beklenen adet
          // 0: kıyaslanacak bir sipariş yok, "beklenen" sıfır değil YOK demektir ve ekran bunu
          // plansız modda hiç yazmaz.
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
          };
          setRows((current) => [...current, row!]);
        }
        /* OKUTMA BİR SAYMA EYLEMİDİR, ARAMA DEĞİL (tasarım deseni · kullanıcı kararı 30.08).
           Tasarımın betiği okutulan kodu ANINDA sayıya yazıyor ve adet çekmecesini açıyor
           (`v3.dc.html:4005-4010`): paket barkodu tek pakete +1, koli barkodu o boydan +1 koli;
           künye "koli barkodu okundu · KL-24" olur. Depocunun yapacağı tek şey devam etmektir.

           Eskiden araya "Okutulan ürün" diye bir çekmece giriyordu (fotoğraf + kaydırıcı +
           "Satıra ekle") ve depocuya kaç adet olduğunu SORUYORDU — oysa koli barkodu kaç adet
           olduğunu kendisi söylüyor (`qtyPerCode`). İki adım, bir soru ve v3'te hiç geçmeyen bir
           kaydırıcı; üçü de eski desenin kalıntısıydı. */
        const scannedQty = found.qtyPerCode;
        addScanned(found.variantId, scannedQty, { kind: found.kind, qtyPerCode: found.qtyPerCode });
        // Ekran bu sinyali görüp satırı açar ve adet çekmecesini getirir; bir kez tüketilir.
        setPendingCount(found.variantId);
      })();
    },
    [addScanned, rows, setNotice],
  );

  /**
   * Plansız kabulde aramadan seçilen ürün satır olur (23.13). Zaten varsa İKİNCİ KEZ eklenmez:
   * aynı ürünün iki satırı, kabulün toplamını iki yere bölerdi.
   */
  const addManualRow = useCallback((variant: VariantSearchRowContract) => {
    /* SAYIM ÇEKMECESİ BURADA DA AÇILIR (kullanıcı bulgusu 30.08): elle eklenen satırın adedi
       SIFIR — okutmadakinin aksine çekmece bir düzeltme değil, işin kendisi. Zaten var olan
       satırda da sinyal verilir: depocu aynı ürünü ikinci kez seçtiyse istediği şey onu saymaktır,
       sessiz bir "zaten ekliydi" değil. */
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
            },
          ],
    );
  }, []);

  /*
    ── ÖĞRENMENİN İKİNCİ ADIMI: BU KOD NEYİ SAYIYOR? (23.12) ─────────────────
    Ürünü seçmek yetmiyor. Kod bir KOLİNİN üstündeyse "bir okutma = kaç adet" bilgisi kodun kendi
    bilgisidir ve öğrenme anında yazılmazsa bir daha yazılacak yeri yok: kapı `kind`/`qtyPerCode`
    alıyordu ama ekran göndermiyordu, yani her öğretilen kod 1 ADETLİK oluyordu (ölçüldü 23.08).
    Sonucu sessizdi ve kalıcıydı — koli her okutmada 1 sayılır, depocu adedi hep elle düzeltirdi
    ve sebebi görünmezdi. Web'de kod EKLEME bilinçle yok (öğrenme kabuldedir, karar §1.3), yani
    doğru çarpanı yazmanın başka yolu da yoktu.
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
        /* ÖĞRENME EKRANDA KALIR (v3:05 · kullanıcı bulgusu 30.08): tasarım listenin üstüne kalıcı
           bir kart koyuyor ("Kod öğrenildi · 869… → Fıstıklı Baklava 450 g · koli barkodu ·
           çarpan 12 · ikinci gelişte tanınacak"). Bizde yalnız geçip giden bir bildirimdi ve
           öğrenmenin ne öğrettiği hiçbir yerde okunamıyordu — oysa bu, bir dahaki kabulü
           değiştiren kalıcı bir kayıt. */
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
      /* BU BİLDİRİM KALIYOR — başarılı okutmanınki kalktı ama bu başka bir şey: depocu B'yi seçti,
         adet A'ya düştü. Sonuç GÖRÜNMEZ (seçtiği satır boş kalır, başka satır artar) ve ekranda
         bunu söyleyen tek şey bu cümledir. */
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
 * Kapının cevabı → ekrandaki cümle.
 *
 * `repricedCount` GÖSTERİLMEZ ve bu sözleşmenin kendi hükmü: alan `null` olabiliyor ("ölçülemedi",
 * fiyat portu kayıtlı değil) ve zaten depocuya ait bir sayı değil — depo ekranı fiyat görmez.
 * Sıfır yazmak bozuk bir ölçümü sağlıklı gibi okutur, "bilinmiyor" yazmak da depocuya işi olmayan
 * bir soru sordurur.
 */
function noticeOf(outcome: ReceiveOutcome): IntakeNotice {
  if (outcome.status === 'empty') return { tone: 'error', text: t.intake.result.empty };
  return { tone: 'ok', text: fillCopy(t.intake.result.ok, { n: String(outcome.result.stockIds.length) }) };
}
