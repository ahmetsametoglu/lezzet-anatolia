import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CatalogImage, SaleCatalogProduct, SalePlace, SaleVariant, StaffCustomerOption } from '@lezzet/types';

import { fetchSaleCatalog, fetchSaleVariants, scanSaleCode, sellOnSite, type SaleScope } from '@/lib/api/sale';
import { newRequestKey } from '@/lib/request-key';
/* Çevrimdışı sinyali deponunkiyle aynıdır: yerinde satış da depo kapsamlı bir yazmadır, iki ayrı sinyal bir gün ayrışır ve iki ekran
   aynı hat için farklı şey söylerdi. */
import { trackWarehouse } from '@/screens/warehouse/warehouse-status';
import { toastError, toastWarning } from '@lezzet/mobile-kit/src/lib/toast/toast-store';
import { centsToAmountText, parseAmountToCents } from '@/lib/operations/money';
import { fillCopy } from '@/screens/operations/copy';
import { useOperationsIdentity } from '@/screens/operations/sections-context';
import { chosenWarehouseId } from '@/lib/operations/warehouse-choice';
import { saleCopy } from './copy';
import { clearPendingSale, isRestorable, readPendingSale, savePendingSale, type PendingSale } from './pending-sale';

/*
  Yerinde satış: fiyat, KDV, indirim, FEFO ve stok reddi sunucudadır; ekrandaki ara toplam ve kalan adet yalnız göstergedir, kesin kapı
  `insufficient_here` cevabıdır. Pazarlıklı fiyat yalnız dokunulan kalemde gider; aramada son istek kazanır (`seqRef`).
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
  /** Ürün görseli; boy görseli olmadığı için ürününki taşınır, daire kendi çapına yeten kare CDN türevini seçer. */
  image: CatalogImage;
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

/**
 * `closed`: bu depoda anonim satış yapılmaz (QUALITE), müşteri seçilince açılır; `mismatch`: seçilen müşterinin işi deponun işi değil.
 * İkisi de tekrar denemekle düzelmediği için hatadan ayrıdır.
 */
type CatalogStatus = 'loading' | 'error' | 'closed' | 'mismatch' | 'ready';

/** Tahsilat türü; vadeli kapıda para almaz, havaleyle ve müşterinin açık bakiyesine yazılır. */
export type SalePayment = 'cash' | 'card' | 'credit';

/** Çekmecede seçili boyun satış künyesi (fiyat/kalan) — tek ve çok boylunun ortak görünümü. */
export interface DraftSelection {
  variantId: string;
  listPriceCents: number;
  availableHere: number;
  name: string;
  image: CatalogImage;
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
      image: draft.product.image,
    };
  }
  if (draft.variants !== null) return null; // boylar hâlâ yolda ya da okunamadı
  if (draft.product.variantId === null || draft.product.priceCents === null) return null;
  return {
    variantId: draft.product.variantId,
    listPriceCents: draft.product.priceCents,
    availableHere: draft.product.availableHere ?? 0,
    name: draft.product.name,
    image: draft.product.image,
  };
}

/**
 * Fiş: yazılmış satışın ekrana kalan izi. `at` cevabın geldiği andır, çünkü cevap zaman damgası taşımaz ve bu ekran belge değil onay
 * sayfasıdır.
 */
export interface SaleReceipt {
  totalCents: number;
  referenceNo: string | null;
  method: SalePayment;
  /** Adı belli satışın müşterisi; anonim satışta `null`. */
  customerName: string | null;
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
    Tahsilat türünün varsayılanı yoktur: kartla tahsil edilip "nakit" yazılan satış sefer kapanışının nakit beklentisini bozar. Seçim
    yapılmadan düğme açılmaz ve başarıda sıfırlanır.
  */
  const [payment, setPayment] = useState<SalePayment | null>(null);
  /* Fiyat müşteriye göre çözüldüğü için müşteri değişince sepet baştan kurulur; katalog da onun fiyatıyla yeniden okunur. */
  const [customer, setCustomerState] = useState<StaffCustomerOption | null>(null);
  const scope = useMemo<SaleScope>(() => ({ place, customerId: customer?.id ?? null }), [place, customer]);
  const [sending, setSending] = useState(false);
  /*
    Sonucu bilinmeyen satış: gönderilen kimlik ve sepet kesin cevap gelene kadar cihazda ve burada durur, sepet kilitlidir. Sunucu aynı
    kimlikle gelen farklı sepete ilk satışı döndürür; kilit olmasa değişen sepet ya sessizce yazılmaz ya da yeni kimlikle ikinci satış olurdu.
  */
  const [pending, setPending] = useState<PendingSale | null>(null);
  const { email } = useOperationsIdentity();
  /* Sonuç toast'ta: başarılı satışın kendi ekranı (fiş) olduğu için bu kanaldan yalnız olumsuz cevaplar geçer (yetersiz stok, kapanmayan
     satış, hat). */
  const setNotice = useCallback((notice: SaleNotice | null) => {
    if (notice === null) return;
    if (notice.tone === 'warn') toastWarning(notice.text);
    else toastError(notice.text);
  }, []);

