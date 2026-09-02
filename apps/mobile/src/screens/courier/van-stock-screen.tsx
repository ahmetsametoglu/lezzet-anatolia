import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ScrollView, Text, TextInput, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import type { CourierVanCandidate, CourierVanStockLine } from '@lezzet/types';

import { OperationsNoticeBlock } from '@/components/operations/notice-block';
import { OperationsProductRow } from '@/components/operations/product-row';
import { OperationsSkeletonList } from '@/components/operations/skeleton-list';
import { OperationsStackHeader } from '@/components/operations/stack-header';
import { OperationsScanQtySheet } from '@/components/operations/scan-qty-sheet';
import { OperationsStepperGroup } from '@/components/operations/stepper-group';
import { OperationsStickyBar } from '@/components/operations/sticky-bar';
import { ScanSheet } from '@/components/scan/scan-sheet';
import { BottomSheet } from '@/components/ui/bottom-sheet';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { toastError, toastSuccess } from '@/lib/toast/toast-store';
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

  ── SAYFA "NE VAR"I GÖSTERİR, ÇEKMECE "NE ALAYIM"I SORAR (kullanıcı kararı 31.08) ──
  Tasarım (v3:19) alma şeridini SAYFAYA seriyor: "SIK KOYULANLAR" başlığı altında iki sütunlu
  kartlar. Tasarımın kendi karesinde o şerit DÖRT karttı; gerçek depoda aday sayısı 12 (ucun
  tavanı) ve ekran cihazda kalabalıklaştı — kullanıcı ölçtü: *"çok fazla kırışık ve karmaşık."*

  Ayrım şu: sayfanın taşıdığı bilgi **"araçta ne var"**dır — kurye kapıda ona bakar, gün boyunca
  ona döner. **"Ne alayım"** ise rampada bir kez sorulan bir SEÇİM anıdır; seçim anları bu yüzeyde
  çekmeceye gider (araç seçimi, adet klavyesi, parti seçimi — hepsi öyle). Şerit çekmecenin içine
  alındı: çekmece boş sorguyla sık koyulanları gösteriyor, yazdıkça aynı liste aramaya dönüşüyor.
  Sayfa tek işe indi, şeridin kalabalığı da seçim anında kaldı.

  ── SATIRIN DİZİLİMİ (kullanıcı kararı 31.08) ───────────────────────────────
  Solda KAPAK, ortada ad + boy/depo, sağda adet düğmeleri, altta sonucun notu. Tasarımda kapak
  yok ve adet düğmeleri solda; ikisi de değişti çünkü rampada kurye ürünü adından değil
  GÖRÜNÜŞÜNDEN tanıyor (dört "Cevizli Baklava" satırını ayıran şey boy etiketi değil kapaktır) ve
  parmağın düştüğü yer satırın sağıdır. Not artık kendi satırında: sağda sıkışınca iki satıra
  kırılıyor ve adet düğmesinin yüksekliğini büyütüyordu.

  ── İSTEĞE BAĞLI, VE BUNU SÖYLÜYOR ──────────────────────────────────────────
  Boş hâl bir eksiklik gibi değil bir DAVET gibi çiziliyor (v3:19'un kendi cümlesi: *"Almadan da
  yola çıkabilirsin"*). Serbest ürün almadan sefer sürmek meşru; ekranın boş hâli kuryeye
  yapmadığı bir işi hatırlatmamalı.
*/

const t = courierCopy;

/** İlk yük iskeleti — okutma düğmesi, arama düğmesi ve iki satır; ekranın çizdiği bloklar. */
const VAN_STOCK_SKELETON = { scan: 54, search: 52, row: 108 } as const;

export function CourierVanStockScreen() {
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [onVan, setOnVan] = useState<CourierVanStockLine[]>([]);
  const [candidates, setCandidates] = useState<CourierVanCandidate[]>([]);
  const [hasVehicle, setHasVehicle] = useState(true);
  /*
    SONUÇ TOAST'TA — TEK İSTİSNA AÇIK ÇEKMECE (kullanıcı kararı 01.09).

    Sayfadaki bildirim şeridi söküldü; hareketin sonucu artık toast. Ama toast KÖKTE çiziliyor ve
    okutma çekmecesi bir yerel `Modal`: Android'de modal kendi penceresini açtığı için kökteki
    katman onun ALTINDA kalır ve kurye kodu okutup hiçbir şey görmez. 31.08'de ölçülen arıza tam
    buydu ve çözümü de aynı kalıyor — çekmece açıkken sonucu ÇEKMECE söyler (`hint`).

    Kural tek cümle: **mesaj kullanıcının baktığı katmanda görünür.**
  */
  const [sheetHint, setSheetHint] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [scanOpen, setScanOpen] = useState(false);
  /*
    ADET ÇEKMECESİ (kullanıcı kararı 02.09) — sayacın ORTASINDAKİ rakama basınca açılır.

    Gerekçe rampanın kendisi: 12 adet koyacak kurye artı düğmesine on iki kez basıyor. Çekmece
    aynı sayacı büyük hâliyle veriyor (`OperationsScanQtySheet`) ve tek yazımda bitiriyor.

    Durum İKİ parça: hangi satır (`qtyLine`) ve çekmecedeki O ANKİ değer (`qtyDraft`). Taslak ayrı
    tutuluyor çünkü çekmecede oynanan sayı ONAYLANANA KADAR araca yazılmıyor — her dokunuşta uca
    istek gitseydi kurye 12'ye çıkarken on iki hareket kaydı doğardı.
  */
  const [qtyLine, setQtyLine] = useState<CourierVanStockLine | null>(null);
  const [qtyDraft, setQtyDraft] = useState(0);
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

  /*
    HAREKET TEK KAPIDAN — alma da geri koyma da. İki ayrı çağrı sarmalayıcısı yazılsaydı biri
    cevabın bir dalını (`not_enough`, `stuck`, `unknown_code`) işlemeyi unuturdu; burada dokuz dal
    tek yerde okunuyor ve ekran her hâlde SEBEBİ söylüyor.

    Kimlik iki dallı: varyant (çekmece/adet) ya da KOD (okutma). Uç kodu `variant_barcode`
    üzerinden çözüyor; tanınmayan kod kendi dalıyla geliyor ve sessizce yutulmuyor.
  */
  const move = useCallback(
    (
      direction: 'take' | 'return',
      target: { variantId: string } | { code: string },
      qty: number,
      /** Sonucun görüneceği katman — `sheet` açık çekmecenin içi, `page` toast (künye yukarıda). */
      surface: 'page' | 'sheet' = 'page',
    ) => {
      if (busy || qty <= 0) return;
      setBusy(true);
      setSheetHint(null);
      const announce = (tone: 'ok' | 'error', text: string) => {
        if (surface === 'sheet') setSheetHint(text);
        else if (tone === 'ok') toastSuccess(text);
        else toastError(text);
      };
      void (async () => {
        const result = await moveVanStock(direction, { ...target, qty });
        setBusy(false);
        if (result.error !== null) {
          announce('error', t.vanStock.failed);
          return;
        }
        const data = result.data;
        if (data.status === 'ok') {
          announce(
            'ok',
            fillCopy(direction === 'take' ? t.vanStock.took : t.vanStock.returned, { n: String(data.movedQty) }),
          );
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
          heights={[VAN_STOCK_SKELETON.scan, VAN_STOCK_SKELETON.search, VAN_STOCK_SKELETON.row]}
          label={t.day.loading}
        />
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
            {/* ALMANIN İKİ YOLU, İKİSİ DE SAYFANIN BAŞINDA: rampada kurye ya elindeki kutunun
                kodunu okutur ya listeden seçer. Liste artık çekmecede — sayfa "araçta ne var"a
                ayrıldı (dosya künyesi). */}
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
                  onChange={(next) => {
                    if (next > line.qty) move('take', { variantId: line.variantId }, next - line.qty);
                    else if (next < line.qty) move('return', { variantId: line.variantId }, line.qty - next);
                  }}
                  onPressQty={() => {
                    setQtyLine(line);
                    setQtyDraft(line.qty);
                  }}
                  onRemove={() => move('return', { variantId: line.variantId }, line.qty)}
                />
              ))
            )}

            <Text style={styles.note}>{t.vanStock.footnote}</Text>
          </>
        )}

      </ScrollView>

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

      {/*
        ── ADET ÇEKMECESİ (kullanıcı kararı 02.09) ──────────────────────────────
        Sayacın ortasındaki rakama basınca açılır ve aynı sayacı büyük hâliyle verir. Kite yeni bir
        çekmece yazılmadı: `OperationsScanQtySheet` zaten tam bu iş için var (ad · bağlam sayısı ·
        büyük sayaç · onay) ve depo tarafında okutmadan sonra aynı soruyu soruyor.

        ARACA YAZIM ONAYDA, her dokunuşta DEĞİL: çekmecede 1'den 12'ye çıkan kurye on iki hareket
        kaydı doğurmamalı. Fark tek çağrıda uygulanıyor — artıysa depodan alınır, eksiyse geri
        konur; ikisi de listenin `+/−` düğmeleriyle aynı kapıdan (`move`).

        TAVAN FİZİKSEL: araçtaki adet + depoda kalan. Yumuşak bir sınır değil — depoda olmayan malı
        araca yazmak, olmayan malı satmanın ilk adımıdır (`DOMAIN §17`).
      */}
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
          const fark = qtyDraft - qtyLine.qty;
          const hedef = { variantId: qtyLine.variantId };
          setQtyLine(null);
          if (fark > 0) move('take', hedef, fark);
          else if (fark < 0) move('return', hedef, -fark);
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
        /* SONUÇ ÇEKMECENİN İÇİNDE (cihazda ölçüldü 31.08): okutma sayfadaki bildirim satırını
           yazıyordu ama çekmece açık kaldığı için o satır katmanın ALTINDA kalıyordu — kurye
           kodu okutuyor, hiçbir şey olmamış gibi görünüyor ve ikinci kez okutuyordu. */
        hint={sheetHint ?? t.vanStock.sheetHint}
        onClose={() => {
          setScanOpen(false);
          setSheetHint(null);
        }}
        onScan={(code) => move('take', { code }, 1, 'sheet')}
        testID="courier-van-scan-sheet"
      />

      {/*
        ARACA ÜRÜN AL — sık koyulanlar VE arama, TEK çekmecede (kullanıcı kararı 31.08).

        Boş sorguda sık koyulanlar, yazdıkça aynı liste aramaya dönüşüyor: ikisi ayrı yerlerde
        dursaydı kurye "listede yoksa nereye bakacağım" sorusunu kendi çözerdi. Çekmece
        dokunmayla KAPANMIYOR — rampada arka arkaya birkaç ürün alınıyor ve her biri için
        çekmeceyi yeniden açmak aynı işi üç kez yaptırırdı; satır hâlini ("araçta N") yerinde
        güncelliyor, sonuç cümlesi de başlığın sağında.
      */}
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
              onPress={() => move('take', { variantId: row.variantId }, 1, 'sheet')}
            />
          ))
        )}
        <Text style={styles.note}>{t.vanStock.sheetHint}</Text>
      </BottomSheet>
    </View>
  );
}

