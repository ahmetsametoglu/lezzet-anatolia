import { useRouter } from 'expo-router';
import { RefreshControl, ScrollView, Text, View } from 'react-native';
import { StyleSheet } from 'react-native-unistyles';

import { OperationsNoticeBlock } from '@/components/operations/notice-block';
import { OperationsSkeletonList } from '@/components/operations/skeleton-list';
import { OperationsStackHeader } from '@/components/operations/stack-header';
import { pullRefreshColors } from '@/components/ui/pull-refresh';
import { captionOf } from '@/lib/operations/caption';
import { money } from '@/lib/operations/money';
import { dateLabelOf } from '@/lib/operations/stamp';
import { fillCopy } from '@/screens/operations/copy';
import { useOperationsWorkplace } from '@/screens/operations/sections-context';
import { emToDp } from '@/theme/parse';
import { operationsTheme } from '@/theme/unistyles';
import type { ManagementHub, ManagementSummary } from '@lezzet/types';
import { managementCopy } from './copy';
import { useManagementHub } from './use-management-hub.hook';

/*
  Y5 · GÜN ÖZETİ (Operasyon Mobil v3:29) — yönetimin TEK salt-okunur ekranı: günün fotoğrafı.

  Hiçbir eylem YOK ve bu tasarımın kararı ("salt okuma · günün fotoğrafı"). Ekran bir karar
  vermiyor, kararların ZEMİNİNİ gösteriyor; bir düğme eklemek burada olmayan bir yetki vaat ederdi.

  ── v3 DÜZ LİSTEYİ ÜÇ KATMANA ÇEVİRDİ (30.08) ───────────────────────────────
  v2 her şeyi eşit ağırlıkta üstbaşlıklı bloklara diziyordu. v3 aynı sayıları ÖNEME göre ayırdı:
    1. KOYU CİRO KARTI — günün tek cümlelik cevabı: ne kadar ciro, kaç sipariş, hangi kanaldan.
    2. KUTUCUK IZGARASI — iki sütun; her kutucuk tek bir sayı ve onun adı.
    3. İÇGÖRÜ KUTUSU — nötr zeminli, cümleyle konuşan blok.
  Depo hub'ının koyu özet kartıyla aynı dil (`warehouse-hub-screen`); ton token'ları da oradan
  ("koyu üstü" ailesi — `on-ink-*`), yeniden ölçülmedi.

  ── AYNI ZARF, İKİ KATMAN ───────────────────────────────────────────────────
  Hub ile AYNI okuma (`/management/hub`) — "kutu 3 diyor, özet 2" çelişkisi motor düzeyinde
  imkânsız. Izgaranın "yakın-SKT aday parti" kutucuğu da o zarfın KARAR KUTUSU tarafından gelir
  (`queue.offers.candidateCount`): ekran yeni bir uç istemiyor, zaten okuduğu zarfın öteki yarısını
  okuyor. Kanal kırılımı sipariş sayacının eksenindedir: gün = TESLİM günü (`order_counts`).

  ── TASARIMIN İSTEYİP SÖZLEŞMEDE OLMAYANLARI: UYDURULMADI ───────────────────
  v3'ün koyu kartı ciroyu B2B/B2C diye ayırıyor, ızgarası da "zamanında teslim" (9/11) ve
  "imha + iade" (148,00 €) kutucukları çiziyor. Üçünün de ölçümü sözleşmede YOK: `channels`
  müşteri segmentini değil SİPARİŞ KAYNAĞINI taşır (web/kapı/WhatsApp), zamanında teslim oranı ve
  imha/iade tutarı ise hiç sorulmuyor. Tasarımın YERLEŞİMİ birebir uygulandı, kutucukların içi
  ölçülmüş veriyle dolduruldu — uydurma bir oran, yönetime olmayan bir gerçeği rapor ederdi.

  ── "YARIN" ŞERİDİ KALDI (v3'ten bilinçli sapma) ────────────────────────────
  v3 yarın satırını çizmiyor. Veri GERÇEK ve tüketicisi var (yöneticinin ilk sorusu "yarın ne
  var"); v3'ün onu kaldırması bir ölçüm kararı değil, yeni yerleşimin dışında kalmasıdır. Aynı
  kutucuk dilinde, tam genişlikte bir kart olarak duruyor — bilgi yerini korudu, dili değişti.

  ── ÖLÇÜLEMEYEN DEĞER SIFIR DEĞİLDİR ────────────────────────────────────────
  Kanal cirosu `null` gelirse hücre "— bilinmiyor (sıfır değil)" yazar. YZ içgörüsü de aynı
  disiplinde: motoru (modül 20/22) bağlanana dek uç BOŞ dizi döner ve blok bunu dürüstçe söyler.

  ── KÜNYE: GÜN + (VARSA) TESİSİN ADI ────────────────────────────────────────
  v3 "28 Ağustos · Strasbourg Merkez" diyor. Gün özetin kendi alanından (`summary.date`) gelir;
  ~~deponun adını verecek bir kapı YOK~~ → **açıldı (30.08, `/operations/scope`)**. Ama kuyruk
  ŞARTLI: yönetim okumaları depo boyutu taşımaz (`management.ts` künyesi: *"yönetim işletmenin
  tamamına bakar"*), yani satır sayıların süzgecini değil yöneticinin BAĞLAMINI söyler. Kapsam tek
  bir tesisi çözmüyorsa (yöneticinin olağan hâli: kapsamı boş, depo-üstü) künye günle yetinir —
  uydurma bir şehir adı, yanlış tesisin ekranındaymış gibi bir güvence verirdi (CLAUDE §1).
*/

