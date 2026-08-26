import { useCallback, useEffect, useRef, useState } from 'react';
import type { SaleCatalogProduct, SaleVariant } from '@lezzet/types';

import { fetchSaleCatalog, fetchSaleVariants, sellOnSite } from '@/lib/api/sale';
import { useNotice } from '@/lib/haptics/use-notice.hook';
import { centsToAmountText, money, parseAmountToCents } from '@/lib/operations/money';
import { fillCopy } from '@/screens/operations/copy';
import { saleCopy } from './copy';

/*
  YERİNDE SATIŞ (21.119) — depo kapısına ya da kuryenin aracına gelen müşteriye elden satış.

  ── EKRAN KURAL HESAPLAMAZ ──────────────────────────────────────────────────
  Fiyat, KDV, indirim, FEFO, stok reddi, sefer bağı — hepsi sunucuda (`sellOnSite` → `quickSale`).
  Buradaki "ara toplam" yalnız GÖSTERGEDİR (personel müşteriye kabaca ne diyeceğini bilsin);
  kesin toplam satış yazılınca cevaptan okunur. İki toplamın ayrışabildiği yerde (indirim) ekran
  bunu saklamaz, sözlük "kesin toplam sunucudan gelir" der.

  ── KALAN ADET EKRANDA, KARAR SUNUCUDA ──────────────────────────────────────
  `availableHere` personelin "kaç tane var" sorusuna cevabıdır ve çekmece adedi onunla SINIRLAR —
  ama bu bir ön kibarlıktır, güvence değil: stok o saniye başka satışla düşebilir. Gerçek kapı
  `insufficient_here` cevabıdır; ekran o cevabı ADIYLA ve KALANIYLA gösterir, sepeti BOZMAZ ki
  personel adedi düşürüp yeniden denesin.

  ── PAZARLIK YALNIZ DOKUNULANDA GİDER ───────────────────────────────────────
  Fiyat alanı liste fiyatıyla dolu açılır; personel değiştirmediyse istekte alan HİÇ yoktur ve
  fiyatı sunucu çözer. Her kaleme sayı göndermek, siparişin parasını istemciye yazdırmak olurdu
  (sözleşme künyesindeki karar — 09.8 ile aynı).

  ── ARAMA HER TUŞTA, SON İSTEK KAZANIR ──────────────────────────────────────
  Mal kabulün arama deseni: "henüz yazmadın" hata değil, akışın normal hâli. Sıra numarası
  (`seqRef`) geciken cevabın taze listeyi ezmesini önler — debounce değil, çünkü sorun sıklık
  değil SIRADIR.
*/

const t = saleCopy;

/** Sepet kalemi — ekranın dili. Tel şekline (`OnSiteSaleLine`) `submit` çevirir. */
export interface SaleCartLine {
  variantId: string;
  /** Kart adı (+ boy etiketi) — sonuç mesajları da bu adla konuşur. */
  name: string;
  qty: number;
  listPriceCents: number;
  /** `null` = pazarlık yok, fiyatı sunucu çözer. */
  negotiatedCents: number | null;
  /** Çekmece açıldığı andaki kalan — gösterge (üst künye). */
  availableHere: number;
}

/** Çekmecenin konusu: kart + (çok boyluda) yüklenen boylar + seçim + adet + fiyat metni. */
interface SaleDraft {
  product: SaleCatalogProduct;
  /** `null` = tek boylu, liste kartından satılır; `'loading'`/`'error'` = boylar okunuyor/okunamadı. */
  variants: SaleVariant[] | 'loading' | 'error' | null;
  pickedVariantId: string | null;
  qty: number;
  /** Fiyat alanının HAM metni — cent'e `submitDraft` çevirir; bozuk girdi orada yakalanır. */
  priceText: string;
}

interface SaleNotice {
  tone: 'ok' | 'warn' | 'error';
  text: string;
}

type CatalogStatus = 'loading' | 'error' | 'ready';

/** Çekmecede seçili boyun satış künyesi (fiyat/kalan) — tek ve çok boylunun ortak görünümü. */
export interface DraftSelection {
  variantId: string;
  listPriceCents: number;
  availableHere: number;
  name: string;
}

