import { useCallback, useEffect, useRef, useState } from 'react';
import type { SaleCatalogProduct, SalePlace, SaleVariant } from '@lezzet/types';

import { fetchSaleCatalog, fetchSaleVariants, scanSaleCode, sellOnSite } from '@/lib/api/sale';
/* ÇEVRİMDIŞI SİNYALİ DEPONUNKİYLE AYNI (v3:20 istiyor: "Sepete ekleme kapalı" / "Satış yazma
   kapalı"). İkinci bir ölçüm yazılmadı — yerinde satış zaten depo kapsamlı bir yazmadır
   (`warehouseGuard`), yani hattın açık olup olmadığı sorusu birebir aynı soru. İki ayrı sinyal,
   bir gün birbirinden ayrılır ve iki ekran aynı hat için iki farklı şey söylerdi (CLAUDE §1). */
import { trackWarehouse } from '@/screens/warehouse/warehouse-status';
import { toastError, toastWarning } from '@/lib/toast/toast-store';
import { centsToAmountText, parseAmountToCents } from '@/lib/operations/money';
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
  /** Ürün görseli (sepet satırı da yüzü gösterir) — boy görseli yok, ürününki kullanılır. */
  imageUrl: string | null;
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
  imageUrl: string | null;
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
      imageUrl: draft.product.image.url,
    };
  }
  if (draft.variants !== null) return null; // boylar hâlâ yolda ya da okunamadı
  if (draft.product.variantId === null || draft.product.priceCents === null) return null;
  return {
    variantId: draft.product.variantId,
    listPriceCents: draft.product.priceCents,
    availableHere: draft.product.availableHere ?? 0,
    name: draft.product.name,
    imageUrl: draft.product.image.url,
  };
}

/**
 * **FİŞ** (v3:22) — yazılmış satışın ekrana kalan izi.
 *
 * `at` SUNUCUDAN GELMİYOR: `OnSiteSaleResponse` bir zaman damgası taşımıyor ve uydurma bir alan
 * eklemek yerine cevabın GELDİĞİ an yazılıyor — personelin yaşadığı satış anı budur, saniyeler
 * farkıyla. Fiş bir belge olsaydı sunucu damgası şart olurdu; bu ekran ise "az önce ne oldu"yu
 * anlatan bir onay sayfası ve yazdırma zaten bu sürümde bağlı değil.
 */
export interface SaleReceipt {
  totalCents: number;
  referenceNo: string | null;
  method: 'cash' | 'card';
  at: string;
  /** Kasa ayarsızsa satış kapanır ama para deftere geçmez — fiş bunu SUSMAZ. */
  paymentRecorded: boolean;
}

/**
 * @param place Satış yeri — `van` ise adresler cihazdaki depo seçimini TAŞIMAZ ve sunucu kuryenin
 *   aracını kapsamdan çözer. Parametre zorunlu ve varsayılansız: varsayılan bıraksaydık yeri
 *   geçirmeyi unutan çağrı derlenir ve sessizce tesisten satardı (`CatalogInput.place`in aynı
 *   gerekçesi).
 */
