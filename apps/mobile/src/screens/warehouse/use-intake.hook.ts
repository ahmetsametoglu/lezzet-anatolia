import { useCallback, useEffect, useRef, useState } from 'react';
import type { IntakeFormRowContract, ResolveCodeResponse } from '@lezzet/types';

import { fetchIntakeForm, learnScannedCode, receiveGoods, resolveScannedCode } from '@/lib/api/warehouse';
import { useNotice } from '@/lib/haptics/use-notice.hook';
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
  /** Ham metin: alan yazılırken geçersiz ara hâllerden geçer, ISO'ya ancak tamamlanınca döner. */
  expiryText: string;
  lotText: string;
  /** Lot BİLEREK boş bırakıldı mı — geri çağırma anahtarının yokluğu bilinçli olmalı (v2). */
  lotSkipped: boolean;
  damageNote: string;
}

const EMPTY_ROW: IntakeRowState = { qty: null, expiryText: '', lotText: '', lotSkipped: false, damageNote: '' };

/**
 * Okutma çekmecesinin konusu: çözülen kod + depocunun seçtiği adet. `expectedQty` satırdan kopyalanır
 * ki ekran ikinci bir arama yapmasın; `qty` çekmecede oynar, satıra ancak onayla yazılır.
 */
export interface ScannedCode extends Omit<Extract<ResolveCodeResponse, { status: 'found' }>, 'status'> {
  qty: number;
  expectedQty: number;
}

interface UseIntakeResult {
  status: IntakeStatus;
  rows: IntakeFormRowContract[];
  stateOf: (variantId: string) => IntakeRowState;
  patch: (variantId: string, patch: Partial<IntakeRowState>) => void;
  /** Her satırda adet + geçerli SKT var mı — CTA'nın kapısı. */
  complete: boolean;
  /** Beklenenden SAPAN satırlar — yalnız onlar gösterilir (v2'nin fark özeti). */
  differences: { name: string; expected: number; received: number }[];
  sending: boolean;
  notice: IntakeNotice | null;
  /** Kabulün sonucu: uyarılar ve farklar KAPIDAN gelir, ekran yeniden hesaplamaz. */
  warnings: { name: string; remainingPercent: number | null }[];
  submit: () => void;
  reload: () => void;
  /** Tarama sayfası açık mı (Modül 23) — ekran ScanSheet'i bununla çizer. */
  scanOpen: boolean;
  openScan: () => void;
  closeScan: () => void;
  /** Ham kodun işlenmesi — çözüm, satır bulma ve adet çekmecesi (künye aşağıda). */
  handleScan: (code: string) => void;
  /** Çözülen kodun çekmecesi — dolu ise ekran ürün kartı + adet seçiciyi çizer. */
  scanned: ScannedCode | null;
  setScannedQty: (qty: number) => void;
  /** Seçilen adedi satıra yazar ve çekmeceyi kapatır. */
  confirmScanned: () => void;
  cancelScanned: () => void;
  /** Tanınmayan kod — dolu ise ekran "bu kod hangi ürün?" seçimini çizer. */
  learn: { code: string } | null;
  /** Seçilen satıra kodu öğretir; `already_bound` cevabı da burada cümleye çevrilir. */
  teach: (variantId: string) => void;
  cancelLearn: () => void;
}

