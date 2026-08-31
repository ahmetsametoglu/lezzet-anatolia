import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import type { CourierVanCandidate, CourierVanStockLine } from '@lezzet/types';

import { OperationsNoticeBlock } from '@/components/operations/notice-block';
import { OperationsSkeletonList } from '@/components/operations/skeleton-list';
import { OperationsStackHeader } from '@/components/operations/stack-header';
import { OperationsStepperGroup } from '@/components/operations/stepper-group';
import { OperationsStickyBar } from '@/components/operations/sticky-bar';
import { ScanSheet } from '@/components/scan/scan-sheet';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { PrimaryButton } from '@/components/ui/primary-button';
import { SecondaryButton } from '@/components/ui/secondary-button';
import { fillCopy } from '@/screens/operations/copy';
import { fetchVanStock, moveVanStock, searchVanCandidates } from '@/lib/api/courier';
import { operationsTheme } from '@/theme/unistyles';
import { courierCopy } from './copy';

/*
  K · ARACA SERBEST ÜRÜN (v3:19) — sipariş dışı, kapıda satılabilecek mal.

  ── NEDEN AYRI BİR EKRAN ────────────────────────────────────────────────────
  Araca iki tür mal biniyor ve mekanizmaları AYNI DEĞİL: sipariş kutusu bir EMANET değişimidir
  (stok oynamaz, `loadBox` yalnız damga yazar), serbest ürün ise GERÇEK stok hareketidir — mal
  depodan çıkıp aracın stoğuna girer, kapıda oradan satılır, akşam sayılıp geri devredilir.
  İkisini tek listede toplamak, kuryeye aynı görünen iki farklı sorumluluğu karıştırırdı.

  ── EKRANIN TAŞIDIĞI TEK KARAR ──────────────────────────────────────────────
  "Ne alayım." Bu yüzden iki liste yan yana: depoda ne var (dokun, al) ve araçta ne var (adedi
  değiştir, geri koy). İkisi ayrı ekranlarda olsaydı kurye kararı zihninde kurmak zorunda kalırdı.

  ── ÜÇ GİRİŞ YOLU, ÜÇÜ DE TASARIMDA (31.08 · tur) ───────────────────────────
  Şerit tek başına yetmiyor ve tasarım bunu baştan söylüyordu: **barkod okutma** (rampada kurye
  ürünü listeden aramaz, kutunun üstündeki kodu okutur), **ürün arama** (şerit tavanlı bir seçki,
  aranan mal onun dışında olabilir) ve şeridin kendisi. İlk ikisi hiç çizilmemişti — şeritte
  olmayan bir ürünü araca almanın YOLU YOKTU.

  ── İSTEĞE BAĞLI, VE BUNU SÖYLÜYOR ──────────────────────────────────────────
  Boş hâl bir eksiklik gibi değil bir DAVET gibi çiziliyor (v3:19'un kendi cümlesi: *"Almadan da
  yola çıkabilirsin"*). Serbest ürün almadan sefer sürmek meşru; ekranın boş hâli kuryeye
  yapmadığı bir işi hatırlatmamalı.
*/

const t = courierCopy;

/** İlk yük iskeleti — okutma düğmesi, şerit ve iki satır; ekranın gerçekten çizdiği bloklar. */
const VAN_STOCK_SKELETON = { scan: 54, quick: 96, row: 108 } as const;