  /* Yeniden açılışta bekleyen satış kilitli sepetle döner; başka hesapta, yerde ya da günde gönderilmez, uyarılır ve silinir. */
  useEffect(() => {
    let alive = true;
    void (async () => {
      const stored = await readPendingSale();
      if (!alive || stored === null) return;
      if (!isRestorable(stored, { account: email, place, warehouseId: saleWarehouseOf(place), now: new Date() })) {
        await clearPendingSale();
        toastWarning(t.unresolved.stale);
        return;
      }
      setPending(stored);
      setCustomerState(stored.customer ?? null);
      setLines(stored.lines);
      setPayment(stored.payment);
    })();
    return () => {
      alive = false;
    };
  }, [email, place]);
  const seqRef = useRef(0);

  /*
    Yeniden yükleme ekranı karartmaz: her tuşta `loading` arama alanını da söküp odağı ve IME kompozisyonunu öldürürdü. Sonraki
    yüklemeler mevcut listeyi tutar; yarışın bekçisi durum değil sıra numarasıdır (`seqRef`).
  */
  const load = useCallback(
    async (term: string, cursor?: string) => {
    const seq = ++seqRef.current;
    const result = await trackWarehouse(
      fetchSaleCatalog({ q: term.trim().length === 0 ? undefined : term.trim(), cursor, scope }),
    );
    if (seq !== seqRef.current) return; // geciken cevap — taze listeyi ezmesin
    if (result.error !== null) {
      setStatus(
        result.error === 'door_sale_closed' ? 'closed' : result.error === 'customer_business_mismatch' ? 'mismatch' : 'error',
      );
      return;
    }
    setProducts((prev) => (cursor === undefined ? result.data.products : [...prev, ...result.data.products]));
    setNextCursor(result.data.nextCursor);
    setStatus('ready');
    },
    [scope],
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
      const result = await fetchSaleVariants(product.slug, scope);
      setDraft((current) => {
        if (current === null || current.product.id !== product.id) return current; // çekmece değişti
        return { ...current, variants: result.error !== null ? 'error' : result.data.variants };
      });
    })();
    },
    [scope],
  );

  const closeDraft = useCallback(() => setDraft(null), []);

  /*
    Barkod okutma sepete doğrudan yazmaz: kod çözülür ve kartla açılan aynı çekmece açılır (boy sorulmaz, adet koli çarpanıdır), kurye
    adedi ve fiyatı görüp onaylar. Doğrudan yazmak 12'lik koli barkodunu okutan kuryenin sepetine sessizce 12 kalem koyardı.
  */
  const [scanOpen, setScanOpen] = useState(false);
  const handleScan = useCallback(
    (code: string) => {
      setScanOpen(false);
      void (async () => {
        const result = await scanSaleCode(code, scope);
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
    [place, scope, setNotice],
  );

  /**
   * Simülasyon çipinin yanındaki ürün adı (yalnız geliştirme): aynı uçtan aynı yer beyanıyla okunur ki çipin altındaki ad açılacak
   * çekmecenin başlığıyla aynı olsun; olumsuz dallar da adıyla söylenir.
   */
  const describeDevCode = useCallback(
    async (code: string): Promise<string | null> => {
      const result = await scanSaleCode(code, scope);
      if (result.error !== null) return null;
      const data = result.data;
      if (data.status === 'ok') {
        return data.variant.label.length === 0 ? data.product.name : `${data.product.name} · ${data.variant.label}`;
      }
      if (data.status === 'not_here') return fillCopy(t.scan.devNotHere, { name: data.name });
      return null;
    },
    [scope],
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
    if (pending !== null) return;
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
              image: selection.image,
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
  }, [pending, setNotice]);

  const removeLine = useCallback(
    (variantId: string) => {
      if (pending === null) setLines((prev) => prev.filter((line) => line.variantId !== variantId));
    },
    [pending],
  );

  const choosePayment = useCallback(
    (method: SalePayment) => {
      if (pending !== null || (method === 'credit' && customer === null)) return;
      setPayment(method);
    },
    [customer, pending],
  );

  /** Müşteri seçimi ya da kaldırma: sonucu bilinmeyen satış varken değişmez, değişince sepet ve arama baştan başlar. */
  const setCustomer = useCallback(
    (next: StaffCustomerOption | null) => {
      if (pending !== null) return;
      setCustomerState(next);
      setLines([]);
      setPayment(null);
      setDraft(null);
      setSearchState('');
    },
    [pending],
  );

  /** Gösterge toplam (üst künye) — kesin toplam sunucudan. */
  const indicativeTotalCents = lines.reduce(
    (sum, line) => sum + (line.negotiatedCents ?? line.listPriceCents) * line.qty,
    0,
  );

  const submit = useCallback(() => {
    if (sending) return;
    const sale: PendingSale | null =
      pending ??
      (lines.length === 0 || payment === null
        ? null
        : {
            key: newRequestKey('sale'),
            account: email,
            place,
            warehouseId: saleWarehouseOf(place),
            createdAt: new Date().toISOString(),
            payment,
            customer,
            // CDN türevleri saklanmaz: kayıt küçük kalsın, görsel tek adresten çizilir.
            lines: lines.map((line) => ({ ...line, image: { ...line.image, frames: null } })),
          });
    if (sale === null) return;
    setSending(true);
    setNotice(null);
    setPending(sale);

    void (async () => {
      // Kayıt istekten önce yazılır: istek gidip cevap gelmeden uygulama kapanırsa geri yüklenecek olan budur.
      await savePendingSale(sale);
      const result = await trackWarehouse(
        sellOnSite(
          {
            lines: sale.lines.map((line) => ({
              variantId: line.variantId,
              qty: line.qty,
              ...(line.negotiatedCents === null ? {} : { negotiatedUnitPriceCents: line.negotiatedCents }),
            })),
            ...(sale.payment === 'credit' ? { paymentMethod: 'bank_transfer', onAccount: true } : { paymentMethod: sale.payment }),
            idempotencyKey: sale.key,
          },
          { place, customerId: sale.customer?.id ?? null },
        ),
      );
      setSending(false);

      // Cevap yoksa sonuç bilinmiyor: kayıt ve kilit kalır, aynı kimlikle yeniden denenir ya da vazgeçilir.
      if (result.error !== null) {
        setNotice({ tone: 'error', text: result.error === 'network_error' ? t.result.network : t.result.failed });
        return;
      }

      await clearPendingSale();
      setPending(null);
      const outcome = result.data;
      if (outcome.status === 'ok') {
        setLines([]); // satış kapandı; sepet sıfırdan başlar
        setPayment(null); // tahsilat türü de: her satış kendi kararını ister, öncekinden miras almaz
        /* Sonuç kendi ekranında (fiş): sepet boşalınca tek satırlık bildirim boş sayfanın üstünde kalırdı, referans ve tutar da
           sığmazdı. */
        setReceipt({
          totalCents: outcome.totalCents,
          referenceNo: outcome.referenceNo,
          method: sale.payment,
          customerName: sale.customer?.name ?? null,
          at: new Date().toISOString(),
          paymentRecorded: outcome.paymentRecorded,
        });
        reload(); // stok değişti — kalan sayılar tazelensin
        return;
      }
      // Reddin üçünde de sepet KORUNUR: personel adedi düşürüp ya da kalemi çıkarıp yeniden dener.
      setNotice(noticeOfRefusal(outcome));
    })();
  }, [customer, email, lines, payment, pending, place, reload, sending, setNotice]);

  /** Vazgeç: bekleyen kayıt ve sepet silinir; satış sunucuya ulaştıysa kayıt orada kalır, onay çekmecesi bunu söyler. */
  const discardPending = useCallback(() => {
    void clearPendingSale();
    setPending(null);
    setLines([]);
    setPayment(null);
  }, []);

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
    customer,
    setCustomer,
    lines,
    removeLine,
    indicativeTotalCents,
    payment,
    setPayment: choosePayment,
    sending,
    submit,
    unresolved: pending !== null,
    discardPending,
    receipt,
    clearReceipt,
  };
}

type SaleOutcome = Extract<Awaited<ReturnType<typeof sellOnSite>>, { error: null }>['data'];

/** Tesis satışının deposu cihazın seçimidir; araçta depoyu sunucu seferden çözer. */
function saleWarehouseOf(place: SalePlace): string | null {
  return place === 'van' ? null : chosenWarehouseId();
}

/** Yalnız ret cevaplarının cümlesi: başarılı satışın kendi ekranı (fiş) vardır. */
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
  if (outcome.status === 'no_payment_account') return { tone: 'error', text: t.result.noPaymentAccount };
  if (outcome.status === 'credit_not_allowed') return { tone: 'error', text: t.result.creditNotAllowed[outcome.reason] };
  return { tone: 'error', text: t.result.failed };
}