export function useSale(place: SalePlace) {
  const [status, setStatus] = useState<CatalogStatus>('loading');
  const [receipt, setReceipt] = useState<SaleReceipt | null>(null);
  const [products, setProducts] = useState<SaleCatalogProduct[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [search, setSearchState] = useState('');
  const [draft, setDraft] = useState<SaleDraft | null>(null);
  const [lines, setLines] = useState<SaleCartLine[]>([]);
  /*
    TAHSİLAT TÜRÜNÜN VARSAYILANI YOK (kullanıcı bulgusu 26.08: "neyle ödendiğini dahi seçmedim").
    "Nakit" önseçiliydi ve satış hiç dokunulmadan kapanabiliyordu — para yazan alanda bilinçsiz
    varsayılan, yanlış kayıttır: kartla tahsil edilip "nakit" yazılan satış, sefer kapanışının
    nakit beklentisini sessizce bozar. "Varsayılan depo yoktur" kuralının parasal karşılığı:
    seçim yapılmadan CTA açılmaz, her satışta yeniden sorulur (başarıda sıfırlanır).
  */
  const [payment, setPayment] = useState<'cash' | 'card' | null>(null);
  const [sending, setSending] = useState(false);
  /* SONUÇ TOAST'TA (kullanıcı kararı 01.09) — cümle sepet ekranında, satış düğmesinin üstünde
     duruyordu ve bir sonraki eyleme kadar orada kalıyordu. Başarılı satışın kendi ekranı zaten
     var (fiş, v3:22), yani bu kanaldan yalnız OLUMSUZ cevaplar geçiyor: yetersiz stok, kapanmayan
     satış, hat. Titreşim `useNotice`tan toast fiillerine geçti. */
  const setNotice = useCallback((notice: SaleNotice | null) => {
    if (notice === null) return;
    if (notice.tone === 'warn') toastWarning(notice.text);
    else toastError(notice.text);
  }, []);
  const seqRef = useRef(0);

  /*
    YENİDEN YÜKLEME EKRANI KARARTMAZ (cihazda ölçüldü 26.08): burada her tuşta `setStatus('loading')`
    vardı ve o durum LİSTEYLE BİRLİKTE ARAMA ALANINI da söküp yükleme halkasına çeviriyordu — odak
    ve IME kompozisyonu her tuşta ölüyor, alanda tek harf kalıyordu (adb'de de, parmakla da).
    Açılış durumu zaten 'loading' başlıyor; sonraki yüklemeler mevcut listeyi ekranda tutar ve
    cevap gelince değiştirir. Yarışın bekçisi durum değil sıra numarasıdır (`seqRef`).
  */
  const load = useCallback(
    async (term: string, cursor?: string) => {
    const seq = ++seqRef.current;
    const result = await trackWarehouse(
      fetchSaleCatalog({ q: term.trim().length === 0 ? undefined : term.trim(), cursor, place }),
    );
    if (seq !== seqRef.current) return; // geciken cevap — taze listeyi ezmesin
    if (result.error !== null) {
      setStatus('error');
      return;
    }
    setProducts((prev) => (cursor === undefined ? result.data.products : [...prev, ...result.data.products]));
    setNextCursor(result.data.nextCursor);
    setStatus('ready');
    },
    [place],
  );

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
  const openProduct = useCallback(
    (product: SaleCatalogProduct) => {
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
      const result = await fetchSaleVariants(product.slug, place);
      setDraft((current) => {
        if (current === null || current.product.id !== product.id) return current; // çekmece değişti
        return { ...current, variants: result.error !== null ? 'error' : result.data.variants };
      });
    })();
    },
    [place],
  );

  const closeDraft = useCallback(() => setDraft(null), []);

  /*
    ── BARKOD OKUTMA (kullanıcı kararı 02.09) ────────────────────────────────
    *"Ürünü okutmak, hangi ürünün sepette olduğunu sonra görmek önemli; okuttuktan sonra adet
    çekmecesinin açılması da."* Okutma SEPETE DOĞRUDAN YAZMAZ: kod çözülür, kartla açılan aynı
    çekmece açılır (boy başlıkta ve SORULMAZ — kod zaten boyu söyledi; adet koli çarpanı) ve
    kurye adedi/fiyatı görüp onaylar. Doğrudan yazmak, 12'lik koli barkodunu okutan kuryenin
    sepetinde sessizce 12 kalem bulması demekti.

    Çekmece aynı `draft` durumu: `variants` tek elemanlı (okutulan boy), `pickedVariantId` o boy;
    ekran tek elemanlı listeye boy çipi çizmez. İkinci bir "okutulmuş ürün" çekmecesi yazılmadı —
    aynı ürün iki yerde iki farklı görünümle çıkardı (CLAUDE §1).
  */
  const [scanOpen, setScanOpen] = useState(false);
  const handleScan = useCallback(
    (code: string) => {
      setScanOpen(false);
      void (async () => {
        const result = await scanSaleCode(code, place);
        if (result.error !== null) {
          setNotice({ tone: 'error', text: t.scan.error });
          return;
        }
        const data = result.data;
        if (data.status === 'unknown_code') {
          setNotice({ tone: 'error', text: t.scan.unknownCode });
          return;
        }
        if (data.status === 'not_sellable') {
          setNotice({ tone: 'error', text: t.scan.notSellable });
          return;
        }
        if (data.status === 'not_here') {
          setNotice({
            tone: 'error',
            text: fillCopy(place === 'van' ? t.scan.notHereVan : t.scan.notHereFacility, { name: data.name }),
          });
          return;
        }
        setDraft({
          product: data.product,
          variants: [data.variant],
          pickedVariantId: data.variant.id,
          qty: data.qtyPerCode,
          priceText: data.variant.priceCents === null ? '' : centsToAmountText(data.variant.priceCents),
        });
      })();
    },
    [place, setNotice],
  );

  /**
   * Simülasyon çipinin yanına ÜRÜN ADI (yalnız geliştirme; `ScanSheet.devResolve` künyesi).
   * Aynı uçtan, aynı yer beyanıyla okunur: çipin altında yazan ad, çipe basınca açılacak
   * çekmecenin başlığıyla birebir aynıdır. Olumsuz dallar da adıyla söylenir ki kurye hangi
   * çipin "araçta yok"u tetiklediğini basmadan görsün.
   */
  const describeDevCode = useCallback(
    async (code: string): Promise<string | null> => {
      const result = await scanSaleCode(code, place);
      if (result.error !== null) return null;
      const data = result.data;
      if (data.status === 'ok') {
        return data.variant.label.length === 0 ? data.product.name : `${data.product.name} · ${data.variant.label}`;
      }
      if (data.status === 'not_here') return fillCopy(t.scan.devNotHere, { name: data.name });
      return null;
    },
    [place],
  );

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
              imageUrl: selection.imageUrl,
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
    if (lines.length === 0 || payment === null || sending) return;
    setSending(true);
    setNotice(null);

    void (async () => {
      const result = await trackWarehouse(
        sellOnSite({
          lines: lines.map((line) => ({
            variantId: line.variantId,
            qty: line.qty,
            ...(line.negotiatedCents === null ? {} : { negotiatedUnitPriceCents: line.negotiatedCents }),
          })),
          paymentMethod: payment,
        }, place),
      );
      setSending(false);

      if (result.error !== null) {
        setNotice({ tone: 'error', text: result.error === 'network_error' ? t.result.network : t.result.failed });
        return;
      }

      const outcome = result.data;
      if (outcome.status === 'ok') {
        setLines([]); // satış kapandı; sepet sıfırdan başlar
        setPayment(null); // tahsilat türü de: her satış kendi kararını ister, öncekinden miras almaz
        /* SONUÇ ARTIK KENDİ EKRANINDA (v3:22). Sepet ekranındaki tek satırlık bildirim, sepet
           boşaldığı an "boş sepet" ekranının üstünde asılı kalıyordu: satışı yazan göz, cevabı
           BOŞ bir sayfada okuyordu. Fiş referansı ve tutarı da o satıra sığmıyordu. */
        setReceipt({
          totalCents: outcome.totalCents,
          referenceNo: outcome.referenceNo,
          method: payment,
          at: new Date().toISOString(),
          paymentRecorded: outcome.paymentRecorded,
        });
        reload(); // stok değişti — kalan sayılar tazelensin
        return;
      }
      // Reddin üçünde de sepet KORUNUR: personel adedi düşürüp ya da kalemi çıkarıp yeniden dener.
      setNotice(noticeOfRefusal(outcome));
    })();
  }, [lines, payment, reload, sending, setNotice]);

  /* Fişi KAPATMAK ekranın işi değil, akışın işi: "Yeni satış" dendiğinde iz silinir, yoksa aynı
     fiş bir sonraki satışın sepetinde de asılı kalırdı. */
  const clearReceipt = useCallback(() => setReceipt(null), []);

  return {
    status,
    products,
    hasMore: nextCursor !== null,
    search,
    setSearch,
    loadMore,
    reload,
    scanOpen,
    setScanOpen,
    handleScan,
    describeDevCode,
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
    submit,
    receipt,
    clearReceipt,
  };
}

type SaleOutcome = Extract<Awaited<ReturnType<typeof sellOnSite>>, { error: null }>['data'];

/* `noticeOfOk` 30.08'de SÖKÜLDÜ: başarı artık tek satırlık bir bildirim değil, kendi ekranı
   (v3:22 · `sale-receipt-screen.tsx`). Kasa ayarsız hâlin cümlesi de oraya taşındı — orada
   kaybolmaz, çünkü ekranın kendisi o satışın sayfasıdır. */

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