const t = managementCopy;

/**
 * İskelet yükseklikleri kartların KENDİ ölçüsünden türer (bildirimler emsali).
 *
 * Koyu ciro kartı: iki dolgu + üstbaşlık + büyük tutar + iç aralık + kırılım satırı.
 */
const SKELETON_REVENUE_HEIGHT =
  operationsTheme.space['4xl'] * 2 +
  operationsTheme.space.xl +
  operationsTheme.text.eyebrow * operationsTheme.text['lead--line-height'] +
  operationsTheme.text['h1-sm'] * operationsTheme.text['lead--line-height'] +
  operationsTheme.text.note * operationsTheme.text['lead--line-height'];

/** Kutucuk sırası: iki dolgu + büyük sayı + iç aralık + künye satırı. */
const SKELETON_TILE_HEIGHT =
  operationsTheme.space['2xl'] * 2 +
  operationsTheme.space.xs +
  operationsTheme.text['h2-sm'] * operationsTheme.text['lead--line-height'] +
  operationsTheme.text.micro * operationsTheme.text['lead--line-height'];

/** İçgörünün noktası — iyi (zeytin) · izle (terracotta) · kötü (kırmızı). */
const INSIGHT_COLOR = {
  good: operationsTheme.colors.olive,
  watch: operationsTheme.colors.terracotta,
  bad: operationsTheme.colors.error,
} as const satisfies Record<ManagementSummary['insights'][number]['tone'], string>;

/** Kanal etiketleri sözlükten — sözleşme `manual`ı da taşıyabilir diye anahtar kapalı okunur. */
const CHANNEL_LABEL: Partial<Record<string, string>> = {
  web: t.summary.channels.web,
  door: t.summary.channels.door,
  whatsapp: t.summary.channels.whatsapp,
};

