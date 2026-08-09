import { useRouter } from 'expo-router';
import { ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { NotificationBell } from '@/components/operations/notification-bell';
import { OperationsNoticeBlock } from '@/components/operations/notice-block';
import { OperationsSectionHeader } from '@/components/operations/section-header';
import { LoadingState } from '@/components/ui/loading-state';
import { PressableSurface } from '@/components/ui/pressable-surface';
import { fillCopy, operationsCopy } from '@/screens/operations/copy';
import { useOperationsNotifications } from '@/screens/operations/use-notifications.hook';
import { operationsTheme } from '@/theme/unistyles';
import { warehouseCopy } from './copy';
import { NEAR_EXPIRY_FIXTURE } from './near-expiry-fixture';
import { useWarehouseHub } from './use-warehouse-hub.hook';
import { useWarehouseStatus } from './warehouse-status';

/*
  DEPO HUB (v2:264-310) — bölümün kökü, altı işin kapısı.

  Kurye kökünün (21.10) açtığı yol: başlık üçlüsü ORTAK komponenttendir
  (`OperationsSectionHeader` + zil), gövde ekranın kendisidir.

  ── ÜSTBAŞLIĞIN KUYRUĞU YAZILMADI ───────────────────────────────────────────
  v2:268 "DEPO · STRASBOURG (SABİT)" diyor ve o kuyruk VERİDİR — personelin sabit deposunun ADI.
  O adı veren bir kapı bugün yok: `/me` sözleşmesi `warehouseIds`i bilerek taşımıyor ve depo
  uçlarının hiçbiri deponun adını döndürmüyor (kimlik jetondan çözülüyor, ekrana çıkmıyor). Uydurma
  bir şehir adı yazmak, depocuya YANLIŞ deponun ekranındaymış gibi bir güvence verirdi — üstbaşlık
  kuyruksuz kaldı (kuryenin gün+ad kuyruğuyla aynı disiplin: veri yoksa parça yazılmaz).

  ── TASARIMDAN BİLİNÇLİ SAPMALAR ────────────────────────────────────────────
  1. **Yükleniyor hâli eklendi** (v2'nin demo sözlüğünde yok — şablon veriyi yerel dizeden okur).
     Boş listeyle göstermek "bugün iş yok" demek olurdu.
  2. **Boş durum bloğu ÇİZİLMEDİ.** v2'nin `kEmpty` hâli bütün hub'ı bir "Bekleyen iş yok" kutusuna
     çeviriyor; gerçekte hub'ın altı satırından ikisi (D3 turu, D4 sayım) **her zaman açıktır** —
     depocu bekleyen sipariş olmadan da yakın-SKT turuna çıkar ve sayım yazar. Bütün listeyi
     gizlemek, çalışan iki kapıyı kapatmak olurdu. Boşluk satırın ALT METNİNDE söyleniyor
     ("bekleyen sipariş yok").
  3. **Sayaçsız iki satır** (D2 · D6): bekleyen sevkiyatı ve dönüş dökümünü listeleyen kapı yok
     (hook künyesi). Rozet yerine satır ne olduğunu söylüyor.

  ── KAPSAM SORUSU EKRANIN KENDİSİDİR ────────────────────────────────────────
  Kapı "hangi depo" diye sorduysa (`warehouse_required` — kapsamda tek depo yok) liste ÇİZİLMEZ:
  hangi deponun işini gösterdiğimizi bilmeden gösterilen bir iş listesi, yanlış deponun malını
  saydırır. Gerekçe ve çıkış yolu `warehouse-status.ts` künyesinde.
*/

const t = warehouseCopy;
const shell = operationsCopy;

/** Hub satırının tek şekli — altı iş de aynı iskeleti çiziyor (v2:288-296). */
interface HubRow {
  key: string;
  code: string;
  title: string;
  subtitle: string;
  badge: string | null;
  onPress: () => void;
}

export function WarehouseHubScreen() {
  const router = useRouter();
  const hub = useWarehouseHub();
  const { scope, offline } = useWarehouseStatus();
  const unread = useOperationsNotifications().length;

  const header = (
    <OperationsSectionHeader
      section="warehouse"
      eyebrow={t.hub.eyebrow}
      title={t.hub.title}
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

  const rows = buildRows(hub.orders, hub.transfers, router);

  return (
    <View style={styles.screen} testID="operations-section-warehouse">
      {header}

      <ScrollView contentContainerStyle={styles.list} testID="warehouse-hub-list">
        {offlineBanner}

        {rows.map((row) => (
          <PressableSurface
            key={row.key}
            onPress={row.onPress}
            feedback="scale"
            style={styles.row}
            accessibilityLabel={`${row.title} — ${row.subtitle}`}
            testID={`warehouse-hub-${row.key}`}
          >
            <View style={styles.code}>
              <Text style={styles.codeText}>{row.code}</Text>
            </View>
            <View style={styles.rowBody}>
              <Text style={styles.rowTitle}>{row.title}</Text>
              <Text style={styles.rowSubtitle}>{row.subtitle}</Text>
            </View>
            {row.badge === null ? null : (
              <Text style={styles.badge} testID={`warehouse-hub-${row.key}-badge`}>
                {row.badge}
              </Text>
            )}
            <Text style={styles.chevron}>›</Text>
          </PressableSurface>
        ))}

        <Text style={styles.footnote}>{t.hub.footnote}</Text>
      </ScrollView>
    </View>
  );
}

/**
 * Altı satırın metni ve rozeti. Sıra TASARIMIN sırasıdır (D1…D6), okuma sırası değil.
 *
 * `null` liste = OKUNAMADI ve "yok" ile karıştırılmaz: birinde alt metin "okunamadı" der, ötekinde
 * "bekleyen sipariş yok". Rozet yalnız gerçekten sayılabilen işte çizilir.
 */
function buildRows(
  orders: readonly { lineCount: number; pickedLineCount: number }[] | null,
  transfers: readonly { referenceNo: string }[] | null,
  router: ReturnType<typeof useRouter>,
): HubRow[] {
  const picking = t.hub.rows.picking;
  const halfDone = orders?.filter((order) => order.pickedLineCount > 0 && order.pickedLineCount < order.lineCount).length ?? 0;
  const pickingSubtitle =
    orders === null
      ? picking.unknown
      : orders.length === 0
        ? picking.none
        : halfDone > 0
          ? fillCopy(picking.someWithHalf, { n: String(orders.length), half: String(halfDone) })
          : fillCopy(picking.some, { n: String(orders.length) });

  const transfer = t.hub.rows.transfer;
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
      key: 'picking',
      code: picking.code,
      title: picking.title,
      subtitle: pickingSubtitle,
      badge: orders === null || orders.length === 0 ? null : String(orders.length),
      onPress: () => router.navigate('/picking'),
    },
    {
      key: 'intake',
      code: t.hub.rows.intake.code,
      title: t.hub.rows.intake.title,
      subtitle: t.hub.rows.intake.subtitle,
      badge: null,
      onPress: () => router.navigate('/intake'),
    },
    {
      key: 'near-expiry',
      code: t.hub.rows.nearExpiry.code,
      title: t.hub.rows.nearExpiry.title,
      subtitle: fillCopy(t.hub.rows.nearExpiry.subtitle, {
        n: String(NEAR_EXPIRY_FIXTURE.length),
        discard: String(discardCount),
      }),
      badge: null,
      onPress: () => router.navigate('/near-expiry'),
    },
    {
      key: 'adjustment',
      code: t.hub.rows.adjustment.code,
      title: t.hub.rows.adjustment.title,
      subtitle: t.hub.rows.adjustment.subtitle,
      badge: null,
      onPress: () => router.navigate('/stock-count'),
    },
    {
      key: 'transfer',
      code: transfer.code,
      title: transfer.title,
      subtitle: transferSubtitle,
      badge: transfers === null || transfers.length === 0 ? null : String(transfers.length),
      onPress: () => router.navigate('/inbound'),
    },
    {
      key: 'return',
      code: t.hub.rows.return.code,
      title: t.hub.rows.return.title,
      subtitle: t.hub.rows.return.subtitle,
      badge: null,
      onPress: () => router.navigate('/courier-return'),
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
  },
  /** v2:286 — kilit uyarısı listenin ÜSTÜNDE, çünkü altı işin üçünü birden kapatıyor. */
  offline: {
    marginTop: operationsTheme.space.lg,
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: operationsTheme.space.xl,
    paddingVertical: operationsTheme.space['3xl'],
    borderBottomWidth: operationsTheme.border.base,
    borderStyle: 'dashed',
    borderBottomColor: operationsTheme.colors['sand-300'],
  },
  code: {
    width: operationsTheme.size.stepButton,
    height: operationsTheme.size.stepButton,
    borderRadius: operationsTheme.radius.badge,
    backgroundColor: operationsTheme.colors['neutral-bg'],
    alignItems: 'center',
    justifyContent: 'center',
  },
  codeText: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.note,
    // Depo bölümünün kimlik tonu (`warehouse` #8a6d3a) — üstbaşlıkla aynı renk, satırda küçük hâli.
    color: operationsTheme.colors.warehouse,
  },
  rowBody: {
    flex: 1,
    gap: operationsTheme.space['2xs'],
  },
  rowTitle: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.body,
    color: operationsTheme.colors.ink,
  },
  rowSubtitle: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.helper,
    color: operationsTheme.colors.muted,
  },
  badge: {
    paddingVertical: operationsTheme.space.xs,
    paddingHorizontal: operationsTheme.space.lg,
    borderRadius: operationsTheme.radius.badge,
    backgroundColor: operationsTheme.colors.terracotta,
    color: operationsTheme.colors.card,
    fontFamily: operationsTheme.font.body[operationsTheme.text['button--font-weight']],
    fontSize: operationsTheme.text.tag,
  },
  chevron: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text['icon-sm'],
    color: operationsTheme.colors['sand-600'],
  },
  footnote: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    lineHeight: operationsTheme.text.micro * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.muted,
    paddingVertical: operationsTheme.space['2xl'],
  },
});