export function useIntake(purchaseOrderId: string | null): UseIntakeResult {
  const [status, setStatus] = useState<IntakeStatus>(purchaseOrderId === null ? 'ready' : 'loading');
  const [rows, setRows] = useState<IntakeFormRowContract[]>([]);
  const [states, setStates] = useState<Record<string, IntakeRowState>>({});
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useNotice<IntakeNotice>();
  const [warnings, setWarnings] = useState<{ name: string; remainingPercent: number | null }[]>([]);

  const generation = useRef(0);

  const load = useCallback(async () => {
    if (purchaseOrderId === null) {
      setStatus('ready');
      setRows([]);
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
    setStatus('ready');
  }, [purchaseOrderId]);

  // Form BİR KEZ okunur (odakta değil): yarı doldurulmuş bir kabul formunu ekranın arkasından
  // tazelemek, depocunun yazdığı adetleri silerdi.
  useEffect(() => {
    void load();
  }, [load]);

  const reload = useCallback(() => {
    setStatus('loading');
    void load();
  }, [load]);

  const stateOf = useCallback((variantId: string): IntakeRowState => states[variantId] ?? EMPTY_ROW, [states]);

  const patch = useCallback((variantId: string, next: Partial<IntakeRowState>) => {
    setStates((current) => ({ ...current, [variantId]: { ...(current[variantId] ?? EMPTY_ROW), ...next } }));
    setNotice(null);
  }, []);

  const complete =
    rows.length > 0 &&
    rows.every((row) => {
      const state = states[row.variantId];
      return state !== undefined && state.qty !== null && state.qty > 0 && parseDate(state.expiryText) !== null;
    });

  const differences = rows
    .map((row) => ({
      name: productLabel(row.productName, row.variantLabel),
      expected: row.expectedQty,
      received: states[row.variantId]?.qty ?? null,
    }))
    .filter((row): row is { name: string; expected: number; received: number } => row.received !== null)
    .filter((row) => row.received !== row.expected);

  const submit = useCallback(() => {
    if (sending || !complete) return;
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
            lotNumber: state.lotSkipped || lot.length === 0 ? null : lot,
          },
        ];
      });

      // Hasar notları satır başına tutulur ama sözleşmede satır notu YOK — isteğin tek notunda,
      // hangi satıra ait olduğu YAZILARAK toplanır (bilginin kaybolmasındansa birleşmesi).
      const damage = rows
        .map((row) => ({ row, note: states[row.variantId]?.damageNote.trim() ?? '' }))
        .filter((entry) => entry.note.length > 0)
        .map((entry) => `${productLabel(entry.row.productName, entry.row.variantLabel)}: ${entry.note}`);

      const result = await trackWarehouse(
        receiveGoods(purchaseOrderId, { lines, note: damage.length === 0 ? null : damage.join(' · ') }),
      );
      setSending(false);

      if (result.error !== null) {
        setNotice({
          tone: 'error',
          text:
            result.error === 'network_error'
              ? t.common.networkError
              : fillCopy(t.common.serverError, { error: result.error }),
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
      setNotice(noticeOf(result.data));
    })();
  }, [complete, purchaseOrderId, rows, sending, states]);

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
  const [scanned, setScanned] = useState<ScannedCode | null>(null);
  const [learn, setLearn] = useState<{ code: string } | null>(null);

  /** Bulunan satıra okumanın adedini ekler ve cümlesini kurar — tarama ile öğrenmenin ortak ucu. */
  const addScanned = useCallback(
    (variantId: string, qty: number, text: (name: string) => string) => {
      const row = rows.find((candidate) => candidate.variantId === variantId);
      if (row === undefined) return false;
      setStates((current) => {
        const state = current[variantId] ?? EMPTY_ROW;
        return { ...current, [variantId]: { ...state, qty: (state.qty ?? 0) + qty } };
      });
      setNotice({ tone: 'ok', text: text(productLabel(row.productName, row.variantLabel)) });
      return true;
    },
    [rows, setNotice],
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
          setLearn({ code });
          return;
        }

        const found = result.data;
        const row = rows.find((candidate) => candidate.variantId === found.variantId);
        if (row === undefined) {
          setNotice({
            tone: 'warn',
            text: fillCopy(t.intake.scan.notInForm, { name: productLabel(found.productName, found.variantLabel) }),
          });
          return;
        }
        // Satıra henüz yazılmaz: adet kararı çekmecenin işi — varsayılan, okutulan birimin miktarı.
        setScanned({
          variantId: found.variantId,
          productName: found.productName,
          variantLabel: found.variantLabel,
          kind: found.kind,
          qtyPerCode: found.qtyPerCode,
          source: found.source,
          imageUrl: found.imageUrl,
          qty: found.qtyPerCode,
          expectedQty: row.expectedQty,
        });
      })();
    },
    [rows, setNotice],
  );

  const setScannedQty = useCallback((qty: number) => {
    setScanned((current) => (current === null ? null : { ...current, qty }));
  }, []);

  const confirmScanned = useCallback(() => {
    if (scanned === null || scanned.qty <= 0) return;
    const copy =
      scanned.source === 'sku'
        ? t.intake.scan.foundSku
        : scanned.source === 'supplier_code'
          ? t.intake.scan.foundSupplier
          : t.intake.scan.found;
    addScanned(scanned.variantId, scanned.qty, (name) => fillCopy(copy, { name, n: String(scanned.qty) }));
    setScanned(null);
  }, [addScanned, scanned]);

  const teach = useCallback(
    (variantId: string) => {
      const code = learn?.code;
      setLearn(null);
      if (code === undefined) return;
      void (async () => {
        const result = await trackWarehouse(learnScannedCode({ code, variantId }));
        if (result.error !== null) {
          setNotice({ tone: 'error', text: t.intake.scan.error });
          return;
        }
        if (result.data.status === 'ok') {
          addScanned(variantId, 1, (name) => fillCopy(t.intake.scan.learned, { name }));
          return;
        }
        // Bu arada BAŞKASI öğretmiş (iki depocu aynı koliyle): kod kime bağlıysa oradan sayılır —
        // sessiz bir çift kayıt yerine, formda varsa o satıra düşer, yoksa yalnız söylenir.
        const bound = result.data;
        const added = addScanned(bound.variantId, 1, (name) => fillCopy(t.intake.scan.alreadyBound, { name }));
        if (!added) {
          setNotice({
            tone: 'warn',
            text: fillCopy(t.intake.scan.notInForm, { name: productLabel(bound.productName, bound.variantLabel) }),
          });
        }
      })();
    },
    [addScanned, learn, setNotice],
  );

  return {
    status,
    rows,
    stateOf,
    patch,
    complete,
    differences,
    sending,
    notice,
    warnings,
    submit,
    reload,
    scanOpen,
    openScan: useCallback(() => setScanOpen(true), []),
    closeScan: useCallback(() => setScanOpen(false), []),
    handleScan,
    scanned,
    setScannedQty,
    confirmScanned,
    cancelScanned: useCallback(() => setScanned(null), []),
    learn,
    teach,
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