export function DaySummaryScreen() {
  const router = useRouter();
  const { state, retry, refresh, reloading } = useManagementHub();
  const workplace = useOperationsWorkplace();

  /* Künye GÜN adıdır (+ varsa tesis); gün okunamadıysa (bozuk biçim) ekranın kendi cümlesine
     düşer — başlık altında boş bir satır bırakmak, künyeyi hiç yazmamaktan daha çok soru
     doğururdu. Tesis adı yoksa kuyruk hiç doğmaz (`captionOf`). */
  const day = state.status === 'ready' ? (dateLabelOf(state.hub.summary.date) ?? t.summary.caption) : t.summary.caption;
  const caption = captionOf(day, workplace);

  return (
    <View style={styles.screen} testID="management-day-summary">
      <OperationsStackHeader
        title={t.summary.title}
        subtitle={caption}
        onBack={() => router.back()}
        backLabel={t.common.back}
        testID="management-day-summary-header"
      />

      {state.status === 'loading' ? (
        /* İLK YÜK İSKELETLE (v3 dili): ekranın kendi sırası — koyu ciro kartı, sonra kutucuk
           ızgarasının iki sırası. Halka bunu tutmaz ve söndüğünde sayfa zıplar. */
        <View style={styles.skeleton}>
          <OperationsSkeletonList
            heights={[SKELETON_REVENUE_HEIGHT, SKELETON_TILE_HEIGHT, SKELETON_TILE_HEIGHT]}
            label={t.summary.loading}
            testID="management-day-summary-loading"
          />
        </View>
      ) : state.status === 'error' ? (
        <View style={styles.errorBlock}>
          <OperationsNoticeBlock
            variant="error"
            title={t.hub.error.title}
            description={t.hub.error.body}
            retry={{ label: t.hub.error.retry, onPress: retry }}
            testID="management-day-summary-error"
          />
        </View>
      ) : (
        <SummaryBody hub={state.hub} refresh={refresh} reloading={reloading} />
      )}
    </View>
  );
}

interface SummaryTileProps {
  value: string;
  caption: string;
  /** İzlenmesi gereken sayı terracotta okunur — hata DEĞİL, takip gerektiren bir iş. */
  watch?: boolean;
  testID: string;
}

function SummaryTile({ value, caption, watch = false, testID }: SummaryTileProps) {
  return (
    <View style={styles.tile} testID={testID}>
      <Text style={[styles.tileValue, watch ? styles.tileValueWatch : undefined]}>{value}</Text>
      <Text style={styles.tileCaption}>{caption}</Text>
    </View>
  );
}

interface SummaryBodyProps {
  hub: ManagementHub;
  refresh: () => void;
  reloading: boolean;
}