/**
 * **ÇEKMECENİN ALMA SATIRI** — kapak · ad + boy/depo · hâl.
 *
 * Sayfadaki iki sütunlu kart ızgarasının yerini aldı (kullanıcı kararı 31.08): on iki kart yan
 * yana dizilince ekran "kırışık" okunuyordu ve kartların hiçbiri ürünün ne olduğunu
 * göstermiyordu. Satır biçimi hem kapağa yer açıyor hem de listenin uzunluğunu zararsız kılıyor —
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
 * **ARAÇTAKİ SATIR** — kapak solda · ad + boy/depoda kalan ortada · adet düğmeleri SAĞDA ·
 * sonucun notu ALTTA (kullanıcı kararı 31.08).
 *
 * Tasarım (v3:19) adet düğmelerini sola, notu onların sağına koyuyordu; not orada iki satıra
 * kırılıp satırın yüksekliğini büyütüyor, kapağa da yer kalmıyordu. Yeni dizilim üç şeyi birden
 * çözüyor: ürün görünüşünden tanınıyor, parmağın düştüğü yer satırın sağı oluyor ve not kendi
 * satırında tek satıra sığıyor.
 *
 * "Araçtan çıkar" ayrı duruyor çünkü ayrı bir karar: adedi tek tek sıfıra indirmek "geri koymak"ın
 * adı değil.
 */
