import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';
import type { CourierVanCandidate, CourierVanStockLine } from '@lezzet/types';

import { OperationsNoticeBlock } from '@/components/operations/notice-block';
import { OperationsSkeletonList } from '@/components/operations/skeleton-list';
import { OperationsStackHeader } from '@/components/operations/stack-header';
import { OperationsStepperGroup } from '@/components/operations/stepper-group';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { fillCopy } from '@/screens/operations/copy';
import { fetchVanStock, moveVanStock } from '@/lib/api/courier';
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

  ── İSTEĞE BAĞLI, VE BUNU SÖYLÜYOR ──────────────────────────────────────────
  Boş hâl bir eksiklik gibi değil bir DAVET gibi çiziliyor (v3:19'un kendi cümlesi: *"Almadan da
  yola çıkabilirsin"*). Serbest ürün almadan sefer sürmek meşru; ekranın boş hâli kuryeye
  yapmadığı bir işi hatırlatmamalı.
*/

const t = courierCopy;

/** İlk yük iskeleti — hızlı şerit ve iki satır; ekranın gerçekten çizdiği bloklar. */
const VAN_STOCK_SKELETON = { quick: 96, row: 108 } as const;

export function CourierVanStockScreen() {
  const router = useRouter();
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [onVan, setOnVan] = useState<CourierVanStockLine[]>([]);
  const [candidates, setCandidates] = useState<CourierVanCandidate[]>([]);
  const [hasVehicle, setHasVehicle] = useState(true);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

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
    HAREKET TEK KAPIDAN — alma da geri koyma da. İki ayrı çağrı sarmalayıcısı yazılsaydı biri
    cevabın bir dalını (`not_enough`, `stuck`) işlemeyi unuturdu; burada sekiz dal tek yerde
    okunuyor ve ekran her hâlde SEBEBİ söylüyor.
  */
  const move = useCallback(
    (direction: 'take' | 'return', variantId: string, qty: number) => {
      if (busy || qty <= 0) return;
      setBusy(true);
      setNotice(null);
      void (async () => {
        const result = await moveVanStock(direction, { variantId, qty });
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
          heights={[VAN_STOCK_SKELETON.quick, VAN_STOCK_SKELETON.row, VAN_STOCK_SKELETON.row]}
          label={t.day.loading}
        />
      </View>
    );
  }

  const total = onVan.reduce((sum, line) => sum + line.qty, 0);

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
            <Text style={styles.heading}>{t.vanStock.quickHeading}</Text>
            {candidates.length === 0 ? (
              <Text style={styles.note}>{t.vanStock.noCandidates}</Text>
            ) : (
              /* İKİ SÜTUN (v3:19 `grid-template-columns:1fr 1fr`) — şerit tek dokunuşla alınacak
                 kısa bir seçki; tek sütun onu bir katalog listesine çevirirdi. */
              <View style={styles.grid}>
                {candidates.map((row) => (
                  <PressableSurface
                    key={row.variantId}
                    onPress={() => move('take', row.variantId, 1)}
                    disabled={busy}
                    feedback="scale"
                    style={styles.quickCard}
                    accessibilityLabel={row.name}
                    testID={`courier-van-take-${row.variantId}`}
                  >
                    <Text style={styles.quickName} numberOfLines={2}>
                      {row.name}
                    </Text>
                    <Text style={styles.quickMeta}>
                      {fillCopy(t.vanStock.inStore, { n: String(row.available) })}
                    </Text>
                    <Text style={styles.quickAction}>{t.vanStock.tapToTake}</Text>
                  </PressableSurface>
                ))}
              </View>
            )}

            <View style={styles.onVanHead}>
              <Text style={styles.heading}>{t.vanStock.onVanHeading}</Text>
              <Text style={styles.onVanCount}>{fillCopy(t.vanStock.count, { n: String(total) })}</Text>
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
                <View key={line.variantId} style={styles.row} testID={`courier-van-line-${line.variantId}`}>
                  <Text style={styles.rowName}>{line.name}</Text>
                  {/* Adedi DÜŞÜRMEK malı depoya geri koymaktır — ayrı bir "geri ver" düğmesi
                      yazılmadı: kurye zaten sayıyı düşünüyor, ikinci bir eylem adı öğretmek
                      aynı işi iki kez anlatmak olurdu. */}
                  <OperationsStepperGroup
                    value={line.qty}
                    onChange={(next) => {
                      if (next > line.qty) move('take', line.variantId, next - line.qty);
                      else if (next < line.qty) move('return', line.variantId, line.qty - next);
                    }}
                    label={line.name}
                    testID={`courier-van-qty-${line.variantId}`}
                  />
                </View>
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
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: operationsTheme.colors.cream },
  list: {
    paddingHorizontal: operationsTheme.space['2xl'],
    paddingBottom: operationsTheme.space['4xl'],
    gap: operationsTheme.space.md,
  },
  heading: {
    paddingTop: operationsTheme.space.md,
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    color: operationsTheme.colors.muted,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: operationsTheme.space.md },
  /** İki sütun: satırın yarısı eksi aradaki boşluğun payı. */
  quickCard: {
    flexBasis: '47%',
    flexGrow: 1,
    minHeight: 88,
    padding: operationsTheme.space.lg,
    borderRadius: operationsTheme.radius.card,
    borderWidth: 1,
    borderColor: operationsTheme.colors['neutral-bg'],
    backgroundColor: operationsTheme.colors.panel,
    gap: operationsTheme.space.xs,
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
    fontSize: operationsTheme.text.meta,
    color: operationsTheme.colors.olive,
  },
  onVanHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  onVanCount: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.meta,
    color: operationsTheme.colors.muted,
  },
  row: {
    padding: operationsTheme.space.lg,
    borderRadius: operationsTheme.radius.card,
    borderWidth: 1,
    borderColor: operationsTheme.colors['neutral-bg'],
    backgroundColor: operationsTheme.colors.panel,
    gap: operationsTheme.space.md,
  },
  rowName: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['screen-title--font-weight']],
    fontSize: operationsTheme.text.helper,
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