export function CourierVanStockScreen() {
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [onVan, setOnVan] = useState<CourierVanStockLine[]>([]);
  const [candidates, setCandidates] = useState<CourierVanCandidate[]>([]);
  const [hasVehicle, setHasVehicle] = useState(true);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CourierVanCandidate[]>([]);

  const load = useCallback(async () => {
    const result = await fetchVanStock();
    if (result.error !== null) {
      setStatus('error');
      return;
    }
    setOnVan(result.data.onVan);
    setCandidates(result.data.candidates);
    setHasVehicle(result.data.vehicleWarehouseId !== null);
    setStatus('ready');
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /*
    ARAMA HER TUŞTA UCA SORAR ve bu bilinçli: süzgeç deponun stoğunun üstünde çalışıyor (küme
    kuryenin deposunda malı olan varyantlar kadar), yerel bir kopyada süzülemez — şerit yalnız 12
    satır taşıyor ve aranan mal tam olarak o 12'nin dışındakiler. Boş sorgu boş liste döner:
    "henüz yazmadın" bir hata değil (plansız kabulün aramasının aynı kararı).
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

  /*
    HAREKET TEK KAPIDAN — alma da geri koyma da. İki ayrı çağrı sarmalayıcısı yazılsaydı biri
    cevabın bir dalını (`not_enough`, `stuck`, `unknown_code`) işlemeyi unuturdu; burada dokuz dal
    tek yerde okunuyor ve ekran her hâlde SEBEBİ söylüyor.

    Kimlik iki dallı: varyant (şerit/arama/adet) ya da KOD (okutma). Uç kodu `variant_barcode`
    üzerinden çözüyor; tanınmayan kod kendi dalıyla geliyor ve sessizce yutulmuyor.
  */
  const move = useCallback(
    (direction: 'take' | 'return', target: { variantId: string } | { code: string }, qty: number) => {
      if (busy || qty <= 0) return;
      setBusy(true);
      setNotice(null);
      void (async () => {
        const result = await moveVanStock(direction, { ...target, qty });
        setBusy(false);
        if (result.error !== null) {
          setNotice({ tone: 'error', text: t.vanStock.failed });
          return;
        }
        const data = result.data;
        if (data.status === 'ok') {
          setNotice({
            tone: 'ok',
            text: fillCopy(direction === 'take' ? t.vanStock.took : t.vanStock.returned, {
              n: String(data.movedQty),
            }),
          });
        } else if (data.status === 'not_enough') {
          setNotice({ tone: 'error', text: fillCopy(t.vanStock.notEnough, { n: String(data.available) }) });
        } else if (data.status === 'unknown_code') {
          // Tanınmayan kod SESSİZ GEÇMEZ: kurye okuttuğunu sanır, mal araca hiç binmez.
          setNotice({ tone: 'error', text: t.vanStock.unknownCode });
        } else if (data.status === 'stuck') {
          // Mal transferde ASILI: sessiz bir "olmadı", kaybolmuş bir malı gizlerdi.
          setNotice({ tone: 'error', text: t.vanStock.stuck });
        } else {
          setNotice({ tone: 'error', text: t.vanStock.failed });
        }
        await load();
      })();
    },
    [busy, load],
  );

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
        <OperationsSkeletonList
          heights={[VAN_STOCK_SKELETON.scan, VAN_STOCK_SKELETON.quick, VAN_STOCK_SKELETON.row]}
          label={t.day.loading}
        />
      </View>
    );
  }

  const totalQty = onVan.reduce((sum, line) => sum + line.qty, 0);

  return (
    <View style={styles.screen} testID="courier-van-stock">
      {header}

      <ScrollView contentContainerStyle={styles.list}>
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
            {/* OKUTMA VE ARAMA ŞERİDİN ÜSTÜNDE (v3:19) — şerit bir kolaylık, bu ikisi ise malın
                araca girmesinin ASIL yolları: rampada kurye elindeki kutunun kodunu okutur. */}
            <PrimaryButton
              label={t.vanStock.scan}
              onPress={() => setScanOpen(true)}
              tone="olive"
              elevation="flat"
              icon="scan"
              testID="courier-van-scan"
            />
            <SecondaryButton
              label={t.vanStock.search}
              onPress={() => setSearchOpen(true)}
              elevation="flat"
              testID="courier-van-search"
            />

            <Text style={styles.heading}>{t.vanStock.quickHeading}</Text>
            {candidates.length === 0 ? (
              <Text style={styles.note}>{t.vanStock.noCandidates}</Text>
            ) : (
              /* İKİ SÜTUN (v3:19 `grid-template-columns:1fr 1fr`) — şerit tek dokunuşla alınacak
                 kısa bir seçki; tek sütun onu bir katalog listesine çevirirdi. */
              <View style={styles.grid}>
                {candidates.map((row) => (
                  <CandidateCard key={row.variantId} row={row} busy={busy} onPress={() => move('take', { variantId: row.variantId }, 1)} />
                ))}
              </View>
            )}

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
                  onChange={(next) => {
                    if (next > line.qty) move('take', { variantId: line.variantId }, next - line.qty);
                    else if (next < line.qty) move('return', { variantId: line.variantId }, line.qty - next);
                  }}
                  onRemove={() => move('return', { variantId: line.variantId }, line.qty)}
                />
              ))
            )}

            <Text style={styles.note}>{t.vanStock.footnote}</Text>
          </>
        )}

        {notice === null ? null : (
          <Text
            style={[styles.notice, notice.tone === 'error' ? styles.noticeError : styles.noticeOk]}
            testID="courier-van-stock-notice"
          >
            {notice.text}
          </Text>
        )}
      </ScrollView>

      {/* DÖNÜŞ DÜĞMESİ YÜKÜ TAŞIR (v3:19 `serbestCtaLabel`) — kurye ekrandan çıkarken araca ne
          koyduğunu son bir kez görür. Düğme hiç çizilmiyordu ve dönüş yalnız geri tuşuyla
          yapılabiliyordu; o da bir onay anı değil bir kaçış. */}
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

      {/* OKUTMA: bir kod = bir adet (v3:19'un kendi davranışı). Adet çekmecesi AÇILMIYOR —
          rampada elindeki paketi okutan kurye zaten bir tane koyuyor; adedi değiştirmek
          istiyorsa "araçta ne var" listesinin adet düğmeleri orada. */}
      <ScanSheet
        open={scanOpen}
        title={t.vanStock.scanTitle}
        /*
          SONUÇ ÇEKMECENİN İÇİNDE (cihazda ölçüldü 31.08 · delivery-screen'in aynı arızası).

          Okutma sayfadaki bildirim satırını yazıyordu ama çekmece AÇIK kaldığı için o satır
          katmanın ALTINDA kalıyordu: kurye kodu okutuyor, hiçbir şey olmamış gibi görünüyor ve
          ikinci kez okutuyordu. Çekmece kapanmıyor çünkü rampada arka arkaya okutma normal —
          kapatmak her paket için bir açma dokunuşu daha demekti. Cevap ipucu satırında.
        */
        hint={notice === null ? t.vanStock.scanHint : notice.text}
        onClose={() => {
          setScanOpen(false);
          setNotice(null);
        }}
        onScan={(code) => move('take', { code }, 1)}
        testID="courier-van-scan-sheet"
      />

      <BottomSheet
        visible={searchOpen}
        title={t.vanStock.searchTitle}
        /* SABİT BOYLU: liste her harfte doluyor ve panel içerikten büyüseydi kuryenin parmağının
           altındaki satır yer değiştirirdi (kitin `fill` künyesi). */
        fill
        onClose={() => {
          setSearchOpen(false);
          setQuery('');
        }}
        testID="courier-van-search-sheet"
      >
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder={t.vanStock.searchPlaceholder}
          placeholderTextColor={operationsTheme.colors.muted}
          autoFocus
          testID="courier-van-search-input"
        />
        {query.trim().length > 0 && results.length === 0 ? (
          <Text style={styles.note}>{t.vanStock.searchEmpty}</Text>
        ) : null}
        {results.map((row) => (
          <CandidateCard
            key={row.variantId}
            row={row}
            busy={busy}
            wide
            onPress={() => {
              move('take', { variantId: row.variantId }, 1);
              setSearchOpen(false);
              setQuery('');
            }}
          />
        ))}
      </BottomSheet>
    </View>
  );
}