function VanLine({
  line,
  onChange,
  onPressQty,
  onRemove,
}: {
  line: CourierVanStockLine;
  onChange: (next: number) => void;
  /** Ortadaki rakama dokunuş — adet çekmecesini açar (künyesi ekranın `qtyLine` durumunda). */
  onPressQty: () => void;
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
      <OperationsProductRow
        name={line.name}
        variantLabel={line.variantLabel}
        photoUri={line.imageUrl}
        size="md"
        tone="olive"
        meta={<Text style={styles.rowMeta}>{fillCopy(t.vanStock.lineMeta, { n: String(line.available) })}</Text>}
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
    // Yapışkan çubuk listenin ÜSTÜNDE duruyor; son satır onun altında kalmasın.
    paddingBottom: operationsTheme.size.controlLg + operationsTheme.space['8xl'],
    /* SATIR ARASI SIKI (kullanıcı bulgusu 31.08 — "kartlar arasında biraz fazla boş var").
       Satırlar artık kapaklı ve iki katlı; her biri zaten kendi kenarıyla ayrılıyor, aradaki
       boşluğun ayırma işi yok. `md`(8) → `sm`(6): kart yüksekliği büyüdükçe aralığın azalması
       listeyi bir yığın değil bir DİZİ gibi okutuyor. */
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
  /* "✕" YERİNE SÖZCÜK (31.08): tek başına bir çarpı, adedin sıfırlanması mı satırın silinmesi mi
     olduğunu söylemiyor — eylemin adı yazılırsa soru da doğmuyor. */
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
