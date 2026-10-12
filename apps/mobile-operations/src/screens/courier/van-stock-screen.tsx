import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { Text, TextInput, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import type { CourierVanCandidate, CourierVanStockLine, CourierVanStockMoveResponse } from '@lezzet/types';

import { OperationsNoticeBlock } from '@/components/operations/notice-block';
import { OperationsProductRow } from '@/components/operations/product-row';
import { OperationsSkeletonList } from '@/components/operations/skeleton-list';
import { OperationsScreenScroll } from '@/components/operations/screen-scroll';
import { OperationsHeadBleed } from '@/components/operations/head-bleed';
import { OperationsStackHeader } from '@/components/operations/stack-header';
import { OperationsScanFab, scanFabRoom } from '@/components/operations/scan-fab';
import { OperationsScanQtySheet } from '@/components/operations/scan-qty-sheet';
import { OperationsStepperGroup } from '@/components/operations/stepper-group';
import { OperationsStickyBar, STICKY_BAR_HEIGHT } from '@/components/operations/sticky-bar';
import { ScanSheet } from '@/components/scan/scan-sheet';
import { BottomSheet } from '@lezzet/mobile-kit/src/components/ui/bottom-sheet';
import { PressableSurface } from '@lezzet/mobile-kit/src/components/ui/pressable-surface';
import { toastError, toastSuccess } from '@lezzet/mobile-kit/src/lib/toast/toast-store';
import { PrimaryButton } from '@lezzet/mobile-kit/src/components/ui/primary-button';
import { SecondaryButton } from '@lezzet/mobile-kit/src/components/ui/secondary-button';
import { fillCopy, operationsCopy } from '@/screens/operations/copy';
import { fetchVanStock, scanToVan, searchVanCandidates, setVanQty as setVanQtyRequest } from '@/lib/api/courier';
import type { ApiResult } from '@lezzet/mobile-kit/src/lib/api/client';
import { newRequestKey } from '@/lib/request-key';
import { operationsTheme } from '@lezzet/mobile-kit/src/theme/unistyles';
import { courierCopy } from './copy';

/* Araca serbest ürün: sipariş dışı, kapıda satılabilecek mal; sipariş kutusu stoğu oynatmayan bir emanetken serbest ürün
   gerçek stok hareketidir ve ikisi tek listede kuryeye aynı görünen iki ayrı sorumluluğu karıştırırdı. Sayfa "araçta ne
   var"ı gösterir, "ne alayım" rampada bir kez sorulan seçimdir ve çekmecededir; boş hâl bir davettir, çünkü serbest ürün
   almadan sefer sürmek meşrudur. */

const t = courierCopy;

/** İlk yük iskeleti: arama düğmesi ve satır, ekranın çizdiği bloklar. */
const VAN_STOCK_SKELETON = { search: 52, row: 108 } as const;

export function CourierVanStockScreen() {
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [onVan, setOnVan] = useState<CourierVanStockLine[]>([]);
  const [candidates, setCandidates] = useState<CourierVanCandidate[]>([]);
  const [hasVehicle, setHasVehicle] = useState(true);
  /* Sonuç toast'ta söylenir; okutma çekmecesi açıkken sonucu çekmece söyler (`hint`), çünkü Android'de yerel `Modal` kökteki
     toast katmanını örter ve kurye okuttuğu kodun sonucunu görmezdi. */
  const [sheetHint, setSheetHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  /* Adet çekmecesi sayacın ortasındaki rakamdan açılır, 12 adet için on iki dokunuş gerekmesin. Taslak (`qtyDraft`) onaya
     kadar araca yazılmaz; her dokunuşta uca gitseydi on iki hareket kaydı doğardı. */
  const [qtyLine, setQtyLine] = useState<CourierVanStockLine | null>(null);
  const [qtyDraft, setQtyDraft] = useState(0);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CourierVanCandidate[]>([]);
  /* Liste bayat: yazımdan sonraki tazeleme düştü ve ekrandaki sayılar ölçüm değil hatıradır. Satırların "depoda N kalır"
     tavsiyesi bu hâlde gizlenir, dayanağı düşmüş sayıyı söylemek ölçülemeyeni ölçülmüş göstermektir. */
  const [refreshFailed, setRefreshFailed] = useState(false);

  /** Okuma başarılı mıydı — yazım sonrası ölçümün düşüp düşmediğini çağıran bilmek zorunda. */
  const load = useCallback(async (): Promise<boolean> => {
    const result = await fetchVanStock();
    if (result.error !== null) {
      setStatus('error');
      return false;
    }
    setOnVan(result.data.onVan);
    setCandidates(result.data.candidates);
    setHasVehicle(result.data.vehicleWarehouseId !== null);
    setStatus('ready');
    setRefreshFailed(false);
    return true;
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /*
    ARAMA HER TUŞTA UCA SORAR ve bu bilinçli: süzgeç deponun stoğunun üstünde çalışıyor (küme
    kuryenin deposunda malı olan varyantlar kadar), yerel bir kopyada süzülemez — çekmecenin boş
    hâli yalnız 12 satır taşıyor ve aranan mal tam olarak o 12'nin dışındakiler.
  */
  useEffect(() => {
    if (!searchOpen) return;
    const needle = query.trim();
    if (needle.length === 0) {
      setResults([]);
      return;
    }
    let alive = true;
    void (async () => {
      const result = await searchVanCandidates(needle);
      if (alive && result.error === null) setResults(result.data.candidates);
    })();
    return () => {
      alive = false;
    };
  }, [query, searchOpen]);

  /* Hareket tek kapıdan: alma da geri koyma da aynı sarmalayıcıdan geçer ki cevabın hiçbir dalı unutulmasın ve ekran her
     hâlde sebebi söylesin. Kimlik ya varyanttır (çekmece/adet) ya koddur (okutma); tanınmayan kod kendi dalıyla gelir. */
  const submit = useCallback(
    (
      run: () => Promise<ApiResult<CourierVanStockMoveResponse>>,
      /** Sonucun görüneceği katman — `sheet` açık çekmecenin içi, `page` toast (künye yukarıda). */
      surface: 'page' | 'sheet' = 'page',
    ) => {
      const announce = (tone: 'ok' | 'error', text: string) => {
        if (surface === 'sheet') setSheetHint(text);
        else if (tone === 'ok') toastSuccess(text);
        else toastError(text);
      };
      /* Meşgulken gelen dokunuş sessiz yutulmaz: önceki yazım sürerken okutulan ikinci kutu iz bırakmadan kaybolsaydı kurye
         okuttuğunu sanırdı. */
      if (busy) {
        announce('error', t.vanStock.busyScan);
        return;
      }
      setBusy(true);
      setSheetHint(null);
      void (async () => {
        const result = await run();
        /* Tel hatasında da ölçülür: cevabın gelmemesi "yazılmadı" demek değildir, tek dürüst hareket ölçüp gerçeği
           göstermektir. */
        if (result.error !== null) {
          const taze = await load();
          setBusy(false);
          announce('error', taze ? t.vanStock.failed : t.vanStock.refreshFailed);
          if (!taze) setRefreshFailed(true);
          return;
        }
        const data = result.data;
        if (data.status === 'ok') {
          /* İşaret yönü söyler ve yön sunucunun ölçtüğü sonuçtur; `0` hiçbir hareket yazılmadı demektir ve gizlenmez, "2
             alındı" demek yazılmamış hareketi yazılmış gösterirdi. */
          announce(
            'ok',
            data.delta === 0
              ? fillCopy(t.vanStock.converged, { n: String(data.vanQty) })
              : fillCopy(data.delta > 0 ? t.vanStock.took : t.vanStock.returned, { n: String(Math.abs(data.delta)) }),
          );
        } else if (data.status === 'stale') {
          /* TABAN TUTMADI — ve bu `failed`ten AYRI bir şey: burada "yazılmadı" bir GARANTİ.
             Satır cevaptaki gerçekle YERİNDE düzeltiliyor ki tazeleme de düşse kurye doğruyu
             görsün; aracın sayısı arada kapıda satışla ya da D6 kabulüyle kaymış olabilir. */
          setOnVan((rows) => rows.map((row) => (row.variantId === data.variantId ? { ...row, qty: data.vanQty } : row)));
          announce('error', fillCopy(t.vanStock.staleLine, { n: String(data.vanQty) }));
        } else if (data.status === 'not_enough') {
          announce('error', fillCopy(t.vanStock.notEnough, { n: String(data.available) }));
        } else if (data.status === 'unknown_code') {
          // Tanınmayan kod SESSİZ GEÇMEZ: kurye okuttuğunu sanır, mal araca hiç binmez.
          announce('error', t.vanStock.unknownCode);
        } else if (data.status === 'stuck') {
          // Mal transferde ASILI: sessiz bir "olmadı", kaybolmuş bir malı gizlerdi.
          announce('error', t.vanStock.stuck);
        } else {
          announce('error', t.vanStock.failed);
        }
        /* Kilit ölçümden sonra açılır: kurye henüz tazelenmemiş listeye ikinci kez dokunabilseydi farkın tabanı bayat
           listeden gelirdi. */
        const taze = await load();
        setRefreshFailed(!taze);
        if (!taze) announce('error', t.vanStock.refreshFailed);
        setBusy(false);
      })();
    },
    [busy, load],
  );

  /**
   * Araçtaki adedi yazar: hedef ve görülen taban birlikte gider, istemci yalnız ne gördüğünü ve ne istediğini söyler. Anahtar
   * her çağrıda yenidir, çünkü korunan şey tek bir isteğin telde çoğalmasıdır (`request-key.ts`).
   */
  const setQty = useCallback(
    (variantId: string, targetQty: number, observedQty: number, surface: 'page' | 'sheet' = 'page') => {
      if (targetQty === observedQty) return;
      submit(
        () => setVanQtyRequest({ variantId, targetQty, observedQty, idempotencyKey: newRequestKey('van') }),
        surface,
      );
    },
    [submit],
  );

  /** Okutma — hedef yok, taban yok: "eldekine bir ekle" (ucun künyesi). */
  const scan = useCallback((code: string) => submit(() => scanToVan({ code }), 'sheet'), [submit]);

  const header = (
    <OperationsStackHeader
      title={t.vanStock.title}
      subtitle={t.vanStock.context}
      onBack={() => router.back()}
      backLabel={t.day.load.back}
      testID="courier-van-stock-header"
    />
  );

  if (status === 'loading') {
    return (
      <View style={styles.screen} testID="courier-van-stock">
        {header}
        <OperationsSkeletonList heights={[VAN_STOCK_SKELETON.search, VAN_STOCK_SKELETON.row]} label={t.day.loading} />
      </View>
    );
  }

  /* İlk okuma düştüğünde ekran "araç boş" demez: ölçülemeyen değer sıfır gösterilseydi kurye araçtaki malı görmeyip yeniden
     alırdı. Gövde çizilmediği için yazma yolları da kapalıdır, taban bilinmeden hedef hesaplanamaz. */
  if (status === 'error') {
    return (
      <View style={styles.screen} testID="courier-van-stock">
        {header}
        <View style={styles.list}>
          <OperationsNoticeBlock
            variant="error"
            title={t.vanStock.loadError.title}
            description={t.vanStock.loadError.body}
            testID="courier-van-stock-load-error"
          />
          <PrimaryButton label={t.vanStock.loadError.retry} onPress={() => void load()} testID="courier-van-stock-retry" />
        </View>
      </View>
    );
  }

  const totalQty = onVan.reduce((sum, line) => sum + line.qty, 0);
  /* Çekmecenin satırı "araçta N"i SAYFANIN listesinden okuyor, kendi alanından değil: hareket
     yazıldıktan sonra sayfa tazeleniyor ama çekmecedeki arama sonucu tazelenmiyor — kurye aldığı
     ürünün satırında hâlâ "dokun, araca al" görürdü. Tek gerçek, tek kaynak. */
  const vanQtyOf = (variantId: string): number => onVan.find((line) => line.variantId === variantId)?.qty ?? 0;
  /** Çekmecenin listesi: yazılmamışken SIK KOYULANLAR, yazdıkça arama sonucu. */
  const sheetRows = query.trim().length === 0 ? candidates : results;

  return (
    <View style={styles.screen} testID="courier-van-stock">
      {/* Yapışkan mikro başlık ve alt çubuk gizlemesi bu kaptan beslenir; başlık kaydırıcının içindedir. */}
      <OperationsScreenScroll
        title={t.vanStock.title}
        caption={operationsCopy.sections.courier.tab}
        /* Araçlı ekranda dönüş çubuğu ve daire var; liste sonu dairenin payını bırakır ki son satırın adet düğmeleri basılabilsin. */
        contentContainerStyle={[styles.list, hasVehicle ? { paddingBottom: scanFabRoom(STICKY_BAR_HEIGHT) } : null]}
      >
        <OperationsHeadBleed pad="2xl">{header}</OperationsHeadBleed>
        {!hasVehicle ? (
          /* Araç deposu YOKSA ekran boş liste göstermez, SEBEBİ söyler: serbest ürün aracın
             stoğuna giriyor ve araç yoksa gidecek bir yer de yok. */
          <OperationsNoticeBlock
            variant="empty"
            title={t.vanStock.noVehicle.title}
            description={t.vanStock.noVehicle.body}
            testID="courier-van-stock-no-vehicle"
          />
        ) : (
          <>
            {/* Rampada kurye kutunun kodunu yüzen düğmeyle okutur; listeden seçim sayfanın başındaki çekmecededir. */}
            <SecondaryButton
              label={t.vanStock.search}
              onPress={() => setSearchOpen(true)}
              elevation="flat"
              /* Çerçeveli ikincil düğme tasarımda HER YERDE açık zemin taşıyor (v3:19/23
                 `background:#fbfaf4`) — sayfa kremi üstünde zeminsiz kalınca düğme yalnız bir
                 çizgiye iniyor. Değer operasyona özgü (`panel`), o yüzden tondan değil kabuktan. */
              style={styles.searchButton}
              testID="courier-van-search"
            />

            <View style={styles.onVanHead}>
              <Text style={styles.heading}>{t.vanStock.onVanHeading}</Text>
              {/* SAYAÇ İKİ SAYI (v3:19 `serbestSayac` = "2 kalem · 5 adet"): yalnız adet
                  yazılıydı ve "beş adet" kaç ürüne dağıldığını söylemiyordu. */}
              <Text style={styles.onVanCount}>
                {fillCopy(t.vanStock.count, { lines: String(onVan.length), qty: String(totalQty) })}
              </Text>
            </View>

            {onVan.length === 0 ? (
              <OperationsNoticeBlock
                variant="empty"
                title={t.vanStock.empty.title}
                description={t.vanStock.empty.body}
                testID="courier-van-stock-empty"
              />
            ) : (
              onVan.map((line) => (
                <VanLine
                  key={line.variantId}
                  line={line}
                  stale={refreshFailed}
                  onChange={(next) => {
                    // Sayaç mutlak düşünür, tel de öyle: hedef ve görülen taban birlikte gider.
                    setQty(line.variantId, next, line.qty);
                  }}
                  onPressQty={() => {
                    setQtyLine(line);
                    setQtyDraft(line.qty);
                  }}
                  onRemove={() => setQty(line.variantId, 0, line.qty)}
                />
              ))
            )}

            <Text style={styles.note}>{t.vanStock.footnote}</Text>
          </>
        )}

      </OperationsScreenScroll>

      {/* DÖNÜŞ DÜĞMESİ YÜKÜ TAŞIR (v3:19 `serbestCtaLabel`) — kurye ekrandan çıkarken araca ne
          koyduğunu son bir kez görür. */}
      {!hasVehicle ? null : (
        <OperationsStickyBar>
          <PrimaryButton
            label={
              totalQty === 0 ? t.vanStock.backCtaEmpty : fillCopy(t.vanStock.backCta, { n: String(totalQty) })
            }
            onPress={() => router.back()}
            tone="ink"
            elevation="flat"
            testID="courier-van-stock-back"
          />
        </OperationsStickyBar>
      )}
      {!hasVehicle ? null : (
        <OperationsScanFab
          icon="scan"
          accessibilityLabel={t.vanStock.scan}
          onPress={() => setScanOpen(true)}
          lift={STICKY_BAR_HEIGHT}
          testID="courier-van-scan"
        />
      )}

      {/* Adet çekmecesi kitin `OperationsScanQtySheet`idir; araca yazım onayda ve tek çağrıda olur, listenin `+/−`
          düğmeleriyle aynı kapıdan geçer. Tavan fizikseldir (araçtaki + depoda kalan), çünkü depoda olmayan malı araca
          yazmak olmayan malı satmanın ilk adımıdır (DOMAIN §17). */}
      <OperationsScanQtySheet
        visible={qtyLine !== null}
        name={qtyLine?.name ?? ''}
        variantLabel={qtyLine?.variantLabel ?? null}
        stats={
          qtyLine === null
            ? []
            : /* TEK bağlam sayısı: depoda kalan. Çekmecenin kendi künyesi en fazla ikiye izin
                 veriyor ("üçüncüsü kartı okunmaz yapar") ve burada sorulan tek soru "kaç tane
                 alabilirim". */
              [{ value: String(qtyLine.available), label: t.vanStock.qtySheetStat }]
        }
        value={qtyDraft}
        onChange={setQtyDraft}
        qtyCaption={t.vanStock.qtySheetCaption}
        min={0}
        max={qtyLine === null ? undefined : qtyLine.qty + qtyLine.available}
        confirmLabel={t.vanStock.qtySheetConfirm}
        confirmDisabled={busy || qtyLine === null || qtyDraft === qtyLine.qty}
        onConfirm={() => {
          if (qtyLine === null) return;
          /* Taban çekmece AÇILDIĞINDA dondurulan satırdır (`qtyLine`), sayfanın o anki listesi
             değil: kuryenin gerçekten GÖRDÜĞÜ sayı tam olarak odur. Fark hesabı burada da kalktı. */
          const { variantId, qty } = qtyLine;
          setQtyLine(null);
          setQty(variantId, qtyDraft, qty);
        }}
        footnote={t.vanStock.qtySheetFootnote}
        onClose={() => setQtyLine(null)}
        testID="courier-van-qty-sheet"
      />

      {/* OKUTMA: bir kod = bir adet (v3:19'un kendi davranışı). Adet çekmecesi AÇILMIYOR —
          rampada elindeki paketi okutan kurye zaten bir tane koyuyor; adedi değiştirmek
          istiyorsa "araçta ne var" listesinin adet düğmeleri orada. */}
      <ScanSheet
        open={scanOpen}
        title={t.vanStock.scanTitle}
        /* Sonuç çekmecenin içindedir: çekmece açıkken sayfadaki satır katmanın altında kalır ve kurye kodu ikinci kez
           okuturdu. */
        hint={sheetHint ?? t.vanStock.sheetHint}
        onClose={() => {
          setScanOpen(false);
          setSheetHint(null);
        }}
        onScan={(code) => scan(code)}
        testID="courier-van-scan-sheet"
      />

      {/* Araca ürün al: sık koyulanlar ve arama tek çekmecededir, boş sorguda sık koyulanlar, yazdıkça arama gelir. Çekmece
          dokunmayla kapanmaz, çünkü rampada arka arkaya birkaç ürün alınır; satır hâli ("araçta N") yerinde güncellenir. */}
      <BottomSheet
        visible={searchOpen}
        title={t.vanStock.searchTitle}
        /* SABİT BOYLU: liste her harfte doluyor ve panel içerikten büyüseydi kuryenin parmağının
           altındaki satır yer değiştirirdi (kitin `fill` künyesi). */
        fill
        onClose={() => {
          setSearchOpen(false);
          setQuery('');
          setSheetHint(null);
        }}
        testID="courier-van-search-sheet"
      >
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder={t.vanStock.searchPlaceholder}
          placeholderTextColor={operationsTheme.colors.muted}
          testID="courier-van-search-input"
        />
        <View style={styles.sheetHead}>
          <Text style={styles.heading}>{query.trim().length === 0 ? t.vanStock.quickHeading : ''}</Text>
          {sheetHint === null ? null : (
            <Text style={styles.sheetNotice} testID="courier-van-sheet-notice">
              {sheetHint}
            </Text>
          )}
        </View>
        {sheetRows.length === 0 ? (
          <Text style={styles.note}>
            {query.trim().length === 0 ? t.vanStock.noCandidates : t.vanStock.searchEmpty}
          </Text>
        ) : (
          sheetRows.map((row) => (
            <CandidateRow
              key={row.variantId}
              row={row}
              onVan={vanQtyOf(row.variantId)}
              busy={busy}
              /* Çekmecenin aday satırı: taban SAYFANIN listesinden okunuyor (`vanQtyOf`) — o
                 satırın kendi `onVan` alanı arama sonucundan geliyor ve tazelenmiyor (yukarıdaki
                 künye). Hedef "bir fazlası". */
              onPress={() => setQty(row.variantId, vanQtyOf(row.variantId) + 1, vanQtyOf(row.variantId), 'sheet')}
            />
          ))
        )}
        <Text style={styles.note}>{t.vanStock.sheetHint}</Text>
      </BottomSheet>
    </View>
  );
}

/**
 * Çekmecenin alma satırı: kapak, ad ve boy/depo, hâl. Satır biçimi kapağa yer açar ve listenin uzunluğunu zararsız kılar, çünkü
 * çekmece kaydırılır, sayfa kaydırılmaz.
 */
function CandidateRow({
  row,
  onVan,
  busy,
  onPress,
}: {
  row: CourierVanCandidate;
  /** Araçtaki adet — SAYFANIN listesinden okunuyor, satırın kendi alanından değil (canlı kalsın). */
  onVan: number;
  busy: boolean;
  onPress: () => void;
}) {
  const taken = onVan > 0;
  return (
    <OperationsProductRow
      name={row.name}
      variantLabel={row.variantLabel}
      photoUri={row.imageUrl}
      size="md"
      tone={taken ? 'olive' : 'neutral'}
      meta={<Text style={styles.rowMeta}>{fillCopy(t.vanStock.inStore, { n: String(row.available) })}</Text>}
      right={
        <Text style={[styles.pickAction, taken ? styles.pickActionTaken : null]}>
          {taken ? fillCopy(t.vanStock.onVanBadge, { n: String(onVan) }) : t.vanStock.tapToTake}
        </Text>
      }
      onPress={busy ? undefined : onPress}
      accessibilityLabel={row.name}
      style={[styles.pick, taken ? styles.pickTaken : styles.pickIdle]}
      testID={`courier-van-take-${row.variantId}`}
    />
  );
}

/**
 * Araçtaki satır: kapak solda, adet düğmeleri sağda, sonucun notu altta; kurye ürünü görünüşünden tanır ve parmağı satırın
 * sağına düşer. "Araçtan çıkar" ayrı durur, çünkü adedi tek tek sıfıra indirmek geri koymanın adı değildir.
 */
function VanLine({
  line,
  stale,
  onChange,
  onPressQty,
  onRemove,
}: {
  line: CourierVanStockLine;
  /**
   * Liste bayat: yazımdan sonraki ölçüm düştü; `available`e dayanan iki cümle yazılmaz, yoksa dayanağı düşmüş sayı ölçülmüş
   * gibi görünürdü.
   */
  stale: boolean;
  onChange: (next: number) => void;
  /** Ortadaki rakama dokunuş — adet çekmecesini açar (künyesi ekranın `qtyLine` durumunda). */
  onPressQty: () => void;
  onRemove: () => void;
}) {
  /* Depoda kalan sıfırsa artırma yolu kapalı ve cümle bunu SÖYLER — pasif bir düğmenin sebebi
     düğmenin kendisinde yazmaz. */
  const note = stale
    ? t.vanStock.staleNote
    : line.available === 0
      ? t.vanStock.lineNoteMax
      : fillCopy(t.vanStock.lineNote, { n: String(line.available - 1) });
  return (
    <View style={styles.row} testID={`courier-van-line-${line.variantId}`}>
      <OperationsProductRow
        name={line.name}
        variantLabel={line.variantLabel}
        photoUri={line.imageUrl}
        size="md"
        tone="olive"
        meta={stale ? null : <Text style={styles.rowMeta}>{fillCopy(t.vanStock.lineMeta, { n: String(line.available) })}</Text>}
        /* Adedi DÜŞÜRMEK malı depoya geri koymaktır — ayrı bir "geri ver" düğmesi yazılmadı:
           kurye zaten sayıyı düşünüyor, ikinci bir eylem adı öğretmek aynı işi iki kez anlatmak
           olurdu. Toptan çıkarma alttaki bağlantıyla, adet adet oynama buradan. */
        right={
          <OperationsStepperGroup
            value={line.qty}
            onChange={onChange}
            onPressValue={onPressQty}
            valueHint={t.vanStock.qtyHint}
            label={line.name}
            testID={`courier-van-qty-${line.variantId}`}
          />
        }
      />
      <View style={styles.rowFoot}>
        <Text style={styles.rowNote}>{note}</Text>
        <PressableSurface
          onPress={onRemove}
          feedback="scale"
          style={styles.removeHit}
          accessibilityLabel={t.vanStock.remove}
          testID={`courier-van-remove-${line.variantId}`}
        >
          <Text style={styles.remove}>{t.vanStock.remove}</Text>
        </PressableSurface>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: operationsTheme.colors.cream },
  list: {
    paddingHorizontal: operationsTheme.space['2xl'],
    /* Satır arası sıkı: kapaklı satırlar kendi kenarıyla ayrılır ve dar aralık listeyi bir yığın değil dizi gibi okutur. */
    gap: operationsTheme.space.sm,
  },
  searchButton: { backgroundColor: operationsTheme.colors.panel },
  heading: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    color: operationsTheme.colors.muted,
  },
  onVanHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: operationsTheme.space.md,
    paddingTop: operationsTheme.space.xl,
  },
  onVanCount: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.meta,
    color: operationsTheme.colors.muted,
  },
  /* ── ARAÇTAKİ SATIR ─────────────────────────────────────────────────────── */
  row: {
    paddingVertical: operationsTheme.space.md,
    paddingHorizontal: operationsTheme.space.lg,
    borderRadius: operationsTheme.radius.card,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-300'],
    backgroundColor: operationsTheme.colors.panel,
    /* Ürün satırı ile not satırı arası: `md`(8) → `sm`(6). Not satırı kartın İKİNCİ katı, ayrı
       bir blok değil — geniş aralık onu bağımsız bir öğe gibi gösteriyordu. */
    gap: operationsTheme.space.sm,
  },
  rowMeta: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.meta,
    color: operationsTheme.colors.muted,
  },
  /** Not ve "araçtan çıkar" aynı satırda: biri sonucu söyler, öteki onu geri alır. */
  rowFoot: { flexDirection: 'row', alignItems: 'center', gap: operationsTheme.space.md },
  rowNote: {
    flex: 1,
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.meta,
    color: operationsTheme.colors.muted,
  },
  removeHit: { paddingVertical: operationsTheme.space.xs, paddingHorizontal: operationsTheme.space.sm },
  /* "✕" yerine sözcük: tek başına çarpı adedin sıfırlanması mı satırın silinmesi mi olduğunu söylemez. */
  remove: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.meta,
    color: operationsTheme.colors.terracotta,
  },
  /* ── ÇEKMECENİN ALMA SATIRI ─────────────────────────────────────────────── */
  /* KABUK yalnız: dizilim (kare · metin · sağ blok) kitin `OperationsProductRow`undan geliyor —
     komponentin kendi künyesi "kabuk çağıranın işi" diyor. */
  pick: {
    minHeight: operationsTheme.size.controlLg,
    padding: operationsTheme.space.lg,
    borderRadius: operationsTheme.radius.card,
    borderWidth: operationsTheme.border.base,
  },
  pickIdle: {
    borderColor: operationsTheme.colors['sand-300'],
    backgroundColor: operationsTheme.colors.panel,
  },
  /** Araçta olan ürün YEŞİL (v3:19 `h.bd`) — satır kendi hâlini söylüyor. */
  pickTaken: {
    borderColor: operationsTheme.colors['success-line'],
    backgroundColor: operationsTheme.colors['success-bg'],
  },
  pickAction: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.meta,
    color: operationsTheme.colors.body,
  },
  pickActionTaken: { color: operationsTheme.colors['olive-dark'] },
  sheetHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: operationsTheme.space.md,
  },
  sheetNotice: {
    flex: 1,
    textAlign: 'right',
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.meta,
  },
  searchInput: {
    height: operationsTheme.size.controlLg,
    paddingHorizontal: operationsTheme.space.xl,
    borderRadius: operationsTheme.radius.card,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-300'],
    backgroundColor: operationsTheme.colors.card,
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text['screen-title'],
    color: operationsTheme.colors.ink,
  },
  note: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.meta,
    lineHeight: operationsTheme.text.meta * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.muted,
  },
});
