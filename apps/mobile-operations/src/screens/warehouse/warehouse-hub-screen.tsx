import { useRouter } from 'expo-router';
import { RefreshControl, Text, useWindowDimensions, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { NotificationBell } from '@/components/operations/notification-bell';
import { OperationsNoticeBlock } from '@/components/operations/notice-block';
import { OperationsScreenScroll } from '@/components/operations/screen-scroll';
import { OperationsSectionHeader } from '@/components/operations/section-header';
import { OperationsSkeletonList } from '@/components/operations/skeleton-list';
import { OperationsStaffMenu } from '@/components/operations/staff-menu';
import { OperationsSurface } from '@/components/operations/surface';
import { Icon } from '@lezzet/mobile-kit/src/components/ui/icon';
import { PressableSurface } from '@lezzet/mobile-kit/src/components/ui/pressable-surface';
import { fillCopy, operationsCopy } from '@/screens/operations/copy';
import { operationsSectionRoute } from '@/screens/login/post-login-route';
import { chooseWarehouse } from '@/lib/operations/warehouse-choice';
import { captionOf } from '@/lib/operations/caption';
import {
  useOperationsIdentity,
  useOperationsSections,
  useOperationsWorkplace,
  useWarehouseOptions,
} from '@/screens/operations/sections-context';
import { useOperationsNotificationBadge } from '@/screens/operations/use-notification-badge.hook';
import { emToDp } from '@lezzet/mobile-kit/src/theme/parse';
import { operationsTheme } from '@lezzet/mobile-kit/src/theme/unistyles';
import { warehouseCopy } from './copy';
import { orderPickingQueue } from './warehouse-format';
import type { BoxPrinterContract, PreparationOrderContract } from '@lezzet/types';
import { useWarehouseHub } from './use-warehouse-hub.hook';
import { resetWarehouseStatus, useWarehouseStatus } from './warehouse-status';

/*
  Depo bölümünün kökü: üstte günün üç sayısı, ortada toplama kuyruğu, altta gerektiğinde açılan işlerin ızgarası. Sayılar bölümün
  zaten okuduğu listelerden çıkar; okunamayan sayı "0" değil "—" yazar, çünkü büyük bir sıfır depocuya "bugün iş yok" der.
*/

const t = warehouseCopy;

/** İlk yükün yer tutucuları blokların kendi boyundadır (özet, D1 kartı, iki sıra kutucuk); tek ortalama boy veri gelince sayfayı zıplatırdı. */
const HUB_SKELETON = { overview: 108, hero: 196, grid: 274 } as const;
const shell = operationsCopy;

/** Izgara kutucuğunun şekli — yedi iş de aynı iskeleti çiziyor (v3:105-161). */
interface HubTile {
  key: string;
  code: string;
  icon: 'intake' | 'near-expiry' | 'stock-count' | 'stock-write-off' | 'transfer' | 'courier-return' | 'sale' | 'plus' | 'handover';
  /** İkonun rengi — şablonda kutucuk başına AYRI ve rastgele değil: terracotta olanlar bekleyen iş. */
  tone: string;
  title: string;
  subtitle: string;
  /** Alt metin DİKKAT rengiyle mi yazılıyor (şablonun `d3Rengi`/`d6Rengi` kuralı). */
  alert: boolean;
  /**
   * Bekleyen iş yoksa çerçeve kesiklidir; bayrak yalnız sayı biliniyor ve sıfırken açılır, çünkü okunamayanı kesikli çizmek "iş yok"
   * demek olurdu. Sayısı olmayan kutucuk (mal kabul, sayım, yerinde satış) kuyruk değil kapıdır ve bayrak taşımaz.
   */
  empty?: boolean;
  onPress: () => void;
}

export function WarehouseHubScreen() {
  const router = useRouter();
  const hub = useWarehouseHub();
  const { scope, offline } = useWarehouseStatus();
  const unread = useOperationsNotificationBadge();
  const identity = useOperationsIdentity();
  const sections = useOperationsSections();
  const workplace = useOperationsWorkplace();
  const warehouseOptions = useWarehouseOptions();
  const { width } = useWindowDimensions();

  /**
   * Seçim yazılır, bölümün kapsam ölçümü sıfırlanır ve hub yeniden okur. Ölçüm sıfırlanmazsa ekran belirsiz kapsam dalında kalır ve
   * yeniden okuma hiç çizilmez.
   */
  const pickWarehouse = (warehouseId: string) => {
    chooseWarehouse(warehouseId);
    resetWarehouseStatus();
    hub.reload();
  };

  /* Sütun eni ekran genişliğinden hesaplanır: yüzdeli `flexBasis` kutucukları içeriğe göre boyutlandırır, yüzdeli `width` ise
     beklenmedik bir tabana çözülür. */
  const tileWidth = (width - 2 * operationsTheme.space['6xl'] - operationsTheme.space.lg) / 2;

  const header = (
    <OperationsSectionHeader
      section="warehouse"
      /* Üstbaşlık nerede olunduğunu, künye satırı kim olunduğunu söyler. Tesis adı yoksa üstbaşlık kuyruksuz kalır, çünkü tek tesisli
         olmayan personele tesislerden birinin adını yazmak yanlış güvence verirdi. */
      eyebrow={captionOf(t.hub.eyebrow, workplace) ?? t.hub.eyebrow}
      title={t.hub.title}
      context={`${identity.name} · ${shell.sections.warehouse.tab}`}
      right={
        <NotificationBell
          onPress={() => router.navigate('/notifications')}
          accessibilityLabel={unread === null || unread === 0 ? shell.bell.label : fillCopy(shell.bell.labelWithCount, { n: String(unread) })}
          count={unread}
          testID="operations-bell"
        />
      }
      identity={<OperationsStaffMenu testID="operations-staff-menu" />}
      testID="warehouse-hub-header"
    />
  );

  if (hub.status === 'loading') {
    /* İlk yükte halka değil iskelet çizilir: halka yerleşimi tutmaz ve söndüğü an sayfa zıplar. */
    return (
      <View style={styles.screen} testID="operations-section-warehouse">
        {header}
        <View style={styles.loading}>
          <OperationsSkeletonList
            heights={[HUB_SKELETON.overview, HUB_SKELETON.hero, HUB_SKELETON.grid]}
            label={t.hub.loading}
            testID="warehouse-hub-loading"
          />
        </View>
      </View>
    );
  }

  /*
    Kapsam sorusu iki yoldan doğar: kapı depo istediğinde ya da personelin birden çok tesisi olup henüz seçmediğinde. Tek tesiste hiç
    sorulmaz; seçim kapsamdan türetilir ve tek satırlık seçici sormuş gibi yapmak olurdu.
  */
  if (warehouseOptions.length !== 1 && (scope === 'ambiguous' || (workplace === null && warehouseOptions.length > 0))) {
    return (
      <View style={styles.screen} testID="operations-section-warehouse">
        {header}
        <View style={styles.block}>
          {/*
            Seçenek varsa soru "hangisi", yoksa cevap "atama bekleniyor"; ayrım rolden değil seçeneklerin varlığından gelir, çünkü
            ataması yapılmış çok depolu personele "atama bekleniyor" demek yanlıştır.
          */}
          <OperationsNoticeBlock
            variant="empty"
            title={warehouseOptions.length === 0 ? t.common.scope.title : t.common.scope.pickTitle}
            description={warehouseOptions.length === 0 ? t.common.scope.body : t.common.scope.pickBody}
            testID="warehouse-scope-block"
          />

          {/*
            Seçim bir yetki değildir: adrese `?warehouseId=` yazılır ve kapı onu her istekte kapsama karşı sınar. Araçlar süzülür,
            liste yalnız tesislerdir.
          */}
          {warehouseOptions.map((option) => (
            <PressableSurface
              key={option.id}
              onPress={() => pickWarehouse(option.id)}
              feedback="scale"
              style={styles.scopePick}
              accessibilityLabel={fillCopy(t.common.scope.pickAction, { name: option.name })}
              testID={`warehouse-scope-pick-${option.id}`}
            >
              <Text style={styles.scopePickName}>{option.name}</Text>
              {/* Kod da yazılıyor: iki tesisin adı benzediğinde ("Kehl Depo" · "Kehl Şube") adı
                  görüp seçmek bir tahmindir; kod belgelerde de o tesisi işaret eder. */}
              <Text style={styles.scopePickCode}>{option.code}</Text>
            </PressableSurface>
          ))}

          {/*
            Kapsam belirsizken personelin açık olan öteki bölümlerine çıkış verilir ki kapalı kapının önünde kalmasın. Yalnız
            gerçekten açık bölümler çizilir; yetkisi olmayan bölüm geri atardı.
          */}
          {sections
            .filter((section) => section !== 'warehouse')
            .map((section) => (
              <PressableSurface
                key={section}
                onPress={() => router.navigate(operationsSectionRoute(section))}
                feedback="scale"
                style={styles.scopeExit}
                accessibilityLabel={fillCopy(t.common.scope.otherSection, { section: shell.sections[section].tab })}
                testID={`warehouse-scope-to-${section}`}
              >
                <Text style={styles.scopeExitLabel}>{fillCopy(t.common.scope.otherSection, { section: shell.sections[section].tab })}</Text>
              </PressableSurface>
            ))}

          {/* Kararın kendisi yazılı: depo SEÇTİRİLMİYOR. Bir liste koymak kolay olurdu; yanlış
              depoya yazılan sayım iki deponun stokunu birden bozar (DOMAIN §17). */}
          <Text style={styles.scopeFootnote}>{t.common.scope.footnote}</Text>
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
  const tiles = buildTiles(hub.orders, hub.transfers, hub.returningCouriers, hub.pendingHandover, hub.pickupWaiting, hub.nearExpiry, router);

  return (
    <View style={styles.screen} testID="operations-section-warehouse">
      {/* Aşağı çekince yenilenir, çünkü hub günün sayılarını gösterir. Kap yapışkan mikro başlığı çizer ve kaydırmayı kabuğa bağlar. */}
      <OperationsScreenScroll
        title={t.hub.title}
        caption={shell.sections.warehouse.tab}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={hub.reloading} onRefresh={hub.refresh} />}
        testID="warehouse-hub-list"
      >
        {/* Başlık kaydırıcının içindedir: dışarıda kalsaydı mikro başlık inince tam başlık altında asılı kalırdı. */}
        {header}

        {offlineBanner}

        {/* ── 1. ÖZET KARTI · tıklanmaz: üç sayının gideceği yer altta zaten bir kart olarak durur. */}
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
              style={[styles.tile, tile.empty === true ? styles.tileEmpty : null, { width: tileWidth }]}
              accessibilityLabel={`${tile.title} — ${tile.subtitle}`}
              testID={`warehouse-hub-${tile.key}`}
            >
              <View style={styles.tileHead}>
                <Icon name={tile.icon} size={operationsTheme.size.tileIcon} color={tile.tone} />
                <Text style={styles.tileCode}>{tile.code}</Text>
              </View>
              {/* Başlık tek satır, alt metin en fazla iki: kutucuk sabit yükseklikte ve taşan
                  metin kutuyu değil KENDİNİ kısaltmalı. */}
              <Text style={styles.tileTitle} numberOfLines={1}>
                {tile.title}
              </Text>
              <Text style={[styles.tileSubtitle, tile.alert ? styles.tileSubtitleAlert : null]} numberOfLines={2}>
                {tile.subtitle}
              </Text>
            </PressableSurface>
          ))}
        </View>

        {/* ── Yazıcı şeridi · kurulumdur, günlük iş değil; ızgaranın dışında ve kitin sessiz tonunda durur. */}
        <OperationsSurface
          tone="quiet"
          padding="md"
          chevron
          onPress={() => router.navigate('/printers')}
          accessibilityLabel={`${t.hub.rows.printers.title} — ${t.hub.rows.printers.subtitle}`}
          testID="warehouse-hub-printers"
        >
          <View style={styles.printersRow}>
            <Icon name="settings" size={operationsTheme.size.stripIcon} color={operationsTheme.colors.muted} />
            <View style={styles.printersBody}>
              <Text style={styles.printersTitle}>{t.hub.rows.printers.title}</Text>
              {/* Şerit cihazın hâlini söyler (hangi amaca hangi yazıcı); okuma düşerse açıklama cümlesine geri düşülür. */}
              <Text style={styles.printersSubtitle} testID="warehouse-hub-printers-state">
                {printerSummary(hub.printers)}
              </Text>
            </View>
          </View>
        </OperationsSurface>

        <Text style={styles.footnote}>{t.hub.footnote}</Text>
      </OperationsScreenScroll>
    </View>
  );
}