function SummaryBody({ hub, refresh, reloading }: SummaryBodyProps) {
  const { summary, queue } = hub;

  return (
    /* AŞAĞI ÇEKİNCE YENİLE (kullanıcı isteği 30.08): gün özeti GÜNÜN FOTOĞRAFI ve gün ilerledikçe
       değişiyor; tazelemenin tek yolu ekrandan çıkıp girmekti. */
    <ScrollView
      contentContainerStyle={styles.body}
      refreshControl={
        <RefreshControl refreshing={reloading} onRefresh={refresh} {...pullRefreshColors(operationsTheme.colors.olive)} />
      }
      testID="management-day-summary-body"
    >
      <View style={styles.revenue} testID="management-summary-revenue">
        <View style={styles.revenueHead}>
          <View style={styles.revenueHeadText}>
            <Text style={styles.revenueEyebrow}>{t.summary.revenue.eyebrow}</Text>
            <Text style={styles.revenueValue}>{money(summary.revenueCents)}</Text>
          </View>
          <Text style={styles.revenueBadge}>{fillCopy(t.summary.revenue.orders, { n: String(summary.orderCount) })}</Text>
        </View>

        <View style={styles.channelGrid}>
          {summary.channels.map((channel) => (
            <View key={channel.source} style={styles.channelCell} testID={`management-channel-${channel.source}`}>
              <Text style={channel.cents === null ? styles.channelValueUnknown : styles.channelValue}>
                {channel.cents === null ? t.summary.channels.unknown : money(channel.cents)}
              </Text>
              <Text style={styles.channelLabel}>{CHANNEL_LABEL[channel.source] ?? channel.source}</Text>
            </View>
          ))}
        </View>
      </View>

      <View style={styles.tiles}>
        {/* Kesir v3'ün ilk kutucuğunun biçimi ("9/11"); ölçtüğü şey ise elimizdeki gerçek oran:
            günün siparişlerinin kaçı şu an hazırlıkta. */}
        <SummaryTile
          value={`${summary.preparingCount}/${summary.orderCount}`}
          caption={t.summary.tiles.preparing}
          testID="management-summary-preparing"
        />
        <SummaryTile
          value={money(summary.pendingPayment.cents)}
          caption={fillCopy(t.summary.tiles.pendingPayment, { n: String(summary.pendingPayment.count) })}
          watch
          testID="management-summary-door-pending"
        />
        <SummaryTile
          value={String(queue.offers.candidateCount)}
          caption={t.summary.tiles.offerCandidates}
          testID="management-summary-offer-candidates"
        />
        <SummaryTile
          value={String(summary.openComplaintCount)}
          caption={t.summary.tiles.complaints}
          testID="management-summary-complaints"
        />
      </View>

      <View style={styles.tomorrow} testID="management-summary-tomorrow">
        <Text style={styles.tomorrowEyebrow}>{t.summary.tomorrow.eyebrow}</Text>
        <Text style={styles.tomorrowLine}>
          {fillCopy(t.summary.tomorrow.line, {
            orders: String(summary.tomorrow.orderCount),
            ready: String(summary.tomorrow.readyCount),
            amount: money(summary.tomorrow.doorPaymentCents),
          })}
        </Text>
      </View>

      <View style={styles.insights}>
        {summary.insights.length === 0 ? (
          <Text style={styles.insightEmpty} testID="management-insights-empty">
            {t.summary.insights.empty}
          </Text>
        ) : (
          summary.insights.map((insight) => (
            <View key={insight.id} style={styles.insightRow} testID={`management-insight-${insight.id}`}>
              <View style={[styles.insightDot, { backgroundColor: INSIGHT_COLOR[insight.tone] }]} />
              <Text style={styles.insightText}>{insight.text}</Text>
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: operationsTheme.colors.cream,
  },
  /* İskelet gövdeyle AYNI kenar boşluğunda durur; yükleme bitince kartlar yerinde doğar. */
  skeleton: {
    paddingTop: operationsTheme.space.xl,
    paddingHorizontal: operationsTheme.space['5xl'],
  },
  errorBlock: {
    paddingTop: operationsTheme.space['7xl'],
    paddingHorizontal: operationsTheme.space['6xl'],
  },
  body: {
    paddingHorizontal: operationsTheme.space['5xl'],
    paddingBottom: operationsTheme.space['8xl'],
    gap: operationsTheme.space.xl,
  },

  /* ── Koyu ciro kartı (v3:29) ──────────────────────────────────────────────
     Depo hub'ının özet kartıyla aynı yapı ve aynı ton ailesi; ikinci bir "koyu kart" dili
     kurulmadı. */
  revenue: {
    backgroundColor: operationsTheme.colors.ink,
    borderRadius: operationsTheme.radius.pill,
    padding: operationsTheme.space['4xl'],
    gap: operationsTheme.space.xl,
  },
  revenueHead: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: operationsTheme.space.lg,
  },
  revenueHeadText: {
    flexShrink: 1,
    gap: operationsTheme.space['2xs'],
  },
  revenueEyebrow: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    // Harf aralığı token `em` taşır, RN mutlak dp ister — çeviri `parse.ts`te, tek yerde.
    letterSpacing: emToDp(operationsTheme.text['eyebrow--letter-spacing'], operationsTheme.text.eyebrow),
    color: operationsTheme.colors['on-ink-label'],
  },
  revenueValue: {
    fontFamily: operationsTheme.font.display[operationsTheme.text['h1-sm--font-weight']],
    fontSize: operationsTheme.text['h1-sm'],
    color: operationsTheme.colors['on-image'],
  },
  /** Sayaç rozeti koyu kartın İÇİNDEKİ açık blok — zemini `ink-inset` (o rolün token'ı). */
  revenueBadge: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.tag,
    color: operationsTheme.colors['on-ink-label'],
    backgroundColor: operationsTheme.colors['ink-inset'],
    borderRadius: operationsTheme.radius.badge,
    paddingVertical: operationsTheme.space.sm,
    paddingHorizontal: operationsTheme.space.xl,
    overflow: 'hidden',
  },
  channelGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: operationsTheme.space.lg,
    paddingTop: operationsTheme.space.xl,
    borderTopWidth: operationsTheme.border.hairline,
    borderTopColor: operationsTheme.colors['on-ink-line'],
  },
  /* İki sütun: `flexBasis` yarıdan küçük seçilir ki üçüncü hücre alta insin, `flexGrow` da satırda
     kalan boşluğu paylaştırsın — sabit yüzde, kanal sayısı değişince satırı kırardı. */
  channelCell: {
    flexBasis: '40%',
    flexGrow: 1,
    gap: operationsTheme.space['2xs'],
  },
  channelValue: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.body,
    color: operationsTheme.colors['on-image'],
  },
  /** Bilinmeyen değer SESSİZ ve bir kademe küçük durur: cümledir, tutar değil. */
  channelValueUnknown: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.helper,
    lineHeight: operationsTheme.text.helper * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors['on-ink-muted'],
  },
  channelLabel: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.meta,
    color: operationsTheme.colors['on-ink-muted'],
  },

  /* ── Kutucuk ızgarası ─────────────────────────────────────────────────────── */
  tiles: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: operationsTheme.space.lg,
  },
  tile: {
    flexBasis: '40%',
    flexGrow: 1,
    gap: operationsTheme.space.xs,
    padding: operationsTheme.space['2xl'],
    backgroundColor: operationsTheme.colors.panel,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-300'],
    borderRadius: operationsTheme.radius.card,
  },
  tileValue: {
    fontFamily: operationsTheme.font.display[operationsTheme.text['h2-sm--font-weight']],
    fontSize: operationsTheme.text['h2-sm'],
    color: operationsTheme.colors.ink,
  },
  tileValueWatch: {
    color: operationsTheme.colors.terracotta,
  },
  tileCaption: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    lineHeight: operationsTheme.text.micro * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.muted,
  },

  /* ── Yarın şeridi — kutucukla aynı kart, tam genişlikte ───────────────────── */
  tomorrow: {
    gap: operationsTheme.space.xs,
    padding: operationsTheme.space['2xl'],
    backgroundColor: operationsTheme.colors.panel,
    borderWidth: operationsTheme.border.base,
    borderColor: operationsTheme.colors['sand-300'],
    borderRadius: operationsTheme.radius.card,
  },
  tomorrowEyebrow: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['eyebrow--font-weight']],
    fontSize: operationsTheme.text.eyebrow,
    letterSpacing: emToDp(operationsTheme.text['eyebrow--letter-spacing'], operationsTheme.text.eyebrow),
    color: operationsTheme.colors.muted,
  },
  tomorrowLine: {
    fontFamily: operationsTheme.font.body[operationsTheme.text['control--font-weight']],
    fontSize: operationsTheme.text.note,
    lineHeight: operationsTheme.text.note * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.ink,
  },

  /* ── İçgörü kutusu — nötr zemin, cümleyle konuşan blok (v3:29) ────────────── */
  insights: {
    gap: operationsTheme.space.sm,
    paddingVertical: operationsTheme.space.xl,
    paddingHorizontal: operationsTheme.space['2xl'],
    backgroundColor: operationsTheme.colors['neutral-bg'],
    borderRadius: operationsTheme.radius.control,
  },
  insightRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: operationsTheme.space.md,
  },
  insightDot: {
    width: operationsTheme.space.lg,
    height: operationsTheme.space.lg,
    borderRadius: operationsTheme.radius.pill,
    // Nokta ilk satırın ortasına denk gelsin.
    marginTop: operationsTheme.space.sm,
  },
  insightText: {
    flex: 1,
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    lineHeight: operationsTheme.text.micro * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.body,
  },
  /** İçgörü yokken blok susmaz, yokluğunu SÖYLER. */
  insightEmpty: {
    fontFamily: operationsTheme.font.body[400],
    fontSize: operationsTheme.text.micro,
    lineHeight: operationsTheme.text.micro * operationsTheme.text['lead--line-height'],
    color: operationsTheme.colors.body,
  },
});
