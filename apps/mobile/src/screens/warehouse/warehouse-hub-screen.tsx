import { useRouter } from 'expo-router';
import { ScrollView, Text, useWindowDimensions, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { NotificationBell } from '@/components/operations/notification-bell';
import { OperationsNoticeBlock } from '@/components/operations/notice-block';
import { OperationsSectionHeader } from '@/components/operations/section-header';
import { OperationsStaffMenu } from '@/components/operations/staff-menu';
import { Icon } from '@/components/ui/icon';
import { LoadingState } from '@/components/ui/loading-state';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { fillCopy, operationsCopy } from '@/screens/operations/copy';
import { useOperationsIdentity } from '@/screens/operations/sections-context';
import { useOperationsNotifications } from '@/screens/operations/use-notifications.hook';
import { emToDp } from '@/theme/parse';
import { operationsTheme } from '@/theme/unistyles';
import { warehouseCopy } from './copy';
import { NEAR_EXPIRY_FIXTURE } from './near-expiry-fixture';
import { orderPickingQueue } from './warehouse-format';
import type { PreparationOrderContract } from '@lezzet/types';
import { useWarehouseHub } from './use-warehouse-hub.hook';
import { useWarehouseStatus } from './warehouse-status';

/*
  DEPO HUB (Operasyon Mobil v3:35-174) — bölümün kökü, sekiz işin kapısı.

  ── v3 HUB'I DÜZ LİSTE DEĞİL, ÜÇ KATMAN (30.08) ─────────────────────────────
  v2 sekiz işi eşit ağırlıkta satırlara diziyordu. v3 onları işin ACİLİYETİNE göre ayırdı:

    1. ÖZET KARTI ("BUGÜN DEPODA") — üç sayı, koyu zemin. Depocunun ekrana bakıp iki saniyede
       cevaplaması gereken soru: bugün ne kadar iş var? Sayılar hiçbir yere GİTMEZ; tıklanabilir
       olsalardı üçü de zaten altta duran kartların kopyası olurdu.
    2. D1 BÜYÜK KART — toplama kuyruğu, ilk iki siparişin önizlemesiyle. Günün asıl işi budur ve
       tek başına bir katman hak ediyor: hangi siparişin yarım kaldığı, listeyi açmadan görünür.
    3. D2…D8 IZGARA — iki sütun, ikonlu kutucuklar. Hepsi "gerektiğinde açılan" işler.
    + Altta yazıcı şeridi: kurulum, günlük iş değil.

  ── SAYILAR YİNE LİSTEDEN SAYILIYOR ─────────────────────────────────────────
  Özet kartı YENİ BİR UÇ İSTEMİYOR: üç sayı da bölümün zaten okuduğu iki listeden ve devir
  sayacından çıkıyor (hook künyesi). "Yarım kutu" mühürlenmemiş kutudur (`sealedAt === null`) —
  sözleşmede zaten var, ayrıca sorulmuyor.

  ── OKUNAMADI ≠ SIFIR, ÖZET KARTINDA DA ─────────────────────────────────────
  Üç sayının her biri `null` olabilir ve o zaman "—" yazılır, "0" DEĞİL (CLAUDE §1). Koyu kartta
  büyük bir "0", depocuya "bugün iş yok" der ve o cümlenin yanlış olması pahalıdır.

  ── ÜSTBAŞLIĞIN KUYRUĞU HÂLÂ YAZILMADI ──────────────────────────────────────
  v3 "DEPO · STRASBOURG MERKEZ" diyor; o kuyruk VERİDİR — personelin sabit deposunun ADI. O adı
  veren bir kapı bugün yok: `/me` sözleşmesi `warehouseIds`i taşımıyor ve depo uçlarının hiçbiri
  deponun adını döndürmüyor. Uydurma bir şehir adı, depocuya YANLIŞ deponun ekranındaymış gibi bir
  güvence verirdi. (Kurye tarafında ad VAR — `courier-api` `warehouseName` döndürüyor; depo
  sözleşmesinde yok. Açık geçiş günlüğüne yazıldı.)

  ── BAĞLAM SATIRI GELDİ ─────────────────────────────────────────────────────
  v3 başlığın altına "Deniz Arslan · depo" koyuyor. Bu veri VAR (`useOperationsIdentity`), yazıldı.

  ── TASARIMDAN BİLİNÇLİ SAPMALAR ────────────────────────────────────────────
  1. **Yükleniyor hâli eklendi** (şablon veriyi yerel dizeden okur, yükleme diye bir hâli yok).
  2. **Boş durum bloğu ÇİZİLMEDİ.** Hub'ın işlerinden ikisi (D3 turu, D4 sayım) her zaman açıktır;
     bütün listeyi bir "iş yok" kutusuna çevirmek çalışan iki kapıyı kapatırdı. Boşluk kartın ALT
     METNİNDE söyleniyor.
  3. **D8 alt metni "verilen"i değil BEKLEYENİ sayıyor.** Şablon "2 kutu verildi" diyor; kodun
     ölçtüğü şey rampada taşıyıcıyı bekleyen kutudur (21.134) ve depocunun sorusu odur — "bitti
     mi?". Verilen kutu geçmiştir, bekleyen kutu iştir.
  4. **Kapsam belirsizken tam ekran blok kalıyor.** Şablon kapsam sorusunu hub'ın ÜSTÜNDE ince bir
     şerit yapıp altında dolu bir hub çiziyor; bizde o mümkün değil, çünkü kapsam çözülmeden
     uçların hiçbiri veri döndürmüyor (`warehouse_required`). Şeridi çizip altını boş bırakmak,
     "okunamadı"yı "iş yok" diye göstermek olurdu.
*/

const t = warehouseCopy;
const shell = operationsCopy;

/** Izgara kutucuğunun şekli — yedi iş de aynı iskeleti çiziyor (v3:105-161). */
interface HubTile {
  key: string;
  code: string;
  icon: 'intake' | 'near-expiry' | 'stock-count' | 'transfer' | 'courier-return' | 'sale' | 'handover';
  /** İkonun rengi — şablonda kutucuk başına AYRI ve rastgele değil: terracotta olanlar bekleyen iş. */
  tone: string;
  title: string;
  subtitle: string;
  /** Alt metin DİKKAT rengiyle mi yazılıyor (şablonun `d3Rengi`/`d6Rengi` kuralı). */
  alert: boolean;
  onPress: () => void;
}

export function WarehouseHubScreen() {
  const router = useRouter();
  const hub = useWarehouseHub();
  const { scope, offline } = useWarehouseStatus();
  const unread = useOperationsNotifications().unread;
  const identity = useOperationsIdentity();
  const { width } = useWindowDimensions();

  /* IZGARANIN SÜTUN GENİŞLİĞİ HESAPLANIR, YÜZDEYLE VERİLMEZ (ölçüldü 30.08, OPPO CPH1907).
     Önce `flexBasis: '48%'` + `flexGrow` denendi: kutucuklar İÇERİĞE göre boyutlandı, uzun alt
     metinli "Mal kabul" satırı tek başına kaplayıp öbürlerini aşağı itti. Sonra `width: '48%'`
     denendi: bu kez yüzde beklenmedik bir tabana çözüldü ve kutucuklar ekranın beşte birine
     düştü, her kelime alt alta sardı. Ekran genişliğinden çıkarmak ikisini de bitiriyor —
     `discover-screen`in kart yolu hesabıyla aynı yol. */
  const tileWidth = (width - 2 * operationsTheme.space['6xl'] - operationsTheme.space.lg) / 2;

  const header = (
    <OperationsSectionHeader
      section="warehouse"
      eyebrow={t.hub.eyebrow}
      title={t.hub.title}
      context={`${identity.name} · ${shell.sections.warehouse.tab}`}
      right={
        <NotificationBell
          onPress={() => router.navigate('/notifications')}
          accessibilityLabel={
            unread === 0 ? shell.bell.label : fillCopy(shell.bell.labelWithCount, { n: String(unread) })
          }
          count={unread}
          testID="operations-bell"
        />
      }
      identity={<OperationsStaffMenu testID="operations-staff-menu" />}
      testID="warehouse-hub-header"
    />
  );

  if (hub.status === 'loading') {
    return (
      <View style={styles.screen} testID="operations-section-warehouse">
        {header}
        <View style={styles.centered}>
          <LoadingState accessibilityLabel={t.hub.loading} label={t.hub.loading} testID="warehouse-hub-loading" />
        </View>
      </View>
    );
  }

  if (scope === 'ambiguous') {
    return (
      <View style={styles.screen} testID="operations-section-warehouse">
        {header}
        <View style={styles.block}>
          <OperationsNoticeBlock
            variant="empty"
            title={t.common.scope.title}
            description={t.common.scope.body}
            testID="warehouse-scope-block"
          />
        </View>
      </View>
    );
  }

  /* Kilit uyarısı hem listede hem HATA hâlinde çizilir: okumalar bağlantısızlıktan düştüyse
     depocunun göreceği ilk cümle "sunucu sorunu" değil "hat kapalı" olmalı — ve yazma ekranlarının
     neden kilitli olduğu o an anlaşılmalı. */
  const offlineBanner = offline ? (
    <View style={styles.offline} testID="warehouse-hub-offline">
      <Text style={styles.offlineText}>{t.hub.offline}</Text>
    </View>
  ) : null;

  if (hub.status === 'error') {
    return (
      <View style={styles.screen} testID="operations-section-warehouse">
        {header}
        <View style={styles.block}>
          {offlineBanner}
          <OperationsNoticeBlock
            variant="error"
            title={t.hub.error.title}
            description={t.hub.error.body}
            retry={{ label: t.common.retry, onPress: hub.reload }}
            testID="warehouse-hub-error"
          />
        </View>
      </View>
    );
  }

  const overview = buildOverview(hub.orders, hub.pendingHandover);
  const picking = buildPicking(hub.orders);
  const tiles = buildTiles(hub.orders, hub.transfers, hub.pendingHandover, router);

  return (
    <View style={styles.screen} testID="operations-section-warehouse">
      {header}

      <ScrollView contentContainerStyle={styles.list} testID="warehouse-hub-list">
        {offlineBanner}

        {/* ── 1. ÖZET KARTI ─────────────────────────────────────────────────
            Tıklanabilir DEĞİL: üç sayının da gideceği yer zaten altta bir kart olarak duruyor.
            Aynı yere iki kapı açmak, hangisinin "asıl" olduğunu belirsizleştirirdi. */}
        <View style={styles.overview} testID="warehouse-hub-overview">
          <Text style={styles.overviewLabel}>{t.hub.overview.label}</Text>
          <View style={styles.overviewRow}>
            {overview.map((cell, index) => (
              <View key={cell.key} style={[styles.overviewCell, index === 0 ? null : styles.overviewCellDivided]}>
                <Text
                  style={[styles.overviewValue, cell.key === 'half' ? styles.overviewValueWarn : null]}
                  testID={`warehouse-hub-overview-${cell.key}`}
                >
                  {cell.value}
                </Text>
                <Text style={styles.overviewCaption}>{cell.caption}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── 2. D1 BÜYÜK KART ──────────────────────────────────────────── */}
        <PressableSurface
          onPress={() => router.navigate('/picking')}
          feedback="scale"
          style={styles.hero}
          accessibilityLabel={`${t.hub.rows.picking.title} — ${picking.subtitle}`}
          testID="warehouse-hub-picking"
        >
          <View style={styles.heroHead}>
            <View style={styles.codeChip}>
              <Text style={styles.codeChipText}>{t.hub.rows.picking.code}</Text>
            </View>
            <Text style={styles.heroTitle}>{t.hub.rows.picking.title}</Text>
            {picking.badge === null ? null : (
              <View style={styles.heroBadge}>
                <Text style={styles.heroBadgeText} testID="warehouse-hub-picking-badge">
                  {picking.badge}
                </Text>
              </View>
            )}
          </View>

          {picking.preview.length === 0 ? null : (
            <View style={styles.previewList} testID="warehouse-hub-picking-preview">
              {picking.preview.map((row) => (
                <View key={row.key} style={styles.previewRow}>
                  <View style={styles.previewMark} />
                  <View style={styles.previewBody}>
                    <Text style={styles.previewTitle} numberOfLines={1}>
                      {row.title}
                    </Text>
                    <Text style={styles.previewMeta} numberOfLines={1}>
                      {row.meta}
                    </Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          <Text style={styles.heroFoot}>{picking.subtitle}</Text>
        </PressableSurface>

        {/* ── 3. D2…D8 IZGARASI ─────────────────────────────────────────── */}
        <View style={styles.grid}>
          {tiles.map((tile) => (
            <PressableSurface
              key={tile.key}
              onPress={tile.onPress}
              feedback="scale"
              style={[styles.tile, { width: tileWidth }]}
              accessibilityLabel={`${tile.title} — ${tile.subtitle}`}
              testID={`warehouse-hub-${tile.key}`}
            >
              <View style={styles.tileHead}>
                <Icon name={tile.icon} size={operationsTheme.size.tileIcon} color={tile.tone} />
                <Text style={styles.tileCode}>{tile.code}</Text>
              </View>
              <Text style={styles.tileTitle}>{tile.title}</Text>
              <Text style={[styles.tileSubtitle, tile.alert ? styles.tileSubtitleAlert : null]}>{tile.subtitle}</Text>
            </PressableSurface>
          ))}
        </View>

        {/* ── Yazıcı şeridi — kurulum, günlük iş değil; ızgaranın DIŞINDA. */}
        <PressableSurface
          onPress={() => router.navigate('/printers')}
          feedback="scale-small"
          style={styles.printers}
          accessibilityLabel={`${t.hub.rows.printers.title} — ${t.hub.rows.printers.subtitle}`}
          testID="warehouse-hub-printers"
        >
          <Icon name="settings" size={operationsTheme.size.stripIcon} color={operationsTheme.colors.muted} />
          <View style={styles.printersBody}>
            <Text style={styles.printersTitle}>{t.hub.rows.printers.title}</Text>
            <Text style={styles.printersSubtitle}>{t.hub.rows.printers.subtitle}</Text>
          </View>
          <Text style={styles.chevron}>›</Text>
        </PressableSurface>

        <Text style={styles.footnote}>{t.hub.footnote}</Text>
      </ScrollView>
    </View>
  );
}

/**
 * ÖZET KARTININ ÜÇ SAYISI — hepsi zaten okunan veriden.
 *
 * `null` = OKUNAMADI ve "—" yazılır; sıfıra düşürmek "bugün iş yok" demek olurdu (CLAUDE §1).
 * "Yarım kutu": mühürlenmemiş kutusu olan sipariş — `sealedAt === null`. Kutuyu değil SİPARİŞİ
 * sayıyoruz, çünkü depocunun bitirmesi gereken şey siparişin kendisidir.
 */
function buildOverview(
  orders: readonly PreparationOrderContract[] | null,
  pendingHandover: number | null,
): { key: 'orders' | 'half' | 'shipments'; value: string; caption: string }[] {
  const unknown = t.hub.overview.unknown;
  const half = orders === null ? null : orders.filter(hasOpenBox).length;

  return [
    { key: 'orders', value: orders === null ? unknown : String(orders.length), caption: t.hub.overview.orders },
    { key: 'half', value: half === null ? unknown : String(half), caption: t.hub.overview.half },
    {
      key: 'shipments',
      value: pendingHandover === null ? unknown : String(pendingHandover),
      caption: t.hub.overview.shipments,
    },
  ];
}

/** Siparişin açık (mühürlenmemiş) kutusu var mı — "yarım kutu"nun tanımı. */
function hasOpenBox(order: PreparationOrderContract): boolean {
  return order.boxes.some((box) => box.sealedAt === null);
}

/** D1 kartının rozeti, önizleme satırları ve alt metni. */
function buildPicking(orders: readonly PreparationOrderContract[] | null): {
  badge: string | null;
  subtitle: string;
  preview: { key: string; title: string; meta: string }[];
} {
  const copy = t.hub.rows.picking;

  if (orders === null) return { badge: null, subtitle: copy.errorCta, preview: [] };
  if (orders.length === 0) return { badge: null, subtitle: copy.emptyCta, preview: [] };

  /* İLK İKİSİ — şablonun sayısı. Önizleme bir LİSTE DEĞİL, kartın "içeride ne var" cümlesidir;
     üçüncü satır kartı listeye çevirir ve altındaki ızgarayı ekrandan atardı.

     SIRA KUYRUĞUN SIRASIDIR (`orderPickingQueue`), ucun sırası değil: kuyruk ekranı yarım kalanı
     en üste alıyor ve hub burada başka bir "ilk ikisi" gösterseydi, aynı listenin iki ekranda iki
     farklı başı olurdu — depocu kartta gördüğü siparişi listenin başında bulamazdı. */
  const preview = orderPickingQueue(orders)
    .slice(0, 2)
    .map((order) => {
      const progress = fillCopy(t.hub.preview.line, {
        picked: String(order.pickedLineCount),
        total: String(order.lineCount),
      });
      return {
        key: order.orderId,
        title: `${order.referenceNo ?? ''} · ${order.recipientName ?? order.customerName}`.replace(/^ · /, ''),
        /* Açık kutu varsa onu söyle, yoksa kanalı: ikisi de "bu sipariş ne durumda" sorusuna
           cevaptır ama açık kutu ACİL olandır — kapatılmayı bekleyen bir iş. */
        meta: hasOpenBox(order) ? `${progress} · ${t.hub.preview.half}` : `${progress} · ${order.channel.toUpperCase()}`,
      };
    });

  return { badge: String(orders.length), subtitle: copy.open, preview };
}

/**
 * IZGARANIN YEDİ KUTUCUĞU. Sıra TASARIMIN sırasıdır (D2…D8), okuma sırası değil.
 *
 * `null` liste = OKUNAMADI ve "yok" ile karıştırılmaz: birinde alt metin "okunamadı" der,
 * ötekinde "bekleyen sipariş yok".
 */
function buildTiles(
  orders: readonly PreparationOrderContract[] | null,
  transfers: readonly { referenceNo: string }[] | null,
  pendingHandover: number | null,
  router: ReturnType<typeof useRouter>,
): HubTile[] {
  const transfer = t.hub.rows.transfer;
  const handover = t.hub.rows.handover;

  const handoverSubtitle =
    pendingHandover === null
      ? handover.unknown
      : pendingHandover === 0
        ? handover.none
        : pendingHandover === 1
          ? handover.one
          : fillCopy(handover.some, { n: String(pendingHandover) });

  const firstTransfer = transfers?.[0];
  const transferSubtitle =
    transfers === null
      ? transfer.unknown
      : firstTransfer === undefined
        ? transfer.none
        : transfers.length === 1
          ? fillCopy(transfer.some, { ref: firstTransfer.referenceNo })
          : fillCopy(transfer.someMany, { ref: firstTransfer.referenceNo, n: String(transfers.length) });

  const discardCount = NEAR_EXPIRY_FIXTURE.filter((batch) => batch.decision === 'discard').length;

  return [
    {
      key: 'intake',
      code: t.hub.rows.intake.code,
      icon: 'intake',
      tone: operationsTheme.colors.olive,
      title: t.hub.rows.intake.title,
      subtitle: t.hub.rows.intake.subtitle,
      alert: false,
      onPress: () => router.navigate('/intake'),
    },
    {
      key: 'near-expiry',
      code: t.hub.rows.nearExpiry.code,
      icon: 'near-expiry',
      tone: operationsTheme.colors.terracotta,
      title: t.hub.rows.nearExpiry.title,
      subtitle: fillCopy(t.hub.rows.nearExpiry.subtitle, {
        n: String(NEAR_EXPIRY_FIXTURE.length),
        discard: String(discardCount),
      }),
      /* Şablonun `d3Rengi` kuralı: liste DOLUYKEN alt metin dikkat rengine geçer. İmhalık parti
         bekleyen bir karardır; gri yazılsaydı öteki altı kutucukla aynı sesle konuşurdu. */
      alert: discardCount > 0,
      onPress: () => router.navigate('/near-expiry'),
    },
    {
      key: 'adjustment',
      code: t.hub.rows.adjustment.code,
      icon: 'stock-count',
      tone: operationsTheme.colors.olive,
      title: t.hub.rows.adjustment.title,
      subtitle: t.hub.rows.adjustment.subtitle,
      alert: false,
      onPress: () => router.navigate('/stock-count'),
    },
    {
      key: 'transfer',
      code: transfer.code,
      icon: 'transfer',
      tone: operationsTheme.colors['sand-600'],
      title: transfer.title,
      subtitle: transferSubtitle,
      alert: false,
      onPress: () => router.navigate('/inbound'),
    },
    {
      key: 'return',
      code: t.hub.rows.return.code,
      icon: 'courier-return',
      tone: operationsTheme.colors.terracotta,
      title: t.hub.rows.return.title,
      subtitle: t.hub.rows.return.subtitle,
      /* `d6Rengi` — bekleyen döküm bir karardır, bekleyen bir iştir. Bugün metin sabit (dökümü
         listeleyen kapı yok), o yüzden koşul da sabit; kapı gelince sayıya bağlanır. */
      alert: true,
      onPress: () => router.navigate('/courier-return'),
    },
    {
      key: 'sale',
      code: t.hub.rows.sale.code,
      icon: 'sale',
      tone: operationsTheme.colors.olive,
      title: t.hub.rows.sale.title,
      subtitle: t.hub.rows.sale.subtitle,
      alert: false,
      onPress: () => router.navigate('/sale'),
    },
    /*
      KARGO DEVRİ (07.12 · tasarım §8.6) — kutuların taşıyıcıya verildiği an.

      Sayaç kendi ucundan geliyor ve bu bir istisna: bekleyen kutuları hiçbir liste taşımıyor.
      Duyurulmuş bir siparişin kutuları hazırlık kuyruğundan DÜŞMÜŞTÜR (sipariş `ready`), yani
      hub'ın "listeden say" kuralı burada uygulanamıyordu.
    */
    {
      key: 'handover',
      code: handover.code,
      icon: 'handover',
      tone: operationsTheme.colors.olive,
      title: handover.title,
      subtitle: handoverSubtitle,
      alert: false,
      onPress: () => router.navigate('/handover'),
    },
  ];
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: operationsTheme.colors.cream,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
  },
  block: {
    paddingHorizontal: operationsTheme.space['6xl'],
    paddingTop: operationsTheme.space['7xl'],
  },
  list: {
    paddingHorizontal: operationsTheme.space['6xl'],
    paddingBottom: operationsTheme.space['8xl'],
    gap: operationsTheme.space.xl,
  },
  /** Kilit uyarısı listenin ÜSTÜNDE, çünkü işlerin üçünü birden kapatıyor. */
  offline: {
    paddingVertical: operationsTheme.space.lg,
    paddingHorizontal: operationsTheme.space['2xl'],
    borderRadius: operationsTheme.radius.control,
    backgroundColor: operationsTheme.colors['error-bg'],
  },
  offlineText: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.helper,
    lineHeight: operationsTheme.text.helper * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.error,
  },

  /* ── Özet kartı ─────────────────────────────────────────────────────────── */
  overview: {
    marginTop: operationsTheme.space.lg,
    backgroundColor: operationsTheme.colors.ink,
    borderRadius: operationsTheme.radius.card,
    paddingVertical: operationsTheme.space['3xl'],
    paddingHorizontal: operationsTheme.space['4xl'],
    gap: operationsTheme.space['2xl'],
  },
  overviewLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    /* Harf aralığı TOKEN'dan, ham çarpandan değil: token `em` (yazı boyuna göreli), RN mutlak dp
       ister — çeviri `parse.ts`te, tek yerde. Şablon burada 0.2em, kod chip'lerinde 0.14em
       yazıyor; ikisi de ölçeğin `eyebrow--letter-spacing` durağının (0.18em) etrafında ve o durak
       kullanılıyor. Ara değer için yeni durak AÇILMADI — üstbaşlık aralığı tek bir karardır,
       kullanıldığı yere göre değişmez (`section-header.tsx`in aynı yolu). */
    letterSpacing: emToDp(operationsTheme.text['eyebrow--letter-spacing'], operationsTheme.text.eyebrow),
    textTransform: 'uppercase',
    color: operationsTheme.colors['on-ink-label'],
  },
  overviewRow: {
    flexDirection: 'row',
  },
  overviewCell: {
    flex: 1,
    gap: operationsTheme.space['2xs'],
  },
  overviewCellDivided: {
    borderLeftWidth: operationsTheme.border.hairline,
    borderLeftColor: operationsTheme.colors['on-ink-line'],
    paddingLeft: operationsTheme.space.xl,
  },
  overviewValue: {
    fontFamily: operationsTheme.font.display[operationsTheme.text['card-title--font-weight']],
    fontSize: operationsTheme.text['card-title'],
    color: operationsTheme.colors['on-image'],
  },
  /** "Yarım kutu" amber — bitirilmesi gereken bir iş; hata DEĞİL (token künyesi). */
  overviewValueWarn: {
    color: operationsTheme.colors['on-ink-warn'],
  },
  overviewCaption: {
    fontFamily: operationsTheme.font.body['400'],
    fontSize: operationsTheme.text.meta,
    lineHeight: operationsTheme.text.meta * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors['on-ink-muted'],
  },

  /* ── D1 büyük kartı ─────────────────────────────────────────────────────── */
  hero: {
    backgroundColor: operationsTheme.colors.panel,
    borderRadius: operationsTheme.radius.card,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-300'],
    paddingVertical: operationsTheme.space['3xl'],
    paddingHorizontal: operationsTheme.space['4xl'],
    gap: operationsTheme.space.xl,
  },
  heroHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.lg,
  },
  codeChip: {
    borderWidth: operationsTheme.border.hairline,
    borderColor: operationsTheme.colors['sand-300'],
    borderRadius: operationsTheme.radius.badge,
    paddingVertical: operationsTheme.space['2xs'],
    paddingHorizontal: operationsTheme.space.sm,
  },
  codeChipText: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    letterSpacing: emToDp(operationsTheme.text['eyebrow--letter-spacing'], operationsTheme.text.eyebrow),
    color: operationsTheme.colors.muted,
  },
  heroTitle: {
    flex: 1,
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.step,
    color: operationsTheme.colors.ink,
  },
  heroBadge: {
    backgroundColor: operationsTheme.colors.terracotta,
    borderRadius: operationsTheme.radius.badge,
    paddingVertical: operationsTheme.space['2xs'],
    paddingHorizontal: operationsTheme.space.lg,
  },
  heroBadgeText: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.helper,
    color: operationsTheme.colors.card,
  },
  heroFoot: {
    fontFamily: operationsTheme.font.body['400'],
    fontSize: operationsTheme.text.micro,
    color: operationsTheme.colors.muted,
  },
  previewList: {
    gap: operationsTheme.space.md,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.md,
  },
  /** Şablonun sol işareti — satırı listeye bağlayan dikey çubuk. */
  previewMark: {
    width: operationsTheme.size.previewMark,
    height: operationsTheme.size.previewMarkHeight,
    borderRadius: operationsTheme.radius.tight,
    backgroundColor: operationsTheme.colors.terracotta,
  },
  previewBody: {
    flex: 1,
    minWidth: 0,
  },
  previewTitle: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text['field-label'],
    color: operationsTheme.colors.ink,
  },
  previewMeta: {
    fontFamily: operationsTheme.font.body['400'],
    fontSize: operationsTheme.text.tag,
    color: operationsTheme.colors.muted,
  },

  /* ── Izgara ─────────────────────────────────────────────────────────────── */
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: operationsTheme.space.lg,
  },
  /* Genişlik BURADA YOK — çağıran ekran genişliğinden hesaplayıp veriyor (gerekçe komponentte).
     Büyümeye de izin verilmiyor: yedi kutucuk iki sütuna sığmaz ve son hücre tek kalır; şablonun
     ızgarası `1fr 1fr` olduğu için o hücre tam genişliğe YAYILMAZ, bir sütun kalır. */
  tile: {
    minHeight: operationsTheme.size.tile,
    backgroundColor: operationsTheme.colors.panel,
    borderRadius: operationsTheme.radius.card,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-300'],
    padding: operationsTheme.space['2xl'],
    gap: operationsTheme.space.md,
  },
  tileHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tileCode: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    letterSpacing: emToDp(operationsTheme.text['eyebrow--letter-spacing'], operationsTheme.text.eyebrow),
    color: operationsTheme.colors['sand-600'],
  },
  tileTitle: {
    marginTop: 'auto',
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text['body-sm'],
    color: operationsTheme.colors.ink,
  },
  tileSubtitle: {
    fontFamily: operationsTheme.font.body['400'],
    fontSize: operationsTheme.text.tag,
    lineHeight: operationsTheme.text.tag * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.muted,
  },
  /** Bekleyen karar dikkat rengiyle yazılır (şablonun `d3Rengi`/`d6Rengi` kuralı). */
  tileSubtitleAlert: {
    color: operationsTheme.colors.error,
  },

  /* ── Yazıcı şeridi ──────────────────────────────────────────────────────── */
  printers: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.lg,
    backgroundColor: operationsTheme.colors['neutral-bg'],
    borderRadius: operationsTheme.radius.control,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-300'],
    paddingVertical: operationsTheme.space.xl,
    paddingHorizontal: operationsTheme.space['2xl'],
  },
  printersBody: {
    flex: 1,
  },
  printersTitle: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.note,
    color: operationsTheme.colors.body,
  },
  printersSubtitle: {
    fontFamily: operationsTheme.font.body['400'],
    fontSize: operationsTheme.text.tag,
    color: operationsTheme.colors.muted,
  },
  chevron: {
    fontFamily: operationsTheme.font.body['400'],
    fontSize: operationsTheme.text['icon-sm'],
    color: operationsTheme.colors['sand-600'],
  },
  footnote: {
    fontFamily: operationsTheme.font.body['400'],
    fontSize: operationsTheme.text.micro,
    lineHeight: operationsTheme.text.micro * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.muted,
  },
});