/**
 * **ŞERİT KARTI** (v3:19 `serbestHizli`) — ad kalın, boy + depoda kalan ince, altta HÂL.
 *
 * Hâl satırı 31.08'de doğdu ve bir arızayı kapattı: kart araçta olan üründe de "dokun, araca al"
 * diyordu, yani kurye aynı üründen ikinci kez alıp almadığını karttan okuyamıyordu. Tasarımın
 * kendi çözümü aynı yerde iki cümle: alınmışsa "araçta N" (yeşil, kart da yeşil), alınmamışsa
 * davet.
 */
function CandidateCard({
  row,
  busy,
  wide = false,
  onPress,
}: {
  row: CourierVanCandidate;
  busy: boolean;
  /** Çekmecede kart tam genişlik alır: orada iki sütun yok, arama sonucu bir liste. */
  wide?: boolean;
  onPress: () => void;
}) {
  const taken = row.onVan > 0;
  return (
    /*
      SÜTUN GENİŞLİĞİ SARMALAYICIDA, KARTIN KENDİSİNDE DEĞİL (cihazda ölçüldü 31.08).

      `PressableSurface`in kendi künyesi söylüyor: verilen `style` İÇ yüzeye gider, dış `Pressable`
      stilsiz kalır ve içeriği kadar daralır. Yani karta yazılan `flexBasis:'47%'` ızgarayı hiç
      etkilemiyordu — şerit uzun adlarla iki sütun görünüyor, ad ile boy ayrılıp metin kısalınca
      üç sütuna düşüyordu. Ölçü ızgaranın gerçek çocuğuna, yani sarmalayıcıya yazılır.
    */
    <View style={wide ? styles.cellWide : styles.cell}>
      <PressableSurface
        onPress={onPress}
        disabled={busy}
        feedback="scale"
        style={[styles.quickCard, taken ? styles.quickCardTaken : null]}
        accessibilityLabel={row.name}
        testID={`courier-van-take-${row.variantId}`}
      >
        <Text style={styles.quickName} numberOfLines={2}>
          {row.name}
        </Text>
        <Text style={styles.quickMeta}>
          {row.variantLabel.length === 0
            ? fillCopy(t.vanStock.inStoreNoSize, { n: String(row.available) })
            : fillCopy(t.vanStock.inStore, { size: row.variantLabel, n: String(row.available) })}
        </Text>
        <Text style={[styles.quickAction, taken ? styles.quickActionTaken : null]}>
          {taken ? fillCopy(t.vanStock.onVanBadge, { n: String(row.onVan) }) : t.vanStock.tapToTake}
        </Text>
      </PressableSurface>
    </View>
  );
}