/** Seçili boyun künyesi — tek boyluda karttan, çok boyluda yüklenen boydan. */
export function selectionOf(draft: SaleDraft): DraftSelection | null {
  if (Array.isArray(draft.variants)) {
    const picked = draft.variants.find((v) => v.id === draft.pickedVariantId);
    if (picked === undefined || picked.priceCents === null) return null;
    return {
      variantId: picked.id,
      listPriceCents: picked.priceCents,
      availableHere: picked.availableHere,
      name: picked.label.length === 0 ? draft.product.name : `${draft.product.name} · ${picked.label}`,
    };
  }
  if (draft.variants !== null) return null; // boylar hâlâ yolda ya da okunamadı
  if (draft.product.variantId === null || draft.product.priceCents === null) return null;
  return {
    variantId: draft.product.variantId,
    listPriceCents: draft.product.priceCents,
    availableHere: draft.product.availableHere ?? 0,
    name: draft.product.name,
  };
}

export function useSale() {
  const [status, setStatus] = useState<CatalogStatus>('loading');
  const [products, setProducts] = useState<SaleCatalogProduct[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [search, setSearchState] = useState('');
  const [draft, setDraft] = useState<SaleDraft | null>(null);
  const [lines, setLines] = useState<SaleCartLine[]>([]);
  const [payment, setPayment] = useState<'cash' | 'card'>('cash');
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useNotice<SaleNotice>();
  const seqRef = useRef(0);

  /*
    YENİDEN YÜKLEME EKRANI KARARTMAZ (cihazda ölçüldü 26.08): burada her tuşta `setStatus('loading')`
    vardı ve o durum LİSTEYLE BİRLİKTE ARAMA ALANINI da söküp yükleme halkasına çeviriyordu — odak
    ve IME kompozisyonu her tuşta ölüyor, alanda tek harf kalıyordu (adb'de de, parmakla da).
    Açılış durumu zaten 'loading' başlıyor; sonraki yüklemeler mevcut listeyi ekranda tutar ve
    cevap gelince değiştirir. Yarışın bekçisi durum değil sıra numarasıdır (`seqRef`).
  */
  const load = useCallback(async (term: string, cursor?: string) => {
    const seq = ++seqRef.current;
    const result = await fetchSaleCatalog({ q: term.trim().length === 0 ? undefined : term.trim(), cursor });
    if (seq !== seqRef.current) return; // geciken cevap — taze listeyi ezmesin
    if (result.error !== null) {
      setStatus('error');
      return;
    }
    setProducts((prev) => (cursor === undefined ? result.data.products : [...prev, ...result.data.products]));
    setNextCursor(result.data.nextCursor);
    setStatus('ready');
  }, []);

  useEffect(() => {
    void load('');
  }, [load]);

  const setSearch = useCallback(
    (term: string) => {
      setSearchState(term);
      void load(term);
    },
    [load],
  );

  const loadMore = useCallback(() => {
    if (nextCursor !== null) void load(search, nextCursor);
  }, [load, nextCursor, search]);

  const reload = useCallback(() => void load(search), [load, search]);

  /** Kart dokunuşu: tek boylu doğrudan çekmeceye, çok boylu önce boylarını okur. */
  const openProduct = useCallback((product: SaleCatalogProduct) => {
    const multi = product.variantCount > 1;
    setDraft({
      product,
      variants: multi ? 'loading' : null,
      pickedVariantId: multi ? null : product.variantId,
      qty: 1,
      priceText: product.priceCents === null ? '' : centsToAmountText(product.priceCents),
    });
    if (!multi) return;
    void (async () => {
      const result = await fetchSaleVariants(product.slug);
      setDraft((current) => {
        if (current === null || current.product.id !== product.id) return current; // çekmece değişti
        return { ...current, variants: result.error !== null ? 'error' : result.data.variants };
      });
    })();
  }, []);

  const closeDraft = useCallback(() => setDraft(null), []);

  /** Boy seçimi fiyat metnini de tazeler: pazarlık alanı hep SEÇİLİ boyun listesiyle açılır. */
  const pickVariant = useCallback((variant: SaleVariant) => {
    if (variant.priceCents === null) return;
    setDraft((current) =>
      current === null
        ? current
        : { ...current, pickedVariantId: variant.id, priceText: centsToAmountText(variant.priceCents ?? 0) },
    );
  }, []);

  const setDraftQty = useCallback((qty: number) => {
    setDraft((current) => (current === null ? current : { ...current, qty }));
  }, []);

  const setDraftPrice = useCallback((priceText: string) => {
    setDraft((current) => (current === null ? current : { ...current, priceText }));
  }, []);

  /** Çekmece onayı — aynı boy zaten sepetteyse adetler TOPLANIR, ikinci satır açılmaz. */
  const confirmDraft = useCallback(() => {
    setDraft((current) => {
      if (current === null) return current;
      const selection = selectionOf(current);
      const priceCents = parseAmountToCents(current.priceText);
      if (selection === null || current.qty <= 0 || priceCents === null) return current;
      const negotiated = priceCents === selection.listPriceCents ? null : priceCents;
      setLines((prev) => {
        const existing = prev.find((line) => line.variantId === selection.variantId);
        if (existing === undefined) {
          return [
            ...prev,
            {
              variantId: selection.variantId,
              name: selection.name,
              qty: current.qty,
              listPriceCents: selection.listPriceCents,
              negotiatedCents: negotiated,
              availableHere: selection.availableHere,
            },
          ];
        }
        return prev.map((line) =>
          line.variantId === selection.variantId
            ? { ...line, qty: line.qty + current.qty, negotiatedCents: negotiated }
            : line,
        );
      });
      setNotice(null);
      return null; // çekmece kapanır
    });
  }, [setNotice]);

  const removeLine = useCallback((variantId: string) => {
    setLines((prev) => prev.filter((line) => line.variantId !== variantId));
  }, []);

  /** Gösterge toplam (üst künye) — kesin toplam sunucudan. */
  const indicativeTotalCents = lines.reduce(
    (sum, line) => sum + (line.negotiatedCents ?? line.listPriceCents) * line.qty,
    0,
  );

  const submit = useCallback(() => {
    if (lines.length === 0 || sending) return;
    setSending(true);
    setNotice(null);

    void (async () => {
      const result = await sellOnSite({
        lines: lines.map((line) => ({
          variantId: line.variantId,
          qty: line.qty,
          ...(line.negotiatedCents === null ? {} : { negotiatedUnitPriceCents: line.negotiatedCents }),
        })),
        paymentMethod: payment,
      });
      setSending(false);

      if (result.error !== null) {
        setNotice({ tone: 'error', text: result.error === 'network_error' ? t.result.network : t.result.failed });
        return;
      }

      const outcome = result.data;
      if (outcome.status === 'ok') {
        setLines([]); // satış kapandı; sepet sıfırdan başlar
        setNotice(noticeOfOk(outcome));
        reload(); // stok değişti — kalan sayılar tazelensin
        return;
      }
      // Reddin üçünde de sepet KORUNUR: personel adedi düşürüp ya da kalemi çıkarıp yeniden dener.
      setNotice(noticeOfRefusal(outcome));
    })();
  }, [lines, payment, reload, sending, setNotice]);

  return {
    status,
    products,
    hasMore: nextCursor !== null,
    search,
    setSearch,
    loadMore,
    reload,
    draft,
    openProduct,
    closeDraft,
    pickVariant,
    setDraftQty,
    setDraftPrice,
    confirmDraft,
    lines,
    removeLine,
    indicativeTotalCents,
    payment,
    setPayment,
    sending,
    notice,
    submit,
  };
}

type SaleOutcome = Extract<Awaited<ReturnType<typeof sellOnSite>>, { error: null }>['data'];

function noticeOfOk(outcome: Extract<SaleOutcome, { status: 'ok' }>): SaleNotice {
  const total = money(outcome.totalCents);
  // Kasa ayarsızsa satış KAPANMIŞTIR ama para kayıtsızdır — bu bir başarı cümlesiyle geçiştirilmez.
  if (!outcome.paymentRecorded) return { tone: 'warn', text: t.result.paymentMissing };
  return {
    tone: 'ok',
    text:
      outcome.referenceNo === null
        ? fillCopy(t.result.okNoRef, { total })
        : fillCopy(t.result.ok, { ref: outcome.referenceNo, total }),
  };
}

function noticeOfRefusal(outcome: Exclude<SaleOutcome, { status: 'ok' }>): SaleNotice {
  if (outcome.status === 'insufficient_here') {
    const linesText = outcome.lines
      .map((line) => fillCopy(t.result.insufficientLine, { name: line.name, n: String(line.available) }))
      .join(', ');
    return { tone: 'error', text: fillCopy(t.result.insufficientIntro, { lines: linesText }) };
  }
  if (outcome.status === 'blocked_lines') {
    return { tone: 'error', text: fillCopy(t.result.blockedIntro, { lines: outcome.lines.join(', ') }) };
  }
  return { tone: 'error', text: t.result.failed };
}