/**
 * Özet kartının üç sayısı okunan veriden; `null` okunamadı demektir ve "—" yazılır. Yarım kutu mühürlenmemiş kutusu olan siparişi
 * sayar, çünkü depocunun bitireceği şey siparişin kendisidir.
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

  /* Önizleme ilk iki siparişi kuyruğun sırasıyla gösterir; üçüncü satır kartı listeye çevirirdi, başka bir sıra da kartta görülen
     siparişi listenin başında bulunamaz kılardı. */
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
 * Yazıcı şeridinin cümlesi amaç başına iki yarımdır, çünkü depocunun sorusu "kaç yazıcı" değil "kargo etiketi basabilir miyim".
 * Okunamayan liste açıklama cümlesine düşer; boş liste kendi cümlesini alır.
 */
function printerSummary(printers: readonly BoxPrinterContract[] | null): string {
  if (printers === null) return t.hub.rows.printers.subtitle;
  const nameOf = (purpose: BoxPrinterContract['purpose']) =>
    printers.find((printer) => printer.purpose === purpose)?.model ?? t.hub.rows.printers.unset;
  return fillCopy(t.hub.rows.printers.state, { box: nameOf('box'), shipping: nameOf('shipping') });
}

/** Izgaranın kutucukları tasarımın sırasıyla; okunamayan liste "okunamadı", boş liste "yok" der. */
function buildTiles(
  orders: readonly PreparationOrderContract[] | null,
  transfers: readonly { referenceNo: string }[] | null,
  /** D6'nın kaynağı — `null` = okunamadı; sıfıra düşürmek "rampa boş" derdi (CLAUDE §1). */
  returningCouriers: number | null,
  pendingHandover: number | null,
  /** D9'un kaynağı — müşterisini bekleyen gel-al; `null` = okunamadı. */
  pickupWaiting: number | null,
  /** D3'ün kaynağı — `null` = okunamadı (kart sayı yazmaz, "okunamadı" der). */
  nearExpiry: readonly { decision: string }[] | null,
  router: ReturnType<typeof useRouter>,
): HubTile[] {
  const transfer = t.hub.rows.transfer;
  const handover = t.hub.rows.handover;
  const ramp = t.hub.rows.return;
  const pickup = t.hub.rows.pickup;

  const pickupSubtitle =
    pickupWaiting === null
      ? pickup.unknown
      : pickupWaiting === 0
        ? pickup.none
        : pickupWaiting === 1
          ? pickup.one
          : fillCopy(pickup.some, { n: String(pickupWaiting) });

  /* Dönüş sayısı rampa kapısından gelir; okunamazsa sayı yazılmaz. */
  const returnSubtitle =
    returningCouriers === null
      ? ramp.unknown
      : returningCouriers === 0
        ? ramp.none
        : fillCopy(ramp.some, { n: String(returningCouriers) });

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

  /* Okunamayan liste sayı yazmaz: "0 parti" okunamayanı "iş yok" diye gösterirdi. */
  const discardCount = nearExpiry === null ? null : nearExpiry.filter((batch) => batch.decision === 'must_discard').length;

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
      subtitle:
        nearExpiry === null || discardCount === null
          ? t.hub.rows.nearExpiry.unknown
          : fillCopy(t.hub.rows.nearExpiry.subtitle, {
              n: String(nearExpiry.length),
              discard: String(discardCount),
            }),
      /* İmhalık parti bekleyen bir karardır ve alt metin dikkat rengine geçer; okunamayan sayı dikkat çekmez, kart zaten "okunamadı" der. */
      alert: discardCount !== null && discardCount > 0,
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
      /* Düşüm sayımdan ayrı iştir: sayım kaydı düzeltir, düşüm malın gerçekten eksildiğini yazar. Stok düşüren tek iş olduğu için terracotta. */
      key: 'writeOff',
      code: t.hub.rows.writeOff.code,
      /* İkon sayımınkinden ayrıdır (raftan inen ok), iki kutucuk aynı şekli göstermemeli. */
      icon: 'stock-write-off',
      tone: operationsTheme.colors.terracotta,
      title: t.hub.rows.writeOff.title,
      subtitle: t.hub.rows.writeOff.subtitle,
      alert: false,
      onPress: () => router.navigate('/write-off'),
    },
    {
      key: 'transfer',
      code: transfer.code,
      icon: 'transfer',
      tone: operationsTheme.colors['sand-600'],
      title: transfer.title,
      subtitle: transferSubtitle,
      alert: false,
      // Liste OKUNDU ve boşsa kesikli; `null` (okunamadı) kesikli DEĞİL — ölçülemeyeni "iş yok"
      // diye göstermek olurdu.
      empty: transfers !== null && transfers.length === 0,
      onPress: () => router.navigate('/inbound'),
    },
    {
      key: 'return',
      code: t.hub.rows.return.code,
      icon: 'courier-return',
      tone: operationsTheme.colors.terracotta,
      title: t.hub.rows.return.title,
      subtitle: returnSubtitle,
      /* Bekleyen dönüş bir iştir ve uyarı sayıya bağlıdır: her gün yanan işaret bir şey söylemez, okunamayan sayı da yanmaz. */
      alert: (returningCouriers ?? 0) > 0,
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
    {
      key: 'new-order',
      code: t.hub.rows.newOrder.code,
      icon: 'plus',
      tone: operationsTheme.colors.olive,
      title: t.hub.rows.newOrder.title,
      subtitle: t.hub.rows.newOrder.subtitle,
      alert: false,
      onPress: () => router.navigate('/order'),
    },
    /*
      Kargo devri: kutuların taşıyıcıya verildiği an. Sayaç kendi ucundan gelir, çünkü duyurulmuş siparişin kutuları hazırlık
      kuyruğunda artık yoktur.
    */
    {
      key: 'handover',
      code: handover.code,
      icon: 'handover',
      tone: operationsTheme.colors.olive,
      title: handover.title,
      subtitle: handoverSubtitle,
      alert: false,
      // Sayaç ucundan geliyor; `null` "okunamadı" demek ve o hâlde kesikli çizilmez.
      empty: pendingHandover === 0,
      onPress: () => router.navigate('/handover'),
    },
    /*
      Gel-al teslim: hazır sipariş tezgâhtan müşteriye verilir, tahsilat da burada olabilir. Bekleyen müşteri bir iştir ve alt metin
      dikkat rengine geçer.
    */
    {
      key: 'pickup',
      code: pickup.code,
      icon: 'handover',
      tone: operationsTheme.colors.terracotta,
      title: pickup.title,
      subtitle: pickupSubtitle,
      alert: (pickupWaiting ?? 0) > 0,
      empty: pickupWaiting === 0,
      onPress: () => router.navigate('/pickup'),
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
  /* Skeleton ORTALANMAZ: yerini tuttuğu bloklar yukarıdan başlıyor ve ortalanmış kutular veri
     gelince yukarı sıçrardı — halkanın kusurunu geri getirmek olurdu. */
  loading: {
    paddingHorizontal: operationsTheme.space['5xl'],
    paddingTop: operationsTheme.space['3xl'],
  },
  block: {
    paddingHorizontal: operationsTheme.space['6xl'],
    paddingTop: operationsTheme.space['7xl'],
    gap: operationsTheme.space.xl,
  },
  /** Kapsam belirsizken açık kalan bölümlere çıkış — kullanıcı kapalı kapının önünde bırakılmaz. */
  scopeExit: {
    alignItems: 'center',
    paddingVertical: operationsTheme.space.xl,
    borderRadius: operationsTheme.radius.control,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-500'],
  },
  scopeExitLabel: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.button,
    color: operationsTheme.colors['olive-dark'],
  },
  /**
   * Depo seçeneği — çıkış düğmesiyle AYNI iskelet ama DOLU zemin: bu satır bir kaçış değil,
   * ekranın beklediği eylemdir. Aynı kutunun içinde iki kademe var (ad + kod), o yüzden hizalama
   * ortadan sola alındı.
   */
  scopePick: {
    paddingVertical: operationsTheme.space.xl,
    paddingHorizontal: operationsTheme.space.xl,
    gap: operationsTheme.space['2xs'],
    borderRadius: operationsTheme.radius.control,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['olive-dark'],
    backgroundColor: operationsTheme.colors['olive-bg'],
  },
  scopePickName: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.button,
    color: operationsTheme.colors['olive-dark'],
  },
  scopePickCode: {
    fontFamily: operationsTheme.font.body['400'],
    fontSize: operationsTheme.text.tag,
    color: operationsTheme.colors.muted,
  },
  scopeFootnote: {
    fontFamily: operationsTheme.font.body['400'],
    fontSize: operationsTheme.text.tag,
    lineHeight: operationsTheme.text.tag * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.muted,
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
    /* Harf aralığı ölçeğin üstbaşlık durağıdır; üstbaşlık aralığı kullanıldığı yere göre değişmez, ara değer için durak açılmaz. */
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
  /* Kuyruğu açan satır bir eylem cümlesidir: zeytin ve sağa yaslı, ama dokunuş satırın değil kartındır. */
  heroFoot: {
    alignSelf: 'flex-end',
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.helper,
    color: operationsTheme.colors.olive,
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
    // Sabit yükseklik: sekiz kutucuk EŞİT olmalı (metrics künyesi). `minHeight` ızgarayı kaydırıyordu.
    height: operationsTheme.size.tile,
    backgroundColor: operationsTheme.colors.panel,
    borderRadius: operationsTheme.radius.card,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-300'],
    padding: operationsTheme.space['2xl'],
    gap: operationsTheme.space.md,
  },
  /* Boş kutucuk kesiklidir: kesik çizgi "burada iş olabilir ama bugün yok" der, depocu ızgarayı alt metni okumadan tarar. */
  tileEmpty: {
    borderStyle: 'dashed',
    borderColor: operationsTheme.colors['sand-500'],
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
  printersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.lg,
  },
  printersBody: {
    flex: 1,
  },
  printersTitle: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.note,
    color: operationsTheme.colors.body,
  },
  /* Alt metin en sessiz mürekkeple yazılır; `muted` başlıkla aynı ağırlıkta okunur ve hangisinin başlık olduğu ayırt edilmez. */
  printersSubtitle: {
    fontFamily: operationsTheme.font.body['400'],
    fontSize: operationsTheme.text.tag,
    color: operationsTheme.colors['tab-inactive'],
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