/**
 * **ARAÇTAKİ SATIR** (v3:19 `serbestSatirlar`) — başlık + boy/kalan, sağ üstte ✕, altta adet
 * düğmeleri ve YANINDA sonucun cümlesi.
 *
 * Satır önce yalnız ad + adet düğmesiydi. İki şey eksikti ve ikisi de kararın kendisi: "depoda
 * kalan" (kurye artırırken depoyu boşaltıp boşaltmadığını görmeli) ve ✕ (adedi tek tek sıfıra
 * indirmek, geri koymanın adı değil).
 */
function VanLine({
  line,
  onChange,
  onRemove,
}: {
  line: CourierVanStockLine;
  onChange: (next: number) => void;
  onRemove: () => void;
}) {
  /* Depoda kalan sıfırsa artırma yolu kapalı ve cümle bunu SÖYLER — pasif bir düğmenin sebebi
     düğmenin kendisinde yazmaz. */
  const note =
    line.available === 0
      ? t.vanStock.lineNoteMax
      : fillCopy(t.vanStock.lineNote, { n: String(line.available - 1) });
  return (
    <View style={styles.row} testID={`courier-van-line-${line.variantId}`}>
      <View style={styles.rowHead}>
        <View style={styles.rowText}>
          <Text style={styles.rowName}>{line.name}</Text>
          <Text style={styles.rowMeta}>
            {line.variantLabel.length === 0
              ? fillCopy(t.vanStock.lineMetaNoSize, { n: String(line.available) })
              : fillCopy(t.vanStock.lineMeta, { size: line.variantLabel, n: String(line.available) })}
          </Text>
        </View>
        <PressableSurface
          onPress={onRemove}
          feedback="scale"
          style={styles.removeHit}
          accessibilityLabel={t.vanStock.remove}
          testID={`courier-van-remove-${line.variantId}`}
        >
          <Text style={styles.remove}>✕</Text>
        </PressableSurface>
      </View>
      <View style={styles.rowFoot}>
        {/* Adedi DÜŞÜRMEK malı depoya geri koymaktır — ayrı bir "geri ver" düğmesi yazılmadı:
            kurye zaten sayıyı düşünüyor, ikinci bir eylem adı öğretmek aynı işi iki kez
            anlatmak olurdu. Toptan çıkarma ✕ ile, adet adet oynama buradan. */}
        <OperationsStepperGroup
          value={line.qty}
          onChange={onChange}
          label={line.name}
          testID={`courier-van-qty-${line.variantId}`}
        />
        <Text style={styles.rowNote}>{note}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: operationsTheme.colors.cream },
  list: {
    paddingHorizontal: operationsTheme.space['2xl'],
    // Yapışkan çubuk listenin ÜSTÜNDE duruyor; son satır onun altında kalmasın.
    paddingBottom: operationsTheme.size.controlLg + operationsTheme.space['8xl'],
    gap: operationsTheme.space.md,
  },
  heading: {
    paddingTop: operationsTheme.space.md,
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    color: operationsTheme.colors.muted,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: operationsTheme.space.md },
  /** İKİ SÜTUN (v3:19 `grid-template-columns:1fr 1fr`) — satırın yarısı, aradaki boşluğun payı düşülü. */
  cell: { flexBasis: '47%', flexGrow: 1, flexShrink: 0 },
  /** Çekmecede tek sütun: arama sonucu bir ızgara değil bir liste. */
  cellWide: { flexBasis: '100%' },
  quickCard: {
    minHeight: 88,
    padding: operationsTheme.space.lg,
    borderRadius: operationsTheme.radius.card,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-300'],
    backgroundColor: operationsTheme.colors.panel,
    gap: operationsTheme.space.xs,
  },
  /** Araçta olan ürün YEŞİL (v3:19 `h.bd`) — kart kendi hâlini söylüyor. */
  quickCardTaken: {
    borderColor: operationsTheme.colors['success-line'],
    backgroundColor: operationsTheme.colors['success-bg'],
  },
  quickName: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['screen-title--font-weight']],
    fontSize: operationsTheme.text.helper,
    color: operationsTheme.colors.ink,
  },
  quickMeta: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.meta,
    color: operationsTheme.colors.muted,
  },
  quickAction: {
    paddingTop: operationsTheme.space.xs,
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.helper,
    color: operationsTheme.colors.body,
  },
  quickActionTaken: { color: operationsTheme.colors['olive-dark'] },
  onVanHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: operationsTheme.space.md,
  },
  onVanCount: {
    paddingTop: operationsTheme.space.md,
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.meta,
    color: operationsTheme.colors.muted,
  },
  row: {
    padding: operationsTheme.space.lg,
    borderRadius: operationsTheme.radius.card,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-300'],
    backgroundColor: operationsTheme.colors.panel,
    gap: operationsTheme.space.md,
  },
  rowHead: { flexDirection: 'row', alignItems: 'flex-start', gap: operationsTheme.space.md },
  rowText: { flex: 1, gap: 2, minWidth: 0 },
  rowName: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['screen-title--font-weight']],
    fontSize: operationsTheme.text.helper,
    color: operationsTheme.colors.ink,
  },
  rowMeta: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.meta,
    color: operationsTheme.colors.muted,
  },
  /** ✕ küçük görünür ama dokunma alanı kademenin tamamı — eldivenli parmak için. */
  removeHit: {
    width: operationsTheme.space['7xl'],
    height: operationsTheme.space['7xl'],
    alignItems: 'center',
    justifyContent: 'center',
  },
  remove: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text['screen-title'],
    color: operationsTheme.colors['sand-600'],
  },
  /** Adet düğmeleri SOLDA, sonucun cümlesi YANINDA (v3:19) — alt alta değil. */
  rowFoot: { flexDirection: 'row', alignItems: 'center', gap: operationsTheme.space.lg },
  rowNote: {
    flex: 1,
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.meta,
    lineHeight: operationsTheme.text.meta * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.muted,
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
  notice: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.helper,
    lineHeight: operationsTheme.text.helper * operationsTheme.text['lead--line-height'],
  },
  noticeOk: { color: operationsTheme.colors.muted },
  noticeError: { color: operationsTheme.colors.error },
});
